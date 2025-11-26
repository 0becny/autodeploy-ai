export interface FileEntry {
  path: string;
  content: string | null; // Content is read lazily or partially for text files
  fileObject: File;
}

export interface EnvVarSuggestion {
  key: string;
  description: string;
  defaultValue?: string;
  value?: string; // User input
}

export interface AIAnalysisResult {
  projectName: string;
  stack: string;
  dockerfile: string;
  dockerCompose?: string; // New field
  envVars: EnvVarSuggestion[];
  explanation: string;
  port: number;
}

export interface DeploymentStatus {
  step: 'idle' | 'analyzing' | 'creating_repo' | 'uploading_blobs' | 'creating_tree' | 'committing' | 'finished' | 'error';
  message: string;
  progress: number; // 0-100
  repoUrl?: string;
}

export interface GithubCreds {
  token: string;
  username: string;
}

export interface AIConfig {
  provider: 'gemini' | 'openrouter';
  apiKey: string;
  baseUrl?: string; // Optional custom URL
  model?: string; // Optional custom model for analysis
}

export enum Step {
  CREDENTIALS,
  SELECT_FOLDER,
  ANALYSIS,
  REVIEW,
  DEPLOYING,
  SUCCESS
}