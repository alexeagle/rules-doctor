export interface ExcludeEntry {
  repository: string; // Repository name in "owner/repo" format
  reason?: string; // Optional reason for exclusion
}

export interface FileCheck {
  name: string;
  file: string;
  pattern: string;
  description?: string;
  enabled?: boolean;  // When false, this check will be skipped
  exclude?: ExcludeEntry[]; // List of repositories to skip for this check
}

export interface Config {
  repositories?: string[];
  dynamicRepositories?: {
    enabled: boolean;
    source: 'github';
    organization: string;
    topic: string;
  };
  checks: FileCheck[];
}

export interface CheckResult {
  repository: string;
  check: string;
  filePath: string;
  passed: boolean;
  error?: string;
}
