import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import chokidar from "chokidar";

interface FileMetadata {
  path: string;
  name: string;
  size: number;
  modified: Date;
  type: string;
  content?: string;
  summary?: string;
  embedding?: number[];
}

interface FileResult {
  path: string;
  relevance: number;
  summary?: string;
  metadata?: FileMetadata;
}

export class SparkleFolder {
  private folderPath: string;
  private fileIndex: Map<string, FileMetadata> = new Map();
  private watcher?: chokidar.FSWatcher;
  private indexReady: boolean = false;

  constructor(folderPath: string) {
    this.folderPath = this.expandPath(folderPath);
    this.initialize();
  }

  private expandPath(folderPath: string): string {
    if (folderPath.startsWith("~/")) {
      return path.join(os.homedir(), folderPath.slice(2));
    }
    return folderPath;
  }

  private async initialize() {
    // Create folder if it doesn't exist
    await fs.mkdir(this.folderPath, { recursive: true });
    
    // Initial indexing
    await this.indexAllFiles();
    
    // Set up file watcher
    this.setupWatcher();
    
    this.indexReady = true;
  }

  private setupWatcher() {
    this.watcher = chokidar.watch(this.folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 5,
    });

    this.watcher
      .on("add", (filePath) => this.onFileAdded(filePath))
      .on("change", (filePath) => this.onFileChanged(filePath))
      .on("unlink", (filePath) => this.onFileRemoved(filePath));
  }

  private async onFileAdded(filePath: string) {
    console.error(`New file in Sparkle folder: ${filePath}`);
    const metadata = await this.indexFile(filePath);
    
    // Auto-enhance file name if needed
    if (this.needsBetterName(metadata)) {
      await this.enhanceFileName(filePath, metadata);
    }
  }

  private async onFileChanged(filePath: string) {
    console.error(`File changed: ${filePath}`);
    await this.indexFile(filePath);
  }

  private onFileRemoved(filePath: string) {
    console.error(`File removed: ${filePath}`);
    this.fileIndex.delete(filePath);
  }

  private async indexAllFiles() {
    try {
      const files = await this.walkDirectory(this.folderPath);
      
      for (const file of files) {
        await this.indexFile(file);
      }
      
      console.error(`Indexed ${this.fileIndex.size} files in Sparkle folder`);
    } catch (error) {
      console.error("Error indexing files:", error);
    }
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        files.push(...await this.walkDirectory(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async indexFile(filePath: string): Promise<FileMetadata> {
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    const metadata: FileMetadata = {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      modified: stats.mtime,
      type: this.getFileType(ext),
    };

    // Extract content based on file type
    if (this.isTextFile(ext)) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        metadata.content = content.slice(0, 5000); // First 5KB
        metadata.summary = this.generateSummary(content);
      } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
      }
    }

    // Generate embedding for semantic search
    metadata.embedding = await this.generateEmbedding(metadata);

    this.fileIndex.set(filePath, metadata);
    return metadata;
  }

  private getFileType(ext: string): string {
    const typeMap: { [key: string]: string } = {
      ".pdf": "document",
      ".doc": "document",
      ".docx": "document",
      ".txt": "text",
      ".md": "text",
      ".jpg": "image",
      ".png": "image",
      ".mp3": "audio",
      ".wav": "audio",
      ".mp4": "video",
      ".mov": "video",
      ".csv": "data",
      ".json": "data",
      ".xlsx": "spreadsheet",
    };
    return typeMap[ext] || "other";
  }

  private isTextFile(ext: string): boolean {
    return [".txt", ".md", ".json", ".csv", ".log"].includes(ext);
  }

  private generateSummary(content: string): string {
    // Simple summary: first few lines
    const lines = content.split("\\n").filter(l => l.trim());
    return lines.slice(0, 3).join(" ").slice(0, 200);
  }

  private async generateEmbedding(metadata: FileMetadata): Promise<number[]> {
    // Placeholder: In real implementation, use embeddings API
    // For now, create fake embedding based on content
    const text = metadata.content || metadata.name;
    const hash = this.simpleHash(text);
    
    // Generate pseudo-embedding
    const embedding: number[] = [];
    for (let i = 0; i < 128; i++) {
      embedding.push(Math.sin(hash * i) * Math.cos(hash / (i + 1)));
    }
    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private needsBetterName(metadata: FileMetadata): boolean {
    // Check if file has generic name
    const genericPatterns = [
      /^IMG_\\d+/,
      /^DSC\\d+/,
      /^Screenshot/,
      /^audio_recording/,
      /^REC\\d+/,
      /^untitled/i,
    ];
    
    return genericPatterns.some(pattern => pattern.test(metadata.name));
  }

  private async enhanceFileName(filePath: string, metadata: FileMetadata) {
    // Placeholder: In real implementation, use AI to generate name
    // For now, add timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const ext = path.extname(filePath);
    const newName = `enhanced_${timestamp}_${metadata.name}`;
    const newPath = path.join(path.dirname(filePath), newName);
    
    try {
      await fs.rename(filePath, newPath);
      console.error(`Renamed ${filePath} to ${newPath}`);
    } catch (error) {
      console.error("Error renaming file:", error);
    }
  }

  public async findRelevant(query: string, limit: number): Promise<FileResult[]> {
    if (!this.indexReady) {
      await this.waitForIndex();
    }

    const queryEmbedding = await this.generateEmbedding({
      name: query,
      content: query,
    } as FileMetadata);

    const results: FileResult[] = [];

    for (const [filePath, metadata] of this.fileIndex.entries()) {
      // Calculate relevance score
      const relevance = this.calculateRelevance(
        query,
        metadata,
        queryEmbedding,
        metadata.embedding || []
      );

      results.push({
        path: filePath,
        relevance,
        summary: metadata.summary,
        metadata,
      });
    }

    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private calculateRelevance(
    query: string,
    metadata: FileMetadata,
    queryEmbedding: number[],
    fileEmbedding: number[]
  ): number {
    let score = 0;

    // 1. Semantic similarity (if embeddings available)
    if (fileEmbedding.length > 0) {
      score += this.cosineSimilarity(queryEmbedding, fileEmbedding) * 0.5;
    }

    // 2. Keyword matching in filename
    const queryWords = query.toLowerCase().split(/\\s+/);
    const nameWords = metadata.name.toLowerCase();
    
    for (const word of queryWords) {
      if (nameWords.includes(word)) {
        score += 0.3;
      }
    }

    // 3. Content matching (if available)
    if (metadata.content) {
      const contentLower = metadata.content.toLowerCase();
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 0.2;
        }
      }
    }

    // 4. Recency bonus
    const daysSinceModified = 
      (Date.now() - metadata.modified.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 7) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async waitForIndex(): Promise<void> {
    // Wait for initial indexing to complete
    while (!this.indexReady) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  public async cleanup() {
    if (this.watcher) {
      await this.watcher.close();
    }
  }
}