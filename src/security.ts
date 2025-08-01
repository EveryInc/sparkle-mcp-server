import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

interface SecurityConfig {
  allowedPaths?: string[];
  blockedPaths?: string[];
  maxFileSize?: number;
  allowSymlinks?: boolean;
}

export class PathValidator {
  private config: SecurityConfig;
  private defaultAllowedPaths: string[];
  private defaultBlockedPaths: string[];

  constructor(config: SecurityConfig = {}) {
    this.config = config;
    
    // Default allowed paths
    this.defaultAllowedPaths = [
      os.homedir(),
      path.join(os.homedir(), "Documents"),
      path.join(os.homedir(), "Downloads"),
      path.join(os.homedir(), "Desktop"),
      path.join(os.homedir(), "Sparkle"),
    ];
    
    // Default blocked paths - system directories
    this.defaultBlockedPaths = [
      "/etc",
      "/sys",
      "/proc",
      "/dev",
      "/private/etc",
      "/private/var",
      "/System",
      "/Library/Security",
      path.join(os.homedir(), ".ssh"),
      path.join(os.homedir(), ".gnupg"),
      path.join(os.homedir(), ".aws"),
      path.join(os.homedir(), ".config/gcloud"),
    ];
  }

  public async validatePath(requestedPath: string): Promise<string> {
    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(requestedPath);
      
      // Check if path exists
      const stats = await fs.stat(absolutePath);
      
      // Check symlinks if not allowed
      if (!this.config.allowSymlinks && stats.isSymbolicLink()) {
        throw new Error("Symbolic links are not allowed");
      }
      
      // Check if path is blocked
      if (this.isPathBlocked(absolutePath)) {
        throw new Error(`Access denied: Path is in blocked directory`);
      }
      
      // Check if path is in allowed directories
      if (!this.isPathAllowed(absolutePath)) {
        throw new Error(`Access denied: Path is outside allowed directories`);
      }
      
      // Check file size if it's a file
      if (stats.isFile() && this.config.maxFileSize) {
        if (stats.size > this.config.maxFileSize) {
          throw new Error(`File too large: ${stats.size} bytes exceeds limit`);
        }
      }
      
      return absolutePath;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${requestedPath}`);
      }
      throw error;
    }
  }

  private isPathBlocked(checkPath: string): boolean {
    const blockedPaths = [
      ...this.defaultBlockedPaths,
      ...(this.config.blockedPaths || [])
    ];
    
    return blockedPaths.some(blocked => {
      const blockedAbsolute = path.resolve(blocked);
      return checkPath.startsWith(blockedAbsolute);
    });
  }

  private isPathAllowed(checkPath: string): boolean {
    const allowedPaths = this.config.allowedPaths || this.defaultAllowedPaths;
    
    return allowedPaths.some(allowed => {
      const allowedAbsolute = path.resolve(allowed);
      return checkPath.startsWith(allowedAbsolute);
    });
  }

  public sanitizeFilename(filename: string): string {
    // Remove any path traversal attempts
    const sanitized = filename
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '_')
      .replace(/^\./, '_'); // No hidden files
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext);
      return name.substring(0, 255 - ext.length) + ext;
    }
    
    return sanitized;
  }

  public async validateSearchPath(searchPath: string): Promise<string> {
    const validated = await this.validatePath(searchPath);
    
    // Additional check: ensure it's a directory
    const stats = await fs.stat(validated);
    if (!stats.isDirectory()) {
      throw new Error("Search path must be a directory");
    }
    
    return validated;
  }

  public getAllowedPaths(): string[] {
    return this.config.allowedPaths || this.defaultAllowedPaths;
  }

  public getBlockedPaths(): string[] {
    return [
      ...this.defaultBlockedPaths,
      ...(this.config.blockedPaths || [])
    ];
  }
}

// Rate limiting for search operations
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public checkLimit(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  public reset(identifier: string) {
    this.requests.delete(identifier);
  }

  public cleanup() {
    // Clean up old entries periodically
    const now = Date.now();
    for (const [id, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(id);
      } else {
        this.requests.set(id, validRequests);
      }
    }
  }
}

// File type validator
export class FileTypeValidator {
  private allowedExtensions: Set<string>;
  private blockedExtensions: Set<string>;

  constructor() {
    // Common safe file types
    this.allowedExtensions = new Set([
      '.txt', '.md', '.pdf', '.doc', '.docx',
      '.jpg', '.jpeg', '.png', '.gif', '.svg',
      '.mp3', '.wav', '.m4a', '.mp4', '.mov',
      '.csv', '.json', '.xml', '.yaml', '.yml',
      '.js', '.ts', '.py', '.java', '.c', '.cpp',
      '.html', '.css', '.scss', '.sass',
      '.log', '.conf', '.cfg', '.ini',
      '.zip', '.tar', '.gz', '.7z',
    ]);
    
    // Potentially dangerous file types
    this.blockedExtensions = new Set([
      '.exe', '.dll', '.so', '.dylib',
      '.app', '.dmg', '.pkg', '.deb', '.rpm',
      '.sh', '.bat', '.cmd', '.ps1',
      '.scr', '.vbs', '.js', '.jar',
    ]);
  }

  public isAllowed(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    
    // Check blocked first
    if (this.blockedExtensions.has(ext)) {
      return false;
    }
    
    // If we have a whitelist, check it
    if (this.allowedExtensions.size > 0) {
      return this.allowedExtensions.has(ext);
    }
    
    return true;
  }

  public addAllowedType(extension: string) {
    this.allowedExtensions.add(extension.toLowerCase());
  }

  public addBlockedType(extension: string) {
    this.blockedExtensions.add(extension.toLowerCase());
  }
}