import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import chokidar from "chokidar";

interface RecentFile {
  path: string;
  timestamp: Date;
  source: "download" | "clipboard" | "created";
  relevance?: number;
}

export class RecentActivityTracker {
  private recentFiles: Map<string, RecentFile> = new Map();
  private downloadsWatcher?: chokidar.FSWatcher;
  private maxAge: number = 24 * 60 * 60 * 1000; // 24 hours
  private downloadsPath: string;

  constructor() {
    this.downloadsPath = path.join(os.homedir(), "Downloads");
    this.setupWatchers();
    this.startCleanupInterval();
  }

  private setupWatchers() {
    // Watch Downloads folder
    this.downloadsWatcher = chokidar.watch(this.downloadsPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0, // Only watch immediate children
    });

    this.downloadsWatcher.on("add", (filePath) => {
      this.addRecentFile(filePath, "download");
    });
  }

  private addRecentFile(filePath: string, source: RecentFile["source"]) {
    console.error(`New ${source} file: ${filePath}`);
    
    this.recentFiles.set(filePath, {
      path: filePath,
      timestamp: new Date(),
      source,
    });
  }

  private startCleanupInterval() {
    // Clean up old files every hour
    setInterval(() => {
      this.cleanupOldFiles();
    }, 60 * 60 * 1000);
  }

  private cleanupOldFiles() {
    const now = Date.now();
    
    for (const [path, file] of this.recentFiles.entries()) {
      if (now - file.timestamp.getTime() > this.maxAge) {
        this.recentFiles.delete(path);
      }
    }
  }

  public async getRelevantFiles(query: string, limit: number): Promise<any[]> {
    const results: any[] = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\\s+/);

    for (const [filePath, recentFile] of this.recentFiles.entries()) {
      // Calculate relevance based on filename and recency
      let relevance = 0;
      
      const fileName = path.basename(filePath).toLowerCase();
      
      // Check filename matches
      for (const word of queryWords) {
        if (fileName.includes(word)) {
          relevance += 0.4;
        }
      }
      
      // Boost for very recent files (last hour)
      const hoursSinceAdded = 
        (Date.now() - recentFile.timestamp.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceAdded < 1) {
        relevance += 0.3;
      } else if (hoursSinceAdded < 6) {
        relevance += 0.2;
      } else if (hoursSinceAdded < 24) {
        relevance += 0.1;
      }
      
      if (relevance > 0) {
        results.push({
          path: filePath,
          relevance: Math.min(relevance, 0.9), // Cap at 0.9 for recent files
          summary: `Recent ${recentFile.source} (${this.getTimeAgo(recentFile.timestamp)})`,
        });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }

  public async cleanup() {
    if (this.downloadsWatcher) {
      await this.downloadsWatcher.close();
    }
  }
}