import { useStore } from '../store';
import './Toolbar.css';

const NODE_TYPES = [
  { value: null, label: 'All' },
  { value: 'user', label: 'User' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'tool_call', label: 'Tools' },
  { value: 'tool_result', label: 'Results' },
  { value: 'agent', label: 'Agents' },
  { value: 'skill', label: 'Skills' },
  { value: 'command', label: 'Commands' },
  { value: 'errors', label: 'Errors' },
];

export function Toolbar() {
  const {
    filterType,
    setFilterType,
    searchQuery,
    setSearchQuery,
    expandAll,
    collapseAll,
    nodes,
    showSystem,
    setShowSystem
  } = useStore();

  const nodeCount = countNodes(nodes, showSystem);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="filter-group">
          {NODE_TYPES.map((type) => (
            <button
              key={type.value || 'all'}
              className={`filter-btn ${filterType === type.value ? 'active' : ''}`}
              onClick={() => setFilterType(type.value)}
            >
              {type.label}
            </button>
          ))}
        </div>
        <label className="system-toggle">
          <input
            type="checkbox"
            checked={showSystem}
            onChange={(e) => setShowSystem(e.target.checked)}
          />
          <span>Show System</span>
        </label>
      </div>

      <div className="toolbar-center">
        <input
          type="text"
          className="search-input"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="toolbar-right">
        <span className="node-count">{nodeCount} items</span>
        <button className="toolbar-btn" onClick={expandAll}>
          Expand All
        </button>
        <button className="toolbar-btn" onClick={collapseAll}>
          Collapse All
        </button>
      </div>
    </div>
  );
}

function countNodes(nodes: any[], showSystem: boolean): number {
  let count = 0;
  for (const node of nodes) {
    if (!showSystem && node.type === 'system') continue;
    count++;
    if (node.children) {
      count += countNodes(node.children, showSystem);
    }
  }
  return count;
}
