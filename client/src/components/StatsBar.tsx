import { useMemo } from 'react';
import { useStore } from '../store';
import type { ConversationNode } from '@workflow-viewer/shared';
import './StatsBar.css';

export function StatsBar() {
  const { nodes, filterType, setFilterType } = useStore();

  const stats = useMemo(() => computeStats(nodes), [nodes]);

  if (nodes.length === 0) return null;

  const handleFilterClick = (filter: string | null) => {
    // Toggle filter off if clicking the same one
    setFilterType(filterType === filter ? null : filter);
  };

  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-icon">⏱</span>
        <span className="stat-value">{stats.duration}</span>
        <span className="stat-label">Duration</span>
      </div>

      <div
        className={`stat-item clickable ${filterType === 'user' ? 'active' : ''}`}
        onClick={() => handleFilterClick('user')}
        title="Filter to user messages"
      >
        <span className="stat-icon">💬</span>
        <span className="stat-value">{stats.turns}</span>
        <span className="stat-label">Turns</span>
      </div>

      <div
        className={`stat-item clickable ${filterType === 'tool_call' ? 'active' : ''}`}
        onClick={() => handleFilterClick('tool_call')}
        title="Filter to tool calls"
      >
        <span className="stat-icon">🔧</span>
        <span className="stat-value">{stats.toolCalls}</span>
        <span className="stat-label">Tools</span>
      </div>

      <div
        className={`stat-item clickable ${filterType === 'agent' ? 'active' : ''}`}
        onClick={() => handleFilterClick('agent')}
        title="Filter to agents"
      >
        <span className="stat-icon">🚀</span>
        <span className="stat-value">{stats.agents}</span>
        <span className="stat-label">Agents</span>
      </div>

      {stats.errors > 0 && (
        <div
          className={`stat-item stat-error clickable ${filterType === 'errors' ? 'active' : ''}`}
          onClick={() => handleFilterClick('errors')}
          title="Filter to errors"
        >
          <span className="stat-icon">⚠</span>
          <span className="stat-value">{stats.errors}</span>
          <span className="stat-label">Errors</span>
        </div>
      )}

      <div className="stat-item stat-success">
        <span className="stat-icon">✓</span>
        <span className="stat-value">{stats.successRate}%</span>
        <span className="stat-label">Success</span>
      </div>
    </div>
  );
}

interface Stats {
  duration: string;
  turns: number;
  toolCalls: number;
  agents: number;
  errors: number;
  successRate: number;
}

function computeStats(nodes: ConversationNode[]): Stats {
  const allNodes = flattenNodes(nodes);

  // Calculate duration
  const timestamps = allNodes.map(n => new Date(n.timestamp).getTime()).filter(t => !isNaN(t));
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const durationMs = maxTime - minTime;
  const duration = formatDuration(durationMs);

  // Count turns (user messages)
  const turns = allNodes.filter(n => n.type === 'user').length;

  // Count tool calls
  const toolCalls = allNodes.filter(n => n.type === 'tool_call').length;

  // Count agents
  const agents = allNodes.filter(n => n.type === 'agent').length;

  // Count errors
  const errors = allNodes.filter(n => {
    if (n.toolResult?.stderr) return true;
    if (n.type === 'tool_result' && typeof n.content === 'string') {
      const content = n.content.toLowerCase();
      return content.includes('error') || content.includes('failed');
    }
    return false;
  }).length;

  // Calculate success rate
  const totalOperations = toolCalls + agents;
  const successRate = totalOperations > 0
    ? Math.round(((totalOperations - errors) / totalOperations) * 100)
    : 100;

  return { duration, turns, toolCalls, agents, errors, successRate };
}

function flattenNodes(nodes: ConversationNode[]): ConversationNode[] {
  const result: ConversationNode[] = [];
  const flatten = (nodeList: ConversationNode[]) => {
    for (const node of nodeList) {
      result.push(node);
      if (node.children?.length) flatten(node.children);
    }
  };
  flatten(nodes);
  return result;
}

function formatDuration(ms: number): string {
  if (isNaN(ms) || ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

