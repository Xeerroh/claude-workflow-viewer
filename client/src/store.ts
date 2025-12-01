import { create } from 'zustand';
import type { ConversationNode, SessionInfo, WsMessage } from '@workflow-viewer/shared';

interface WorkflowStore {
  // Connection state
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // Session state
  sessions: SessionInfo[];
  setSessions: (sessions: SessionInfo[]) => void;
  currentSessionFile: string | null;
  setCurrentSessionFile: (file: string | null) => void;

  // Conversation tree
  nodes: ConversationNode[];
  setNodes: (nodes: ConversationNode[]) => void;
  addNode: (node: ConversationNode) => void;
  clearNodes: () => void;

  // UI state
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  expandedNodeIds: Set<string>;
  toggleExpanded: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // Filter state
  filterType: string | null;
  setFilterType: (type: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showSystem: boolean;
  setShowSystem: (show: boolean) => void;
}

export const useStore = create<WorkflowStore>((set, get) => ({
  // Connection state
  connected: false,
  setConnected: (connected) => set({ connected }),

  // Session state
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  currentSessionFile: null,
  setCurrentSessionFile: (file) => set({ currentSessionFile: file }),

  // Conversation tree
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => {
    // Find parent and add as child, or add to roots
    const updateTree = (nodes: ConversationNode[]): ConversationNode[] => {
      return nodes.map((n) => {
        if (n.id === node.parentId) {
          return { ...n, children: [...n.children, node] };
        }
        if (n.children.length > 0) {
          return { ...n, children: updateTree(n.children) };
        }
        return n;
      });
    };

    const existingParent = findNode(state.nodes, node.parentId);
    if (existingParent) {
      return { nodes: updateTree(state.nodes) };
    }
    return { nodes: [...state.nodes, node] };
  }),
  clearNodes: () => set({ nodes: [], selectedNodeId: null, expandedNodeIds: new Set() }),

  // UI state
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  expandedNodeIds: new Set<string>(),
  toggleExpanded: (id) => set((state) => {
    const newSet = new Set(state.expandedNodeIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    return { expandedNodeIds: newSet };
  }),
  expandAll: () => set((state) => {
    const allIds = getAllNodeIds(state.nodes);
    return { expandedNodeIds: new Set(allIds) };
  }),
  collapseAll: () => set({ expandedNodeIds: new Set() }),

  // Filter state
  filterType: null,
  setFilterType: (type) => set({ filterType: type }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  showSystem: true,  // Shown by default
  setShowSystem: (show) => set({ showSystem: show }),
}));

// Helper functions
function findNode(nodes: ConversationNode[], id: string | null): ConversationNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function getAllNodeIds(nodes: ConversationNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...getAllNodeIds(node.children));
  }
  return ids;
}

// WebSocket connection manager
let ws: WebSocket | null = null;

export function connectWebSocket() {
  const store = useStore.getState();

  if (ws?.readyState === WebSocket.OPEN) {
    return;
  }

  ws = new WebSocket(`ws://${window.location.hostname}:3456`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    store.setConnected(true);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    store.setConnected(false);
    // Reconnect after delay
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    try {
      const message: WsMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'init':
          store.setNodes(message.nodes || []);
          if (message.sessionFile) {
            store.setCurrentSessionFile(message.sessionFile);
          }
          break;
        case 'update':
          if (message.node) {
            store.addNode(message.node);
          }
          break;
        case 'clear':
          store.clearNodes();
          store.setCurrentSessionFile(null);
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
}

export async function fetchSessions(): Promise<void> {
  try {
    const response = await fetch('/api/sessions');
    const sessions = await response.json();
    useStore.getState().setSessions(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
  }
}

export async function watchSession(sessionFile: string): Promise<void> {
  try {
    await fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionFile })
    });
  } catch (error) {
    console.error('Error watching session:', error);
  }
}

export async function stopWatching(): Promise<void> {
  try {
    await fetch('/api/stop', { method: 'POST' });
  } catch (error) {
    console.error('Error stopping watch:', error);
  }
}
