import { useEffect } from 'react';
import { useStore, connectWebSocket, fetchSessions } from './store';
import { SessionSelector } from './components/SessionSelector';
import { TreeView } from './components/TreeView';
import { DetailPanel } from './components/DetailPanel';
import { Toolbar } from './components/Toolbar';
import { StatsBar } from './components/StatsBar';
import './App.css';

function App() {
  const { connected, currentSessionFile, selectedNodeId, nodes } = useStore();

  useEffect(() => {
    connectWebSocket();
    fetchSessions();
  }, []);

  const selectedNode = selectedNodeId ? findNode(nodes, selectedNodeId) : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Claude Workflow Viewer</h1>
        <div className="connection-status">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <SessionSelector />
        </aside>

        <main className="main-panel">
          {currentSessionFile ? (
            <>
              <StatsBar />
              <Toolbar />
              <div className="content-area">
                <div className="tree-container">
                  <TreeView />
                </div>
                {selectedNode && (
                  <div className="detail-container">
                    <DetailPanel node={selectedNode} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h2>No Session Selected</h2>
              <p>Select a session from the sidebar to view the workflow</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function findNode(nodes: any[], id: string): any | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children || [], id);
    if (found) return found;
  }
  return null;
}

export default App;
