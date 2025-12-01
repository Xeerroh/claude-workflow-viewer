# Claude Workflow Viewer

A real-time viewer for Claude Code session files. Watch your AI conversations unfold with a clean, organized interface that shows messages, tool calls, thinking, and more.

![Claude Workflow Viewer](https://img.shields.io/badge/Claude-Workflow%20Viewer-blue)

## Features

- **Session Browser** - Browse and search all your Claude Code sessions, grouped by project
- **Real-time Updates** - Watch conversations update live via WebSocket as you work
- **Tree View** - Visualize conversation flow with collapsible nodes
- **Detail Panel** - Inspect messages, tool inputs/outputs, diffs, and AI thinking
- **Smart Filtering** - Filter by message type (user, assistant, tools, thinking, system)
- **Search** - Find specific content across your session

### Supported Node Types

- User messages
- AI responses and thinking blocks
- Tool calls (Bash, Read, Write, Edit, Glob, Grep, etc.)
- Agents (Task tool with subagents)
- Skills and Slash Commands
- System messages

## Prerequisites

- Node.js 18+
- npm
- Claude Code (sessions are stored in `~/.claude/projects/`)

## Installation

```bash
# Clone the repository
git clone https://github.com/Xeerroh/claude-workflow-viewer.git
cd claude-workflow-viewer

# Install dependencies
npm install
```

## Usage

```bash
# Start the development server
npm run dev
```

This starts:
- **Backend server** on http://localhost:3456
- **Frontend client** on http://localhost:5173

Open the client URL in your browser to view your sessions.

## Project Structure

```
├── client/          # React frontend (Vite + TypeScript)
│   └── src/
│       ├── components/   # UI components
│       └── store.ts      # Zustand state management
├── server/          # Node.js backend (Express + WebSocket)
│   └── src/
│       ├── index.ts           # Server entry point
│       ├── session-manager.ts # Session listing & metadata
│       └── session-watcher.ts # File watching & parsing
└── shared/          # Shared TypeScript types
```

## How It Works

1. The server scans `~/.claude/projects/` for `.jsonl` session files
2. When you select a session, it parses the JSONL and builds a conversation tree
3. File changes trigger WebSocket updates for real-time viewing
4. The client renders the tree with filtering, search, and detailed inspection

## License

MIT
