export interface FileCheck {
  name: string;
  file: string;
  pattern: string;
  description?: string;
  enabled?: boolean;  // When false, this check will be skipped
}

export interface Config {
  repositories: string[];
  checks: FileCheck[];
}

export interface CheckResult {
  repository: string;
  check: string;
  filePath: string;
  passed: boolean;
  error?: string;
}
