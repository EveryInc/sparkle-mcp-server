# How to Restart Sparkle MCP Server in Claude Desktop

The server code has been updated and built, but Claude Desktop is still running the old version. You need to restart it:

## Option 1: Restart Claude Desktop
1. Quit Claude Desktop completely (Cmd+Q on Mac)
2. Start Claude Desktop again
3. The Sparkle MCP server should start with the new code

## Option 2: Restart just the MCP server (if Claude Desktop supports it)
1. Look for MCP server settings in Claude Desktop
2. Find the Sparkle MCP server
3. Stop/disable it
4. Start/enable it again

## Option 3: From Terminal (if the server is running separately)
1. Find the process:
   ```bash
   ps aux | grep sparkle-mcp
   ```
2. Kill it:
   ```bash
   pkill -f sparkle-mcp
   ```
3. The server should restart automatically if configured in Claude Desktop

## Verify the Update
After restarting, test these operations again:
- `list_directory` with `path: ""`
- `search_files` with `path: "", pattern: "*"`

You should see the files listed instead of "Access denied" errors.

## If Still Not Working
Check the Claude Desktop MCP configuration file (usually in ~/.config/claude/mcp.json or similar) to ensure it's pointing to the correct server path.