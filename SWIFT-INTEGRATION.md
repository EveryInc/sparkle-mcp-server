# Swift Integration Guide

This guide shows how to integrate your Swift Sparkle app with the Sparkle MCP Server.

## Overview

The Sparkle MCP Server acts as a bridge between your Swift app and Claude AI, allowing Claude to access files and clipboard history from your Sparkle folder.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Swift App     │    │ Sparkle MCP      │    │   Claude    │
│   (Sparkle)     │◄──►│     Server       │◄──►│  Desktop    │
└─────────────────┘    └──────────────────┘    └─────────────┘
        │                       │
        ▼                       ▼
┌─────────────────────────────────────────────┐
│            ~/Sparkle Folder                 │
│  ├── Documents/                             │
│  ├── Images/                                │
│  ├── Pasteboard/  (Clipboard History)      │
│  └── ...                                    │
└─────────────────────────────────────────────┘
```

## Implementation

### 1. Basic MCP Communication

```swift
import Foundation
import Combine

// MCP Protocol Messages
struct MCPRequest: Codable {
    let jsonrpc: String = "2.0"
    let id: Int
    let method: String
    let params: [String: Any]
    
    private enum CodingKeys: String, CodingKey {
        case jsonrpc, id, method, params
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(jsonrpc, forKey: .jsonrpc)
        try container.encode(id, forKey: .id)
        try container.encode(method, forKey: .method)
        
        // Custom encoding for Any dictionary
        let jsonData = try JSONSerialization.data(withJSONObject: params)
        let jsonObject = try JSONSerialization.jsonObject(with: jsonData)
        try container.encode(AnyCodable(jsonObject), forKey: .params)
    }
}

struct MCPResponse: Codable {
    let jsonrpc: String
    let id: Int
    let result: [String: Any]?
    let error: MCPError?
    
    struct MCPError: Codable {
        let code: Int
        let message: String
    }
}

// Helper for encoding Any values
struct AnyCodable: Codable {
    private let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    func encode(to encoder: Encoder) throws {
        if let data = value as? Data {
            var container = encoder.singleValueContainer()
            try container.encode(data)
        } else if let string = value as? String {
            var container = encoder.singleValueContainer()
            try container.encode(string)
        }
        // Add more type handling as needed
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let data = try? container.decode(Data.self) {
            value = data
        } else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported type")
            )
        }
    }
}
```

### 2. Sparkle Manager Class

```swift
class SparkleManager: ObservableObject {
    @Published var isConnected = false
    @Published var lastError: Error?
    
    private let sparkleFolder: URL
    private let pasteboardFolder: URL
    private var requestId = 0
    
    init() {
        let homeURL = FileManager.default.homeDirectoryForCurrentUser
        sparkleFolder = homeURL.appendingPathComponent("Sparkle")
        pasteboardFolder = sparkleFolder.appendingPathComponent("Pasteboard")
        
        createFoldersIfNeeded()
    }
    
    private func createFoldersIfNeeded() {
        try? FileManager.default.createDirectory(
            at: sparkleFolder, 
            withIntermediateDirectories: true
        )
        try? FileManager.default.createDirectory(
            at: pasteboardFolder, 
            withIntermediateDirectories: true
        )
    }
    
    // MARK: - File Operations
    
    func saveFile(_ data: Data, to relativePath: String) throws {
        let fullURL = sparkleFolder.appendingPathComponent(relativePath)
        let directory = fullURL.deletingLastPathComponent()
        
        try FileManager.default.createDirectory(
            at: directory, 
            withIntermediateDirectories: true
        )
        
        try data.write(to: fullURL)
    }
    
    func saveText(_ text: String, to relativePath: String) throws {
        try saveFile(text.data(using: .utf8)!, to: relativePath)
    }
    
    func listFiles(in directory: String = "") -> [URL] {
        let targetURL = directory.isEmpty ? sparkleFolder : sparkleFolder.appendingPathComponent(directory)
        
        do {
            return try FileManager.default.contentsOfDirectory(
                at: targetURL,
                includingPropertiesForKeys: [.isDirectoryKey, .modificationDateKey],
                options: .skipsHiddenFiles
            )
        } catch {
            print("Error listing files: \(error)")
            return []
        }
    }
}
```

### 3. Clipboard Integration

```swift
import AppKit

extension SparkleManager {
    
    // MARK: - Clipboard Management
    
    func saveCurrentClipboard() {
        let pasteboard = NSPasteboard.general
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let today = dateFormatter.string(from: Date())
        
        let todayFolder = pasteboardFolder.appendingPathComponent(today)
        try? FileManager.default.createDirectory(at: todayFolder, withIntermediateDirectories: true)
        
        var clipboardEntries: [[String: Any]] = []
        
        // Load existing entries for today
        let entriesFile = todayFolder.appendingPathComponent("clipboard.json")
        if let existingData = try? Data(contentsOf: entriesFile),
           let existingEntries = try? JSONSerialization.jsonObject(with: existingData) as? [[String: Any]] {
            clipboardEntries = existingEntries
        }
        
        // Add new clipboard content
        let timestamp = ISO8601DateFormatter().string(from: Date())
        
        if let string = pasteboard.string(forType: .string) {
            let entry: [String: Any] = [
                "timestamp": timestamp,
                "content": string,
                "type": inferClipboardType(string),
                "metadata": [
                    "app": NSWorkspace.shared.frontmostApplication?.localizedName ?? "Unknown",
                    "size": string.count
                ]
            ]
            clipboardEntries.append(entry)
        }
        
        // Handle other clipboard types
        if let image = pasteboard.data(forType: .png) {
            let entry: [String: Any] = [
                "timestamp": timestamp,
                "content": image.base64EncodedString(),
                "type": "image",
                "metadata": [
                    "format": "png",
                    "size": image.count
                ]
            ]
            clipboardEntries.append(entry)
        }
        
        // Save updated entries
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: clipboardEntries, options: .prettyPrinted)
            try jsonData.write(to: entriesFile)
        } catch {
            print("Error saving clipboard: \(error)")
        }
    }
    
    private func inferClipboardType(_ content: String) -> String {
        if content.hasPrefix("http://") || content.hasPrefix("https://") {
            return "url"
        } else if content.hasPrefix("/") && content.contains(".") {
            return "file-path"
        } else {
            return "text"
        }
    }
    
    func startClipboardMonitoring() {
        let pasteboard = NSPasteboard.general
        var lastChangeCount = pasteboard.changeCount
        
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if pasteboard.changeCount != lastChangeCount {
                lastChangeCount = pasteboard.changeCount
                self.saveCurrentClipboard()
            }
        }
    }
}
```

### 4. Document Management

```swift
extension SparkleManager {
    
    // MARK: - Document Operations
    
    func saveDocument(_ document: NSDocument, to category: String) throws {
        let categoryFolder = sparkleFolder.appendingPathComponent(category)
        try FileManager.default.createDirectory(at: categoryFolder, withIntermediateDirectories: true)
        
        let filename = document.displayName ?? "Untitled"
        let fileURL = categoryFolder.appendingPathComponent(filename)
        
        try document.write(to: fileURL, ofType: document.fileType!, for: .saveOperation, originalContentsURL: nil)
    }
    
    func importFile(from sourceURL: URL, to category: String) throws {
        let categoryFolder = sparkleFolder.appendingPathComponent(category)
        try FileManager.default.createDirectory(at: categoryFolder, withIntermediateDirectories: true)
        
        let filename = sourceURL.lastPathComponent
        let destinationURL = categoryFolder.appendingPathComponent(filename)
        
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
    }
    
    func organizeFilesByType() {
        let files = listFiles()
        
        for fileURL in files {
            let fileExtension = fileURL.pathExtension.lowercased()
            let category = categoryForExtension(fileExtension)
            
            if category != "Root" {
                let categoryFolder = sparkleFolder.appendingPathComponent(category)
                try? FileManager.default.createDirectory(at: categoryFolder, withIntermediateDirectories: true)
                
                let destinationURL = categoryFolder.appendingPathComponent(fileURL.lastPathComponent)
                try? FileManager.default.moveItem(at: fileURL, to: destinationURL)
            }
        }
    }
    
    private func categoryForExtension(_ ext: String) -> String {
        switch ext {
        case "pdf", "doc", "docx", "txt", "md":
            return "Documents"
        case "jpg", "jpeg", "png", "gif", "bmp", "tiff":
            return "Images"
        case "mp3", "wav", "m4a", "flac":
            return "Audio"
        case "mp4", "mov", "avi", "mkv":
            return "Videos"
        case "zip", "tar", "gz", "7z":
            return "Archives"
        default:
            return "Root"
        }
    }
}
```

### 5. SwiftUI Integration

```swift
import SwiftUI

struct SparkleView: View {
    @StateObject private var sparkleManager = SparkleManager()
    @State private var selectedFiles: Set<URL> = []
    @State private var showingFilePicker = false
    
    var body: some View {
        NavigationView {
            VStack {
                // File List
                List(sparkleManager.listFiles(), id: \.self, selection: $selectedFiles) { fileURL in
                    FileRowView(fileURL: fileURL)
                }
                
                // Actions
                HStack {
                    Button("Add Files") {
                        showingFilePicker = true
                    }
                    
                    Button("Organize") {
                        sparkleManager.organizeFilesByType()
                    }
                    
                    Button("Start Clipboard Monitoring") {
                        sparkleManager.startClipboardMonitoring()
                    }
                }
                .padding()
            }
            .navigationTitle("Sparkle Files")
            .fileImporter(
                isPresented: $showingFilePicker,
                allowedContentTypes: [.item],
                allowsMultipleSelection: true
            ) { result in
                switch result {
                case .success(let urls):
                    for url in urls {
                        try? sparkleManager.importFile(from: url, to: "Imported")
                    }
                case .failure(let error):
                    print("File import error: \(error)")
                }
            }
        }
    }
}

struct FileRowView: View {
    let fileURL: URL
    
    var body: some View {
        HStack {
            Image(systemName: iconForFile(fileURL))
                .foregroundColor(.blue)
            
            VStack(alignment: .leading) {
                Text(fileURL.lastPathComponent)
                    .font(.headline)
                
                Text(fileURL.path)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding(.vertical, 2)
    }
    
    private func iconForFile(_ url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "pdf": return "doc.text"
        case "jpg", "jpeg", "png", "gif": return "photo"
        case "mp3", "wav": return "music.note"
        case "mp4", "mov": return "video"
        default: return "doc"
        }
    }
}
```

### 6. Testing Integration

```swift
extension SparkleManager {
    
    // MARK: - Testing & Debugging
    
    func testMCPServer() async {
        // This would ideally communicate with the MCP server directly
        // For now, we'll simulate what the MCP server would see
        
        print("Testing Sparkle folder structure...")
        
        // Test file operations
        try? saveText("Hello from Swift!", to: "test/hello.txt")
        
        // Test clipboard save
        saveCurrentClipboard()
        
        // List all files
        let files = listFiles()
        print("Found \(files.count) files in Sparkle folder")
        
        for file in files.prefix(5) {
            print("- \(file.lastPathComponent)")
        }
    }
    
    func validateSparkleSetup() -> Bool {
        let requiredFolders = [
            sparkleFolder,
            pasteboardFolder
        ]
        
        for folder in requiredFolders {
            var isDirectory: ObjCBool = false
            if !FileManager.default.fileExists(atPath: folder.path, isDirectory: &isDirectory) || !isDirectory.boolValue {
                return false
            }
        }
        
        return true
    }
}
```

## Usage in Your App

1. **Initialize SparkleManager**:
   ```swift
   let sparkleManager = SparkleManager()
   ```

2. **Start clipboard monitoring**:
   ```swift
   sparkleManager.startClipboardMonitoring()
   ```

3. **Save files for Claude**:
   ```swift
   try sparkleManager.saveText(documentContent, to: "Documents/my-document.txt")
   ```

4. **Organize files**:
   ```swift
   sparkleManager.organizeFilesByType()
   ```

## Best Practices

1. **File Organization**: Use consistent folder structures (Documents/, Images/, etc.)
2. **Clipboard Format**: Save clipboard data in the JSON format for best MCP server compatibility
3. **File Naming**: Use descriptive filenames that Claude can understand
4. **Error Handling**: Always handle file system errors gracefully
5. **Privacy**: Only save clipboard content that users explicitly want to share

## Testing

Run the MCP server test to ensure everything works:

```bash
# Install the MCP server first
npm install -g @every-env/sparkle-mcp-server

# Test the connection
sparkle-mcp --help
```

Then test from your Swift app:

```swift
await sparkleManager.testMCPServer()
```

This integration allows your Swift Sparkle app to work seamlessly with Claude AI through the MCP server!