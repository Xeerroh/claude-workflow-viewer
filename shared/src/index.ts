// Types for Claude Code conversation JSONL format

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  tool_use_id: string;
  type: 'tool_result';
  content: string;
  is_error: boolean;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock | ToolResultContent;

export interface AssistantMessage {
  model: string;
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface UserMessageContent {
  role: 'user';
  content: string | ToolResultContent[];
}

export interface ToolUseResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

// Base message entry from JSONL
export interface BaseMessageEntry {
  parentUuid: string | null;
  isSidechain: boolean;
  userType: string;
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch: string;
  uuid: string;
  timestamp: string;
}

export interface UserMessageEntry extends BaseMessageEntry {
  type: 'user';
  message: UserMessageContent;
  thinkingMetadata?: {
    level: string;
    disabled: boolean;
    triggers: string[];
  };
  todos?: unknown[];
}

export interface AssistantMessageEntry extends BaseMessageEntry {
  type: 'assistant';
  message: AssistantMessage;
  requestId: string;
  toolUseResult?: ToolUseResult;
}

export interface FileHistorySnapshot {
  type: 'file-history-snapshot';
  messageId: string;
  snapshot: {
    messageId: string;
    trackedFileBackups: Record<string, unknown>;
    timestamp: string;
  };
  isSnapshotUpdate: boolean;
}

export type ConversationEntry = UserMessageEntry | AssistantMessageEntry | FileHistorySnapshot;

// Node types for visualization
export type NodeType =
  | 'user'           // Human user message
  | 'assistant'      // AI text response
  | 'thinking'       // AI thinking block
  | 'tool_call'      // Generic tool invocation (Bash, Read, Edit, etc.)
  | 'tool_result'    // Tool execution result
  | 'agent'          // Task agent (Explore, Plan, claude-code-guide, etc.)
  | 'skill'          // Skill invocation
  | 'command'        // Slash command execution
  | 'system';        // System/infrastructure message

// Processed node for tree visualization
export interface ConversationNode {
  id: string;
  parentId: string | null;
  timestamp: string;
  type: NodeType;
  summary: string;
  content: ContentBlock | string | null;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: ToolUseResult;
  agentType?: string;    // For 'agent' nodes: the subagent_type (Explore, Plan, etc.)
  skillName?: string;    // For 'skill' nodes: the skill name
  commandName?: string;  // For 'command' nodes: the slash command
  children: ConversationNode[];
  raw: ConversationEntry;
}

// WebSocket message types
export interface WsMessage {
  type: 'init' | 'update' | 'clear';
  nodes?: ConversationNode[];
  node?: ConversationNode;
  sessionId?: string;
  sessionFile?: string;
}

export interface SessionInfo {
  sessionId: string;
  filePath: string;
  projectPath: string;
  lastModified: string;
  // Enhanced metadata
  fileSize?: number;
  messageCount?: number;
  toolCount?: number;
  firstMessage?: string;
  duration?: number;  // in milliseconds
  isLive?: boolean;   // modified within last 5 minutes
}

// Helper to check entry types
export function isUserMessage(entry: ConversationEntry): entry is UserMessageEntry {
  return 'type' in entry && entry.type === 'user';
}

export function isAssistantMessage(entry: ConversationEntry): entry is AssistantMessageEntry {
  return 'type' in entry && entry.type === 'assistant';
}

export function isFileHistorySnapshot(entry: ConversationEntry): entry is FileHistorySnapshot {
  return 'type' in entry && entry.type === 'file-history-snapshot';
}

export function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}
