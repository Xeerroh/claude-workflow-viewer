import { watch, FSWatcher } from 'chokidar';
import { readFile, stat } from 'fs/promises';
import { EventEmitter } from 'events';
import {
  ConversationEntry,
  ConversationNode,
  isUserMessage,
  isAssistantMessage,
  isFileHistorySnapshot,
  isThinkingBlock,
  isTextBlock,
  isToolUseBlock,
  ContentBlock
} from '@workflow-viewer/shared';

export class SessionWatcher extends EventEmitter {
  private filePath: string;
  private watcher: FSWatcher | null = null;
  private nodes: Map<string, ConversationNode> = new Map();
  private lastLineCount = 0;
  private processedLines: Set<string> = new Set(); // Track processed line hashes to avoid duplicates

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  async start(): Promise<void> {
    // Initial read
    await this.readFile();

    // Start watching
    this.watcher = watch(this.filePath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    this.watcher.on('change', async () => {
      await this.readNewContent();
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.nodes.clear();
    this.lastLineCount = 0;
    this.processedLines.clear();
  }

  getNodes(): ConversationNode[] {
    return this.buildTree();
  }

  getFilePath(): string {
    return this.filePath;
  }

  private async readFile(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (this.isValidJsonLine(line)) {
          const lineHash = this.hashLine(line);
          if (!this.processedLines.has(lineHash)) {
            this.processedLines.add(lineHash);
            this.processLine(line);
          }
        }
      }

      this.lastLineCount = lines.length;
      this.emit('init', this.buildTree());
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  }

  private async readNewContent(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Only process lines beyond what we've already seen
      if (lines.length <= this.lastLineCount) {
        return;
      }

      // Process new lines
      const newLines = lines.slice(this.lastLineCount);
      let hasNewNodes = false;

      for (const line of newLines) {
        if (this.isValidJsonLine(line)) {
          const lineHash = this.hashLine(line);
          if (!this.processedLines.has(lineHash)) {
            this.processedLines.add(lineHash);
            const node = this.processLine(line);
            if (node) {
              hasNewNodes = true;
            }
          }
        }
        // Silently skip invalid lines (partial writes)
      }

      this.lastLineCount = lines.length;

      // Emit the full reorganized tree so nesting is correct
      if (hasNewNodes) {
        this.emit('init', this.buildTree());
      }
    } catch (error) {
      console.error('Error reading new content:', error);
    }
  }

  private processLine(line: string): ConversationNode | null {
    try {
      const entry: ConversationEntry = JSON.parse(line);

      if (isFileHistorySnapshot(entry)) {
        // Skip file history snapshots for now
        return null;
      }

      if (isUserMessage(entry)) {
        const node = this.createUserNode(entry);
        if (node) {
          this.nodes.set(node.id, node);
        }
        return node;
      }

      if (isAssistantMessage(entry)) {
        const nodes = this.createAssistantNodes(entry);
        for (const node of nodes) {
          this.nodes.set(node.id, node);
        }
        return nodes[0] || null;
      }

      return null;
    } catch (error) {
      console.error('Error parsing line:', error);
      return null;
    }
  }

  private createUserNode(entry: ConversationEntry & { type: 'user' }): ConversationNode | null {
    const messageContent = entry.message.content;

    // Check if this is a tool result (array of tool_result objects)
    if (Array.isArray(messageContent) && messageContent.length > 0) {
      const firstItem = messageContent[0];
      if (firstItem && typeof firstItem === 'object' && 'type' in firstItem && firstItem.type === 'tool_result') {
        // This is a tool result response
        const toolResult = firstItem as { tool_use_id: string; type: string; content: string; is_error: boolean };
        const resultContent = toolResult.content || '';
        const isError = toolResult.is_error;

        // Get a meaningful summary from the result
        const summary = this.getToolResultSummary(resultContent, isError);

        // Construct the parent tool node id to nest result under the tool call
        // Tool nodes have id format: ${assistantUuid}-tool-${block.id}
        // The tool_use_id matches the block.id from the tool_use
        const toolNodeId = `${entry.parentUuid}-tool-${toolResult.tool_use_id}`;

        return {
          id: entry.uuid,
          parentId: toolNodeId,  // Nest under the specific tool call
          timestamp: entry.timestamp,
          type: 'tool_result',
          summary: summary,
          content: resultContent,
          toolResult: {
            stdout: isError ? undefined : resultContent,
            stderr: isError ? resultContent : undefined,
          },
          children: [],
          raw: entry
        };
      }
    }

    // Regular user message
    const content = typeof messageContent === 'string'
      ? messageContent
      : JSON.stringify(messageContent);

    // Detect system/infrastructure messages
    const systemInfo = this.detectSystemMessage(content);

    // Skip boilerplate system messages entirely (caveat, empty command output, etc.)
    if (systemInfo.skip) {
      return null;
    }

    return {
      id: entry.uuid,
      parentId: entry.parentUuid,
      timestamp: entry.timestamp,
      type: systemInfo.isSystem ? 'system' : 'user',
      summary: systemInfo.isSystem ? systemInfo.summary : this.truncate(content, 100),
      content: content,
      children: [],
      raw: entry
    };
  }

  private detectSystemMessage(content: string): { isSystem: boolean; summary: string; skip?: boolean } {
    // Slash command invocation
    if (content.includes('<command-name>') && content.includes('<command-message>')) {
      const cmdMatch = content.match(/<command-name>([^<]+)<\/command-name>/);
      const cmdName = cmdMatch ? cmdMatch[1] : 'command';
      return { isSystem: true, summary: `Command: ${cmdName}` };
    }

    // Command output placeholder - skip entirely
    if (content.includes('<local-command-stdout>')) {
      return { isSystem: true, summary: '', skip: true };
    }

    // Skill/slash command expansion (prompt text)
    if (content.includes('<command-message>') && content.includes('is running')) {
      const cmdMatch = content.match(/<command-name>([^<]+)<\/command-name>/);
      const argsMatch = content.match(/<command-args>([^<]*)<\/command-args>/);
      const cmdName = cmdMatch ? cmdMatch[1] : 'command';
      const args = argsMatch ? argsMatch[1] : '';
      return { isSystem: true, summary: `Running: ${cmdName}${args ? ' ' + args : ''}` };
    }

    // Skill prompt expansion (large JSON-like text block from .md files)
    if (content.startsWith('[{"type":"text"')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed[0]?.type === 'text') {
          const text = parsed[0].text || '';

          // Check for caveat message inside the JSON text - skip entirely
          if (text.includes('Caveat: The messages below were generated by the user')) {
            return { isSystem: true, summary: '', skip: true };
          }

          // Extract first meaningful line as summary
          const firstLine = text.split('\n').find((l: string) => l.trim() && !l.startsWith('#'))?.trim() || 'Skill prompt';
          const title = text.match(/^#\s+(.+)$/m)?.[1] || firstLine;
          return { isSystem: true, summary: `Skill: ${this.truncate(title, 60)}` };
        }
      } catch {
        // Not valid JSON, continue
      }
    }

    // System caveat message (plain text format) - skip entirely
    if (content.includes('Caveat: The messages below were generated by the user')) {
      return { isSystem: true, summary: '', skip: true };
    }

    return { isSystem: false, summary: '' };
  }

  private getToolResultSummary(content: string | unknown, isError: boolean): string {
    // Ensure content is a string
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    if (isError) {
      return `Error: ${this.truncate(contentStr, 80)}`;
    }

    // For file listings, count items
    const lines = contentStr.split('\n').filter(l => l.trim());
    if (lines.length > 3) {
      return `${lines.length} lines of output`;
    }

    return this.truncate(contentStr.replace(/\n/g, ' '), 100);
  }

  private createAssistantNodes(entry: ConversationEntry & { type: 'assistant' }): ConversationNode[] {
    const nodes: ConversationNode[] = [];
    const message = entry.message;

    if (!message.content || !Array.isArray(message.content)) {
      return nodes;
    }

    for (const block of message.content) {
      if (isThinkingBlock(block)) {
        nodes.push({
          id: `${entry.uuid}-thinking`,
          parentId: entry.parentUuid,
          timestamp: entry.timestamp,
          type: 'thinking',
          summary: this.truncate(block.thinking, 100),
          content: block,
          children: [],
          raw: entry
        });
      } else if (isTextBlock(block)) {
        nodes.push({
          id: `${entry.uuid}-text`,
          parentId: entry.parentUuid,
          timestamp: entry.timestamp,
          type: 'assistant',
          summary: this.truncate(block.text, 100),
          content: block,
          children: [],
          raw: entry
        });
      } else if (isToolUseBlock(block)) {
        const toolNode = this.createToolNode(entry, block);
        nodes.push(toolNode);
      }
    }

    return nodes;
  }

  private createToolNode(
    entry: ConversationEntry & { type: 'assistant' },
    block: ContentBlock & { type: 'tool_use' }
  ): ConversationNode {
    const input = block.input as Record<string, unknown>;

    // Task tool = Agent
    if (block.name === 'Task') {
      const agentType = String(input.subagent_type || 'unknown');
      const description = String(input.description || input.prompt || '');
      return {
        id: `${entry.uuid}-tool-${block.id}`,
        parentId: entry.parentUuid,
        timestamp: entry.timestamp,
        type: 'agent',
        summary: this.truncate(description, 80),
        content: block,
        toolName: block.name,
        toolInput: input,
        toolResult: entry.toolUseResult,
        agentType: agentType,
        children: [],
        raw: entry
      };
    }

    // Skill tool
    if (block.name === 'Skill') {
      const skillName = String(input.skill || 'unknown');
      return {
        id: `${entry.uuid}-tool-${block.id}`,
        parentId: entry.parentUuid,
        timestamp: entry.timestamp,
        type: 'skill',
        summary: skillName,
        content: block,
        toolName: block.name,
        toolInput: input,
        skillName: skillName,
        children: [],
        raw: entry
      };
    }

    // SlashCommand tool
    if (block.name === 'SlashCommand') {
      const command = String(input.command || 'unknown');
      return {
        id: `${entry.uuid}-tool-${block.id}`,
        parentId: entry.parentUuid,
        timestamp: entry.timestamp,
        type: 'command',
        summary: command,
        content: block,
        toolName: block.name,
        toolInput: input,
        commandName: command,
        children: [],
        raw: entry
      };
    }

    // Regular tool call
    return {
      id: `${entry.uuid}-tool-${block.id}`,
      parentId: entry.parentUuid,
      timestamp: entry.timestamp,
      type: 'tool_call',
      summary: `${block.name}: ${this.getToolSummary(block)}`,
      content: block,
      toolName: block.name,
      toolInput: block.input,
      toolResult: entry.toolUseResult,
      children: [],
      raw: entry
    };
  }

  private getToolSummary(block: ContentBlock & { type: 'tool_use' }): string {
    const input = block.input as Record<string, unknown>;

    switch (block.name) {
      case 'Bash':
        return this.truncate(String(input.command || ''), 60);
      case 'Read':
        return this.truncate(String(input.file_path || ''), 60);
      case 'Write':
        return this.truncate(String(input.file_path || ''), 60);
      case 'Edit':
        return this.truncate(String(input.file_path || ''), 60);
      case 'Glob':
        return this.truncate(String(input.pattern || ''), 60);
      case 'Grep':
        return this.truncate(String(input.pattern || ''), 60);
      case 'Task':
        return this.truncate(String(input.description || input.prompt || ''), 60);
      case 'TodoWrite':
        return 'Updating todo list';
      default:
        return this.truncate(JSON.stringify(input), 60);
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  private buildTree(): ConversationNode[] {
    const nodeArray = Array.from(this.nodes.values());
    const rootNodes: ConversationNode[] = [];
    const nodeMap = new Map<string, ConversationNode>();

    // Reset children
    for (const node of nodeArray) {
      node.children = [];
      nodeMap.set(node.id, node);
    }

    // Build parent-child relationships
    for (const node of nodeArray) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(node);
      } else if (!node.parentId) {
        rootNodes.push(node);
      } else {
        // Orphan node - add to roots
        rootNodes.push(node);
      }
    }

    // Sort by timestamp
    const sortByTimestamp = (a: ConversationNode, b: ConversationNode) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

    rootNodes.sort(sortByTimestamp);
    for (const node of nodeArray) {
      node.children.sort(sortByTimestamp);
    }

    // Reorganize: AI response first, tools/thinking nested under it
    return this.reorganizeForDisplay(rootNodes);
  }

  /**
   * Reorganize the tree for better display:
   * - Each user/system message becomes a root
   * - AI text response as first child of user
   * - Thinking, tools, agents nested under AI response
   * - Tool results stay nested under their tool calls
   */
  private reorganizeForDisplay(rootNodes: ConversationNode[]): ConversationNode[] {
    // Flatten the entire tree to get all nodes
    const allNodes = this.flattenTree(rootNodes);
    if (allNodes.length === 0) return rootNodes;

    // IMPORTANT: First, reset ALL children arrays to prevent circular references
    for (const node of allNodes) {
      node.children = [];
    }

    // Sort by timestamp
    const sortByTimestamp = (a: ConversationNode, b: ConversationNode) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    allNodes.sort(sortByTimestamp);

    // Track which nodes have been added to prevent duplicates
    const usedNodes = new Set<string>();

    // Find turn boundaries (user and system messages)
    const turnStarters: ConversationNode[] = [];
    for (const node of allNodes) {
      if (node.type === 'user' || node.type === 'system') {
        turnStarters.push(node);
      }
    }

    if (turnStarters.length === 0) return rootNodes;

    // Build new tree with each turn starter as a root
    const newRoots: ConversationNode[] = [];

    for (let i = 0; i < turnStarters.length; i++) {
      const turnStart = turnStarters[i];
      const nextTurnStart = turnStarters[i + 1];

      // Mark turn starter as used
      usedNodes.add(turnStart.id);

      // Collect nodes for this turn (between this user and next user)
      const turnNodes = allNodes.filter(n => {
        if (n === turnStart) return false;
        if (usedNodes.has(n.id)) return false; // Skip already used nodes
        const nodeTime = new Date(n.timestamp).getTime();
        const startTime = new Date(turnStart.timestamp).getTime();
        const endTime = nextTurnStart ? new Date(nextTurnStart.timestamp).getTime() : Infinity;
        return nodeTime > startTime && nodeTime < endTime;
      });

      // Add user/system message as root
      newRoots.push(turnStart);

      // Find the AI text response (conclusion) for this turn
      const aiTextResponses = turnNodes.filter(n => n.type === 'assistant');
      const aiTextResponse = aiTextResponses[aiTextResponses.length - 1];

      if (aiTextResponse) {
        usedNodes.add(aiTextResponse.id);

        // Collect other node types
        const toolCalls = turnNodes.filter(n =>
          n.type === 'tool_call' || n.type === 'agent' || n.type === 'skill' || n.type === 'command'
        );
        const toolResults = turnNodes.filter(n => n.type === 'tool_result');
        const thinkingNodes = turnNodes.filter(n => n.type === 'thinking');
        const otherAiResponses = aiTextResponses.filter(n => n !== aiTextResponse);

        // Add thinking nodes
        for (const thinking of thinkingNodes) {
          if (!usedNodes.has(thinking.id)) {
            usedNodes.add(thinking.id);
            aiTextResponse.children.push(thinking);
          }
        }

        // Add tool calls with their results
        for (const tool of toolCalls) {
          if (!usedNodes.has(tool.id)) {
            usedNodes.add(tool.id);
            // Find matching tool results
            const matchingResults = toolResults.filter(r => r.parentId === tool.id && !usedNodes.has(r.id));
            for (const result of matchingResults) {
              usedNodes.add(result.id);
              tool.children.push(result);
            }
            aiTextResponse.children.push(tool);
          }
        }

        // Add other AI responses
        for (const other of otherAiResponses) {
          if (!usedNodes.has(other.id)) {
            usedNodes.add(other.id);
            aiTextResponse.children.push(other);
          }
        }

        // Sort AI's children by timestamp
        aiTextResponse.children.sort(sortByTimestamp);

        // Add AI response as sibling (separate root) after user
        newRoots.push(aiTextResponse);
      } else if (turnNodes.length > 0) {
        // No AI text response - add turn nodes as separate roots
        const toolResults = turnNodes.filter(n => n.type === 'tool_result');
        for (const node of turnNodes) {
          if (node.type !== 'tool_result' && !usedNodes.has(node.id)) {
            usedNodes.add(node.id);
            // Find matching tool results
            const matchingResults = toolResults.filter(r => r.parentId === node.id && !usedNodes.has(r.id));
            for (const result of matchingResults) {
              usedNodes.add(result.id);
              node.children.push(result);
            }
            newRoots.push(node);
          }
        }
      }
    }

    return newRoots;
  }

  private flattenTree(nodes: ConversationNode[]): ConversationNode[] {
    const result: ConversationNode[] = [];

    const flatten = (nodeList: ConversationNode[]) => {
      for (const node of nodeList) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          flatten(node.children);
        }
      }
    };

    flatten(nodes);
    return result;
  }

  /**
   * Check if a line is valid JSON before attempting to parse.
   * This prevents errors from partial writes.
   */
  private isValidJsonLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Must start with { and end with }
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return false;
    }

    // Try to parse to validate
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a simple hash of a line for deduplication.
   * Uses the uuid field if present, otherwise a simple hash.
   */
  private hashLine(line: string): string {
    try {
      const parsed = JSON.parse(line);
      // Use uuid as hash if available (most reliable)
      if (parsed.uuid) {
        return parsed.uuid;
      }
      // For file-history-snapshot, use messageId
      if (parsed.messageId) {
        return `snapshot-${parsed.messageId}`;
      }
    } catch {
      // Fall through to string hash
    }

    // Simple string hash as fallback
    let hash = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `hash-${hash}`;
  }
}
