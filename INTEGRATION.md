# Sparkle MCP Server Integration Guide

## Overview

The Sparkle MCP Server provides secure file access for AI assistants through the Model Context Protocol. When users select MCP in your app, they can give AI access to files in their `~/Sparkle` folder.

## Quick Start

### 1. Install Dependencies

```bash
npm install @modelcontextprotocol/sdk @every-env/sparkle-mcp-server
```

### 2. Basic Integration

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class MCPManager {
  async connect() {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['@every-env/sparkle-mcp-server']
    });

    const client = new Client({
      name: 'your-app',
      version: '1.0.0'
    });

    await client.connect(transport);
    return client;
  }
}
```

## Architecture

### App Side
- **UI**: MCP toggle button, status indicator, file browser
- **Connection Manager**: Handles MCP client lifecycle
- **Tool Invocation**: Calls MCP tools for file operations

### MCP Server Side
- **Sparkle Folder**: `~/Sparkle` - automatically created
- **Security**: Path validation, rate limiting
- **File Operations**: Read, write, search, move files
- **Auto-indexing**: Files are indexed for smart search

## Available Tools

| Tool | Description |
|------|-------------|
| `get_relevant_files` | AI-powered file search |
| `search_files` | Pattern-based file search |
| `read_file` | Read file contents |
| `write_file` | Create/update files |
| `list_directory` | Browse folders |
| `create_directory` | Create folders |
| `move_file` | Move/rename files |
| `get_file_info` | File metadata |
| `health_check` | Server status |

## Security Features

- **Sandboxed**: Only `~/Sparkle` folder accessible
- **Path Validation**: Prevents directory traversal
- **Rate Limiting**: 100 requests/minute
- **File Size Limits**: 100MB max
- **No Symlinks**: By default

## Example Usage

### Connect to MCP
```javascript
const mcpManager = new MCPManager();
await mcpManager.connect();
```

### Search Files
```javascript
const results = await client.callTool('get_relevant_files', {
  query: 'project documentation',
  maxFiles: 10
});
```

### Read File
```javascript
const content = await client.callTool('read_file', {
  path: 'documents/notes.txt'
});
```

### Write File
```javascript
await client.callTool('write_file', {
  path: 'data/output.json',
  content: JSON.stringify(data)
});
```

## User Experience

1. User clicks "Enable MCP" in your app
2. App connects to Sparkle MCP server
3. `~/Sparkle` folder is created (if needed)
4. User drops files into Sparkle folder
5. AI can now access those files
6. User sees file activity in your app

## Error Handling

```javascript
mcpManager.on('error', (error) => {
  if (error.code === 'ENOENT') {
    // Sparkle folder missing
  } else if (error.code === -32001) {
    // Request timeout
  } else {
    // Other errors
  }
});
```

## Testing

Run the test client:
```bash
node examples/app-integration.js
```

## Production Checklist

- [ ] Install MCP server as dependency
- [ ] Add connection management
- [ ] Implement error handling
- [ ] Add UI for MCP status
- [ ] Handle disconnections
- [ ] Add file browser (optional)
- [ ] Test with real users

## Support

- Issues: https://github.com/EveryInc/sparkle-mcp-server/issues
- Docs: See README.md