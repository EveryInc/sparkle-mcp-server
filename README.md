# Sparkle MCP Server

A powerful Model Context Protocol (MCP) server that provides secure file access and clipboard history management for Claude AI and other MCP-compatible clients.

## Features

- **Secure File Access**: Restricted to `~/Sparkle` folder for safe AI file operations
- **Advanced File Search**: Pattern matching, content search, and relevance scoring
- **Clipboard History**: Search and query clipboard history from `~/Sparkle/Pasteboard/`
- **Binary File Support**: Handles PDFs, images, and other binary files (up to 100MB)
- **Smart File Indexing**: Automatic file indexing with 50KB content sampling for search
- **Multiple File Operations**: Read, write, move, create directories, and get file info

## Installation

### Option 1: NPM Install (Recommended)

```bash
npm install -g @every-env/sparkle-mcp-server
```

### Option 2: From Source

```bash
git clone https://github.com/EveryInc/sparkle-mcp-server.git
cd sparkle-mcp-server
npm install
npm run build
npm link
```

## Quick Setup

### Option 1: Zero Install (Recommended) 🚀

Just add this to your Claude Desktop config (`~/.config/claude/config.json`):

```json
{
  "mcpServers": {
    "sparkle": {
      "command": "npx",
      "args": ["-y", "@every-env/sparkle-mcp-server"]
    }
  }
}
```

That's it! Restart Claude Desktop and you're done. No installation needed!

### Option 2: Traditional Install

If you prefer a local installation:

```bash
npm install -g @every-env/sparkle-mcp-server
```

Then use this config:
```json
{
  "mcpServers": {
    "sparkle": {
      "command": "sparkle-mcp"
    }
  }
}
```

## Available Tools

### File Operations
- `list_directory` - List files and directories
- `search_files` - Search with glob patterns (`*`, `*.txt`, etc.)
- `get_relevant_files` - AI-powered file search and ranking
- `read_file` - Read file contents (text and binary)
- `write_file` - Create or overwrite files
- `move_file` - Move or rename files
- `create_directory` - Create directories
- `get_file_info` - Get file metadata

### Clipboard History
- `search_clipboard` - Search clipboard history with filters
- `get_clipboard_by_date` - Get clipboard entries for a specific date
- `get_recent_clipboard` - Get recent clipboard entries
- `clipboard_stats` - Usage statistics and analytics

### System
- `health_check` - Server status and diagnostics

## Usage Examples

### Basic File Operations
```javascript
// List all files in Sparkle folder
list_directory({ path: "" })

// Search for all text files
search_files({ path: "", pattern: "*.txt" })

// Find relevant files with AI
get_relevant_files({ query: "my tax documents", maxFiles: 5 })
```

### Clipboard History
```javascript
// Search clipboard for specific text
search_clipboard({ query: "password", limit: 20 })

// Get today's clipboard
get_clipboard_by_date({ date: "2025-08-05" })

// Recent clipboard history
get_recent_clipboard({ days: 7, limit: 50 })
```

## Directory Structure

```
~/Sparkle/                    # Main Sparkle directory
├── README.txt               # Welcome file (auto-created)
├── Pasteboard/              # Clipboard history
│   ├── 2025-08-05/         # Daily clipboard folders
│   │   ├── clipboard.json  # Clipboard entries
│   │   └── ...
├── Documents/              # Your documents
├── Images/                 # Your images
└── ...                     # Any other files/folders
```

## Clipboard History Format

The server supports multiple clipboard storage formats:

### JSON Format (`clipboard.json`)
```json
[
  {
    "timestamp": "2025-08-05T10:30:00Z",
    "content": "Hello world",
    "type": "text",
    "metadata": {
      "app": "Safari",
      "size": 11
    }
  }
]
```

### Text Format (`clipboard.txt`)
```
2025-08-05 10:30:00 | text | Hello world
2025-08-05 10:31:15 | url | https://example.com
```

## Swift Integration

If you have a Swift Sparkle app, here's how to integrate:

### 1. MCP Server Communication
```swift
import Foundation

class SparkleManager {
    private let serverProcess: Process
    
    init() {
        serverProcess = Process()
        serverProcess.executableURL = URL(fileURLWithPath: "/usr/local/bin/sparkle-mcp")
        // Configure stdio pipes for MCP communication
    }
    
    func sendMCPRequest(_ request: MCPRequest) async throws -> MCPResponse {
        // Implement MCP protocol communication
    }
}
```

### 2. File Operations
```swift
// Search files
let searchResult = try await sparkleManager.sendMCPRequest(
    MCPRequest(method: "tools/call", params: [
        "name": "search_files",
        "arguments": ["path": "", "pattern": "*.pdf"]
    ])
)

// Read file
let fileContent = try await sparkleManager.sendMCPRequest(
    MCPRequest(method: "tools/call", params: [
        "name": "read_file", 
        "arguments": ["path": "document.txt"]
    ])
)
```

### 3. Clipboard Integration
```swift
// Save clipboard to Pasteboard folder
func saveClipboard() {
    let pasteboard = NSPasteboard.general
    if let string = pasteboard.string(forType: .string) {
        let clipboardEntry = ClipboardEntry(
            timestamp: Date(),
            content: string,
            type: "text"
        )
        saveToSparkleFolder(clipboardEntry)
    }
}

// Query clipboard history via MCP
let recentClipboard = try await sparkleManager.sendMCPRequest(
    MCPRequest(method: "tools/call", params: [
        "name": "get_recent_clipboard",
        "arguments": ["days": 7, "limit": 50]
    ])
)
```

## Configuration

The server uses `~/Sparkle/.mcp-config.json` for configuration:

```json
{
  "version": "1.0.0",
  "created": "2025-08-05T10:00:00Z",
  "settings": {
    "sparkleFolder": "~/Sparkle",
    "maxFileSize": 104857600,
    "allowedExtensions": ["*"],
    "autoIndex": true,
    "watcherEnabled": true
  }
}
```

## Security Features

- **Sandboxed Access**: Only `~/Sparkle` folder is accessible
- **File Size Limits**: 100MB maximum file size
- **Path Validation**: Prevents directory traversal attacks
- **Rate Limiting**: 100 requests per minute
- **Safe File Types**: Blocks executable files by default

## Development

```bash
# Clone and setup
git clone https://github.com/EveryInc/sparkle-mcp-server.git
cd sparkle-mcp-server
npm install

# Development mode
npm run dev

# Build
npm run build

# Test
npm test
```

## Publishing Steps (For Maintainers)

1. **Update version**: `npm version patch|minor|major`
2. **Build**: `npm run build`
3. **Publish**: `npm publish --access public`

## Troubleshooting

### Server Won't Start
```bash
# Check if installed correctly
which sparkle-mcp

# Test server manually
sparkle-mcp --help

# Check logs
tail -f ~/.config/claude/logs/sparkle.log
```

### File Access Issues
- Ensure `~/Sparkle` folder exists and is writable
- Check file permissions: `chmod 755 ~/Sparkle`
- Verify Claude Desktop has proper permissions

### Clipboard History Not Working
- Create `~/Sparkle/Pasteboard/` directory
- Ensure your clipboard app saves to the correct format
- Check folder permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: https://github.com/EveryInc/sparkle-mcp-server/issues
- **Documentation**: https://github.com/EveryInc/sparkle-mcp-server/wiki
- **Discussions**: https://github.com/EveryInc/sparkle-mcp-server/discussions

---

Built with ❤️ by [Every Inc](https://github.com/EveryInc)