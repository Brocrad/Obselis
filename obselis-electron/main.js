const { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog, Notification, nativeImage, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

let mainWindow
let tray

// Enable live reload for development
if (process.argv.includes('--dev')) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  })
}

function createWindow() {
  const windowIconPath = path.join(__dirname, 'assets', 'icon')
  const windowIconPathWithExt = path.join(__dirname, 'assets', 'icon.ico')
  
  console.log(`🔍 Window icon path (no ext): ${windowIconPath}`)
  console.log(`🔍 Window icon path (with ext): ${windowIconPathWithExt}`)
  console.log(`🔍 Icon.ico exists: ${fs.existsSync(windowIconPathWithExt)}`)
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false, // Allow cross-origin requests for media streaming
      allowRunningInsecureContent: true, // Allow HTTP content in HTTPS context
      experimentalFeatures: true // Enable experimental web features
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'), // Crystal Obelisk icon
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e293b',
      symbolColor: '#ffffff'
    }
  })

  // Load the renderer HTML
  mainWindow.loadFile('renderer.html')

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools()
  }

  // Handle window close event
  mainWindow.on('close', (event) => {
    console.log('🚪 Window close event triggered')
    
    // Clean up tray when window closes
    if (tray) {
      tray.destroy()
      tray = null
    }
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    console.log('🚪 Window closed - cleaning up')
    mainWindow = null
    
    // Ensure app quits when window is destroyed
    if (!app.isQuitting) {
      app.quit()
    }
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createTray() {
  // Use the same icon as window (Electron will resize automatically)
  const trayIconPath = path.join(__dirname, 'assets', 'icon.ico')
  
  let trayIcon
  try {
    console.log(`🔍 Checking tray icon path: ${trayIconPath}`)
    console.log(`🔍 File exists: ${fs.existsSync(trayIconPath)}`)
    
    if (fs.existsSync(trayIconPath)) {
      trayIcon = nativeImage.createFromPath(trayIconPath)
      console.log(`🔍 Icon loaded, isEmpty: ${trayIcon.isEmpty()}`)
      console.log(`🔍 Icon size: ${trayIcon.getSize().width}x${trayIcon.getSize().height}`)
      
      // Resize for tray (16x16 is typical for Windows tray)
      if (!trayIcon.isEmpty()) {
        trayIcon = trayIcon.resize({ width: 16, height: 16 })
        console.log(`✅ Tray icon loaded and resized from ${path.basename(trayIconPath)}`)
      }
    }
    
    if (!trayIcon || trayIcon.isEmpty()) {
      // Create a better visible 16x16 icon programmatically
      console.log('📝 Creating fallback tray icon...')
      trayIcon = nativeImage.createEmpty()
      
      // If that fails, try creating a simple black square
      if (trayIcon.isEmpty()) {
        // Create a basic 16x16 black square PNG
        const width = 16
        const height = 16
        const buffer = Buffer.alloc(width * height * 4) // RGBA
        
        // Fill with a simple pattern - white border, dark center
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
              // White border
              buffer[index] = 255     // R
              buffer[index + 1] = 255 // G
              buffer[index + 2] = 255 // B
              buffer[index + 3] = 255 // A
            } else if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
              // Dark center square
              buffer[index] = 64      // R
              buffer[index + 1] = 64  // G
              buffer[index + 2] = 64  // B
              buffer[index + 3] = 255 // A
            } else {
              // Transparent
              buffer[index] = 0       // R
              buffer[index + 1] = 0   // G
              buffer[index + 2] = 0   // B
              buffer[index + 3] = 0   // A
            }
          }
        }
        
        trayIcon = nativeImage.createFromBuffer(buffer, { width, height })
      }
      
      console.log('✅ Tray icon created programmatically (fallback)')
    }
    
    tray = new Tray(trayIcon)
    console.log('✅ Tray created successfully')
    
    // Test if tray is actually visible
    console.log('🔍 Tray details:')
    console.log('  - Tray bounds:', tray.getBounds())
    console.log('  - Tray is destroyed:', tray.isDestroyed())
    
  } catch (error) {
    console.log('❌ Could not create tray icon:', error.message)
    console.log('❌ Tray will not be available - minimize will use regular minimize instead')
    return
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Obselis',
      click: () => {
        console.log('🪟 Tray: Show Obselis clicked')
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          } else {
            mainWindow.show()
          }
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Obselis',
      click: () => {
        console.log('🪟 Tray: Quit Obselis clicked')
        app.quit()
      }
    }
  ])

  tray.setToolTip('Obselis Desktop - Media Server\nRight-click for options, double-click to show')
  tray.setContextMenu(contextMenu)
  
  // Single click to show window (more intuitive)
  tray.on('click', () => {
    console.log('🪟 Tray: Single click detected')
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      } else {
        mainWindow.show()
      }
      mainWindow.focus()
    }
  })
  
  // Double click to show window
  tray.on('double-click', () => {
    console.log('🪟 Tray: Double click detected')
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      } else {
        mainWindow.show()
      }
      mainWindow.focus()
    }
  })
  
  // Right click for context menu (should happen automatically, but let's log it)
  tray.on('right-click', () => {
    console.log('🪟 Tray: Right click detected')
  })
}

// IPC handlers for renderer process
ipcMain.handle('download-content', async (event, url, filename, authToken, contentInfo) => {
  try {
    // Get current user info for user-specific directory
    console.log('📥 Fetching user info for download...')
    const userInfo = await getCurrentUserInfo(authToken, url)
    console.log('📥 User info received:', userInfo)
    const userIdentifier = userInfo ? sanitizeFilename(userInfo.email || userInfo.username || 'unknown') : 'unknown'
    console.log('📥 User identifier for download:', userIdentifier)
    
    // Create user-specific offline directory structure
    const offlineBasePath = path.join(require('os').homedir(), 'Downloads', 'Obselis', userIdentifier)
    console.log('📥 Download base path:', offlineBasePath)
    
    // Determine content type and organize accordingly
    let targetDir = offlineBasePath
    let finalFilename = filename
    
    if (contentInfo) {
      if (contentInfo.category === 'tv-show' && contentInfo.tv_show_name) {
        // Organize TV shows: Obselis/TV Shows/Show Name/Season X/
        const showName = sanitizeFilename(contentInfo.tv_show_name)
        const seasonFolder = contentInfo.season_number ? `Season ${contentInfo.season_number}` : 'Episodes'
        targetDir = path.join(offlineBasePath, 'TV Shows', showName, seasonFolder)
        
        // Clean up filename for TV shows
        if (contentInfo.season_number && contentInfo.episode_number) {
          const ext = path.extname(filename)
          const episodeTitle = contentInfo.episode_title || contentInfo.title || 'Episode'
          finalFilename = `S${contentInfo.season_number.toString().padStart(2, '0')}E${contentInfo.episode_number.toString().padStart(2, '0')} - ${sanitizeFilename(episodeTitle)}${ext}`
        }
      } else if (contentInfo.category === 'movie') {
        // Organize movies: Obselis/Movies/
        targetDir = path.join(offlineBasePath, 'Movies')
        
        // Clean up filename for movies
        if (contentInfo.title && contentInfo.title !== filename) {
          const ext = path.extname(filename)
          finalFilename = `${sanitizeFilename(contentInfo.title)}${ext}`
        }
      }
    }
    
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    
    const filePath = path.join(targetDir, finalFilename)
    
    // Check if file already exists
    if (fs.existsSync(filePath)) {
      // Show notification that file already exists
      if (Notification.isSupported()) {
        new Notification({
          title: 'Already Downloaded',
          body: `${finalFilename} is already available offline!`
        }).show()
      }
      return filePath
    }
    
    // Download file directly without save dialog
    const file = fs.createWriteStream(filePath)
    
    return new Promise((resolve, reject) => {
      console.log(`📥 Starting download:`)
      console.log(`  - URL: ${url}`)
      console.log(`  - Filename: ${finalFilename}`)
      console.log(`  - Target path: ${filePath}`)
      console.log(`  - Auth token present: ${!!authToken}`)
      
      const options = {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
      }
      
      // Determine if we should use http or https
      const requestModule = url.startsWith('https:') ? https : require('http')
      
      console.log(`📥 Making ${url.startsWith('https:') ? 'HTTPS' : 'HTTP'} request...`)
      
      const request = requestModule.get(url, options, (response) => {
        console.log(`📥 Response received:`)
        console.log(`  - Status: ${response.statusCode}`)
        console.log(`  - Headers:`, response.headers)
        
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          const redirectUrl = response.headers.location
          console.log(`📥 Redirect to: ${redirectUrl}`)
          
          // Close current file stream
          file.close()
          fs.unlinkSync(filePath) // Remove empty file
          
          // Retry with redirect URL
          const redirectModule = redirectUrl.startsWith('https:') ? https : require('http')
          redirectModule.get(redirectUrl, options, (redirectResponse) => {
            console.log(`📥 Redirect response: ${redirectResponse.statusCode}`)
            
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`Download failed after redirect with status ${redirectResponse.statusCode}`))
              return
            }
            
            // Create new file stream
            const newFile = fs.createWriteStream(filePath)
            handleDownloadResponse(redirectResponse, newFile, filePath, finalFilename, resolve, reject)
          }).on('error', (err) => {
            console.error(`❌ Redirect request error: ${err.message}`)
            reject(err)
          })
          
          return
        }
        
        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(filePath) // Remove empty file
          reject(new Error(`Download failed with status ${response.statusCode}: ${response.statusMessage}`))
          return
        }
        
        handleDownloadResponse(response, file, filePath, finalFilename, resolve, reject)
      })
      
      request.on('error', (err) => {
        console.error(`❌ Request error: ${err.message}`)
        file.close()
        // Try to remove the empty file
        try {
          fs.unlinkSync(filePath)
        } catch (unlinkError) {
          console.error(`❌ Could not remove empty file: ${unlinkError.message}`)
        }
        reject(err)
      })
      
      // Set timeout
      request.setTimeout(30000, () => {
        console.error(`❌ Request timeout after 30 seconds`)
        request.destroy()
        file.close()
        try {
          fs.unlinkSync(filePath)
        } catch (unlinkError) {
          console.error(`❌ Could not remove empty file: ${unlinkError.message}`)
        }
        reject(new Error('Download timeout'))
      })
    })
    
    function handleDownloadResponse(response, file, filePath, finalFilename, resolve, reject) {
      const totalSize = parseInt(response.headers['content-length'], 10)
      let downloadedSize = 0
      
      console.log(`📥 Starting download stream:`)
      console.log(`  - Content-Length: ${totalSize || 'unknown'}`)
      console.log(`  - Content-Type: ${response.headers['content-type']}`)
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (totalSize) {
          const progress = Math.round((downloadedSize / totalSize) * 100)
          if (downloadedSize % (1024 * 1024) < chunk.length) { // Log every MB
            console.log(`📥 Download progress: ${progress}% (${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)`)
          }
        } else {
          if (downloadedSize % (1024 * 1024) < chunk.length) { // Log every MB
            console.log(`📥 Downloaded: ${Math.round(downloadedSize / 1024 / 1024)}MB`)
          }
        }
      })
      
      response.on('end', () => {
        console.log(`📥 Response stream ended. Total downloaded: ${downloadedSize} bytes`)
      })
      
      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        
        // Verify file was actually written
        const stats = fs.statSync(filePath)
        console.log(`✅ Download complete:`)
        console.log(`  - File: ${filePath}`)
        console.log(`  - Size: ${stats.size} bytes`)
        console.log(`  - Expected: ${totalSize || 'unknown'} bytes`)
        
        if (stats.size === 0) {
          console.error(`❌ Downloaded file is empty!`)
          reject(new Error('Downloaded file is empty'))
          return
        }
        
        // Show success notification
        if (Notification.isSupported()) {
          new Notification({
            title: 'Download Complete',
            body: `${finalFilename} is now available offline! (${Math.round(stats.size / 1024 / 1024)}MB)`
          }).show()
        }
        
        resolve(filePath)
      })
      
      file.on('error', (err) => {
        console.error(`❌ File write error: ${err.message}`)
        try {
          fs.unlinkSync(filePath) // Delete partial file
        } catch (unlinkError) {
          console.error(`❌ Could not remove partial file: ${unlinkError.message}`)
        }
        reject(err)
      })
    }
    
  } catch (error) {
    console.error(`❌ Download setup error: ${error.message}`)
    throw error
  }
})

// Helper function to get current user info
async function getCurrentUserInfo(authToken, serverUrl) {
  if (!authToken) return null
  
  try {
    // Extract base URL from the streaming URL
    const baseUrl = serverUrl.replace(/\/api\/.*$/, '')
    const userUrl = `${baseUrl}/api/auth/me`
    console.log('🔍 Fetching user info from:', userUrl)
    
    const requestModule = userUrl.startsWith('https:') ? https : require('http')
    
    return new Promise((resolve, reject) => {
      const options = {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
      
      const request = requestModule.get(userUrl, options, (response) => {
        let data = ''
        
        response.on('data', (chunk) => {
          data += chunk
        })
        
        response.on('end', () => {
          try {
            console.log('🔍 User info response status:', response.statusCode)
            console.log('🔍 User info response data:', data)
            if (response.statusCode === 200) {
              const userInfo = JSON.parse(data)
              console.log('🔍 Parsed user info:', userInfo)
              resolve(userInfo.user || userInfo)
            } else {
              console.warn('Could not fetch user info:', response.statusCode, data)
              resolve(null)
            }
          } catch (error) {
            console.warn('Error parsing user info:', error, 'Raw data:', data)
            resolve(null)
          }
        })
      })
      
      request.on('error', (error) => {
        console.warn('Error fetching user info:', error)
        resolve(null)
      })
      
      request.setTimeout(5000, () => {
        request.destroy()
        resolve(null)
      })
    })
  } catch (error) {
    console.warn('Error in getCurrentUserInfo:', error)
    return null
  }
}

// Helper function to sanitize filenames
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
}

// Convert file path to proper file:// URL (the proven approach)
function convertToFileUrl(filePath) {
  // Normalize the path and convert to file:// URL
  const normalizedPath = path.normalize(filePath)
  // Convert Windows path to proper file URL format
  const fileUrl = `file:///${normalizedPath.replace(/\\/g, '/').replace(/^([A-Z]):/, '$1:')}`
  return fileUrl
}

// IPC handler for getting local file URLs
ipcMain.handle('get-local-file-url', async (event, filePath) => {
  try {
    console.log('📁 Requesting local file URL for:', filePath)
    
    // Fix path separators and normalize
    const fixedFilePath = filePath.replace(/\//g, path.sep)
    console.log('📁 Fixed file path:', fixedFilePath)
    
    // Verify the file exists and is within the allowed directory
    const downloadsPath = path.join(require('os').homedir(), 'Downloads', 'Obselis')
    const normalizedFilePath = path.normalize(fixedFilePath)
    const normalizedDownloadsPath = path.normalize(downloadsPath)
    
    console.log('📁 Downloads path:', normalizedDownloadsPath)
    console.log('📁 Normalized file path:', normalizedFilePath)
    
    // Security check: ensure the file is within the Downloads/Obselis directory
    if (!normalizedFilePath.startsWith(normalizedDownloadsPath)) {
      console.error('❌ Security violation: File outside allowed directory')
      console.error('❌ Expected to start with:', normalizedDownloadsPath)
      console.error('❌ Actual path:', normalizedFilePath)
      throw new Error('File access denied: outside allowed directory')
    }
    
    // Check if file exists
    if (!fs.existsSync(normalizedFilePath)) {
      console.error('❌ File not found:', normalizedFilePath)
      throw new Error('File not found')
    }
    
    // Convert to file:// URL
    const fileUrl = convertToFileUrl(normalizedFilePath)
    console.log('✅ Created file URL:', fileUrl)
    
    return fileUrl
    
  } catch (error) {
    console.error('❌ Error creating local file URL:', error.message)
    throw error
  }
})

ipcMain.handle('show-notification', async (event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
})

ipcMain.handle('delete-offline-content', async (event, filePath) => {
  try {
    console.log('🗑️ Deleting offline content:', filePath)
    
    // Fix path separators and normalize
    const fixedFilePath = filePath.replace(/\//g, path.sep)
    console.log('🗑️ Fixed file path:', fixedFilePath)
    
    // Verify the file exists and is within the allowed directory
    const downloadsPath = path.join(require('os').homedir(), 'Downloads', 'Obselis')
    const normalizedFilePath = path.normalize(fixedFilePath)
    const normalizedDownloadsPath = path.normalize(downloadsPath)
    
    console.log('🗑️ Downloads path:', normalizedDownloadsPath)
    console.log('🗑️ Normalized file path:', normalizedFilePath)
    
    // Security check: ensure the file is within the Downloads/Obselis directory
    if (!normalizedFilePath.startsWith(normalizedDownloadsPath)) {
      console.error('❌ Security violation: File outside allowed directory')
      console.error('❌ Expected to start with:', normalizedDownloadsPath)
      console.error('❌ Actual path:', normalizedFilePath)
      throw new Error('File access denied: outside allowed directory')
    }
    
    // Check if file exists
    if (!fs.existsSync(normalizedFilePath)) {
      console.error('❌ File not found:', normalizedFilePath)
      throw new Error('File not found')
    }
    
    // Get file stats for logging
    const stats = fs.statSync(normalizedFilePath)
    console.log('🗑️ File size:', stats.size, 'bytes')
    
    // Delete the file
    fs.unlinkSync(normalizedFilePath)
    console.log('✅ File deleted successfully:', normalizedFilePath)
    
    // Try to clean up empty directories
    try {
      const parentDir = path.dirname(normalizedFilePath)
      const parentContents = fs.readdirSync(parentDir)
      
      if (parentContents.length === 0) {
        console.log('🗑️ Removing empty directory:', parentDir)
        fs.rmdirSync(parentDir)
        
        // Try to remove parent directories if they're also empty
        const grandParentDir = path.dirname(parentDir)
        if (grandParentDir !== normalizedDownloadsPath) {
          const grandParentContents = fs.readdirSync(grandParentDir)
          if (grandParentContents.length === 0) {
            console.log('🗑️ Removing empty parent directory:', grandParentDir)
            fs.rmdirSync(grandParentDir)
          }
        }
      }
    } catch (cleanupError) {
      console.log('🗑️ Could not clean up empty directories:', cleanupError.message)
      // This is not a critical error, so we don't throw
    }
    
    return true
    
  } catch (error) {
    console.error('❌ Error deleting offline content:', error.message)
    throw error
  }
})

ipcMain.handle('open-with-system-player', async (event, filePath) => {
  try {
    console.log('📱 Opening with system player:', filePath)
    
    // Fix path separators and normalize
    const fixedFilePath = filePath.replace(/\//g, path.sep)
    console.log('📱 Fixed file path:', fixedFilePath)
    
    // Verify the file exists and is within the allowed directory
    const downloadsPath = path.join(require('os').homedir(), 'Downloads', 'Obselis')
    const normalizedFilePath = path.normalize(fixedFilePath)
    const normalizedDownloadsPath = path.normalize(downloadsPath)
    
    console.log('📱 Downloads path:', normalizedDownloadsPath)
    console.log('📱 Normalized file path:', normalizedFilePath)
    console.log('📱 File exists:', fs.existsSync(normalizedFilePath))
    
    // Security check
    if (!normalizedFilePath.startsWith(normalizedDownloadsPath)) {
      console.error('❌ Security violation: File outside allowed directory')
      console.error('❌ Expected to start with:', normalizedDownloadsPath)
      console.error('❌ Actual path:', normalizedFilePath)
      throw new Error('File access denied: outside allowed directory')
    }
    
    if (!fs.existsSync(normalizedFilePath)) {
      console.error('❌ File not found:', normalizedFilePath)
      throw new Error('File not found')
    }
    
    // Get file stats for debugging
    const stats = fs.statSync(normalizedFilePath)
    console.log('📱 File size:', stats.size, 'bytes')
    console.log('📱 File is readable:', fs.constants.R_OK)
    
    // Check if file is empty
    if (stats.size === 0) {
      console.error('❌ File is empty (0 bytes)')
      throw new Error('File is empty - the download may have failed or been interrupted. Please re-download this content.')
    }
    
    // Open with system default application
    console.log('📱 Attempting to open:', normalizedFilePath)
    const result = await shell.openPath(normalizedFilePath)
    console.log('📱 Shell.openPath result:', result)
    
    if (result) {
      console.error('❌ Shell.openPath failed with error:', result)
      throw new Error(`Failed to open file: ${result}`)
    } else {
      console.log('✅ Opened with system player successfully')
    }
    
  } catch (error) {
    console.error('❌ Error opening with system player:', error.message)
    throw error
  }
})

ipcMain.handle('minimize-to-tray', async () => {
  if (mainWindow) {
    mainWindow.minimize()
  }
})

ipcMain.handle('minimize-window', async () => {
  if (mainWindow) {
    mainWindow.minimize()
  }
})

ipcMain.handle('close-window', async () => {
  console.log('🚪 Close window requested - terminating app completely')
  
  // Clean up tray
  if (tray) {
    tray.destroy()
    tray = null
  }
  
  // Close window and quit app completely
  if (mainWindow) {
    mainWindow.close()
  }
  
  // Force quit the app
  app.quit()
})

ipcMain.handle('force-quit', async () => {
  console.log('🚪 Force quit requested')
  
  // Force quit the app by removing tray first
  if (tray) {
    tray.destroy()
    tray = null
  }
  app.quit()
})

// App event handlers
app.whenReady().then(() => {
  createWindow()
  
  // Optionally create tray (but don't rely on it for core functionality)
  try {
    createTray()
  } catch (error) {
    console.log('Tray creation failed, continuing without tray:', error.message)
  }
  
  // Show welcome notification
  if (Notification.isSupported()) {
    new Notification({
      title: 'Obselis Desktop',
      body: 'Welcome to Obselis Desktop! Your media server is ready.'
    }).show()
  }
})

// Handle app before quit - cleanup resources
app.on('before-quit', (event) => {
  console.log('🚪 App is about to quit - cleaning up resources')
  app.isQuitting = true
  
  // Clean up tray
  if (tray && !tray.isDestroyed()) {
    console.log('🧹 Destroying tray')
    tray.destroy()
    tray = null
  }
  
  // Close main window if still open
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('🧹 Closing main window')
    mainWindow.removeAllListeners('close')
    mainWindow.close()
    mainWindow = null
  }
})

app.on('window-all-closed', () => {
  console.log('🚪 All windows closed - terminating app completely')
  
  // Clean up tray
  if (tray) {
    tray.destroy()
    tray = null
  }
  
  // Always quit the app when all windows are closed
  // This ensures no background processes keep running
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
} 