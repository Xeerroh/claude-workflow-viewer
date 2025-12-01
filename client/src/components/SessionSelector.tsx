import { useEffect, useState, useMemo } from 'react';
import { useStore, fetchSessions, watchSession, stopWatching } from '../store';
import type { SessionInfo } from '@workflow-viewer/shared';
import './SessionSelector.css';

type SortOption = 'recent' | 'oldest' | 'project' | 'size' | 'messages';
type GroupMode = 'none' | 'project';

export function SessionSelector() {
  const { sessions, currentSessionFile } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [groupBy, setGroupBy] = useState<GroupMode>('project');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort sessions
  const processedSessions = useMemo(() => {
    let filtered = sessions;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = sessions.filter(s =>
        s.projectPath.toLowerCase().includes(query) ||
        s.sessionId.toLowerCase().includes(query) ||
        s.firstMessage?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case 'oldest':
          return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
        case 'project':
          return a.projectPath.localeCompare(b.projectPath);
        case 'size':
          return (b.fileSize || 0) - (a.fileSize || 0);
        case 'messages':
          return (b.messageCount || 0) - (a.messageCount || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [sessions, searchQuery, sortBy]);

  // Group sessions by project
  const groupedSessions = useMemo(() => {
    if (groupBy === 'none') {
      return { '': processedSessions };
    }

    const groups: Record<string, SessionInfo[]> = {};
    for (const session of processedSessions) {
      const key = session.projectName || getProjectName(session.projectPath);
      if (!groups[key]) groups[key] = [];
      groups[key].push(session);
    }
    return groups;
  }, [processedSessions, groupBy]);

  const handleSelectSession = async (filePath: string) => {
    if (currentSessionFile === filePath) {
      await stopWatching();
    } else {
      await watchSession(filePath);
    }
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const totalSessions = sessions.length;
  const liveSessions = sessions.filter(s => s.isLive).length;

  return (
    <div className="session-selector">
      <div className="session-header">
        <div className="session-header-top">
          <h2>Sessions</h2>
          <div className="session-counts">
            {liveSessions > 0 && (
              <span className="live-count" title="Active sessions">
                <span className="live-dot" /> {liveSessions}
              </span>
            )}
            <span className="total-count">{totalSessions}</span>
          </div>
        </div>
        <div className="session-search">
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button
            className={`filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Filter options"
          >
            <span className="filter-icon">⚙</span>
          </button>
          <button className="refresh-btn" onClick={() => fetchSessions()} title="Refresh">
            ↻
          </button>
        </div>
        {showFilters && (
          <div className="session-filters">
            <div className="filter-group">
              <label>Sort:</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="project">By Project</option>
                <option value="size">By Size</option>
                <option value="messages">By Messages</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Group:</label>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupMode)}>
                <option value="project">By Project</option>
                <option value="none">No Grouping</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="session-list">
        {processedSessions.length === 0 ? (
          <div className="no-sessions">
            {searchQuery ? 'No matching sessions' : 'No sessions found'}
          </div>
        ) : groupBy === 'none' ? (
          processedSessions.map((session) => (
            <SessionItem
              key={session.sessionId}
              session={session}
              isActive={currentSessionFile === session.filePath}
              onClick={() => handleSelectSession(session.filePath)}
            />
          ))
        ) : (
          Object.entries(groupedSessions).map(([groupName, groupSessions]) => (
            <div key={groupName} className="session-group">
              <button
                className="session-group-header"
                onClick={() => toggleGroup(groupName)}
              >
                <span className={`group-toggle ${collapsedGroups.has(groupName) ? '' : 'expanded'}`}>
                  ▶
                </span>
                <span className="group-name">{groupName}</span>
                <span className="group-count">{groupSessions.length}</span>
                {groupSessions.some(s => s.isLive) && (
                  <span className="group-live-indicator" title="Has active sessions">●</span>
                )}
              </button>
              {!collapsedGroups.has(groupName) && (
                <div className="session-group-items">
                  {groupSessions.map((session) => (
                    <SessionItem
                      key={session.sessionId}
                      session={session}
                      isActive={currentSessionFile === session.filePath}
                      onClick={() => handleSelectSession(session.filePath)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface SessionItemProps {
  session: SessionInfo;
  isActive: boolean;
  onClick: () => void;
  compact?: boolean;
}

function SessionItem({ session, isActive, onClick, compact }: SessionItemProps) {
  const projectName = session.projectName || getProjectName(session.projectPath);

  return (
    <button
      className={`session-item ${isActive ? 'active' : ''} ${session.isLive ? 'live' : ''} ${compact ? 'compact' : ''}`}
      onClick={onClick}
    >
      <div className="session-item-header">
        {!compact && (
          <span className="session-project">{projectName}</span>
        )}
        {session.gitBranch && (
          <span className="branch-badge" title={`Branch: ${session.gitBranch}`}>
            {session.gitBranch}
          </span>
        )}
        {session.isLive && <span className="live-badge">LIVE</span>}
      </div>

      {session.firstMessage && (
        <div className="session-preview" title={session.firstMessage}>
          {session.firstMessage}
        </div>
      )}

      <div className="session-meta">
        <span className="session-time">{formatDate(session.lastModified)}</span>
        {session.messageCount !== undefined && session.messageCount > 0 && (
          <span className="session-stat" title="User messages">
            💬 {session.messageCount}
          </span>
        )}
        {session.toolCount !== undefined && session.toolCount > 0 && (
          <span className="session-stat" title="Tool calls">
            🔧 {session.toolCount}
          </span>
        )}
        {session.duration !== undefined && session.duration > 0 && (
          <span className="session-stat" title="Duration">
            ⏱ {formatDuration(session.duration)}
          </span>
        )}
        {session.fileSize !== undefined && (
          <span className="session-size" title="File size">
            {formatFileSize(session.fileSize)}
          </span>
        )}
      </div>

      <div className="session-id">{session.sessionId.slice(0, 8)}...</div>
    </button>
  );
}

function getProjectName(projectPath: string): string {
  const parts = projectPath.split(/[/\\]/);
  return parts[parts.length - 1] || projectPath;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

function formatDuration(ms: number): string {
  if (ms < 60000) return '<1m';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
