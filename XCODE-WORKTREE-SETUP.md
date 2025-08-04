# Running Multiple App Versions with Xcode and Git Worktrees

## Overview
This guide explains how to run 2 versions of the same iOS/macOS app simultaneously using git worktrees and Xcode.

## Step-by-Step Setup

### 1. Create Git Worktrees

```bash
# From your main repository
cd /path/to/your/app

# Create worktree for feature branch
git worktree add ../app-feature-x feature-branch

# Create worktree for another version
git worktree add ../app-staging staging

# Your directory structure:
# ~/Projects/
#   ├── app (main branch)
#   ├── app-feature-x (feature branch)
#   └── app-staging (staging branch)
```

### 2. Configure Different Bundle IDs

#### Method 1: Using xcconfig files

Create `Config-Worktree.xcconfig` in each worktree:

**Main Worktree** (`Config-Main.xcconfig`):
```
PRODUCT_BUNDLE_IDENTIFIER = com.yourcompany.app
APP_DISPLAY_NAME = YourApp
APP_ICON_SET = AppIcon
```

**Feature Worktree** (`Config-Feature.xcconfig`):
```
PRODUCT_BUNDLE_IDENTIFIER = com.yourcompany.app.feature
APP_DISPLAY_NAME = YourApp-Dev
APP_ICON_SET = AppIcon-Dev
```

#### Method 2: Using Build Settings

1. Open each worktree's project in Xcode
2. Select your target → Build Settings
3. Search for "Product Bundle Identifier"
4. Set different values:
   - Main: `com.yourcompany.app`
   - Feature: `com.yourcompany.app.dev`

### 3. Handle Scheme Conflicts

**Create Unique Schemes**:
1. Product → Scheme → Manage Schemes
2. Duplicate the main scheme
3. Rename based on worktree:
   - `YourApp-Main`
   - `YourApp-Feature`
   - `YourApp-Staging`

### 4. Configure App Names & Icons

To distinguish between versions visually:

**In Info.plist**:
```xml
<!-- Main worktree -->
<key>CFBundleDisplayName</key>
<string>YourApp</string>

<!-- Feature worktree -->
<key>CFBundleDisplayName</key>
<string>YourApp-Dev</string>
```

**Different App Icons**:
1. Create `AppIcon-Dev` in Assets.xcassets
2. Set in Build Settings → Asset Catalog App Icon Set Name

### 5. Handle Local Server Ports

If your app runs local servers (like the MCP server):

```swift
// AppConfig.swift
struct AppConfig {
    #if DEBUG_FEATURE
    static let mcpServerPort = 8081
    static let webServerPort = 3001
    #else
    static let mcpServerPort = 8080
    static let webServerPort = 3000
    #endif
}
```

### 6. Data Isolation

**Different UserDefaults**:
```swift
let suiteName = "com.yourcompany.app.\(Configuration.current.bundleSuffix)"
let defaults = UserDefaults(suiteName: suiteName)
```

**Different Keychain Access Groups**:
```
// Main: com.yourcompany.app.keychain
// Dev: com.yourcompany.app.dev.keychain
```

### 7. Running Simultaneously

#### On Simulators:
```bash
# Terminal 1 - Run main version
cd ~/Projects/app
xcodebuild -scheme YourApp-Main -destination 'platform=iOS Simulator,name=iPhone 15'

# Terminal 2 - Run feature version  
cd ~/Projects/app-feature-x
xcodebuild -scheme YourApp-Feature -destination 'platform=iOS Simulator,name=iPhone 15 Pro'
```

#### From Xcode:
1. Open both projects in separate Xcode windows
2. Select different simulators or devices
3. Run both projects

### 8. MCP Server Integration for Multiple Versions

For the Sparkle MCP server with multiple app versions:

```javascript
// In your app's MCP configuration
const getMCPConfig = (appVersion) => {
  return {
    sparkleFolder: `~/Sparkle-${appVersion}`,
    serverPort: appVersion === 'main' ? 8080 : 8081,
    configFile: `.mcp-config-${appVersion}.json`
  };
};
```

### 9. Debugging Tips

**Identify Running Version**:
```swift
// Add visual indicator
#if DEBUG
    let versionLabel = UILabel()
    versionLabel.text = "FEATURE BUILD"
    versionLabel.backgroundColor = .red
    window.addSubview(versionLabel)
#endif
```

**Console Logging**:
```swift
print("🏃 Running \(Bundle.main.bundleIdentifier ?? "unknown") on port \(AppConfig.serverPort)")
```

### 10. Common Issues & Solutions

**Issue**: "An app with this bundle ID is already installed"
**Solution**: Change bundle ID or uninstall existing app

**Issue**: Port already in use
**Solution**: Use different ports per worktree or kill existing processes

**Issue**: Keychain/data conflicts
**Solution**: Use different keychain groups and app groups

**Issue**: Provisioning profile errors
**Solution**: Create separate provisioning profiles for each bundle ID

### Example Project Structure

```
YourApp/
├── main-worktree/
│   ├── YourApp.xcodeproj
│   ├── Config-Main.xcconfig
│   └── Info.plist (bundle: com.company.app)
│
├── feature-worktree/
│   ├── YourApp.xcodeproj  
│   ├── Config-Feature.xcconfig
│   └── Info.plist (bundle: com.company.app.feature)
│
└── staging-worktree/
    ├── YourApp.xcodeproj
    ├── Config-Staging.xcconfig
    └── Info.plist (bundle: com.company.app.staging)
```

### Automation Script

Create `setup-worktree.sh`:
```bash
#!/bin/bash

BRANCH=$1
BUNDLE_SUFFIX=$2

# Create worktree
git worktree add ../${PWD##*/}-$BRANCH $BRANCH

# Update bundle ID
cd ../${PWD##*/}-$BRANCH
sed -i '' "s/com.company.app/com.company.app.$BUNDLE_SUFFIX/g" *.xcodeproj/project.pbxproj

echo "✅ Worktree created with bundle ID: com.company.app.$BUNDLE_SUFFIX"
```

Usage: `./setup-worktree.sh feature-x dev`

## Benefits

1. **Test features in isolation** without affecting main build
2. **Compare versions side-by-side** on same device
3. **Different backend environments** per version
4. **Separate push notifications** and app data
5. **A/B testing** different implementations

## Best Practices

1. Use clear naming conventions for bundle IDs
2. Add visual indicators to distinguish versions
3. Document which ports each version uses
4. Keep worktree-specific config in separate files
5. Use build configurations for environment variables