#!/usr/bin/env node

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testSparkleMCP() {
  console.log('🚀 Starting Sparkle MCP test client...\n');

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
      name: 'sparkle-test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    console.log('✅ Connected to Sparkle MCP server\n');

    // List available tools
    console.log('📋 Available tools:');
    const tools = await client.listTools();
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test health check
    console.log('🏥 Testing health check...');
    const healthResult = await client.callTool('health_check', {});
    console.log(JSON.parse(healthResult.content[0].text));
    console.log();

    // Test listing directory
    console.log('📁 Testing list directory...');
    const listResult = await client.callTool('list_directory', { path: '.' });
    console.log('Sparkle folder contents:');
    console.log(listResult.content[0].text);
    console.log();

    // Test creating a file
    console.log('📝 Testing file creation...');
    const writeResult = await client.callTool('write_file', {
      path: 'test-file.txt',
      content: 'Hello from Sparkle MCP test client!\nThis file was created via MCP.'
    });
    console.log(writeResult.content[0].text);
    console.log();

    // Test reading the file
    console.log('📖 Testing file read...');
    const readResult = await client.callTool('read_file', {
      path: 'test-file.txt'
    });
    console.log('File contents:');
    console.log(readResult.content[0].text);
    console.log();

    // Test search functionality
    console.log('🔍 Testing search...');
    const searchResult = await client.callTool('search_files', {
      path: '.',
      pattern: 'test'
    });
    console.log('Search results:');
    console.log(searchResult.content[0].text);
    console.log();

    // Test get relevant files
    console.log('🎯 Testing get relevant files...');
    const relevantResult = await client.callTool('get_relevant_files', {
      query: 'test documentation',
      maxFiles: 5
    });
    console.log(relevantResult.content[0].text);

    // Cleanup
    console.log('\n✨ All tests completed successfully!');
    
    // Close connection
    await client.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testSparkleMCP();