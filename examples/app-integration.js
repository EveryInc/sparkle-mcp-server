/**
 * Example App-Side Integration for Sparkle MCP Server
 * 
 * This demonstrates how to integrate the Sparkle MCP server into your application
 * when a user selects the MCP option.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EventEmitter } from 'events';

export class MCPConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.transport = null;
    this.isConnected = false;
  }

  /**
   * Connect to the Sparkle MCP server
   * @returns {Promise<boolean>} Success status
   */
  async connectToSparkleServer() {
    try {
      this.emit('status', 'Connecting to Sparkle MCP server...');

      // Path to the installed sparkle-mcp server
      // In production, this would be resolved from node_modules
      const serverCommand = 'npx';
      const serverArgs = ['@every-env/sparkle-mcp-server'];

      // Create transport
      this.transport = new StdioClientTransport({
        command: serverCommand,
        args: serverArgs,
        env: { ...process.env }
      });

      // Create client
      this.client = new Client({
        name: 'your-app-name',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect
      await this.client.connect(this.transport);
      this.isConnected = true;

      this.emit('status', 'Connected to Sparkle MCP server');
      this.emit('connected');

      // Check server health
      const health = await this.checkHealth();
      this.emit('health', health);

      return true;
    } catch (error) {
      this.emit('error', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      this.emit('disconnected');
    }
  }

  /**
   * Check server health
   */
  async checkHealth() {
    if (!this.isConnected) throw new Error('Not connected');
    
    const result = await this.client.callTool('health_check', {});
    return JSON.parse(result.content[0].text);
  }

  /**
   * Search for files based on user query
   */
  async searchFiles(query, maxFiles = 10) {
    if (!this.isConnected) throw new Error('Not connected');
    
    const result = await this.client.callTool('get_relevant_files', {
      query,
      maxFiles
    });
    
    return result.content[0].text;
  }

  /**
   * Read a file from Sparkle folder
   */
  async readFile(path) {
    if (!this.isConnected) throw new Error('Not connected');
    
    const result = await this.client.callTool('read_file', { path });
    return result.content[0].text;
  }

  /**
   * Write a file to Sparkle folder
   */
  async writeFile(path, content) {
    if (!this.isConnected) throw new Error('Not connected');
    
    const result = await this.client.callTool('write_file', {
      path,
      content
    });
    
    return result.content[0].text;
  }

  /**
   * List directory contents
   */
  async listDirectory(path = '.') {
    if (!this.isConnected) throw new Error('Not connected');
    
    const result = await this.client.callTool('list_directory', { path });
    return result.content[0].text;
  }

  /**
   * Get available tools
   */
  async getAvailableTools() {
    if (!this.isConnected) throw new Error('Not connected');
    
    const tools = await this.client.listTools();
    return tools.tools;
  }
}

// Example usage in your app
export class SparkleIntegration {
  constructor() {
    this.mcpManager = new MCPConnectionManager();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.mcpManager.on('status', (status) => {
      console.log(`[MCP Status] ${status}`);
      // Update UI status indicator
    });

    this.mcpManager.on('connected', () => {
      console.log('[MCP] Connected successfully');
      // Enable MCP features in UI
    });

    this.mcpManager.on('disconnected', () => {
      console.log('[MCP] Disconnected');
      // Disable MCP features in UI
    });

    this.mcpManager.on('error', (error) => {
      console.error('[MCP Error]', error);
      // Show error to user
    });

    this.mcpManager.on('health', (health) => {
      console.log('[MCP Health]', health);
      // Update health indicator in UI
    });
  }

  /**
   * Called when user selects MCP option
   */
  async onUserSelectsMCP() {
    const connected = await this.mcpManager.connectToSparkleServer();
    
    if (connected) {
      // Show Sparkle folder info
      const health = await this.mcpManager.checkHealth();
      console.log(`Sparkle folder: ${health.sparkleFolder.path}`);
      console.log(`Indexed files: ${health.indexedFiles}`);
      
      // List initial contents
      const contents = await this.mcpManager.listDirectory();
      console.log('\nSparkle folder contents:');
      console.log(contents);
      
      // Show available tools
      const tools = await this.mcpManager.getAvailableTools();
      console.log('\nAvailable MCP tools:');
      tools.forEach(tool => {
        console.log(`- ${tool.name}: ${tool.description}`);
      });
    }
  }

  /**
   * Example: Handle user file search
   */
  async handleUserSearch(query) {
    try {
      const results = await this.mcpManager.searchFiles(query);
      console.log('Search results:', results);
      return results;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Example: Save user data to Sparkle folder
   */
  async saveUserData(filename, data) {
    try {
      const content = JSON.stringify(data, null, 2);
      const result = await this.mcpManager.writeFile(filename, content);
      console.log('Save result:', result);
      return result;
    } catch (error) {
      console.error('Save failed:', error);
      throw error;
    }
  }

  /**
   * Clean up when app closes or user deselects MCP
   */
  async cleanup() {
    await this.mcpManager.disconnect();
  }
}

// Example React component integration (pseudo-code)
// import { useState, useRef, useEffect } from 'react';
/*
export const MCPButton = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('');
  const sparkleIntegration = useRef(null);

  useEffect(() => {
    sparkleIntegration.current = new SparkleIntegration();
    
    sparkleIntegration.current.mcpManager.on('connected', () => {
      setIsConnected(true);
    });
    
    sparkleIntegration.current.mcpManager.on('disconnected', () => {
      setIsConnected(false);
    });
    
    sparkleIntegration.current.mcpManager.on('status', (status) => {
      setStatus(status);
    });

    return () => {
      sparkleIntegration.current?.cleanup();
    };
  }, []);

  const handleToggleMCP = async () => {
    if (!isConnected) {
      await sparkleIntegration.current.onUserSelectsMCP();
    } else {
      await sparkleIntegration.current.cleanup();
    }
  };

  return (
    <div>
      <button onClick={handleToggleMCP}>
        {isConnected ? 'Disconnect MCP' : 'Connect MCP'}
      </button>
      {status && <p>{status}</p>}
    </div>
  );
};
*/

// Example: Standalone test
if (import.meta.url === `file://${process.argv[1]}`) {
  const integration = new SparkleIntegration();
  
  console.log('Testing Sparkle MCP integration...\n');
  
  integration.onUserSelectsMCP()
    .then(async () => {
      // Test file operations
      await integration.saveUserData('test-data.json', {
        timestamp: new Date().toISOString(),
        message: 'Hello from app integration!'
      });
      
      // Test search
      await integration.handleUserSearch('test');
      
      // Cleanup
      await integration.cleanup();
      console.log('\nIntegration test complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Integration test failed:', error);
      process.exit(1);
    });
}