import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

interface SearchOptions {
  query: string;
  locations?: string[];
  fileTypes?: string[];
  limit?: number;
}

interface SearchResult {
  path: string;
  relevance: number;
  matchedContent?: string;
  lineNumber?: number;
}

export class FileSearchEngine {
  // No default locations - must be explicitly provided
  private defaultLocations: string[] = [];

  public async search(options: SearchOptions): Promise<SearchResult[]> {
    const {
      query,
      locations = this.defaultLocations,
      fileTypes = [],
      limit = 50,
    } = options;

    // Expand paths
    const searchPaths = locations.map(loc => this.expandPath(loc));
    
    // Parse query to understand intent
    const searchTerms = this.parseQuery(query);
    
    const results: SearchResult[] = [];

    for (const searchPath of searchPaths) {
      try {
        const pathResults = await this.searchInPath(
          searchPath,
          searchTerms,
          fileTypes,
          limit - results.length
        );
        results.push(...pathResults);
        
        if (results.length >= limit) break;
      } catch (error) {
        console.error(`Error searching ${searchPath}:`, error);
      }
    }

    return results.slice(0, limit);
  }

  private expandPath(folderPath: string): string {
    if (folderPath.startsWith("~/")) {
      return path.join(os.homedir(), folderPath.slice(2));
    }
    return folderPath;
  }

  private parseQuery(query: string): {
    keywords: string[];
    fileTypes?: string[];
    timeRange?: { from: Date; to: Date };
  } {
    const queryLower = query.toLowerCase();
    const keywords: string[] = [];
    const fileTypes: string[] = [];

    // Extract file type hints
    if (queryLower.includes("pdf")) fileTypes.push(".pdf");
    if (queryLower.includes("document")) fileTypes.push(".doc", ".docx", ".pdf");
    if (queryLower.includes("image") || queryLower.includes("photo")) {
      fileTypes.push(".jpg", ".jpeg", ".png", ".gif");
    }
    if (queryLower.includes("video")) fileTypes.push(".mp4", ".mov", ".avi");
    if (queryLower.includes("audio") || queryLower.includes("podcast")) {
      fileTypes.push(".mp3", ".wav", ".m4a");
    }

    // Extract keywords (simple tokenization)
    const words = query.split(/\\s+/);
    for (const word of words) {
      if (word.length > 2 && !this.isStopWord(word)) {
        keywords.push(word.toLowerCase());
      }
    }

    return { keywords, fileTypes };
  }

  private isStopWord(word: string): boolean {
    const stopWords = ["the", "is", "at", "which", "on", "a", "an", "and", "or", "but", "in", "with", "to", "for", "of", "as", "by", "that", "this", "from", "up", "out", "if", "about", "into", "through", "during", "how", "when", "where", "why", "what", "who", "whose", "whom", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "should", "could", "may", "might", "must", "shall", "can", "need", "ought", "dare", "used"];
    return stopWords.includes(word.toLowerCase());
  }

  private async searchInPath(
    searchPath: string,
    searchTerms: { keywords: string[]; fileTypes?: string[] },
    requestedFileTypes: string[],
    limit: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // Combine file types from query parsing and explicit request
    const fileTypes = [
      ...new Set([...(searchTerms.fileTypes || []), ...requestedFileTypes])
    ];

    try {
      // First, try to use find command for file name search
      const findResults = await this.findByName(
        searchPath,
        searchTerms.keywords,
        fileTypes,
        limit
      );
      
      results.push(...findResults);

      // If we need more results and have text file types, search content
      if (results.length < limit && this.shouldSearchContent(fileTypes)) {
        const contentResults = await this.searchContent(
          searchPath,
          searchTerms.keywords,
          fileTypes,
          limit - results.length
        );
        results.push(...contentResults);
      }
    } catch (error) {
      console.error("Search error:", error);
    }

    return results;
  }

  private async findByName(
    searchPath: string,
    keywords: string[],
    fileTypes: string[],
    limit: number
  ): Promise<SearchResult[]> {
    return new Promise((resolve) => {
      const results: SearchResult[] = [];
      
      // Build find command
      let findCmd = `find "${searchPath}" -type f`;
      
      // Add file type filters
      if (fileTypes.length > 0) {
        const nameFilters = fileTypes.map(ext => `-name "*${ext}"`).join(" -o ");
        findCmd += ` \\( ${nameFilters} \\)`;
      }
      
      // Limit depth to avoid too deep recursion
      findCmd += " -maxdepth 5";

      const find = spawn("sh", ["-c", findCmd]);
      let stdout = "";

      find.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      find.on("close", () => {
        const files = stdout.split("\\n").filter(f => f.trim());
        
        for (const file of files) {
          if (results.length >= limit) break;
          
          const relevance = this.calculateNameRelevance(file, keywords);
          if (relevance > 0) {
            results.push({
              path: file,
              relevance,
            });
          }
        }

        resolve(
          results
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, limit)
        );
      });

      find.on("error", () => {
        resolve([]);
      });
    });
  }

  private calculateNameRelevance(filePath: string, keywords: string[]): number {
    const fileName = path.basename(filePath).toLowerCase();
    let relevance = 0;

    for (const keyword of keywords) {
      if (fileName.includes(keyword)) {
        relevance += 0.6;
      }
    }

    // Boost for exact matches
    for (const keyword of keywords) {
      if (fileName === keyword || fileName === `${keyword}.pdf` || fileName === `${keyword}.doc`) {
        relevance += 0.4;
      }
    }

    return Math.min(relevance, 1.0);
  }

  private shouldSearchContent(fileTypes: string[]): boolean {
    const textTypes = [".txt", ".md", ".json", ".csv", ".log", ".js", ".ts", ".py"];
    return fileTypes.length === 0 || fileTypes.some(ft => textTypes.includes(ft));
  }

  private async searchContent(
    searchPath: string,
    keywords: string[],
    fileTypes: string[],
    limit: number
  ): Promise<SearchResult[]> {
    // Simple grep-based content search
    const results: SearchResult[] = [];
    
    for (const keyword of keywords) {
      if (results.length >= limit) break;
      
      const grepResults = await this.grepSearch(searchPath, keyword, fileTypes);
      results.push(...grepResults);
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private async grepSearch(
    searchPath: string,
    keyword: string,
    fileTypes: string[]
  ): Promise<SearchResult[]> {
    return new Promise((resolve) => {
      const results: SearchResult[] = [];
      
      // Try to use ripgrep first, fallback to grep
      let rgPath: string | null = null;
      try {
        rgPath = require('@vscode/ripgrep').rgPath;
      } catch (e) {
        // Ripgrep not available, use regular grep
      }

      let cmd: string;
      let args: string[];
      
      if (rgPath) {
        // Use ripgrep - much faster and more features
        args = [
          '-i', // case insensitive
          '--files-with-matches', // only show filenames
          '--max-count', '1', // stop at first match per file
          '--max-filesize', '50M', // skip large files
          '--type-add', 'custom:*{.txt,.md,.json,.csv,.log,.js,.ts,.py}',
        ];
        
        if (fileTypes.length > 0) {
          // Add glob patterns for file types
          fileTypes.forEach(ext => {
            args.push('-g', `*${ext}`);
          });
        } else {
          // Search common text files by default
          args.push('--type', 'custom');
        }
        
        args.push(keyword, searchPath);
        cmd = rgPath;
      } else {
        // Fallback to grep
        cmd = 'sh';
        let grepCmd = `grep -r -i -l "${keyword}" "${searchPath}"`;
        
        if (fileTypes.length > 0) {
          const includes = fileTypes.map(ext => `--include="*${ext}"`).join(" ");
          grepCmd += ` ${includes}`;
        }
        
        grepCmd += " 2>/dev/null | head -20";
        args = ['-c', grepCmd];
      }

      const proc = spawn(cmd, args);
      let stdout = "";
      let lineCount = 0;
      const maxResults = 20;

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        
        // Process results as they come for better performance
        const lines = stdout.split("\\n");
        stdout = lines.pop() || ""; // Keep incomplete line
        
        for (const line of lines) {
          if (line.trim() && lineCount < maxResults) {
            results.push({
              path: line.trim(),
              relevance: 0.7,
              matchedContent: `Contains "${keyword}"`,
            });
            lineCount++;
          }
        }
      });

      proc.on("close", () => {
        // Process any remaining output
        if (stdout.trim() && lineCount < maxResults) {
          results.push({
            path: stdout.trim(),
            relevance: 0.7,
            matchedContent: `Contains "${keyword}"`,
          });
        }
        
        resolve(results);
      });

      proc.on("error", (error) => {
        console.error("Search process error:", error);
        resolve([]);
      });
    });
  }
}