import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

interface ClipboardEntry {
  timestamp: Date;
  content: string;
  type: string; // text, image, file, etc.
  metadata?: {
    app?: string;
    size?: number;
    format?: string;
  };
}

interface ClipboardSearchResult {
  date: string;
  entries: ClipboardEntry[];
  totalCount: number;
}

export class ClipboardHistoryManager {
  private pasteboardPath: string;

  constructor(sparklePath: string) {
    this.pasteboardPath = path.join(this.expandPath(sparklePath), "Pasteboard");
  }

  private expandPath(folderPath: string): string {
    if (folderPath.startsWith("~/")) {
      return path.join(os.homedir(), folderPath.slice(2));
    }
    return folderPath;
  }

  /**
   * Search clipboard history with various filters
   */
  public async searchClipboardHistory(options: {
    query?: string;
    startDate?: Date;
    endDate?: Date;
    type?: string;
    limit?: number;
  }): Promise<ClipboardSearchResult[]> {
    const { query, startDate, endDate, type, limit = 50 } = options;
    const results: ClipboardSearchResult[] = [];

    try {
      // Get all date directories
      const dateDirs = await this.getDateDirectories(startDate, endDate);

      for (const dateDir of dateDirs) {
        const dayResults = await this.searchDayClipboard(dateDir, query, type, limit);
        if (dayResults.entries.length > 0) {
          results.push(dayResults);
        }

        // Stop if we've reached the limit
        const totalEntries = results.reduce((sum, r) => sum + r.entries.length, 0);
        if (totalEntries >= limit) {
          break;
        }
      }

      return results;
    } catch (error) {
      console.error("Error searching clipboard history:", error);
      return [];
    }
  }

  /**
   * Get clipboard entries for a specific date
   */
  public async getClipboardByDate(date: Date): Promise<ClipboardSearchResult> {
    const dateStr = this.formatDate(date);
    const datePath = path.join(this.pasteboardPath, dateStr);

    try {
      const entries = await this.readDateClipboard(datePath);
      return {
        date: dateStr,
        entries,
        totalCount: entries.length
      };
    } catch (error) {
      return {
        date: dateStr,
        entries: [],
        totalCount: 0
      };
    }
  }

  /**
   * Get recent clipboard entries (last N days)
   */
  public async getRecentClipboard(days: number = 7, limit: number = 50): Promise<ClipboardSearchResult[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.searchClipboardHistory({
      startDate,
      endDate,
      limit
    });
  }

  /**
   * Search for clipboard entries containing specific text
   */
  public async findClipboardText(searchText: string, limit: number = 30): Promise<ClipboardEntry[]> {
    const results = await this.searchClipboardHistory({
      query: searchText,
      limit
    });

    // Flatten results
    const entries: ClipboardEntry[] = [];
    for (const result of results) {
      entries.push(...result.entries);
      if (entries.length >= limit) {
        return entries.slice(0, limit);
      }
    }

    return entries;
  }

  /**
   * Get available date directories
   */
  private async getDateDirectories(startDate?: Date, endDate?: Date): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.pasteboardPath, { withFileTypes: true });
      
      let dateDirs = entries
        .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map(entry => entry.name)
        .sort()
        .reverse(); // Most recent first

      // Filter by date range if provided
      if (startDate || endDate) {
        dateDirs = dateDirs.filter(dateStr => {
          const date = new Date(dateStr);
          if (startDate && date < startDate) return false;
          if (endDate && date > endDate) return false;
          return true;
        });
      }

      return dateDirs;
    } catch (error) {
      console.error("Error reading pasteboard directory:", error);
      return [];
    }
  }

  /**
   * Search clipboard entries for a specific day
   */
  private async searchDayClipboard(
    dateDir: string,
    query?: string,
    type?: string,
    limit?: number
  ): Promise<ClipboardSearchResult> {
    const datePath = path.join(this.pasteboardPath, dateDir);
    const entries = await this.readDateClipboard(datePath);

    let filtered = entries;

    // Filter by query
    if (query) {
      const queryLower = query.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.content.toLowerCase().includes(queryLower) ||
        entry.metadata?.app?.toLowerCase().includes(queryLower)
      );
    }

    // Filter by type
    if (type) {
      filtered = filtered.filter(entry => entry.type === type);
    }

    // Apply limit
    if (limit && filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }

    return {
      date: dateDir,
      entries: filtered,
      totalCount: entries.length
    };
  }

  /**
   * Read clipboard entries from a date directory
   */
  private async readDateClipboard(datePath: string): Promise<ClipboardEntry[]> {
    const entries: ClipboardEntry[] = [];

    try {
      // Check for different possible file formats
      const possibleFiles = [
        'clipboard.json',      // JSON format
        'clipboard.txt',       // Plain text format
        'entries.json',        // Alternative JSON
        'history.txt'          // Alternative text
      ];

      for (const filename of possibleFiles) {
        const filePath = path.join(datePath, filename);
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          
          if (filename.endsWith('.json')) {
            // Parse JSON format
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              entries.push(...data.map(this.normalizeEntry));
            } else if (data.entries) {
              entries.push(...data.entries.map(this.normalizeEntry));
            }
          } else {
            // Parse text format (assuming one entry per line or separated by delimiter)
            const lines = content.split('\n').filter(line => line.trim());
            for (const line of lines) {
              entries.push(this.parseTextEntry(line, datePath));
            }
          }
          
          break; // Found a file, stop looking
        } catch (error) {
          // File doesn't exist or can't be read, try next
          continue;
        }
      }

      // Also check for individual entry files (e.g., timestamp-based files)
      const files = await fs.readdir(datePath);
      const entryFiles = files.filter(f => 
        f.endsWith('.txt') || f.endsWith('.json') && 
        !possibleFiles.includes(f)
      );

      for (const file of entryFiles) {
        try {
          const content = await fs.readFile(path.join(datePath, file), 'utf-8');
          const timestamp = this.extractTimestampFromFilename(file);
          
          if (file.endsWith('.json')) {
            const data = JSON.parse(content);
            entries.push(this.normalizeEntry({ ...data, timestamp }));
          } else {
            entries.push({
              timestamp: timestamp || new Date(),
              content: content.trim(),
              type: 'text'
            });
          }
        } catch (error) {
          console.error(`Error reading entry file ${file}:`, error);
        }
      }

      // Sort by timestamp (most recent first)
      return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
    } catch (error) {
      console.error(`Error reading clipboard for ${datePath}:`, error);
      return [];
    }
  }

  /**
   * Normalize entry data from various formats
   */
  private normalizeEntry(data: any): ClipboardEntry {
    return {
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      content: data.content || data.text || data.data || '',
      type: data.type || this.inferType(data.content || ''),
      metadata: {
        app: data.app || data.source || undefined,
        size: data.size || data.content?.length || undefined,
        format: data.format || undefined
      }
    };
  }

  /**
   * Parse text entry (for simple text format)
   */
  private parseTextEntry(line: string, datePath: string): ClipboardEntry {
    // Try to parse structured format like: "2024-01-15 14:30:00 | text | Content here"
    const parts = line.split('|').map(p => p.trim());
    
    if (parts.length >= 3) {
      return {
        timestamp: new Date(parts[0]),
        type: parts[1],
        content: parts.slice(2).join('|')
      };
    }

    // Fall back to simple content
    return {
      timestamp: this.getDateFromPath(datePath),
      content: line,
      type: 'text'
    };
  }

  /**
   * Extract timestamp from filename
   */
  private extractTimestampFromFilename(filename: string): Date | null {
    // Try to extract timestamp from filenames like "2024-01-15-143000.txt"
    const match = filename.match(/(\d{4}-\d{2}-\d{2})[-_]?(\d{6})?/);
    if (match) {
      const dateStr = match[1];
      const timeStr = match[2] || '000000';
      
      return new Date(`${dateStr}T${timeStr.substr(0,2)}:${timeStr.substr(2,2)}:${timeStr.substr(4,2)}`);
    }
    return null;
  }

  /**
   * Infer content type
   */
  private inferType(content: string): string {
    if (content.startsWith('http://') || content.startsWith('https://')) {
      return 'url';
    }
    if (content.startsWith('/') && content.includes('.')) {
      return 'file-path';
    }
    if (content.match(/^data:image\//)) {
      return 'image';
    }
    return 'text';
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get date from path
   */
  private getDateFromPath(datePath: string): Date {
    const dateStr = path.basename(datePath);
    return new Date(dateStr);
  }

  /**
   * Get clipboard statistics
   */
  public async getClipboardStats(): Promise<{
    totalDays: number;
    totalEntries: number;
    typeBreakdown: Record<string, number>;
    recentActivity: { date: string; count: number }[];
  }> {
    const dateDirs = await this.getDateDirectories();
    let totalEntries = 0;
    const typeBreakdown: Record<string, number> = {};
    const recentActivity: { date: string; count: number }[] = [];

    for (const dateDir of dateDirs.slice(0, 30)) { // Last 30 days
      const result = await this.searchDayClipboard(dateDir);
      totalEntries += result.totalCount;
      
      recentActivity.push({
        date: dateDir,
        count: result.totalCount
      });

      for (const entry of result.entries) {
        typeBreakdown[entry.type] = (typeBreakdown[entry.type] || 0) + 1;
      }
    }

    return {
      totalDays: dateDirs.length,
      totalEntries,
      typeBreakdown,
      recentActivity: recentActivity.slice(0, 7) // Last 7 days
    };
  }
}