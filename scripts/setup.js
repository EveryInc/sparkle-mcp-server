#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const setupSparkleFolder = async () => {
  const sparkleDir = path.join(os.homedir(), 'Sparkle');
  
  console.log('🌟 Setting up Sparkle folder...');
  
  try {
    // Create Sparkle directory
    await fs.mkdir(sparkleDir, { recursive: true });
    console.log(`✅ Created Sparkle folder at: ${sparkleDir}`);
    
    // Create configuration file
    const configPath = path.join(sparkleDir, '.mcp-config.json');
    const config = {
      version: '1.0.0',
      created: new Date().toISOString(),
      settings: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowedExtensions: ['*'],
        autoIndex: true,
        watcherEnabled: true
      }
    };
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Created configuration file');
    
    // Create welcome file if it doesn't exist
    const welcomePath = path.join(sparkleDir, 'README.txt');
    try {
      await fs.access(welcomePath);
      console.log('ℹ️  Welcome file already exists');
    } catch {
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
      console.log('✅ Created welcome file');
    }
    
    // Create example directories
    const exampleDirs = ['documents', 'images', 'projects'];
    for (const dir of exampleDirs) {
      await fs.mkdir(path.join(sparkleDir, dir), { recursive: true });
    }
    console.log('✅ Created example directories');
    
    console.log('\n🎉 Sparkle folder setup complete!');
    console.log(`📁 Location: ${sparkleDir}`);
    
  } catch (error) {
    console.error('❌ Error during setup:', error);
    process.exit(1);
  }
};

// Run setup
setupSparkleFolder();