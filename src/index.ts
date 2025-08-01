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

// Main server class
class SparkleMCPServer {
  private server: Server;
  private sparkleFolder: SparkleFolder;
  private searchEngine: FileSearchEngine;
  private pathValidator: PathValidator;
  private rateLimiter: RateLimiter;

  constructor() {
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

    // Initialize components
    this.sparkleFolder = new SparkleFolder("~/Sparkle");
    this.searchEngine = new FileSearchEngine();
    
    // IMPORTANT: Only allow access to Sparkle folder
    this.pathValidator = new PathValidator({
      allowedPaths: ["~/Sparkle"], // ONLY Sparkle folder
      maxFileSize: 100 * 1024 * 1024, // 100MB max
      allowSymlinks: false,
    });
    this.rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

    this.setupHandlers();
    
    // Ensure Sparkle folder exists on startup
    this.ensureSparkleFolder();
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
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

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
      
      // No need to check other locations - Sparkle folder only!
      const validatedFiles = [];
      
      for (const file of sparkleFiles) {
        try {
          await this.pathValidator.validatePath(file.path);
          validatedFiles.push(file);
        } catch (error) {
          console.error(`Skipping invalid path ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
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
      // Rate limiting check
      if (!this.rateLimiter.checkLimit("search")) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }

      // Build full path within Sparkle folder
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullSearchPath = path.resolve(sparkleRoot, searchPath || ".");
      
      // Validate path is within Sparkle folder
      await this.pathValidator.validatePath(fullSearchPath);

      const results = await this.recursiveSearch(fullSearchPath, pattern, excludePatterns);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2),
        }],
      };
    } catch (error) {
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
    const patternLower = pattern.toLowerCase();
    
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
        
        // Check if matches pattern (case-insensitive partial match)
        if (entry.name.toLowerCase().includes(patternLower)) {
          results.push(relativePath);
        }
        
        // Recurse into directories
        if (entry.isDirectory()) {
          const subResults = await this.recursiveSearch(fullPath, pattern, excludePatterns);
          results.push(...subResults);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
    }
    
    return results;
  }

  private async handleReadFile(args: any) {
    const { path: filePath } = ReadFileSchema.parse(args);
    
    try {
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullPath = path.resolve(sparkleRoot, filePath);
      await this.pathValidator.validatePath(fullPath);
      
      const content = await fs.readFile(fullPath, 'utf-8');
      
      return {
        content: [{
          type: "text", 
          text: content,
        }],
      };
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
      const sparkleRoot = this.expandPath("~/Sparkle");
      const fullPath = path.resolve(sparkleRoot, dirPath || ".");
      await this.pathValidator.validatePath(fullPath);
      
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const formatted = entries.map(entry => {
        const prefix = entry.isDirectory() ? "[DIR]" : "[FILE]";
        return `${prefix} ${entry.name}`;
      });
      
      return {
        content: [{
          type: "text",
          text: formatted.join('\n'),
        }],
      };
    } catch (error) {
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
      
      await this.pathValidator.validatePath(sourcePath);
      
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
      await this.pathValidator.validatePath(fullPath);
      
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
      const sparkleDir = this.expandPath("~/Sparkle");
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Sparkle MCP Server running...");
    console.error("Sparkle folder:", this.expandPath("~/Sparkle"));
  }
}

// Start the server
const server = new SparkleMCPServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});