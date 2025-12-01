import { useState } from 'react';
import type { ConversationNode, ThinkingBlock, TextBlock, ToolUseBlock } from '@workflow-viewer/shared';
import { useStore } from '../store';
import { JsonTree } from './JsonTree';
import { CodeBlock, FileList } from './CodeBlock';
import { DiffView } from './DiffView';
import './DetailPanel.css';

interface DetailPanelProps {
  node: ConversationNode;
}

export function DetailPanel({ node }: DetailPanelProps) {
  const { setSelectedNodeId } = useStore();
  const [showRaw, setShowRaw] = useState(false);

  const status = getNodeStatus(node);

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-left">
          <span className={`detail-type-badge type-${node.type}`}>
            {getTypeLabel(node.type)}
          </span>
          {status && (
            <span className={`detail-status status-${status.type}`}>
              {status.icon} {status.label}
            </span>
          )}
        </div>
        <button className="detail-close" onClick={() => setSelectedNodeId(null)}>
          ×
        </button>
      </div>

      <div className="detail-content">
        {renderNodeContent(node)}

        <div className="detail-meta">
          <span className="detail-timestamp">
            {new Date(node.timestamp).toLocaleString()}
          </span>
          <button
            className="detail-raw-toggle"
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? 'Hide' : 'Show'} Raw Data
          </button>
        </div>

        {showRaw && (
          <div className="detail-section">
            <div className="detail-label">Raw Data</div>
            <JsonTree data={node.raw} initialExpanded={false} maxDepth={2} />
          </div>
        )}
      </div>
    </div>
  );
}

function getNodeStatus(node: ConversationNode): { type: 'success' | 'error' | 'warning'; icon: string; label: string } | null {
  // Check for errors in tool results
  if (node.type === 'tool_result') {
    if (node.toolResult?.stderr || (typeof node.content === 'string' && node.content.toLowerCase().includes('error'))) {
      return { type: 'error', icon: '✗', label: 'Error' };
    }
    return { type: 'success', icon: '✓', label: 'Success' };
  }

  // Check tool call results
  if (node.type === 'tool_call' || node.type === 'agent' || node.type === 'skill' || node.type === 'command') {
    if (node.toolResult?.stderr) {
      return { type: 'error', icon: '✗', label: 'Failed' };
    }
    if (node.toolResult?.stdout !== undefined) {
      return { type: 'success', icon: '✓', label: 'Completed' };
    }
  }

  return null;
}

function renderNodeContent(node: ConversationNode) {
  switch (node.type) {
    case 'user':
      return renderUserMessage(node);
    case 'assistant':
      return renderAssistantMessage(node);
    case 'thinking':
      return renderThinking(node);
    case 'tool_call':
      return renderToolCall(node);
    case 'tool_result':
      return renderToolResult(node);
    case 'agent':
      return renderAgentCall(node);
    case 'skill':
      return renderSkillCall(node);
    case 'command':
      return renderCommandCall(node);
    case 'system':
      return renderSystemMessage(node);
    default:
      return <div className="detail-text">{JSON.stringify(node.content, null, 2)}</div>;
  }
}

function renderUserMessage(node: ConversationNode) {
  const content = typeof node.content === 'string' ? node.content : '';
  return (
    <div className="detail-section">
      <div className="detail-label">User Request</div>
      <div className="detail-user-message">{content}</div>
    </div>
  );
}

function renderAssistantMessage(node: ConversationNode) {
  const block = node.content;
  if (block && typeof block === 'object' && 'text' in block) {
    return (
      <div className="detail-section">
        <div className="detail-label">AI Response</div>
        <div className="detail-assistant-message">{(block as TextBlock).text}</div>
      </div>
    );
  }
  return null;
}

function renderThinking(node: ConversationNode) {
  const block = node.content;
  if (block && typeof block === 'object' && 'thinking' in block) {
    const thinking = (block as ThinkingBlock).thinking;
    return (
      <div className="detail-section">
        <div className="detail-label">AI Reasoning</div>
        <div className="detail-thinking">{thinking}</div>
      </div>
    );
  }
  return null;
}

function renderToolCall(node: ConversationNode) {
  const input = node.toolInput || {};
  const toolName = node.toolName || 'Unknown Tool';

  return (
    <>
      <div className="detail-section">
        <div className="detail-label">Operation</div>
        <div className="detail-operation">
          <span className="detail-operation-name">{toolName}</span>
          <span className="detail-operation-desc">{getToolDescription(toolName, input)}</span>
        </div>
      </div>

      {renderToolInput(toolName, input)}
      {renderToolOutput(node)}
    </>
  );
}

function renderAgentCall(node: ConversationNode) {
  const input = node.toolInput || {};
  const agentType = node.agentType || 'unknown';
  const description = String(input.description || '');
  const prompt = String(input.prompt || '');

  return (
    <>
      <div className="detail-section">
        <div className="detail-label">Agent Deployed</div>
        <div className="detail-agent-header">
          <span className="detail-agent-type">{agentType}</span>
          {description && <span className="detail-agent-desc">{description}</span>}
        </div>
      </div>

      {prompt && (
        <div className="detail-section">
          <div className="detail-label">Task Given to Agent</div>
          <div className="detail-agent-prompt">{prompt}</div>
        </div>
      )}

      {renderToolOutput(node)}
    </>
  );
}

function renderSkillCall(node: ConversationNode) {
  const skillName = node.skillName || 'unknown';

  return (
    <>
      <div className="detail-section">
        <div className="detail-label">Skill Invoked</div>
        <div className="detail-skill-name">{skillName}</div>
      </div>

      {renderToolOutput(node)}
    </>
  );
}

function renderCommandCall(node: ConversationNode) {
  const commandName = node.commandName || 'unknown';

  return (
    <>
      <div className="detail-section">
        <div className="detail-label">Slash Command</div>
        <div className="detail-command-name">{commandName}</div>
      </div>

      {renderToolOutput(node)}
    </>
  );
}

function renderToolResult(node: ConversationNode) {
  const content = typeof node.content === 'string' ? node.content : JSON.stringify(node.content, null, 2);
  const isError = node.toolResult?.stderr || content.toLowerCase().includes('error');

  // Check if content is JSON
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return (
        <div className="detail-section">
          <div className="detail-label">{isError ? 'Error Output' : 'Result'}</div>
          <JsonTree data={parsed} initialExpanded={true} maxDepth={4} />
        </div>
      );
    } catch {
      // Not valid JSON
    }
  }

  // Check if it looks like a file list
  const lines = content.trim().split('\n');
  const looksLikeFileList = lines.length > 1 && lines.every(line =>
    /^[A-Za-z]:[\\\/]|^\/|^\.\//.test(line.trim()) || /\.(ts|tsx|js|jsx|css|json|md|py|go|rs|java|c|cpp|h)$/i.test(line.trim())
  );

  if (looksLikeFileList) {
    return (
      <div className="detail-section">
        <div className="detail-label">Files ({lines.length})</div>
        <FileList files={lines.filter(l => l.trim())} />
      </div>
    );
  }

  return (
    <div className="detail-section">
      <div className="detail-label">{isError ? 'Error Output' : 'Result'}</div>
      <CodeBlock
        content={content}
        variant={isError ? 'error' : 'success'}
      />
    </div>
  );
}

function renderSystemMessage(node: ConversationNode) {
  const content = typeof node.content === 'string' ? node.content : '';

  // Don't show raw content for infrastructure/boilerplate system messages
  const isBoilerplate = content.includes('Caveat: The messages below were generated by the user') ||
    content.includes('<command-message>') ||
    content.includes('<local-command-stdout>');

  return (
    <div className="detail-section">
      <div className="detail-label">System Message</div>
      <div className="detail-system-message">{node.summary}</div>
      {!isBoilerplate && content && content !== node.summary && (
        <pre className="detail-code">{content.slice(0, 500)}...</pre>
      )}
    </div>
  );
}

function getToolDescription(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return 'Execute shell command';
    case 'Read':
      return `Read file`;
    case 'Write':
      return `Write file`;
    case 'Edit':
      return `Edit file`;
    case 'Glob':
      return `Find files matching pattern`;
    case 'Grep':
      return `Search for pattern in files`;
    case 'TodoWrite':
      return 'Update task list';
    case 'WebFetch':
      return 'Fetch web content';
    case 'WebSearch':
      return 'Search the web';
    case 'AskUserQuestion':
      return 'Ask user for input';
    default:
      return 'Execute operation';
  }
}

function renderToolInput(toolName: string, input: Record<string, unknown>) {
  switch (toolName) {
    case 'Bash':
      return (
        <div className="detail-section">
          <div className="detail-label">Command</div>
          <CodeBlock
            content={String(input.command || '')}
            language="shell"
            variant="command"
            showLineNumbers={false}
            title={input.description ? String(input.description) : undefined}
          />
        </div>
      );

    case 'Read':
      return (
        <div className="detail-section">
          <div className="detail-label">File Path</div>
          <div className="detail-file-path">{String(input.file_path || '')}</div>
          {(input.offset || input.limit) && (
            <div className="detail-hint">
              Lines {input.offset || 0} to {(Number(input.offset) || 0) + (Number(input.limit) || 0)}
            </div>
          )}
        </div>
      );

    case 'Write':
      const filePath = String(input.file_path || '');
      const fileExt = filePath.split('.').pop()?.toLowerCase();
      return (
        <>
          <div className="detail-section">
            <div className="detail-label">File Path</div>
            <div className="detail-file-path">{filePath}</div>
          </div>
          {input.content && (
            <div className="detail-section">
              <div className="detail-label">Content Written</div>
              <CodeBlock
                content={String(input.content)}
                language={extToLanguage(fileExt)}
                maxLines={40}
              />
            </div>
          )}
        </>
      );

    case 'Edit':
      const editPath = String(input.file_path || '');
      const editExt = editPath.split('.').pop()?.toLowerCase();
      return (
        <>
          <div className="detail-section">
            <div className="detail-label">File Path</div>
            <div className="detail-file-path">{editPath}</div>
          </div>
          <div className="detail-section">
            <div className="detail-label">Change</div>
            <DiffView
              oldContent={String(input.old_string || '')}
              newContent={String(input.new_string || '')}
              language={extToLanguage(editExt)}
            />
          </div>
        </>
      );

    case 'Glob':
      return (
        <div className="detail-section">
          <div className="detail-label">Pattern</div>
          <div className="detail-pattern">{String(input.pattern || '')}</div>
          {input.path && <div className="detail-hint">in {String(input.path)}</div>}
        </div>
      );

    case 'Grep':
      return (
        <div className="detail-section">
          <div className="detail-label">Search Pattern</div>
          <div className="detail-pattern">{String(input.pattern || '')}</div>
          {input.path && <div className="detail-hint">in {String(input.path)}</div>}
          {input.glob && <div className="detail-hint">files: {String(input.glob)}</div>}
        </div>
      );

    case 'TodoWrite':
      const todos = input.todos as Array<{ content: string; status: string }> | undefined;
      if (todos && Array.isArray(todos)) {
        return (
          <div className="detail-section">
            <div className="detail-label">Task List Update</div>
            <div className="detail-todos">
              {todos.map((todo, i) => (
                <div key={i} className={`detail-todo status-${todo.status}`}>
                  <span className="todo-status">{getStatusIcon(todo.status)}</span>
                  <span className="todo-content">{todo.content}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
      return null;

    case 'WebSearch':
      return (
        <div className="detail-section">
          <div className="detail-label">Search Query</div>
          <div className="detail-pattern">{String(input.query || '')}</div>
        </div>
      );

    default:
      return (
        <div className="detail-section">
          <div className="detail-label">Parameters</div>
          <JsonTree data={input} initialExpanded={true} maxDepth={3} />
        </div>
      );
  }
}

function extToLanguage(ext: string | undefined): string | undefined {
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
    case 'scss':
      return 'css';
    case 'html':
      return 'html';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'sql':
      return 'sql';
    default:
      return undefined;
  }
}

function renderToolOutput(node: ConversationNode) {
  if (!node.toolResult) return null;

  const { stdout, stderr } = node.toolResult;

  if (stderr) {
    return (
      <div className="detail-section">
        <div className="detail-label">Error</div>
        <CodeBlock
          content={stderr}
          variant="error"
          showLineNumbers={stderr.split('\n').length > 3}
        />
      </div>
    );
  }

  if (stdout) {
    // Check if output looks like a file list (common from Glob/Grep)
    const lines = stdout.trim().split('\n');
    const looksLikeFileList = lines.length > 1 && lines.every(line =>
      /^[A-Za-z]:[\\\/]|^\/|^\.\// .test(line.trim()) || /\.(ts|tsx|js|jsx|css|json|md|py|go|rs|java|c|cpp|h)$/i.test(line.trim())
    );

    if (looksLikeFileList) {
      return (
        <div className="detail-section">
          <div className="detail-label">Files Found ({lines.length})</div>
          <FileList files={lines.filter(l => l.trim())} />
        </div>
      );
    }

    // Check if output is JSON
    const trimmed = stdout.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return (
          <div className="detail-section">
            <div className="detail-label">Output (JSON)</div>
            <JsonTree data={parsed} initialExpanded={true} maxDepth={4} />
          </div>
        );
      } catch {
        // Not valid JSON, fall through
      }
    }

    return (
      <div className="detail-section">
        <div className="detail-label">Output</div>
        <CodeBlock
          content={stdout}
          variant="success"
        />
      </div>
    );
  }

  return null;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓';
    case 'in_progress': return '→';
    case 'pending': return '○';
    default: return '·';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'user': return 'User';
    case 'assistant': return 'AI';
    case 'thinking': return 'Thinking';
    case 'tool_call': return 'Tool';
    case 'tool_result': return 'Result';
    case 'agent': return 'Agent';
    case 'skill': return 'Skill';
    case 'command': return 'Command';
    case 'system': return 'System';
    default: return type;
  }
}
