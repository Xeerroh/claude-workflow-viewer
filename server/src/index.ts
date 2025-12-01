import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionWatcher } from './session-watcher.js';
import { SessionManager } from './session-manager.js';
import type { WsMessage } from '@workflow-viewer/shared';

const PORT = process.env.PORT || 3456;
const CLAUDE_DIR = process.env.CLAUDE_DIR || `${process.env.USERPROFILE || process.env.HOME}/.claude`;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const sessionManager = new SessionManager(CLAUDE_DIR);
let currentWatcher: SessionWatcher | null = null;

// Broadcast to all connected clients
function broadcast(message: WsMessage) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// REST API endpoints
app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await sessionManager.listSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const session = await sessionManager.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session' });
  }
});

app.post('/api/watch', async (req, res) => {
  const { sessionFile } = req.body;

  if (!sessionFile) {
    return res.status(400).json({ error: 'sessionFile is required' });
  }

  try {
    // Stop existing watcher
    if (currentWatcher) {
      currentWatcher.stop();
    }

    // Start new watcher
    currentWatcher = new SessionWatcher(sessionFile);

    currentWatcher.on('init', (nodes) => {
      broadcast({ type: 'init', nodes, sessionFile });
    });

    currentWatcher.on('update', (node) => {
      broadcast({ type: 'update', node });
    });

    await currentWatcher.start();

    res.json({ success: true, sessionFile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start watching session' });
  }
});

app.post('/api/stop', (_req, res) => {
  if (currentWatcher) {
    currentWatcher.stop();
    currentWatcher = null;
    broadcast({ type: 'clear' });
  }
  res.json({ success: true });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state if watching
  if (currentWatcher) {
    const nodes = currentWatcher.getNodes();
    const message: WsMessage = {
      type: 'init',
      nodes,
      sessionFile: currentWatcher.getFilePath()
    };
    ws.send(JSON.stringify(message));
  }

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Workflow Viewer server running on http://localhost:${PORT}`);
  console.log(`Claude directory: ${CLAUDE_DIR}`);
});
