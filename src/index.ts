import { readFile, writeFile } from 'fs/promises';
import { RepositoryChecker } from './checker.js';
import { Config, CheckResult } from './types.js';

const REPORT_FILE = 'report.md';

async function loadConfig(configPath: string): Promise<Config> {
    try {
        const configContent = await readFile(configPath, 'utf-8');
        return JSON.parse(configContent) as Config;
    } catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
}

async function getRepositories(config: Config, checker: RepositoryChecker): Promise<string[]> {
    // If dynamic repositories are enabled, fetch them from GitHub
    if (config.dynamicRepositories?.enabled) {
        console.log(`Fetching repositories from ${config.dynamicRepositories.source} for org: ${config.dynamicRepositories.organization} with topic: ${config.dynamicRepositories.topic}`);
        return await checker.fetchBazelContribRepositories();
    }

    // Fall back to static repositories if provided
    if (config.repositories) {
        return config.repositories;
    }

    throw new Error('No repositories configured. Either provide static repositories or enable dynamic repository fetching.');
}

// Helper to check if a required check failed for a specific repository
function getFailedRequires(failure: CheckResult, allResults: CheckResult[]): { check: string; reason?: string }[] {
    if (!failure.requires || failure.requires.length === 0) {
        return [];
    }

    return failure.requires.filter(req => {
        // Check if the required check also failed for this repository
        const requiredCheckResult = allResults.find(
            r => r.check === req.check && r.repository === failure.repository
        );
        return requiredCheckResult && !requiredCheckResult.passed;
    });
}

function generateMarkdownReport(results: CheckResult[]): string {
    const lines: string[] = [];
    const failedResults = results.filter(result => !result.passed);
    const passedResults = results.filter(result => result.passed);

    lines.push('# Rules Doctor Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    if (failedResults.length === 0) {
        lines.push('## ✅ All checks passed!');
        return lines.join('\n');
    }

    lines.push('## Summary');
    lines.push('');
    lines.push(`- ❌ **Failed checks:** ${failedResults.length}`);
    lines.push(`- ✅ **Passed checks:** ${passedResults.length}`);
    lines.push('');
    lines.push('## Failed Checks');
    lines.push('');

    // Group by check name
    const groupedByCheck = failedResults.reduce((acc, result) => {
        if (!acc[result.check]) {
            acc[result.check] = [];
        }
        acc[result.check].push(result);
        return acc;
    }, {} as Record<string, CheckResult[]>);

    // Sort checks alphabetically
    const sortedCheckNames = Object.keys(groupedByCheck).sort();

    for (const checkName of sortedCheckNames) {
        const failures = groupedByCheck[checkName];
        lines.push(`### 🔍 ${checkName}`);
        lines.push('');

        // Group by repository for this check
        const byRepo = failures.reduce((acc, result) => {
            if (!acc[result.repository]) {
                acc[result.repository] = [];
            }
            acc[result.repository].push(result);
            return acc;
        }, {} as Record<string, CheckResult[]>);

        // Sort repositories alphabetically
        const sortedRepos = Object.keys(byRepo).sort();

        lines.push('| Repository | File | Status |');
        lines.push('|------------|------|--------|');

        for (const repo of sortedRepos) {
            const repoFailures = byRepo[repo];

            for (const failure of repoFailures) {
                const repoLink = `[${repo}](https://github.com/${repo})`;
                const fileLink = `[${failure.filePath}](https://github.com/${repo}/blob/main/${failure.filePath})`;
                let status: string;

                if (failure.error) {
                    if (failure.error.includes('File not found')) {
                        status = '🤷‍♂️ File not found';
                    } else {
                        status = `❌ ${failure.error}`;
                    }
                } else {
                    status = '🔍 Pattern not found';
                }

                // Check if required checks failed for this repo
                const failedRequires = getFailedRequires(failure, results);
                if (failedRequires.length > 0) {
                    const reqLinks = failedRequires.map(req => {
                        const anchor = `-${req.check}`;
                        return `[\`${req.check}\`](#${anchor})`;
                    }).join(', ');
                    status += ` ⚠️ Fix first: ${reqLinks}`;
                }

                lines.push(`| ${repoLink} | ${fileLink} | ${status} |`);
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

function reportResults(results: CheckResult[]): void {
    const failedResults = results.filter(result => !result.passed);

    if (failedResults.length === 0) {
        console.log('✅ All checks passed!');
        return;
    }

    console.log(`\n❌ Found ${failedResults.length} failed check(s):\n`);

    // Group by check name instead of repository
    const groupedByCheck = failedResults.reduce((acc, result) => {
        if (!acc[result.check]) {
            acc[result.check] = [];
        }
        acc[result.check].push(result);
        return acc;
    }, {} as Record<string, CheckResult[]>);

    // Sort checks alphabetically
    const sortedCheckNames = Object.keys(groupedByCheck).sort();

    for (const checkName of sortedCheckNames) {
        const failures = groupedByCheck[checkName];
        console.log(`🔍 Check: ${checkName}`);

        // Group by repository for this check
        const byRepo = failures.reduce((acc, result) => {
            if (!acc[result.repository]) {
                acc[result.repository] = [];
            }
            acc[result.repository].push(result);
            return acc;
        }, {} as Record<string, CheckResult[]>);

        // Sort repositories alphabetically
        const sortedRepos = Object.keys(byRepo).sort();

        for (const repo of sortedRepos) {
            const repoFailures = byRepo[repo];
            console.log(`  📦 Repository: https://github.com/${repo}`);

            for (const failure of repoFailures) {
                if (failure.error) {
                    if (failure.error.includes('File not found')) {
                        console.log(`     🤷‍♂️ ${failure.filePath} - File not found`);
                    } else {
                        console.log(`     ❌ ${failure.filePath} - ${failure.error}`);
                    }
                } else {
                    console.log(`     🔍 ${failure.filePath} - Pattern not found`);
                }
                console.log(`        View: https://github.com/${repo}/blob/main/${failure.filePath}`);

                // Check if required checks failed for this repo
                const failedRequires = getFailedRequires(failure, results);
                if (failedRequires.length > 0) {
                    for (const req of failedRequires) {
                        const reason = req.reason ? ` (${req.reason})` : '';
                        console.log(`        ⚠️  Fix first: ${req.check}${reason}`);
                    }
                }
            }
        }
        console.log();
    }
}

async function main(): Promise<void> {
    try {
        const checkName = process.argv[2]; // Optional check name (first argument)
        const configPath = 'config.json';

        console.log(`Loading configuration from: ${configPath}`);
        const config = await loadConfig(configPath);

        const checker = new RepositoryChecker();
        const repositories = await getRepositories(config, checker);

        // Filter checks if a specific check name is provided
        let checks = config.checks;
        if (checkName) {
            checks = checks.filter(check => check.name === checkName);
            if (checks.length === 0) {
                console.error(`Error: No check found with name '${checkName}'`);
                process.exit(1);
            }
            console.log(`Running only check: ${checkName}\n`);
        } else {
            console.log(`Found ${repositories.length} repositories and ${config.checks.length} checks\n`);
        }

        const results = await checker.checkAllRepositories(repositories, checks);

        console.log('\n--- Results ---');
        reportResults(results);

        // Write markdown report
        const markdownReport = generateMarkdownReport(results);
        await writeFile(REPORT_FILE, markdownReport, 'utf-8');
        console.log(`\n📄 Report written to ${REPORT_FILE}`);

        // Exit with error code if any checks failed
        const hasFailures = results.some(result => !result.passed);
        process.exit(hasFailures ? 1 : 0);

    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
