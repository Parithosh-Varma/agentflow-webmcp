# AgentFlow — Visual Workflow Builder × WebMCP

A visual workflow builder where humans and AI agents co-create automation pipelines in real-time.

## What it does

AgentFlow lets you drag-and-drop nodes on a canvas to build workflows. AI agents can interact with your workflow through **8 WebMCP tools** — discovering nodes, adding connections, executing workflows, validating configurations, and more.

### WebMCP Tools

| Tool | Description |
|------|-------------|
| `add_node` | Add a new node (API Call, Transform, Condition, Output, Delay) |
| `connect_nodes` | Connect two nodes with a directed edge |
| `execute_workflow` | Run the entire workflow in topological order |
| `get_available_tools` | Discover all available tool definitions |
| `get_node_details` | Get detailed info about a specific node |
| `update_node_config` | Update node configuration without recreating |
| `get_workflow_status` | Get current workflow state |
| `validate_workflow` | Check for errors, missing connections, cycles |

## Why WebMCP?

WebMCP lets agents interact with the canvas directly — no DOM scraping, no guessing. Agents call structured tools with JSON schemas. This means:

- **Agents can build workflows** by calling `add_node` and `connect_nodes`
- **Agents can debug workflows** by calling `validate_workflow` and `get_node_details`
- **Agents can execute workflows** and inspect results via `execute_workflow`
- **Humans and agents collaborate** on the same canvas in real-time

## Tech Stack

- **Frontend**: React + TypeScript + React Flow
- **Backend**: Express.js
- **WebMCP**: 8 registered tools via `document.modelContext.registerTool()`
- **Deploy**: Render

## Getting Started

```bash
# Backend
cd backend
npm install
node index.js

# Frontend
cd frontend
npm install
npm run dev
```

## License

MIT
