# Mac App Simple Setup Guide

## The Magic: One-Click Claude Integration! ✨

Your Mac app users can get Claude integration working in literally 30 seconds:

### Step 1: Your App Shows This

```swift
struct ClaudeQuickSetup: View {
    @State private var configCopied = false
    
    let claudeConfig = """
    {
      "mcpServers": {
        "sparkle": {
          "command": "npx",
          "args": ["-y", "@every-env/sparkle-mcp-server"]
        }
      }
    }
    """
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Claude Desktop Setup")
                .font(.largeTitle)
                .bold()
            
            Text("Just copy this configuration:")
                .font(.headline)
            
            // Config display
            GroupBox {
                Text(claudeConfig)
                    .font(.system(.body, design: .monospaced))
                    .padding()
                    .textSelection(.enabled)
            }
            
            HStack {
                Button("Copy to Clipboard") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(claudeConfig, forType: .string)
                    configCopied = true
                }
                .buttonStyle(.borderedProminent)
                
                if configCopied {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Copied!")
                        .foregroundColor(.green)
                }
            }
            
            Divider()
            
            VStack(alignment: .leading, spacing: 10) {
                Label("Paste into ~/.config/claude/config.json", systemImage: "1.circle")
                Label("Restart Claude Desktop", systemImage: "2.circle")
                Label("Done! Ask Claude to 'list my Sparkle files'", systemImage: "3.circle")
            }
            .font(.callout)
            
            Button("Open Claude Config Folder") {
                openClaudeConfig()
            }
        }
        .padding()
        .frame(width: 500)
    }
    
    func openClaudeConfig() {
        let configDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/claude")
        
        // Create directory if it doesn't exist
        try? FileManager.default.createDirectory(
            at: configDir,
            withIntermediateDirectories: true
        )
        
        NSWorkspace.shared.open(configDir)
    }
}
```

### Step 2: That's It! 

No npm install needed! The `npx` command will:
- Automatically download the latest version
- Run it directly
- Cache it for future use
- Always use the latest version

## Benefits of This Approach

1. **Zero Installation**: Users don't need Node.js knowledge
2. **Always Updated**: npx fetches the latest version
3. **No PATH Issues**: npx handles everything
4. **Simple Copy/Paste**: One config, done!

## Your Mac App's Role

Your app just needs to:

```swift
class SparkleManager {
    private let sparkleURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Sparkle")
    
    init() {
        // 1. Create folder structure
        setupFolders()
        
        // 2. Start clipboard monitoring
        startClipboardMonitoring()
        
        // 3. Show setup if needed
        if !isClaudeConfigured() {
            showClaudeSetup()
        }
    }
    
    private func setupFolders() {
        let folders = ["Documents", "Images", "Pasteboard"]
        for folder in folders {
            let url = sparkleURL.appendingPathComponent(folder)
            try? FileManager.default.createDirectory(
                at: url,
                withIntermediateDirectories: true
            )
        }
    }
    
    private func isClaudeConfigured() -> Bool {
        // Check if config exists
        let configFile = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/claude/config.json")
        
        if let data = try? Data(contentsOf: configFile),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let mcpServers = json["mcpServers"] as? [String: Any],
           mcpServers["sparkle"] != nil {
            return true
        }
        
        return false
    }
}
```

## Complete User Flow

1. **User downloads your Mac app**
2. **App creates ~/Sparkle folder structure**
3. **App shows the Claude setup screen**
4. **User copies the config (one click)**
5. **User pastes into Claude config**
6. **Done!** 🎉

## Testing the Integration

```swift
func createTestFile() {
    let testFile = sparkleURL.appendingPathComponent("welcome.txt")
    let content = """
    Welcome to Sparkle! 🌟
    
    If you can see this in Claude, the integration is working!
    Try asking Claude:
    - "List all files in my Sparkle folder"
    - "Search for PDF files"
    - "Show my recent clipboard history"
    """
    
    try? content.write(to: testFile, atomically: true, encoding: .utf8)
}
```

## The Magic Line

This single line in Claude's config:
```json
"command": "npx",
"args": ["-y", "@every-env/sparkle-mcp-server"]
```

Is all users need! It's brilliant because:
- No installation required
- No terminal/command line knowledge needed
- Works on any system with Node.js
- Automatically updates
- Super simple for non-technical users

Your Mac app + this one config line = Complete Claude integration! 🚀