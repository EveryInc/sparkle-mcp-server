#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function quickTest() {
  console.log('🚀 Quick Sparkle MCP test...\n');

  try {
    // Get the absolute path to the server
    const serverPath = new URL('../dist/index.js', import.meta.url).pathname;
    
    // Create transport with command
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // Create and connect client
    const client = new Client({
      name: 'sparkle-quick-test',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    console.log('✅ Connected to Sparkle MCP server\n');

    // Test health check
    console.log('🏥 Health check:');
    const healthResult = await client.callTool('health_check', {});
    const health = JSON.parse(healthResult.content[0].text);
    console.log(JSON.stringify(health, null, 2));
    
    // Close connection
    await client.close();
    console.log('\n✨ Test completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
quickTest();