export type FileRole =
  | 'svelte-component'
  | 'page-server'
  | 'layout-server'
  | 'server-endpoint'
  | 'page-client'
  | 'layout-client'
  | 'lib-server'
  | 'lib-client'
  | 'config';

export interface ClassifiedFile {
  filePath: string;
  role: FileRole;
}

export interface RuleContext {
  filePath: string;
  fileRole: FileRole;
  source: string;
  report: (info: { node: any; message: string }) => void;
}

export interface Rule {
  id: string;
  severity: 'error' | 'warning';
  applicableTo: FileRole[];
  description: string;
  agentPrompt: string;
  analyze: (ast: any, context: RuleContext) => void;
  fix?: (source: string, diagnostic: Diagnostic) => string | null;
}

export interface Diagnostic {
  ruleId: string;
  severity: 'error' | 'warning';
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  agentInstruction: string;
  fixable: boolean;
  codeSnippet?: string;
}

export interface ScoreResult {
  score: number;
  label: 'Excellent' | 'Good' | 'Needs Work' | 'Critical';
}

export interface DiagnoseResult {
  score: ScoreResult;
  diagnostics: Diagnostic[];
  filesScanned: number;
}

export interface SvelteDoctorConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
  };
  verbose?: boolean;
  diff?: boolean | string;
}
