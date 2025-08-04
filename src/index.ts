#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SparkleFolder } from "./sparkle-folder.js";
import { FileSearchEngine } from "./search-engine.js";
import { PathValidator, RateLimiter } from "./security.js";
import { loadConfig, SparkleConfig } from "./config.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Tool schemas
const GetRelevantFilesSchema = z.object({
  query: z.string().describe("Natural language query about files needed"),
  maxFiles: z.number().optional().default(10).describe("Maximum files to return"),
});

const SearchFilesSchema = z.object({
  path: z.string().describe("Directory path to search (relative to Sparkle folder)"),
  pattern: z.string().describe("Search pattern to match against file/directory names"),
  excludePatterns: z.array(z.string()).optional().describe("Glob patterns to exclude from search"),
});

const ReadFileSchema = z.object({
  path: z.string().describe("Path to file to read (relative to Sparkle folder)"),
});

const WriteFileSchema = z.object({
  path: z.string().describe("Path to file to write (relative to Sparkle folder)"),
  content: z.string().describe("Content to write to the file"),
});

const ListDirectorySchema = z.object({
  path: z.string().describe("Directory path to list (relative to Sparkle folder)"),
});

const CreateDirectorySchema = z.object({
  path: z.string().describe("Directory path to create (relative to Sparkle folder)"),
});

const MoveFileSchema = z.object({
  source: z.string().describe("Source path (relative to Sparkle folder)"),
  destination: z.string().describe("Destination path (relative to Sparkle folder)"),
});

const GetFileInfoSchema = z.object({
  path: z.string().describe("File path to get info for (relative to Sparkle folder)"),
});

const HealthCheckSchema = z.object({});

// Main server class
class SparkleMCPServer {
  private server: Server;
  private sparkleFolder: SparkleFolder;
  private searchEngine: FileSearchEngine;
  private pathValidator: PathValidator;
  private rateLimiter: RateLimiter;
  private config: SparkleConfig | null = null;
  private startupTime: Date;

  constructor() {
    this.startupTime = new Date();
    
    this.server = new Server(
      {
        name: "sparkle-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize components with Sparkle folder
    const sparkleDir = "~/Sparkle";
    this.sparkleFolder = new SparkleFolder(sparkleDir);
    this.searchEngine = new FileSearchEngine();
    
    // IMPORTANT: Only allow access to Sparkle folder
    // Use expanded path for PathValidator
    this.pathValidator = new PathValidator({
      allowedPaths: [this.expandPath(sparkleDir)], // ONLY Sparkle folder (expanded)
      maxFileSize: 100 * 1024 * 1024, // 100MB max
      allowSymlinks: false,
    });
    this.rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

    this.setupHandlers();
    
    // Ensure Sparkle folder exists on startup
    this.ensureSparkleFolder();
    
    // Load configuration
    this.loadConfiguration();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_relevant_files",
            description: 
              "Automatically retrieves files relevant to the query from your Sparkle folder. " +
              "This tool is called automatically when AI needs file context. " +
              "Only searches within the ~/Sparkle folder for security.",
            inputSchema: zodToJsonSchema(GetRelevantFilesSchema),
          },
          {
            name: "search_files",
            description:
              "Recursively search for files and directories in Sparkle folder matching a pattern. " +
              "Case-insensitive partial name matching with optional exclude patterns.",
            inputSchema: zodToJsonSchema(SearchFilesSchema),
          },
          {
            name: "read_file",
            description: "Read the complete contents of a file in the Sparkle folder.",
            inputSchema: zodToJsonSchema(ReadFileSchema),
          },
          {
            name: "write_file", 
            description: "Create or overwrite a file in the Sparkle folder with the provided content.",
            inputSchema: zodToJsonSchema(WriteFileSchema),
          },
          {
            name: "list_directory",
            description: "List the contents of a directory in the Sparkle folder.",
            inputSchema: zodToJsonSchema(ListDirectorySchema),
          },
          {
            name: "create_directory",
            description: "Create a new directory in the Sparkle folder.",
            inputSchema: zodToJsonSchema(CreateDirectorySchema),
          },
          {
            name: "move_file",
            description: "Move or rename a file or directory within the Sparkle folder.",
            inputSchema: zodToJsonSchema(MoveFileSchema),
          },
          {
            name: "get_file_info",
            description: "Get detailed information about a file or directory in the Sparkle folder.",
            inputSchema: zodToJsonSchema(GetFileInfoSchema),
          },
          {
            name: "health_check",
            description: "Check the health status of the Sparkle MCP server.",
            inputSchema: zodToJsonSchema(HealthCheckSchema),
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`call_tool: ${name}`);

      switch (name) {
        case "get_relevant_files":
          return await this.handleGetRelevantFiles(args);
        case "search_files":
          return await this.handleSearchFiles(args);
        case "read_file":
          return await this.handleReadFile(args);
        case "write_file":
          return await this.handleWriteFile(args);
        case "list_directory":
          return await this.handleListDirectory(args);
        case "create_directory":
          return await this.handleCreateDirectory(args);
        case "move_file":
          return await this.handleMoveFile(args);
        case "get_file_info":
          return await this.handleGetFileInfo(args);
        case "health_check":
          return await this.handleHealthCheck(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleGetRelevantFiles(args: any) {
    const { query, maxFiles } = GetRelevantFilesSchema.parse(args);

    try {
      // Rate limiting check
      if (!this.rateLimiter.checkLimit("get_files")) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }

      // ONLY search in Sparkle folder
      const sparkleFiles = await this.sparkleFolder.findRelevant(query, maxFiles);
      
      // All files from SparkleFolder are already validated
      const validatedFiles = sparkleFiles;
      
      const finalResults = validatedFiles
        .slice(0, maxFiles)
        .sort((a, b) => b.relevance - a.relevance);

      return {
        content: [{
          type: "text",
          text: this.formatFileResults(finalResults, query),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error retrieving files: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleSearchFiles(args: any) {
    const { path: searchPath, pattern, excludePatterns = [] } = SearchFilesSchema.parse(args);

    try {
      console.error(`search_files called with path: "${searchPath}", pattern: "${pattern}"`);
      
      // Rate limiting check
      if (!this.rateLimiter.checkLimit("search")) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }

      // Build full path within Sparkle folder
      const sparkleRoot = this.expandPath("~/Sparkle");
      console.error(`Sparkle root: ${sparkleRoot}`);
      
      // Handle both relative and absolute paths
      let fullSearchPath: string;
      if (searchPath && path.isAbsolute(searchPath)) {
        // If absolute path is provided, use it directly but validate it's in Sparkle
        fullSearchPath = searchPath;
      } else {
        // Otherwise resolve relative to Sparkle root
        // Empty string or "." should resolve to sparkle root
        fullSearchPath = searchPath ? path.resolve(sparkleRoot, searchPath) : sparkleRoot;
      }
      
      console.error(`Full search path: ${fullSearchPath}`);
      
      // Ensure the path doesn't escape the Sparkle folder
      if (!fullSearchPath.startsWith(sparkleRoot)) {
        throw new Error(`Access denied: Path is outside Sparkle folder - ${fullSearchPath} does not start with ${sparkleRoot}`);
      }

      // Check if the path exists
      try {
        await fs.stat(fullSearchPath);
      } catch (error) {
        throw new Error(`Path does not exist: ${fullSearchPath}`);
      }

      const results = await this.recursiveSearch(fullSearchPath, pattern, excludePatterns);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2),
        }],
      };
    } catch (error) {
      console.error("Search error:", error);
      return {
        content: [{
          type: "text",
          text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async recursiveSearch(searchPath: string, pattern: string, excludePatterns: string[]): Promise<string[]> {
    const results: string[] = [];
    
    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(searchPath, entry.name);
        const relativePath = path.relative(this.expandPath("~/Sparkle"), fullPath);
        
        // Check if excluded
        const isExcluded = excludePatterns.some(excludePattern => {
          return entry.name.includes(excludePattern) || relativePath.includes(excludePattern);
        });
        
        if (isExcluded) continue;
        
        // Check if matches pattern
        let matches = false;
        if (pattern === '*') {
          // Match all files
          matches = true;
        } else if (pattern.startsWith('*.')) {
          // Extension matching (e.g., *.txt)
          const ext = pattern.slice(1); // Remove the *
          matches = entry.name.endsWith(ext);
        } else if (pattern.includes('*')) {
          // Simple glob pattern
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
          matches = regex.test(entry.name);
        } else {
          // Partial name matching (case-insensitive)
          matches = entry.name.toLowerCase().includes(pattern.toLowerCase());
        }
        
        if (matches) {
          results.push(relativePath);
        }
        
        // Recurse into directories
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subResults = await this.recursiveSearch(fullPath, pattern, excludePatterns);
          results.push(...subResults);
        }
      }
    } catch (error) {
      console.error(`Error searching ${searchPath}:`, error);
    }
    
    return results;
  }

  private async handleReadFile(args: any) {
    const { path: filePath } = ReadFileSchema.parse(args);
    
    try {
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullPath = path.resolve(sparkleRoot, filePath);
      
      // Ensure path is within Sparkle folder
      if (!fullPath.startsWith(sparkleRoot)) {
        throw new Error("Access denied: Path is outside Sparkle folder");
      }
      
      // Check file extension to determine if it's binary
      const ext = path.extname(fullPath).toLowerCase();
      const binaryExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.tiff', '.webp', '.svg', '.mp3', '.mp4', '.wav', '.mov', '.avi', '.zip', '.tar', '.gz', '.7z', '.rar'];
      const isBinary = binaryExtensions.includes(ext);
      
      if (isBinary) {
        // Read as binary and return base64
        const buffer = await fs.readFile(fullPath);
        const base64 = buffer.toString('base64');
        
        return {
          content: [{
            type: "text",
            text: `[Binary file: ${ext}]\nSize: ${buffer.length} bytes\nBase64 encoding:\n${base64}`,
          }],
        };
      } else {
        // Read as text
        const content = await fs.readFile(fullPath, 'utf-8');
        
        return {
          content: [{
            type: "text", 
            text: content,
          }],
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleWriteFile(args: any) {
    const { path: filePath, content } = WriteFileSchema.parse(args);
    
    try {
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullPath = path.resolve(sparkleRoot, filePath);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      await fs.writeFile(fullPath, content, 'utf-8');
      
      return {
        content: [{
          type: "text",
          text: `Successfully wrote to ${filePath}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error writing file: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleListDirectory(args: any) {
    const { path: dirPath } = ListDirectorySchema.parse(args);
    
    try {
      console.error(`list_directory called with path: "${dirPath}"`);
      
      const sparkleRoot = this.expandPath("~/Sparkle");
      console.error(`Sparkle root: ${sparkleRoot}`);
      
      // Handle empty path or "." as sparkle root
      const fullPath = dirPath ? path.resolve(sparkleRoot, dirPath) : sparkleRoot;
      console.error(`Full path: ${fullPath}`);
      
      // Ensure the path doesn't escape the Sparkle folder
      if (!fullPath.startsWith(sparkleRoot)) {
        throw new Error(`Access denied: Path is outside Sparkle folder - ${fullPath} does not start with ${sparkleRoot}`);
      }
      
      // Check if the path exists and is a directory
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        throw new Error(`Not a directory: ${fullPath}`);
      }
      
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const formatted = entries.map(entry => {
        const prefix = entry.isDirectory() ? "[DIR]" : "[FILE]";
        return `${prefix} ${entry.name}`;
      });
      
      console.error(`Found ${entries.length} entries in ${fullPath}`);
      
      return {
        content: [{
          type: "text",
          text: formatted.length > 0 ? formatted.join('\n') : "Empty directory",
        }],
      };
    } catch (error) {
      console.error("List directory error:", error);
      return {
        content: [{
          type: "text",
          text: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleCreateDirectory(args: any) {
    const { path: dirPath } = CreateDirectorySchema.parse(args);
    
    try {
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullPath = path.resolve(sparkleRoot, dirPath);
      
      await fs.mkdir(fullPath, { recursive: true });
      
      return {
        content: [{
          type: "text",
          text: `Successfully created directory ${dirPath}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating directory: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleMoveFile(args: any) {
    const { source, destination } = MoveFileSchema.parse(args);
    
    try {
      const sparkleRoot = this.expandPath("~/Sparkle");
      const sourcePath = path.resolve(sparkleRoot, source);
      const destPath = path.resolve(sparkleRoot, destination);
      
      // Ensure source path is within Sparkle folder
      if (!sourcePath.startsWith(sparkleRoot) || !destPath.startsWith(sparkleRoot)) {
        throw new Error("Access denied: Path is outside Sparkle folder");
      }
      
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      
      await fs.rename(sourcePath, destPath);
      
      return {
        content: [{
          type: "text",
          text: `Successfully moved ${source} to ${destination}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error moving file: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleGetFileInfo(args: any) {
    const { path: filePath } = GetFileInfoSchema.parse(args);
    
    try {
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullPath = path.resolve(sparkleRoot, filePath);
      
      // Ensure path is within Sparkle folder
      if (!fullPath.startsWith(sparkleRoot)) {
        throw new Error("Access denied: Path is outside Sparkle folder");
      }
      
      const stats = await fs.stat(fullPath);
      
      const info = {
        path: filePath,
        size: stats.size,
        type: stats.isDirectory() ? 'directory' : 'file',
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
      };
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(info, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting file info: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private hasGoodResults(files: any[], needed: number): boolean {
    // Check if we have enough high-relevance results
    const highRelevance = files.filter(f => f.relevance > 0.7);
    return highRelevance.length >= Math.min(needed / 2, 3);
  }

  private formatFileResults(files: any[], query: string): string {
    if (files.length === 0) {
      return `No files found matching "${query}"`;
    }

    let result = `Found ${files.length} relevant files for "${query}":\\n\\n`;
    
    files.forEach((file, index) => {
      result += `${index + 1}. ${file.path}\\n`;
      result += `   Relevance: ${(file.relevance * 100).toFixed(0)}%\\n`;
      if (file.summary) {
        result += `   Summary: ${file.summary}\\n`;
      }
      result += `\\n`;
    });

    return result;
  }

  private formatSearchResults(results: any[], query: string): string {
    if (results.length === 0) {
      return `No files found matching "${query}"`;
    }

    let output = `Search results for "${query}":\\n\\n`;
    
    // Group by file type
    const grouped = results.reduce((acc, file) => {
      const ext = file.path.split('.').pop() || 'other';
      if (!acc[ext]) acc[ext] = [];
      acc[ext].push(file);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([type, files]) => {
      output += `\\n${type.toUpperCase()} files:\\n`;
      (files as any[]).forEach((file: any) => {
        output += `  - ${file.path}\\n`;
        if (file.matchedContent) {
          output += `    Match: "${file.matchedContent}"\\n`;
        }
      });
    });

    return output;
  }

  private async ensureSparkleFolder() {
    try {
      const folderName = "~/Sparkle";
      const sparkleDir = this.expandPath(folderName);
      await fs.mkdir(sparkleDir, { recursive: true });
      
      // Create a welcome file if folder is new
      const welcomePath = path.join(sparkleDir, "README.txt");
      try {
        await fs.access(welcomePath);
      } catch {
        // File doesn't exist, create it
        const welcomeContent = `Welcome to your Sparkle folder! 🌟

This is your special folder for AI-accessible files.

How to use:
1. Drop any files here that you want Claude to access
2. Ask Claude about them naturally:
   - "What files are in my Sparkle folder?"
   - "Find my tax documents"
   - "Show me the PDF I just added"

Important:
- Only files in THIS folder are accessible to Claude
- Files are indexed automatically when added
- You can organize with subfolders

Happy organizing!
`;
        await fs.writeFile(welcomePath, welcomeContent);
        console.error("Created Sparkle folder at:", sparkleDir);
      }
    } catch (error) {
      console.error("Error creating Sparkle folder:", error);
    }
  }
  
  private expandPath(folderPath: string): string {
    if (folderPath.startsWith("~/")) {
      return path.join(os.homedir(), folderPath.slice(2));
    }
    return folderPath;
  }

  private async loadConfiguration() {
    try {
      this.config = await loadConfig();
      console.error("Configuration loaded:", this.config);
    } catch (error) {
      console.error("Failed to load configuration, using defaults");
    }
  }

  private async handleHealthCheck(args: any) {
    try {
      console.error("health_check: start");
      const sparkleDir = this.expandPath(process.env.APP_ENV === 'dev' ? "~/Sparkle-Dev" : "~/Sparkle");
      const stats = await fs.stat(sparkleDir);
      
      const health = {
        status: "healthy",
        version: "1.0.0",
        uptime: Math.floor((Date.now() - this.startupTime.getTime()) / 1000),
        sparkleFolder: {
          path: sparkleDir,
          exists: stats.isDirectory(),
          writable: true,
        },
        indexedFiles: this.sparkleFolder.getFileCount(),
        configuration: this.config || "default",
        rateLimiter: {
          remaining: this.rateLimiter.getRemainingRequests('health_check')
        },
        timestamp: new Date().toISOString(),
      };
      
      const response = {
        content: [{
          type: "text",
          text: JSON.stringify(health, null, 2),
        }],
      };
      console.error("health_check: success");
      return response;
    } catch (error) {
      console.error("health_check: error", error);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "unhealthy",
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Sparkle MCP Server running...");
    console.error("Sparkle folder:", this.expandPath("~/Sparkle"));
  }

  getSparkleFolder() {
    return this.sparkleFolder;
  }
}

// Start the server
const server = new SparkleMCPServer();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  await server.getSparkleFolder()?.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down gracefully...');
  await server.getSparkleFolder()?.cleanup();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Attempt to continue running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Attempt to continue running
});

server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});