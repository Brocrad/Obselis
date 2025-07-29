# Obselis Desktop App (Electron)

A cross-platform desktop client for the Obselis media server built with Electron.

## Features

- 🖥️ **Native Desktop Experience** - Custom title bar and system tray integration
- 📥 **Offline Downloads** - Download media files directly to your computer
- 🔔 **Desktop Notifications** - Get notified about downloads and updates
- 🌐 **Server Connection** - Connect to any Obselis media server
- 🎨 **Modern UI** - Beautiful dark theme with smooth animations
- 📱 **Cross-Platform** - Works on Windows, macOS, and Linux

## Prerequisites

- Node.js (v16 or higher)
- A running Obselis media server (backend)

## Installation

1. Navigate to the Electron app directory:
   ```bash
   cd obselis-electron
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Start the app in development mode:
```bash
npm run dev
```

This will launch the Electron app with hot reload enabled.

## Building

Build the app for your current platform:
```bash
npm run build
```

Build for specific platforms:
```bash
npm run build:win    # Windows (.msi)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (.AppImage)
```

Built applications will be in the `dist/` directory.

## Usage

1. **Launch the App** - Start the desktop application
2. **Connect to Server** - Enter your Obselis server URL (default: http://localhost:3001)
3. **Browse Content** - View your media library
4. **Download Files** - Click the download button on any media item
5. **System Tray** - Minimize to system tray for background operation

## Configuration

The app connects to `http://localhost:3001` by default. You can change this in the connection screen or by modifying the `serverUrl` in `renderer.js`.

## File Structure

```
obselis-electron/
├── main.js           # Main Electron process
├── renderer.html     # App UI structure
├── renderer.js       # UI logic and API communication
├── styles.css        # App styling
├── package.json      # Dependencies and build config
└── README.md         # This file
```

## Troubleshooting

### Connection Issues
- Ensure the Obselis backend server is running
- Check that the server URL is correct
- Verify firewall settings aren't blocking the connection

### Download Issues
- Check that you have write permissions to the Downloads folder
- Ensure sufficient disk space is available

### Build Issues
- Make sure all dependencies are installed: `npm install`
- Try clearing node_modules and reinstalling: `rm -rf node_modules && npm install`

## Development Notes

The desktop app is completely separate from the web application and connects to the same backend API. This allows for:
- Independent development and deployment
- Shared backend logic and database
- Real-time synchronization between web and desktop clients

## License

Same as the main Obselis project.

## Running the Application

```bash
npm start
```

## Minimize to Tray Functionality

The app supports minimizing to the system tray for background operation.

### How it works:
- **Minimize Button**: Hides the app to system tray (if available)
- **Close Button**: Also hides to system tray (prevents accidental closure)
- **System Tray Icon**: Click to show/hide, right-click for menu

### Restoring the Window:
1. **System Tray**: Look for the Obselis icon in your system tray (notification area)
2. **Global Hotkey**: Press `Ctrl+Shift+O` to restore the window from anywhere
3. **Safety Timeout**: Window automatically appears in taskbar after 30 seconds if you can't find the tray icon

### Keyboard Shortcuts:
- `Ctrl+M`: Minimize to tray
- `Ctrl+Q`: Force quit (with confirmation)
- `Ctrl+Shift+O`: Restore window (global hotkey)
- `Escape`: Close media player

### Troubleshooting Tray Issues:

If you minimize the app and can't find it:

1. **Check System Tray**: Look in the bottom-right corner of your screen (Windows) for the Obselis icon
2. **Wait for Safety Timeout**: The app will automatically show in the taskbar after 30 seconds
3. **Use Global Hotkey**: Press `Ctrl+Shift+O` to restore the window
4. **Test Tray Functionality**: Run `npm run debug-tray` to test if system tray works on your system
5. **Force Restart**: If all else fails, kill the process and restart the app

### System Tray Not Working?

If the system tray doesn't work on your system, the app will fall back to regular window minimizing instead of hiding completely.

## Debug Commands

```bash
# Test system tray functionality
npm run debug-tray

# Run in development mode with DevTools
npm run dev
``` 