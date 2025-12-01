import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import type { SessionInfo, ConversationEntry } from '@workflow-viewer/shared';

export class SessionManager {
  private claudeDir: string;
  private sessionCache: Map<string, { info: SessionInfo; timestamp: number }> = new Map();
  private cacheTTL = 30000; // 30 seconds

  constructor(claudeDir: string) {
    this.claudeDir = claudeDir;
  }

  async listSessions(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    const projectsDir = join(this.claudeDir, 'projects');
    const now = Date.now();

    try {
      const projectFolders = await readdir(projectsDir);

      for (const projectFolder of projectFolders) {
        const projectPath = join(projectsDir, projectFolder);
        const projectStat = await stat(projectPath);

        if (!projectStat.isDirectory()) continue;

        const files = await readdir(projectPath);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

        for (const file of jsonlFiles) {
          const filePath = join(projectPath, file);
          const fileStat = await stat(filePath);
          const sessionId = file.replace('.jsonl', '');

          // Decode project path
          const decodedProjectPath = projectFolder
            .replace(/^C--/, 'C:/')
            .replace(/--/g, '/')
            .replace(/-/g, ' ');

          const lastModified = fileStat.mtime.toISOString();
          const isLive = (now - fileStat.mtime.getTime()) < 300000; // 5 minutes

          // Check cache for metadata
          const cached = this.sessionCache.get(filePath);
          const cacheValid = cached &&
            (now - cached.timestamp < this.cacheTTL) &&
            cached.info.lastModified === lastModified;

          if (cacheValid) {
            sessions.push({ ...cached.info, isLive });
          } else {
            // Get enhanced metadata
            const metadata = await this.getSessionMetadata(filePath, fileStat.size);

            const sessionInfo: SessionInfo = {
              sessionId,
              filePath,
              projectPath: decodedProjectPath,
              lastModified,
              fileSize: fileStat.size,
              isLive,
              ...metadata
            };

            // Cache the result
            this.sessionCache.set(filePath, { info: sessionInfo, timestamp: now });
            sessions.push(sessionInfo);
          }
        }
      }

      // Sort by last modified, newest first
      sessions.sort((a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );

      return sessions;
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  private async getSessionMetadata(filePath: string, fileSize: number): Promise<{
    messageCount: number;
    toolCount: number;
    firstMessage: string;
    duration: number;
  }> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      let firstUserMessage = '';
      let messageCount = 0;
      let toolCount = 0;
      let firstTimestamp: number | null = null;
      let lastTimestamp: number | null = null;

      for (const line of lines) {
        try {
          const entry: ConversationEntry = JSON.parse(line);

          // Track timestamps for duration
          if ('timestamp' in entry) {
            const ts = new Date(entry.timestamp).getTime();
            if (!isNaN(ts)) {
              if (firstTimestamp === null) firstTimestamp = ts;
              lastTimestamp = ts;
            }
          }

          if ('type' in entry) {
            if (entry.type === 'user') {
              messageCount++;
              if (!firstUserMessage && 'message' in entry) {
                const msg = entry.message;
                if ('content' in msg && typeof msg.content === 'string') {
                  const content = msg.content;

                  // Skip system/boilerplate messages
                  if (this.isBoilerplateMessage(content)) {
                    continue;
                  }

                  // Clean up the first message
                  firstUserMessage = content
                    .replace(/<[^>]+>/g, '') // Remove XML tags
                    .replace(/\s+/g, ' ')    // Normalize whitespace
                    .trim()
                    .slice(0, 150);
                }
              }
            } else if (entry.type === 'assistant' && 'message' in entry) {
              // Count tool uses
              const assistantMsg = entry.message;
              if (assistantMsg && 'content' in assistantMsg && Array.isArray(assistantMsg.content)) {
                toolCount += assistantMsg.content.filter(
                  (block: any) => block.type === 'tool_use'
                ).length;
              }
            }
          }
        } catch {
          // Skip invalid lines
        }
      }

      const duration = firstTimestamp && lastTimestamp
        ? lastTimestamp - firstTimestamp
        : 0;

      return {
        messageCount,
        toolCount,
        firstMessage: firstUserMessage,
        duration
      };
    } catch (error) {
      return { messageCount: 0, toolCount: 0, firstMessage: '', duration: 0 };
    }
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const sessions = await this.listSessions();
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  private isBoilerplateMessage(content: string): boolean {
    // Caveat messages
    if (content.includes('Caveat: The messages below were generated by the user')) {
      return true;
    }

    // Empty command output
    if (content.includes('<local-command-stdout>')) {
      return true;
    }

    // Command invocation infrastructure
    if (content.includes('<command-name>') && content.includes('<command-message>')) {
      return true;
    }

    // JSON-formatted text blocks that contain caveat
    if (content.startsWith('[{"type":"text"')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed[0]?.type === 'text') {
          const text = parsed[0].text || '';
          if (text.includes('Caveat: The messages below were generated by the user')) {
            return true;
          }
        }
      } catch {
        // Not valid JSON
      }
    }

    return false;
  }
}
