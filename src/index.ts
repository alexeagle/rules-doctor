import { readFile } from 'fs/promises';
import { RepositoryChecker } from './checker.js';
import { Config, CheckResult } from './types.js';

async function loadConfig(configPath: string): Promise<Config> {
  try {
    const configContent = await readFile(configPath, 'utf-8');
    return JSON.parse(configContent) as Config;
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error}`);
  }
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
      console.log(`Found ${config.repositories.length} repositories and ${config.checks.length} checks\n`);
    }
    
    const checker = new RepositoryChecker();
    const results = await checker.checkAllRepositories(config.repositories, checks);
    
    console.log('\n--- Results ---');
    reportResults(results);
    
    // Exit with error code if any checks failed
    const hasFailures = results.some(result => !result.passed);
    process.exit(hasFailures ? 1 : 0);
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
