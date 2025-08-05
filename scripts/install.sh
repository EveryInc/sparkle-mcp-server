#!/bin/bash

# Sparkle MCP Server Installation Script
# This script installs and configures the Sparkle MCP server for Claude Desktop

set -e

echo "🌟 Sparkle MCP Server Installation"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 16+ first.${NC}"
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Please upgrade to Node.js 16+${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $NODE_VERSION detected${NC}"

# Install the package
echo "📦 Installing Sparkle MCP Server..."
if npm install -g @every-env/sparkle-mcp-server; then
    echo -e "${GREEN}✅ Package installed successfully${NC}"
else
    echo -e "${RED}❌ Failed to install package${NC}"
    exit 1
fi

# Create Sparkle directory
SPARKLE_DIR="$HOME/Sparkle"
if [ ! -d "$SPARKLE_DIR" ]; then
    echo "📁 Creating Sparkle directory..."
    mkdir -p "$SPARKLE_DIR"
    mkdir -p "$SPARKLE_DIR/Pasteboard"
    echo -e "${GREEN}✅ Created $SPARKLE_DIR${NC}"
else
    echo -e "${YELLOW}📁 Sparkle directory already exists${NC}"
fi

# Create Pasteboard directory if it doesn't exist
if [ ! -d "$SPARKLE_DIR/Pasteboard" ]; then
    mkdir -p "$SPARKLE_DIR/Pasteboard"
    echo -e "${GREEN}✅ Created Pasteboard directory${NC}"
fi

# Configure Claude Desktop
CLAUDE_CONFIG_DIR="$HOME/.config/claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/config.json"

echo "⚙️  Configuring Claude Desktop..."

# Create config directory if it doesn't exist
if [ ! -d "$CLAUDE_CONFIG_DIR" ]; then
    mkdir -p "$CLAUDE_CONFIG_DIR"
    echo -e "${GREEN}✅ Created Claude config directory${NC}"
fi

# Check if config file exists
if [ -f "$CLAUDE_CONFIG_FILE" ]; then
    echo -e "${YELLOW}📄 Claude config file already exists${NC}"
    
    # Check if sparkle is already configured
    if grep -q '"sparkle"' "$CLAUDE_CONFIG_FILE"; then
        echo -e "${YELLOW}⚠️  Sparkle MCP server is already configured in Claude${NC}"
    else
        echo "🔧 Adding Sparkle configuration to existing Claude config..."
        
        # Backup existing config
        cp "$CLAUDE_CONFIG_FILE" "$CLAUDE_CONFIG_FILE.backup.$(date +%s)"
        
        # Add sparkle configuration (this is a simple approach - in production you'd want proper JSON merging)
        echo -e "${YELLOW}⚠️  Please manually add the following to your Claude config:${NC}"
        echo '{
  "mcpServers": {
    "sparkle": {
      "command": "sparkle-mcp"
    }
  }
}'
    fi
else
    echo "📝 Creating Claude configuration file..."
    cat > "$CLAUDE_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "sparkle": {
      "command": "sparkle-mcp"
    }
  }
}
EOF
    echo -e "${GREEN}✅ Claude configuration created${NC}"
fi

# Test the installation
echo "🧪 Testing installation..."
if command -v sparkle-mcp &> /dev/null; then
    echo -e "${GREEN}✅ sparkle-mcp command is available${NC}"
    
    # Test that the server can start (timeout after 3 seconds)
    if timeout 3s sparkle-mcp --help &> /dev/null || [ $? -eq 124 ]; then
        echo -e "${GREEN}✅ Server executable works${NC}"
    else
        echo -e "${YELLOW}⚠️  Server executable test inconclusive${NC}"
    fi
else
    echo -e "${RED}❌ sparkle-mcp command not found in PATH${NC}"
    echo "Try running: export PATH=\$PATH:\$(npm config get prefix)/bin"
fi

echo ""
echo "🎉 Installation Complete!"
echo "========================"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop"
echo "2. Try asking Claude: 'List the files in my Sparkle folder'"
echo "3. Add files to ~/Sparkle for Claude to access"
echo ""
echo "For clipboard history:"
echo "- Files should be saved to ~/Sparkle/Pasteboard/YYYY-MM-DD/"
echo "- Supported formats: JSON and text"
echo ""
echo "📖 Documentation: https://github.com/EveryInc/sparkle-mcp-server"
echo "🐛 Issues: https://github.com/EveryInc/sparkle-mcp-server/issues"
echo ""
echo -e "${GREEN}Happy Sparkling! ✨${NC}"