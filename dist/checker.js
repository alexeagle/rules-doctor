import fetch from 'node-fetch';
export class RepositoryChecker {
    async fetchFileContent(repoPath, filePath) {
        // repoPath is in format "owner/repo"
        const [owner, repoName] = repoPath.split('/');
        if (!owner || !repoName) {
            throw new Error(`Invalid repository format: ${repoPath}. Expected "owner/repo"`);
        }
        // Use GitHub's raw content API
        const url = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${filePath}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Try 'master' branch if 'main' fails
                const masterUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/master/${filePath}`;
                const masterResponse = await fetch(masterUrl);
                if (!masterResponse.ok) {
                    throw new Error(`File not found: ${filePath}`);
                }
                return await masterResponse.text();
            }
            return await response.text();
        }
        catch (error) {
            throw new Error(`Failed to fetch ${filePath}: ${error}`);
        }
    }
    runCheck(content, check) {
        const isNegated = check.pattern.startsWith('!');
        const pattern = isNegated ? check.pattern.slice(1) : check.pattern;
        const regex = new RegExp(pattern);
        const matches = regex.test(content);
        return isNegated ? !matches : matches;
    }
    async checkRepository(repoPath, checks) {
        const results = [];
        for (const check of checks) {
            try {
                const content = await this.fetchFileContent(repoPath, check.file);
                const passed = this.runCheck(content, check);
                results.push({
                    repository: repoPath,
                    check: check.name,
                    filePath: check.file,
                    passed
                });
            }
            catch (error) {
                results.push({
                    repository: repoPath,
                    check: check.name,
                    filePath: check.file,
                    passed: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        return results;
    }
    async checkAllRepositories(repositories, checks) {
        const allResults = [];
        const enabledChecks = checks.filter(check => check.enabled !== false);
        console.log(`\n🔍 Running ${enabledChecks.length} checks across ${repositories.length} repositories\n`);
        for (const repo of repositories) {
            console.log(`📦 Repository: ${repo}`);
            const results = await this.checkRepository(repo, checks);
            allResults.push(...results);
        }
        return allResults;
    }
}
