import { useEffect, useCallback, memo } from 'react';
import { useStore } from '../store';
import type { ConversationNode } from '@workflow-viewer/shared';
import './TreeView.css';

export function TreeView() {
  const { nodes, filterType, searchQuery, showSystem, selectedNodeId, setSelectedNodeId, toggleExpanded } = useStore();

  const filteredNodes = filterNodes(nodes, filterType, searchQuery, showSystem);

  // Flatten visible nodes for keyboard navigation
  const flatNodes = flattenVisibleNodes(filteredNodes);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!flatNodes.length) return;

    const currentIndex = flatNodes.findIndex(n => n.id === selectedNodeId);

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        if (currentIndex < flatNodes.length - 1) {
          setSelectedNodeId(flatNodes[currentIndex + 1].id);
        } else if (currentIndex === -1) {
          setSelectedNodeId(flatNodes[0].id);
        }
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        if (currentIndex > 0) {
          setSelectedNodeId(flatNodes[currentIndex - 1].id);
        }
        break;
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        if (selectedNodeId) {
          toggleExpanded(selectedNodeId);
        }
        break;
      case 'ArrowLeft':
      case 'h':
        e.preventDefault();
        if (selectedNodeId) {
          toggleExpanded(selectedNodeId);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSelectedNodeId(null);
        break;
    }
  }, [flatNodes, selectedNodeId, setSelectedNodeId, toggleExpanded]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected node into view
  useEffect(() => {
    if (selectedNodeId) {
      const element = document.querySelector(`[data-node-id="${selectedNodeId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedNodeId]);

  if (filteredNodes.length === 0) {
    return (
      <div className="tree-empty">
        <p>No items to display</p>
        <p className="tree-empty-hint">Waiting for conversation data...</p>
      </div>
    );
  }

  return (
    <div className="tree-view">
      {filteredNodes.map((node) => (
        <TreeNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: ConversationNode;
  depth: number;
}

const TreeNode = memo(function TreeNode({ node, depth }: TreeNodeProps) {
  // Use individual selectors to minimize re-renders
  const selectedNodeId = useStore(state => state.selectedNodeId);
  const setSelectedNodeId = useStore(state => state.setSelectedNodeId);
  const expandedNodeIds = useStore(state => state.expandedNodeIds);
  const toggleExpanded = useStore(state => state.toggleExpanded);
  const filterType = useStore(state => state.filterType);
  const searchQuery = useStore(state => state.searchQuery);
  const showSystem = useStore(state => state.showSystem);

  const isExpanded = expandedNodeIds.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const filteredChildren = hasChildren
    ? filterNodes(node.children, filterType, searchQuery, showSystem)
    : [];

  const handleClick = () => {
    setSelectedNodeId(node.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(node.id);
  };

  return (
    <div className="tree-node-container" data-node-id={node.id}>
      <div
        className={`tree-node ${isSelected ? 'selected' : ''} type-${node.type}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={handleClick}
      >
        {filteredChildren.length > 0 ? (
          <button className="tree-toggle" onClick={handleToggle}>
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}

        <span className={`tree-type-badge type-${node.type}`}>
          <span className="badge-icon">{getTypeIcon(node.type)}</span>
          <span className="badge-label">{getTypeLabel(node.type)}</span>
        </span>

        {node.type === 'agent' && node.agentType && (
          <span className="tree-agent-type">{node.agentType}</span>
        )}

        {node.type === 'skill' && node.skillName && (
          <span className="tree-skill-name">{node.skillName}</span>
        )}

        {node.type === 'command' && node.commandName && (
          <span className="tree-command-name">{node.commandName}</span>
        )}

        {node.type === 'tool_call' && node.toolName && (
          <span className="tree-tool-name">{node.toolName}</span>
        )}

        <span className="tree-summary">{node.summary}</span>

        <span className="tree-time">{formatTime(node.timestamp)}</span>

        {getStatusIndicator(node)}
      </div>

      {/* Inline preview for tool results */}
      {isExpanded && node.toolResult?.stdout && (
        <div className="tree-inline-preview">
          {getPreviewContent(node.toolResult.stdout)}
        </div>
      )}

      {isExpanded && filteredChildren.length > 0 && (
        <div className="tree-children">
          {filteredChildren.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});

function getTypeIcon(type: string): string {
  switch (type) {
    case 'user': return '👤';
    case 'assistant': return '🤖';
    case 'thinking': return '🧠';
    case 'tool_call': return '🔧';
    case 'tool_result': return '📄';
    case 'agent': return '🚀';
    case 'skill': return '✨';
    case 'command': return '⚡';
    case 'system': return '⚙️';
    default: return '📌';
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

function getPreviewContent(content: string): string {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length <= 3) {
    return lines.join('\n');
  }
  return lines.slice(0, 3).join('\n') + `\n... (+${lines.length - 3} more lines)`;
}

function getStatusIndicator(node: ConversationNode): React.ReactNode {
  // Only show status for tool-related nodes
  if (!['tool_call', 'tool_result', 'agent', 'skill', 'command'].includes(node.type)) {
    return null;
  }

  // Check for errors
  if (node.toolResult?.stderr) {
    return <span className="tree-status error">✗</span>;
  }

  // Check content for error indicators
  if (node.type === 'tool_result' && typeof node.content === 'string') {
    if (node.content.toLowerCase().includes('error') ||
        node.content.toLowerCase().includes('failed') ||
        node.content.toLowerCase().includes('exception')) {
      return <span className="tree-status error">✗</span>;
    }
  }

  // Success - has output without errors
  if (node.toolResult?.stdout !== undefined || node.type === 'tool_result') {
    return <span className="tree-status success">✓</span>;
  }

  return null;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function filterNodes(
  nodes: ConversationNode[],
  filterType: string | null,
  searchQuery: string,
  showSystem: boolean
): ConversationNode[] {
  return nodes.filter((node) => {
    // System filter - hide system messages unless showSystem is true
    if (!showSystem && node.type === 'system') {
      return false;
    }

    // Type filter
    if (filterType && node.type !== filterType) {
      // Check if any children match
      const childrenMatch = node.children && filterNodes(node.children, filterType, searchQuery, showSystem).length > 0;
      if (!childrenMatch) return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSummary = node.summary.toLowerCase().includes(query);
      const matchesTool = node.toolName?.toLowerCase().includes(query);
      const childrenMatch = node.children && filterNodes(node.children, filterType, searchQuery, showSystem).length > 0;
      if (!matchesSummary && !matchesTool && !childrenMatch) return false;
    }

    return true;
  });
}

function flattenVisibleNodes(nodes: ConversationNode[]): ConversationNode[] {
  const result: ConversationNode[] = [];
  const flatten = (nodeList: ConversationNode[]) => {
    for (const node of nodeList) {
      result.push(node);
      if (node.children?.length) {
        flatten(node.children);
      }
    }
  };
  flatten(nodes);
  return result;
}
