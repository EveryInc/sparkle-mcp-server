# Development & Update Workflow

## 🔄 Update Workflow

### 1. Make Code Changes
```bash
cd /Users/yashpoojary/Documents/Apps(1)/sparkle-mcp-server

# Edit source files in src/
# For example:
# - src/index.ts (main server)
# - src/search-engine.ts (search functionality)
# - src/sparkle-folder.ts (folder monitoring)
```

### 2. Test Locally
```bash
# Build the TypeScript
npm run build

# Test the server
npm start
# Or test directly:
node dist/index.js
```

### 3. Test with Claude Desktop
```json
// In Claude Desktop config, point to local version:
{
  "mcpServers": {
    "sparkle-dev": {
      "command": "node",
      "args": ["/Users/yashpoojary/Documents/Apps(1)/sparkle-mcp-server/dist/index.js"]
    }
  }
}
```

### 4. Version Bump
```bash
# Patch version (1.0.0 → 1.0.1)
npm version patch

# Minor version (1.0.0 → 1.1.0)
npm version minor

# Major version (1.0.0 → 2.0.0)
npm version major
```

### 5. Commit & Push
```bash
# Add changes
git add .

# Commit with descriptive message
git commit -m "feat: add new search capability"

# Push to GitHub
git push origin main
```

### 6. Publish to NPM
```bash
# Publish new version
npm publish --access public

# Users automatically get updates via npx
```

## 🧪 Testing Checklist

### Before Publishing:
- [ ] `npm run build` succeeds
- [ ] `npm start` runs without errors
- [ ] All 8 tools work in Claude Desktop
- [ ] Sparkle folder auto-creation works
- [ ] Security restrictions are enforced

### Test Commands:
```bash
# Quick functionality test
echo "Test file" > ~/Sparkle/test.txt
node dist/index.js

# In another terminal, test MCP protocol:
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

## 🛠 Development Tips

### Watch Mode
```bash
# Auto-rebuild on changes
npm run dev
```

### Debug Mode
```typescript
// Add to src/index.ts for debugging:
console.error("Debug:", someVariable);
// Errors go to stderr, visible in Claude logs
```

### Common Issues

**TypeScript errors:**
```bash
# Clean rebuild
rm -rf dist/
npm run build
```

**Module not found:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## 📦 Release Process

### 1. Test Everything
```bash
npm test  # If you add tests
npm run build
npm start
```

### 2. Update Version
```bash
npm version patch -m "Release v%s - Bug fixes"
```

### 3. Push & Publish
```bash
git push origin main --tags
npm publish --access public
```

### 4. Verify
```bash
# Test the published version
npx @every-env/sparkle-mcp-server@latest
```

## 🔍 Monitoring Usage

Check npm stats:
- https://www.npmjs.com/package/@every-env/sparkle-mcp-server

GitHub insights:
- Stars, issues, PRs at your GitHub repo

## 🐛 User Bug Reports

Users can report issues at:
- GitHub Issues: https://github.com/EveryInc/sparkle-mcp-server/issues

Common troubleshooting:
1. Check Claude Desktop logs
2. Verify ~/Sparkle folder exists
3. Test with simple commands first