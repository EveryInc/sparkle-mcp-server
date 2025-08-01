# Sparkle MCP Server

A secure MCP (Model Context Protocol) server that provides Claude AI with intelligent file access to your Sparkle folder.

## Features

- 🔒 **Secure**: Only accesses files in `~/Sparkle` folder
- 🧠 **AI-Powered**: Smart file search with natural language
- ⚡ **Real-time**: Monitors folder for instant file indexing
- 🛠 **Full Filesystem**: Read, write, search, organize files
- 🚀 **Zero Setup**: Creates Sparkle folder automatically

## Quick Start

### With Sparkle App (Recommended)
1. Open Sparkle app settings
2. Click "Connect to Claude AI"
3. Follow the setup instructions

### Manual Setup
Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "sparkle": {
      "command": "npx",
      "args": ["-y", "@every/sparkle-mcp-server"]
    }
  }
}
```

## Available Tools

- `search_files` - Recursive pattern search with exclusions
- `read_file` - Read any file contents
- `write_file` - Create or overwrite files
- `list_directory` - List folder contents
- `create_directory` - Create new folders  
- `move_file` - Move or rename files
- `get_file_info` - File metadata and permissions
- `get_relevant_files` - AI-powered smart file discovery

## Usage Examples

```
"What's in my Sparkle folder?"
"Find my tax documents from 2023"
"Read my notes.txt file"
"Create a shopping list file"
"Move all invoices to an Invoices folder"
```

## Security

- Only accesses `~/Sparkle` folder
- Blocks access to system and sensitive directories
- Rate limiting and file size restrictions
- No external network access

## Development

```bash
git clone https://github.com/EveryInc/sparkle-mcp-server.git
cd sparkle-mcp-server
npm install
npm run build
npm start
```

## License

MIT © Every Inc