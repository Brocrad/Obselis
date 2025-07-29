const { ipcRenderer } = require('electron')

// App state
let serverUrl = 'http://localhost:3001'
let isConnected = false
let authToken = null
let isAuthenticated = false
let currentUser = null
let currentPage = 'home'
let allContent = []
let filteredContent = []
let offlineContent = []
let currentOfflineTab = 'movies'
let currentOfflineSeries = null
let currentOfflineSeason = 1

// Enhanced caching system
let enhancedContentCache = {
    data: null,
    timestamp: 0,
    analytics: null,
    analyticsTimestamp: 0
}
const ENHANCED_CACHE_DURATION = 60000 // 1 minute for content
const ANALYTICS_CACHE_DURATION = 300000 // 5 minutes for analytics
let isInitialLoad = true

// DOM elements
const loadingScreen = document.getElementById('loadingScreen')
const connectionError = document.getElementById('connectionError')
const mainApp = document.getElementById('mainApp')
const serverUrlInput = document.getElementById('serverUrl')
const reconnectBtn = document.getElementById('reconnectBtn')

// Navigation elements
const navLinks = document.querySelectorAll('.nav-link')
const pages = document.querySelectorAll('.page')
const userMenuBtn = document.getElementById('userMenuBtn')
const userDropdown = document.getElementById('userDropdown')
const userInitials = document.getElementById('userInitials')
const userName = document.getElementById('userName')
const userRole = document.getElementById('userRole')
const logoutBtn = document.getElementById('logoutBtn')

// Page elements
const welcomeTitle = document.getElementById('welcomeTitle')
const welcomeDate = document.getElementById('welcomeDate')
const quickStats = document.getElementById('quickStats')
const recentGrid = document.getElementById('recentGrid')
const moviesGrid = document.getElementById('moviesGrid')
const seriesGrid = document.getElementById('seriesGrid')
const contentGrid = document.getElementById('contentGrid')

// Offline elements
const offlineMoviesGrid = document.getElementById('offlineMoviesGrid')
const offlineSeriesGrid = document.getElementById('offlineSeriesGrid')
const offlineEpisodesGrid = document.getElementById('offlineEpisodesGrid')
const offlineTabs = document.querySelectorAll('.offline-tab')
const offlineTabContents = document.querySelectorAll('.offline-tab-content')

// Search elements
const movieSearch = document.getElementById('movieSearch')
const tvSearch = document.getElementById('tvSearch')
const contentSearch = document.getElementById('contentSearch')
const contentFilter = document.getElementById('contentFilter')
const offlineMovieSearch = document.getElementById('offlineMovieSearch')
const offlineTVSearch = document.getElementById('offlineTVSearch')

// Media player elements
const mediaPlayer = document.getElementById('mediaPlayer')
const closePlayer = document.getElementById('closePlayer')
const videoPlayer = document.getElementById('videoPlayer')
const audioPlayer = document.getElementById('audioPlayer')
const imagePlayer = document.getElementById('imagePlayer')
const documentPlayer = document.getElementById('documentPlayer')
const mediaTitle = document.getElementById('mediaTitle')
const mediaDescription = document.getElementById('mediaDescription')
const mediaType = document.getElementById('mediaType')
const mediaSize = document.getElementById('mediaSize')
const mediaDuration = document.getElementById('mediaDuration')

// Title bar controls
const minimizeBtn = document.getElementById('minimizeBtn')
const closeBtn = document.getElementById('closeBtn')

// Utility functions
function formatFileSize(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDuration(seconds) {
    if (!seconds) return '0:00'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

function getUserInitials(name) {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// Authentication functions
async function checkConnection() {
    showLoading()
    
    try {
        // Clear any existing authentication state to force fresh login
        authToken = null
        isAuthenticated = false
        currentUser = null
        localStorage.removeItem('authToken')
        
        // Test server connectivity
        const response = await fetch(`${serverUrl}/api/content?limit=1`)
        
        if (response.status === 401) {
            // Server is reachable but requires authentication
            console.log('Server reachable - showing login screen')
            setConnected(true)
            showLoginScreen()
        } else if (response.ok) {
            // This shouldn't happen with proper auth, but handle it
            console.log('Server accessible without auth - showing login screen anyway')
            setConnected(true)
            showLoginScreen()
        } else {
            throw new Error(`Server responded with ${response.status}`)
        }
    } catch (error) {
        console.error('Connection failed:', error)
        setConnected(false)
        showConnectionError()
    }
}

async function getCurrentUser() {
    if (!authToken) return
    
    try {
        const response = await fetch(`${serverUrl}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
        
        if (response.ok) {
            currentUser = await response.json()
            updateUserInterface()
        }
    } catch (error) {
        console.error('Failed to get user info:', error)
    }
}

async function login(email, password) {
    try {
        const response = await fetch(`${serverUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })
        
        if (response.ok) {
            const data = await response.json()
            authToken = data.token
            currentUser = data.user
            isAuthenticated = true
            
            // Store token
            localStorage.setItem('authToken', authToken)
            
            // Show Obselis loading animation immediately after login
            console.log('🎬 Starting Obselis loading animation after login...')
            window.obselisLoadingStartTime = Date.now()
            showObselisLoadingAnimation()
            
            // Load app (this will happen behind the animation)
            showMainApp()
            updateUserInterface()
            updateWelcomeMessage()
            await loadDashboardData()
            renderRecentContent()
            
            return { success: true }
        } else {
            const error = await response.json()
            return { success: false, error: error.error || 'Login failed' }
        }
    } catch (error) {
        return { success: false, error: 'Network error' }
    }
}

function logout() {
    authToken = null
    currentUser = null
    isAuthenticated = false
    
    // Clear offline content to prevent showing previous user's content
    offlineContent = []
    if (window.offlineFilePaths) {
        window.offlineFilePaths = {}
    }
    
    localStorage.removeItem('authToken')
    showLoginScreen()
}

// Screen management
function showLoading() {
    loadingScreen.classList.remove('hidden')
    connectionError.classList.add('hidden')
    mainApp.classList.add('hidden')
    document.getElementById('loginScreen')?.classList.add('hidden')
}

function showObselisLoadingAnimation() {
    // Create the Obselis loading animation
    const existingAnimation = document.getElementById('obselisLoadingAnimation')
    if (existingAnimation) {
        existingAnimation.remove()
    }
    
    const animationHTML = `
        <div id="obselisLoadingAnimation" class="screen" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); z-index: 9999; position: fixed; top: 0; left: 0; right: 0; bottom: 0;">
            <!-- Enhanced Background Particles -->
            <div class="absolute inset-0">
                ${[...Array(12)].map((_, i) => `
                    <div class="absolute w-1 h-1 bg-blue-400/30 rounded-full animate-pulse" 
                         style="left: ${Math.random() * 100}%; top: ${Math.random() * 100}%; 
                                animation-delay: ${Math.random() * 4}s; animation-duration: ${2 + Math.random() * 3}s;">
                    </div>
                `).join('')}
                
                <!-- Floating mystical symbols (reduced and subtle) -->
                ${['📚', '🎬', '💾'].map((symbol, i) => `
                    <div class="absolute text-xl opacity-15 animate-pulse pointer-events-none mystical-symbol"
                         style="left: ${20 + i * 30}%; top: ${25 + (i % 2) * 50}%; 
                                animation-delay: ${i * 1.2}s; animation-duration: ${5 + Math.random() * 2}s;">
                        ${symbol}
                    </div>
                `).join('')}
            </div>

            <!-- Purple Dotted Circle (subtle) -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="w-48 h-48 rounded-full border border-dotted border-purple-500/20 animate-spin opacity-0 transition-all duration-2000" 
                     id="purpleCircle" style="animation-duration: 30s;">
                </div>
            </div>

            <!-- Main Animation Container -->
            <div class="relative flex flex-col items-center">
                <!-- Enhanced Tower Structure -->
                <div class="relative mb-8" id="towerStructure">
                    <!-- Base Foundation -->
                    <div class="tower-base w-20 h-2 bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg transition-all duration-1000 opacity-0 scale-50"></div>
                    
                    <!-- Tower Levels -->
                    ${[...Array(4)].map((_, i) => `
                        <div class="tower-level absolute left-1/2 transform -translate-x-1/2 bg-gradient-to-t from-slate-600 to-slate-500 rounded-t-sm transition-all duration-800 opacity-0 translate-y-2"
                             style="width: ${80 - i * 6}px; height: 10px; bottom: ${8 + i * 10}px; animation-delay: ${i * 150}ms;">
                        </div>
                    `).join('')}

                    <!-- Enhanced Central Core with glow -->
                    <div class="central-core absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0">
                        <div class="w-4 h-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse">
                        </div>
                    </div>
                </div>

                <!-- Obselis Title with enhanced effects -->
                <div class="text-center mb-6 transition-all duration-1200 opacity-0 translate-y-4" id="obselisTitle">
                    <h1 class="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent mb-2 drop-shadow-lg">
                        OBSELIS
                    </h1>
                    <div class="transition-all duration-1000 opacity-0 translate-y-2" id="subtitle">
                        <p class="text-slate-400 text-base font-medium tracking-wider">
                            🔮 Vault of Arcane Media 🔮
                        </p>
                    </div>
                </div>

                <!-- Loading Progress -->
                <div class="w-64 transition-all duration-1000 opacity-0" id="loadingProgress">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-slate-400 text-sm">📡 Accessing the Archive</span>
                        <span class="text-blue-400 text-sm font-mono" id="progressPercent">0%</span>
                    </div>
                    <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden shadow-inner">
                        <div id="progressBar" class="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 shadow-lg" style="width: 0%">
                        </div>
                    </div>
                </div>

                <!-- Loading Messages -->
                <div class="mt-6 text-center transition-all duration-800 opacity-0" id="loadingMessage">
                    <div class="text-slate-500 text-sm" id="loadingText">
                        ✨ Initializing media archive...
                    </div>
                </div>
            </div>
        </div>
    `
    
    document.body.insertAdjacentHTML('beforeend', animationHTML)
    
    // Start the animation sequence
    startObselisAnimation()
}

function startObselisAnimation() {
    // Store animation elements globally for progress updates
    window.obselisProgressBar = document.getElementById('progressBar')
    window.obselisProgressPercent = document.getElementById('progressPercent')
    window.obselisLoadingText = document.getElementById('loadingText')
    
    // Initialize progress
    updateObselisProgress(0, 'Initializing archive access...')
    
    // Failsafe: Force completion after maximum time (30 seconds) - just in case
    window.obselisFailsafeTimer = setTimeout(() => {
        console.log('🚨 Failsafe triggered - forcing animation completion')
        if (document.getElementById('obselisLoadingAnimation')) {
            updateObselisProgress(100, 'Loading complete!')
        }
    }, 30000)
    
    // Smooth stage animations with better timing
    const stageTimers = [
        // Stage 0: Base foundation (start immediately)
        setTimeout(() => {
            const base = document.querySelector('.tower-base')
            if (base) {
                base.style.opacity = '1'
                base.style.transform = 'scale(1)'
            }
        }, 300),
        
        // Stage 1: Tower levels (smoother sequence)
        setTimeout(() => {
            const levels = document.querySelectorAll('.tower-level')
            levels.forEach((level, i) => {
                setTimeout(() => {
                    level.style.opacity = '1'
                    level.style.transform = 'translateX(-50%) translateY(0)'
                }, i * 100)
            })
        }, 600),
        
        // Stage 2: Title (earlier timing)
        setTimeout(() => {
            const title = document.getElementById('obselisTitle')
            if (title) {
                title.style.opacity = '1'
                title.style.transform = 'translateY(0)'
            }
        }, 1000),
        
        // Stage 3: Subtitle
        setTimeout(() => {
            const subtitle = document.getElementById('subtitle')
            if (subtitle) {
                subtitle.style.opacity = '1'
                subtitle.style.transform = 'translateY(0)'
            }
        }, 1400),
        
        // Stage 4: Central core and progress
        setTimeout(() => {
            const core = document.querySelector('.central-core')
            if (core) {
                core.style.opacity = '1'
            }
            
            const loadingProgress = document.getElementById('loadingProgress')
            if (loadingProgress) {
                loadingProgress.style.opacity = '1'
            }
        }, 1800),
        
        // Stage 5: Purple circle (later, very subtle)
        setTimeout(() => {
            const purpleCircle = document.getElementById('purpleCircle')
            if (purpleCircle) {
                purpleCircle.style.opacity = '0.15'
            }
        }, 3000),
        
        // Stage 4: Loading message
        setTimeout(() => {
            const message = document.getElementById('loadingMessage')
            if (message) {
                message.style.opacity = '1'
            }
        }, 3000)
    ]
    
    // Store timers for cleanup
    window.obselisAnimationTimers = stageTimers
}

// Function to update loading progress from external sources
function updateObselisProgress(percentage, message = null) {
    console.log(`🎬 Progress: ${percentage}% - ${message || ''}`)
    
    if (window.obselisProgressBar && window.obselisProgressPercent) {
        window.obselisProgressBar.style.width = `${percentage}%`
        window.obselisProgressPercent.textContent = `${Math.floor(percentage)}%`
    }
    
    if (message && window.obselisLoadingText) {
        window.obselisLoadingText.textContent = message
    }
    
    // Complete animation when reaching 100%
    if (percentage >= 100) {
        console.log('🎬 Loading complete, transitioning to main app')
        setTimeout(() => {
            if (window.obselisLoadingText) {
                window.obselisLoadingText.textContent = 'Archive accessed successfully!'
                window.obselisLoadingText.style.color = '#60a5fa' // blue-400
            }
            
            setTimeout(() => {
                hideObselisLoadingAnimation()
                showMainApp()
            }, 1000)
        }, 500)
    }
}

function hideObselisLoadingAnimation() {
    // Clear any running timers
    if (window.obselisAnimationTimers) {
        window.obselisAnimationTimers.forEach(timer => clearTimeout(timer))
        window.obselisAnimationTimers = null
    }
    
    // Clear failsafe timer
    if (window.obselisFailsafeTimer) {
        clearTimeout(window.obselisFailsafeTimer)
        window.obselisFailsafeTimer = null
    }
    
    // Clear global progress elements
    window.obselisProgressBar = null
    window.obselisProgressPercent = null
    window.obselisLoadingText = null
    
    const animation = document.getElementById('obselisLoadingAnimation')
    if (animation) {
        animation.style.opacity = '0'
        animation.style.transition = 'opacity 0.5s ease'
        setTimeout(() => {
            animation.remove()
        }, 500)
    }
}

function showConnectionError() {
    loadingScreen.classList.add('hidden')
    connectionError.classList.remove('hidden')
    mainApp.classList.add('hidden')
    document.getElementById('loginScreen')?.classList.add('hidden')
    serverUrlInput.value = serverUrl
}

function showMainApp() {
    loadingScreen.classList.add('hidden')
    connectionError.classList.add('hidden')
    document.getElementById('loginScreen')?.classList.add('hidden')
    mainApp.classList.remove('hidden')
}

function showLoginScreen() {
    console.log('showLoginScreen called')
    loadingScreen.classList.add('hidden')
    connectionError.classList.add('hidden')
    mainApp.classList.add('hidden')
    
    let loginScreen = document.getElementById('loginScreen')
    if (!loginScreen) {
        console.log('Creating login screen')
        createLoginScreen()
        loginScreen = document.getElementById('loginScreen')
    }
    console.log('Login screen element:', loginScreen)
    loginScreen.classList.remove('hidden')
}

function createLoginScreen() {
    const loginHTML = `
        <div id="loginScreen" class="screen">
            <div class="login-container">
                <div class="login-header">
                    <h1>Welcome to Obselis</h1>
                    <p>Sign in to access your media server</p>
                </div>
                <form class="login-form" id="loginForm">
                    <div class="form-group">
                        <label for="loginEmail">Email</label>
                        <input type="email" id="loginEmail" required>
                    </div>
                    <div class="form-group">
                        <label for="loginPassword">Password</label>
                        <input type="password" id="loginPassword" required>
                    </div>
                    <button type="submit" class="login-btn" id="loginBtn">
                        Sign In
                    </button>
                    <div id="loginError" class="login-error hidden"></div>
                </form>
                <div class="login-footer">
                    <p>Server: <span>${serverUrl}</span></p>
                    <button type="button" class="change-server-btn" id="changeServerBtn">
                        Change Server
                    </button>
                </div>
            </div>
        </div>
    `
    
    document.body.insertAdjacentHTML('beforeend', loginHTML)
    
    // Add event listeners
    const loginForm = document.getElementById('loginForm')
    const loginBtn = document.getElementById('loginBtn')
    const loginError = document.getElementById('loginError')
    const changeServerBtn = document.getElementById('changeServerBtn')
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const email = document.getElementById('loginEmail').value
        const password = document.getElementById('loginPassword').value
        
        loginBtn.disabled = true
        loginBtn.textContent = 'Signing in...'
        loginError.classList.add('hidden')
        
        const result = await login(email, password)
        
        if (!result.success) {
            loginError.textContent = result.error
            loginError.classList.remove('hidden')
        }
        
        loginBtn.disabled = false
        loginBtn.textContent = 'Sign In'
    })
    
    changeServerBtn.addEventListener('click', () => {
        showConnectionError()
    })
}

function setConnected(connected) {
    isConnected = connected
    const statusIndicator = document.getElementById('connectionStatus')
    if (statusIndicator) {
        statusIndicator.className = connected ? 'status-indicator' : 'status-indicator offline'
    }
}

// User interface updates
function updateUserInterface() {
    if (!currentUser) return
    
    // Update user menu
    userInitials.textContent = getUserInitials(currentUser.display_name || currentUser.username)
    userName.textContent = currentUser.display_name || currentUser.username
    userRole.textContent = currentUser.role_display_name || currentUser.role || 'User'
    
    // Show/hide content manager based on permissions
    const canManageContent = currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.is_admin
    const contentManagerLink = document.getElementById('contentManagerLink')
    const contentActionCard = document.getElementById('contentActionCard')
    
    if (canManageContent) {
        contentManagerLink.style.display = 'block'
        contentActionCard.style.display = 'block'
    }
}

function updateWelcomeMessage() {
    if (!currentUser) return
    
    const greeting = getGreeting()
    const name = currentUser.display_name || currentUser.username
    welcomeTitle.textContent = `${greeting}, ${name}!`
    
    const now = new Date()
    welcomeDate.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

// Data loading
// Cache for content data
let contentCache = null
let contentCacheTime = 0
const CACHE_DURATION = 30000 // 30 seconds

async function loadDashboardData(forceRefresh = false) {
    if (!authToken) return
    
    const now = Date.now()
    
    // Check enhanced cache for content
    const contentCacheValid = !forceRefresh && 
                             enhancedContentCache.data && 
                             (now - enhancedContentCache.timestamp) < ENHANCED_CACHE_DURATION
    
    // Check analytics cache
    const analyticsCacheValid = enhancedContentCache.analytics && 
                               (now - enhancedContentCache.analyticsTimestamp) < ANALYTICS_CACHE_DURATION
    
    // If we have valid cache and it's not initial load, use it immediately
    if (contentCacheValid && !isInitialLoad) {
        console.log('📚 Using cached content data')
        allContent = enhancedContentCache.data
        filteredContent = [...allContent]
        renderRecentContent()
        renderMovies()
        renderTVShows()
        renderAllContent()
        return
    }
    
    // Show Obselis loading animation only if not already showing and cache is expired
    const animationAlreadyShowing = document.getElementById('obselisLoadingAnimation')
    if ((isInitialLoad || !contentCacheValid) && !animationAlreadyShowing) {
        console.log('🎬 Starting Obselis loading animation...')
        window.obselisLoadingStartTime = now
        showObselisLoadingAnimation()
    }
    
    try {
        console.log('📚 Loading fresh content data...')
        updateObselisProgress(10, 'Connecting to media server...')
        
        // Prepare requests
        const requests = []
        
        // Always fetch content if cache is invalid
        if (!contentCacheValid) {
            requests.push(
            fetch(`${serverUrl}/api/content`, {
                    headers: { 
                        'Authorization': `Bearer ${authToken}`,
                        'Cache-Control': 'no-cache'
                    }
                }).then(res => ({ type: 'content', response: res }))
            )
        }
        
        // Fetch analytics if cache is invalid
        if (!analyticsCacheValid) {
            requests.push(
            fetch(`${serverUrl}/api/storage/analytics`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
                }).then(res => ({ type: 'analytics', response: res })),
            fetch(`${serverUrl}/api/storage/transcoding/status`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
                }).then(res => ({ type: 'status', response: res }))
            )
        }
        
        updateObselisProgress(25, 'Fetching media library...')
        
        // Execute requests
        const results = await Promise.all(requests)
        
        updateObselisProgress(50, 'Processing media data...')
        
        // Process results
        let content = null
        let analytics = enhancedContentCache.analytics // Use cached if available
        let status = null
        
        for (const result of results) {
            if (result.type === 'content' && result.response.ok) {
                content = await result.response.json()
            } else if (result.type === 'analytics' && result.response.ok) {
                analytics = await result.response.json()
            } else if (result.type === 'status' && result.response.ok) {
                status = await result.response.json()
            }
        }
        
        // Update content if we fetched it
        if (content) {
        allContent = content.content || content || []
        console.log('📚 Loaded all content:', allContent.length, 'items')
            
            updateObselisProgress(65, 'Categorizing media content...')
        
        // Auto-categorize content using metadata and filename analysis
        allContent = await categorizeContent(allContent)
        
            updateObselisProgress(80, 'Organizing media library...')
            
            // Cache the processed content
            enhancedContentCache.data = [...allContent]
            enhancedContentCache.timestamp = now
            
        filteredContent = [...allContent]
        } else {
            // Use cached content
            allContent = enhancedContentCache.data || []
            filteredContent = [...allContent]
            updateObselisProgress(70, 'Loading cached media data...')
        }
        
        // Update analytics cache if we fetched it
        if (analytics && analytics !== enhancedContentCache.analytics) {
            enhancedContentCache.analytics = analytics
            enhancedContentCache.analyticsTimestamp = now
        }
        
        // Minimum animation time for better UX - ensure it covers the content loading
        const minAnimationTime = 5000 // 5 seconds to properly mask content loading
        const loadingStartTime = window.obselisLoadingStartTime || now
        const elapsedTime = now - loadingStartTime
        const remainingTime = Math.max(0, minAnimationTime - elapsedTime)
        
        setTimeout(() => {
            updateObselisProgress(90, 'Preparing user interface...')
            
            // Update UI
        if (analytics?.analytics) {
            updateQuickStats(analytics.analytics, status)
        }
        
        // Render content after loading and categorization
        console.log('🔄 Starting content rendering after categorization...')
            try {
        renderRecentContent()
        renderMovies()
        renderTVShows()
        renderAllContent()
        console.log('✅ Content rendering complete')
                
                // Complete the loading process with a small delay to ensure rendering is done
                setTimeout(() => {
                    updateObselisProgress(100, 'Archive ready!')
                    isInitialLoad = false
                }, 300)
            } catch (error) {
                console.error('❌ Error during content rendering:', error)
                // Still complete the loading even if rendering fails
                setTimeout(() => {
                    updateObselisProgress(100, 'Archive ready!')
                    isInitialLoad = false
                }, 300)
            }
            
        }, remainingTime)
        
    } catch (error) {
        console.error('Failed to load dashboard data:', error)
        
        // Try to use cached data as fallback
        if (enhancedContentCache.data) {
            console.log('📚 Using cached data as fallback')
            updateObselisProgress(70, 'Loading cached media data...')
            allContent = enhancedContentCache.data
            filteredContent = [...allContent]
            updateObselisProgress(90, 'Preparing user interface...')
            try {
                renderRecentContent()
                renderMovies()
                renderTVShows()
                renderAllContent()
                console.log('✅ Fallback content rendering complete')
                setTimeout(() => {
                    updateObselisProgress(100, 'Archive ready!')
                }, 300)
            } catch (error) {
                console.error('❌ Error during fallback content rendering:', error)
                setTimeout(() => {
                    updateObselisProgress(100, 'Archive ready!')
                }, 300)
            }
        } else {
            // No fallback data available
            updateObselisProgress(100, 'Connection failed - please try again')
        }
        
        isInitialLoad = false
    }
}

function updateQuickStats(analytics, status) {
    quickStats.classList.remove('hidden')
    
    // Update stat values
    document.getElementById('totalContent').textContent = allContent.length || 0
    document.getElementById('totalSize').textContent = analytics.original?.formattedTotalSize || '0 GB'
    document.getElementById('spaceSaved').textContent = analytics.compression?.formattedStats?.spaceSaved || '0 GB'
    document.getElementById('compressionRatio').textContent = (analytics.compression?.compressionRatio || '0%') + ' compression'
    document.getElementById('queueLength').textContent = status?.queue?.queueLength || 0
    document.getElementById('queueStatus').textContent = status?.queue?.isProcessing ? 'Processing...' : 'Idle'
    
    // Update user role display
    if (currentUser) {
        document.getElementById('userRoleDisplay').textContent = currentUser.role_display_name || currentUser.role || 'User'
        const isAdmin = currentUser.is_admin || currentUser.role === 'admin'
        const canManageContent = currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.is_admin
        document.getElementById('accessLevel').textContent = isAdmin ? 'Full Access' : canManageContent ? 'Content Manager' : 'Viewer'
    }
}

// Content categorization and organization
async function categorizeContent(content) {
    console.log('🏷️ Starting content categorization...')
    
    const categorizedContent = []
    
    for (const item of content) {
        const categorized = { ...item }
        
        // Extract filename without extension for analysis
        const filename = item.original_filename || item.title || ''
        const filenameNoExt = filename.replace(/\.[^/.]+$/, '')
        
        // Check if already categorized by backend
        if (item.category && ['movie', 'tv-show'].includes(item.category)) {
            console.log(`✅ ${filename} already categorized as: ${item.category}`)
        } else {
            // Auto-categorize based on filename patterns
            categorized.category = detectContentType(filename, item.title)
            console.log(`🔍 Auto-categorized ${filename} as: ${categorized.category}`)
        }
        
        // TEMPORARY: Force any content with TV-like patterns to be categorized as TV show for testing
        if (filename && (
            filename.toLowerCase().includes('peep') ||
            filename.toLowerCase().includes('s0') ||
            filename.toLowerCase().includes('season') ||
            filename.toLowerCase().includes('episode') ||
            /s\d+e\d+/i.test(filename)
        )) {
            categorized.category = 'tv-show'
            
        }
        
        // For TV shows, extract season and episode information
        if (categorized.category === 'tv-show') {
            const tvInfo = extractTVShowInfo(filename, item.title)
            categorized.tv_show_name = tvInfo.showName
            categorized.season_number = tvInfo.season
            categorized.episode_number = tvInfo.episode
            categorized.episode_title = tvInfo.episodeTitle
            
            console.log(`📺 TV Show details:`, {
                show: tvInfo.showName,
                season: tvInfo.season,
                episode: tvInfo.episode,
                title: tvInfo.episodeTitle
            })
        }
        
        categorizedContent.push(categorized)
    }
    
    console.log('🏷️ Categorization complete!')
    return categorizedContent
}

function detectContentType(filename, title) {
    const text = (filename + ' ' + (title || '')).toLowerCase()
    
    // TV Show patterns (more specific patterns first)
    const tvPatterns = [
        /s\d+e\d+/i,                    // S01E01
        /season\s*\d+/i,                // Season 1
        /episode\s*\d+/i,               // Episode 1
        /\d+x\d+/,                      // 1x01
        /ep\s*\d+/i,                    // Ep 1
        /part\s*\d+/i,                  // Part 1
        /\b\d{1,2}\s*-\s*\d{1,2}\b/,   // 1-01, 01-01
    ]
    
    // Check for TV show patterns
    for (const pattern of tvPatterns) {
        if (pattern.test(text)) {
            console.log(`🏷️ "${filename}" matched TV pattern: ${pattern} -> tv-show`)
            return 'tv-show'
        }
    }
    
    // Movie indicators (if no TV patterns found)
    const moviePatterns = [
        /\b(19|20)\d{2}\b/,             // Year (1900-2099)
        /\b(dvdrip|bluray|hdtv|webrip|web-dl|brrip)\b/i,
        /\b(1080p|720p|480p|4k|uhd)\b/i,
        /\b(x264|x265|h264|h265)\b/i,
    ]
    
    // Check for movie patterns
    for (const pattern of moviePatterns) {
        if (pattern.test(text)) {
            console.log(`🏷️ "${filename}" matched movie pattern: ${pattern} -> movie`)
            return 'movie'
        }
    }
    
    // Default to movie if no clear TV patterns
    console.log(`🏷️ "${filename}" no clear patterns found -> defaulting to movie`)
    return 'movie'
}

function extractTVShowInfo(filename, title) {
    const text = filename || title || ''
    
    // Common TV show filename patterns
    const patterns = [
        // Show Name S01E01 - Episode Title
        /^(.+?)\s+s(\d+)e(\d+)(?:\s*-\s*(.+?))?(?:\.[^.]+)?$/i,
        // Show Name - S01E01 - Episode Title  
        /^(.+?)\s*-\s*s(\d+)e(\d+)(?:\s*-\s*(.+?))?(?:\.[^.]+)?$/i,
        // Show Name 1x01 - Episode Title
        /^(.+?)\s+(\d+)x(\d+)(?:\s*-\s*(.+?))?(?:\.[^.]+)?$/i,
        // Show Name - 1x01 - Episode Title
        /^(.+?)\s*-\s*(\d+)x(\d+)(?:\s*-\s*(.+?))?(?:\.[^.]+)?$/i,
        // Show Name Season 1 Episode 1
        /^(.+?)\s+season\s*(\d+)\s+episode\s*(\d+)(?:\s*-?\s*(.+?))?(?:\.[^.]+)?$/i,
    ]
    
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) {
            return {
                showName: match[1].trim().replace(/[._]/g, ' '),
                season: parseInt(match[2]),
                episode: parseInt(match[3]),
                episodeTitle: match[4] ? match[4].trim().replace(/[._]/g, ' ') : null
            }
        }
    }
    
    // Fallback: try to extract show name from beginning of filename
    const showNameMatch = text.match(/^([^-_\d]+)/i)
    return {
        showName: showNameMatch ? showNameMatch[1].trim().replace(/[._]/g, ' ') : 'Unknown Show',
        season: null,
        episode: null,
        episodeTitle: null
    }
}

// Content rendering
function renderRecentContent() {
    if (!allContent || allContent.length === 0) {
        recentGrid.innerHTML = '<div class="no-content"><div class="no-content-icon">📁</div><h3>No Content</h3><p>Your media library appears to be empty</p></div>'
        return
    }
    
    const recentItems = allContent.slice(0, 6)
    recentGrid.innerHTML = recentItems.map(item => createContentCard(item)).join('')
}

function renderMovies() {
    const movies = allContent.filter(item => item.category === 'movie')
    
    console.log('🎬 Rendering movies:', movies.length, 'items')
    
    if (movies.length === 0) {
        moviesGrid.innerHTML = '<div class="no-content"><div class="no-content-icon">🎬</div><h3>No Movies</h3><p>No movies found in your library</p></div>'
        document.getElementById('noMovies')?.classList.remove('hidden')
        return
    }
    
    document.getElementById('noMovies')?.classList.add('hidden')
    moviesGrid.innerHTML = movies.map(item => createContentCard(item)).join('')
}

// Global variables for series management
let currentSeries = null
let currentSeason = 1

function renderTVShows() {
    console.log('📺 Rendering TV Shows in Library View')
    
    // Show the series library view
    showSeriesLibraryView()
    
    if (!allContent || allContent.length === 0) {
        seriesGrid.innerHTML = '<div class="no-content"><div class="no-content-icon">📺</div><h3>No Content</h3><p>Content not loaded yet</p></div>'
        return
    }
    
    const tvShows = allContent.filter(item => item.category === 'tv-show')
    
    if (tvShows.length === 0) {
        seriesGrid.innerHTML = '<div class="no-content"><div class="no-content-icon">📺</div><h3>No TV Shows</h3><p>No TV shows found in your library</p></div>'
        document.getElementById('noTVShows')?.classList.remove('hidden')
        return
    }
    
    document.getElementById('noTVShows')?.classList.add('hidden')
    
    // Group TV shows by series name
    const groupedShows = groupTVShowsByName(tvShows)
    console.log('📺 Found series:', Object.keys(groupedShows))
    
    // Render series cards
    seriesGrid.innerHTML = Object.keys(groupedShows).map(seriesName => 
        createSeriesCard(seriesName, groupedShows[seriesName])
    ).join('')
}

// View management functions
function showSeriesLibraryView() {
    document.getElementById('seriesLibraryView').classList.add('active')
    document.getElementById('seriesDetailView').classList.remove('active')
}

function showSeriesDetailView() {
    document.getElementById('seriesLibraryView').classList.remove('active')
    document.getElementById('seriesDetailView').classList.add('active')
}

// Create a series card for the library view
function createSeriesCard(seriesName, seriesData) {
    // Calculate total episodes and seasons
    const seasonNumbers = Object.keys(seriesData.seasons).map(n => parseInt(n)).filter(n => !isNaN(n))
    const totalSeasons = seasonNumbers.length
    const totalEpisodes = Object.values(seriesData.seasons).reduce((total, episodes) => total + episodes.length, 0) + seriesData.episodes.length
    
    // Get first episode for thumbnail (if available)
    const firstEpisode = Object.values(seriesData.seasons)[0]?.[0] || seriesData.episodes[0]
    const thumbnailUrl = firstEpisode?.thumbnail_path ? `${serverUrl}${firstEpisode.thumbnail_path}` : null
    
    return `
        <div class="series-card" onclick="openSeriesDetail('${seriesName}')">
            <div class="series-poster">
                ${thumbnailUrl 
                    ? `<img src="${thumbnailUrl}" alt="${seriesName}" onerror="this.style.display='none'; this.parentNode.innerHTML='📺'">`
                    : '📺'
                }
            </div>
            <div class="series-card-info">
                <h3 class="series-card-title">${seriesName}</h3>
                <div class="series-card-meta">
                    <span>${totalSeasons} Season${totalSeasons !== 1 ? 's' : ''}</span>
                    <span>${totalEpisodes} Episode${totalEpisodes !== 1 ? 's' : ''}</span>
                </div>
                <p class="series-card-description">
                    Click to view episodes organized by season
                </p>
            </div>
        </div>
    `
}

// Open series detail view
function openSeriesDetail(seriesName) {
    const tvShows = allContent.filter(item => item.category === 'tv-show')
    const groupedShows = groupTVShowsByName(tvShows)
    const seriesData = groupedShows[seriesName]
    
    if (!seriesData) {
        console.error('Series not found:', seriesName)
        return
    }
    
    currentSeries = seriesData
    currentSeason = 1
    
    // Update series info
    document.getElementById('seriesTitle').textContent = seriesName
    
    // Calculate stats
    const seasonNumbers = Object.keys(seriesData.seasons).map(n => parseInt(n)).filter(n => !isNaN(n)).sort((a, b) => a - b)
    const totalSeasons = seasonNumbers.length
    const totalEpisodes = Object.values(seriesData.seasons).reduce((total, episodes) => total + episodes.length, 0) + seriesData.episodes.length
    
    document.getElementById('seriesEpisodeCount').textContent = `${totalEpisodes} Episode${totalEpisodes !== 1 ? 's' : ''}`
    document.getElementById('seriesSeasonCount').textContent = `${totalSeasons} Season${totalSeasons !== 1 ? 's' : ''}`
    
    // Populate season dropdown
    const seasonSelect = document.getElementById('seasonSelect')
    seasonSelect.innerHTML = ''
    
    seasonNumbers.forEach(seasonNum => {
        const option = document.createElement('option')
        option.value = seasonNum
        option.textContent = `Season ${seasonNum}`
        seasonSelect.appendChild(option)
    })
    
    // Set default season (first available season)
    if (seasonNumbers.length > 0) {
        currentSeason = seasonNumbers[0]
        seasonSelect.value = currentSeason
    }
    
    // Show the detail view
    showSeriesDetailView()
    
    // Render episodes for current season
    renderCurrentSeasonEpisodes()
}

// Render episodes for the current season
function renderCurrentSeasonEpisodes() {
    if (!currentSeries) return
    
    const episodesGrid = document.getElementById('episodesGrid')
    let episodes = []
    let seasonInfo = ''
    
    if (currentSeason === 'episodes') {
        episodes = currentSeries.episodes
        seasonInfo = `${episodes.length} episode${episodes.length !== 1 ? 's' : ''}`
    } else {
        episodes = currentSeries.seasons[currentSeason] || []
        seasonInfo = `${episodes.length} episode${episodes.length !== 1 ? 's' : ''}`
    }
    
    // Sort episodes by episode number
    episodes.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
    
    // Update season info
    document.getElementById('currentSeasonInfo').textContent = seasonInfo
    
    // Render episodes
    if (episodes.length === 0) {
        episodesGrid.innerHTML = '<div class="no-content"><div class="no-content-icon">📺</div><h3>No Episodes</h3><p>No episodes found for this season</p></div>'
    } else {
        episodesGrid.innerHTML = episodes.map(episode => createEpisodeCard(episode)).join('')
    }
}

// Create episode card for detail view
function createEpisodeCard(episode) {
    const thumbnailUrl = episode.thumbnail_path ? `${serverUrl}${episode.thumbnail_path}` : null
    const title = episode.episode_title || episode.title || episode.original_filename || 'Unknown Episode'
    const episodeInfo = episode.season_number && episode.episode_number 
        ? `S${episode.season_number.toString().padStart(2, '0')}E${episode.episode_number.toString().padStart(2, '0')}`
        : ''
    const duration = episode.duration ? formatDuration(episode.duration) : 'Unknown'
    
    return `
        <div class="episode-card" onclick="window.playContent(${episode.id})">
            <div class="episode-thumbnail">
                ${thumbnailUrl 
                    ? `<img src="${thumbnailUrl}" alt="${title}" onerror="this.style.display='none'; this.parentNode.innerHTML='📺'">`
                    : '📺'
                }
                <div class="play-overlay">
                    <button class="play-button">▶</button>
                </div>
            </div>
            <div class="episode-info">
                <div class="episode-number">${episodeInfo}</div>
                <div class="episode-title">${title}</div>
                <div class="episode-duration">${duration}</div>
            </div>
        </div>
    `
}

function normalizeShowName(showName) {
    if (!showName) return 'Unknown Show'
    
    // Convert to lowercase for comparison
    let normalized = showName.toLowerCase().trim()
    
    // Remove common prefixes/suffixes that don't belong to the show name
    normalized = normalized
        .replace(/^watch\s+/, '') // Remove "watch " prefix
        .replace(/\s+\d{4}.*$/, '') // Remove year and everything after (e.g., "2003 Online Free")
        .replace(/\s+online.*$/, '') // Remove "online" and everything after
        .replace(/\s+free.*$/, '') // Remove "free" and everything after
        .replace(/\s+download.*$/, '') // Remove "download" and everything after
        .replace(/\s+-.*$/, '') // Remove dash and everything after
        .trim()
    
    // Capitalize first letter of each word for display
    return normalized.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

function groupTVShowsByName(tvShows) {
    const grouped = {}
    
    tvShows.forEach(item => {
        const rawShowName = item.tv_show_name || item.title || 'Unknown Show'
        const normalizedShowName = normalizeShowName(rawShowName)
        
        console.log(`📺 Normalizing "${rawShowName}" → "${normalizedShowName}"`)
        
        if (!grouped[normalizedShowName]) {
            grouped[normalizedShowName] = {
                name: normalizedShowName,
                seasons: {},
                episodes: []
            }
        }
        
        if (item.season_number) {
            if (!grouped[normalizedShowName].seasons[item.season_number]) {
                grouped[normalizedShowName].seasons[item.season_number] = []
            }
            grouped[normalizedShowName].seasons[item.season_number].push(item)
        } else {
            grouped[normalizedShowName].episodes.push(item)
        }
    })
    
    return grouped
}

// Offline Content Functions
async function loadOfflineContent() {
    console.log('📱 Loading offline content...')
    console.log('📱 Current authentication state:')
    console.log('📱 isAuthenticated:', isAuthenticated)
    console.log('📱 authToken exists:', !!authToken)
    console.log('📱 currentUser:', currentUser)
    
    // Ensure user is authenticated and user info is available
    if (!isAuthenticated || !currentUser) {
        console.warn('📱 User not authenticated or user info not available, skipping offline content load')
        offlineContent = []
        return
    }
    
    // Update progress if animation is showing
    if (window.obselisProgressBar) {
        updateObselisProgress(15, 'Scanning offline content...')
    }
    
    // Get list of downloaded files from the user-specific Downloads/Obselis directory
    try {
        // Create user-specific directory path
        console.log('📱 Current user for offline content:', currentUser)
        const userIdentifier = currentUser ? (currentUser.email || currentUser.username || 'unknown').replace(/[<>:"/\\|?*]/g, '_') : 'unknown'
        console.log('📱 User identifier for offline path:', userIdentifier)
        
        // Double-check we have a valid user identifier
        if (userIdentifier === 'unknown' || !userIdentifier) {
            console.warn('📱 Invalid user identifier, cannot load user-specific offline content')
            offlineContent = []
            return
        }
        
        const downloadsPath = require('path').join(require('os').homedir(), 'Downloads', 'Obselis', userIdentifier)
        console.log('📱 Offline content path:', downloadsPath)
        const fs = require('fs')
        const path = require('path')
        
        if (!fs.existsSync(downloadsPath)) {
            console.log('📱 User-specific offline content directory not found:', downloadsPath)
            
            // Check if there's content in the old shared directory (for backward compatibility)
            const oldSharedPath = require('path').join(require('os').homedir(), 'Downloads', 'Obselis')
            if (fs.existsSync(oldSharedPath)) {
                console.log('📱 Found old shared offline content directory, but user-specific isolation is now enforced')
                console.log('📱 Please re-download content to have it properly isolated per user')
                
                // List what's in the old shared directory for debugging
                try {
                    const sharedContents = fs.readdirSync(oldSharedPath)
                    console.log('📱 Old shared directory contents:', sharedContents)
                } catch (error) {
                    console.log('📱 Could not read old shared directory:', error.message)
                }
            }
            
            offlineContent = []
            return
        }
        
        // Recursively scan for media files
        function scanDirectory(dirPath, category = null) {
            const items = []
            
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true })
                
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name)
                    
                    if (entry.isDirectory()) {
                        // Recursively scan subdirectories
                        let subCategory = category
                        
                        // Determine category from directory structure
                        if (entry.name === 'Movies') {
                            subCategory = 'movie'
                        } else if (entry.name === 'TV Shows') {
                            subCategory = 'tv-show'
                        }
                        
                        items.push(...scanDirectory(fullPath, subCategory))
                    } else if (entry.isFile()) {
                        const stats = fs.statSync(fullPath)
                        const mediaType = detectOfflineMediaType(entry.name)
                        
                        // Only include video files
                        if (mediaType === 'video') {
                            // Extract TV show info from path structure
                            let tvShowInfo = {}
                            if (category === 'tv-show') {
                                const pathParts = fullPath.split(path.sep)
                                const showNameIndex = pathParts.findIndex(part => part === 'TV Shows') + 1
                                
                                if (showNameIndex > 0 && showNameIndex < pathParts.length) {
                                    tvShowInfo.tv_show_name = pathParts[showNameIndex]
                                    
                                    // Extract season from path or filename
                                    const seasonMatch = fullPath.match(/Season (\d+)/i) || entry.name.match(/S(\d+)/i)
                                    if (seasonMatch) {
                                        tvShowInfo.season_number = parseInt(seasonMatch[1])
                                    }
                                    
                                    // Extract episode from filename
                                    const episodeMatch = entry.name.match(/S\d+E(\d+)|Episode (\d+)/i)
                                    if (episodeMatch) {
                                        tvShowInfo.episode_number = parseInt(episodeMatch[1] || episodeMatch[2])
                                    }
                                    
                                    // Extract episode title
                                    const titleMatch = entry.name.match(/S\d+E\d+ - (.+)\./i)
                                    if (titleMatch) {
                                        tvShowInfo.episode_title = titleMatch[1]
                                    }
                                }
                            }
                            
                            // Create a content object similar to server content
                            const item = {
                                id: `offline_${path.relative(downloadsPath, fullPath).replace(/[\\\/]/g, '_')}`,
                                title: tvShowInfo.episode_title || entry.name.replace(/\.[^/.]+$/, ''), // Remove extension
                                original_filename: entry.name,
                                file_path: fullPath,
                                file_size: stats.size,
                                media_type: mediaType,
                                category: category || detectOfflineCategory(entry.name),
                                isOffline: true,
                                created_at: stats.birthtime,
                                ...tvShowInfo
                            }
                            
                            items.push(item)
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning directory ${dirPath}:`, error)
            }
            
            return items
        }
        
        offlineContent = scanDirectory(downloadsPath)
        console.log(`📱 Found ${offlineContent.length} offline video files`)
        
        // Update progress if animation is showing
        if (window.obselisProgressBar) {
            updateObselisProgress(35, 'Processing offline media files...')
        }
        
        // Debug: Log some sample items
        if (offlineContent.length > 0) {
            console.log('📱 Sample offline content:', offlineContent.slice(0, 3))
        }
        
    } catch (error) {
        console.error('Failed to load offline content:', error)
        offlineContent = []
    }
}

function detectOfflineMediaType(filename) {
    const ext = filename.toLowerCase()
    if (ext.match(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ogv|ts|mts|m2ts)$/)) {
        return 'video'
    } else if (ext.match(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/)) {
        return 'audio'
    } else if (ext.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/)) {
        return 'image'
    }
    return 'unknown'
}

function detectOfflineCategory(filename) {
    // Use the same logic as the streaming content
    const title = filename.replace(/\.[^/.]+$/, '')
    
    // Check for TV show patterns
    if (/s\d+e\d+|season\s*\d+.*episode\s*\d+|\d+x\d+/i.test(title)) {
        return 'tv-show'
    }
    
    // Default to movie
    return 'movie'
}

function renderOfflineContent() {
    console.log('📱 Rendering offline content...')
    
    if (currentOfflineTab === 'movies') {
        renderOfflineMovies()
    } else if (currentOfflineTab === 'tv-shows') {
        renderOfflineTVShows()
    }
}

function renderOfflineMovies() {
    const movies = offlineContent.filter(item => item.category === 'movie')
    
    if (movies.length === 0) {
        offlineMoviesGrid.innerHTML = ''
        document.getElementById('noOfflineMovies').classList.remove('hidden')
        return
    }
    
    document.getElementById('noOfflineMovies').classList.add('hidden')
    offlineMoviesGrid.innerHTML = movies.map(item => createOfflineContentCard(item)).join('')
}

function renderOfflineTVShows() {
    const tvShows = offlineContent.filter(item => item.category === 'tv-show')
    
    if (tvShows.length === 0) {
        offlineSeriesGrid.innerHTML = ''
        document.getElementById('noOfflineTVShows').classList.remove('hidden')
        showOfflineSeriesLibraryView()
        return
    }
    
    document.getElementById('noOfflineTVShows').classList.add('hidden')
    
    // Group TV shows by series name
    const groupedShows = groupOfflineTVShowsByName(tvShows)
    
    // Render series cards
    offlineSeriesGrid.innerHTML = Object.keys(groupedShows).map(seriesName => 
        createOfflineSeriesCard(seriesName, groupedShows[seriesName])
    ).join('')
    
    showOfflineSeriesLibraryView()
}

function groupOfflineTVShowsByName(tvShows) {
    const grouped = {}
    
    tvShows.forEach(item => {
        const showInfo = extractTVShowInfo(item.original_filename, item.title)
        const rawShowName = showInfo.showName || item.title || item.original_filename
        const normalizedShowName = normalizeShowName(rawShowName)
        
        if (!grouped[normalizedShowName]) {
            grouped[normalizedShowName] = {
                name: normalizedShowName,
                seasons: {},
                episodes: []
            }
        }
        
        if (showInfo.season) {
            if (!grouped[normalizedShowName].seasons[showInfo.season]) {
                grouped[normalizedShowName].seasons[showInfo.season] = []
            }
            grouped[normalizedShowName].seasons[showInfo.season].push({
                ...item,
                season_number: showInfo.season,
                episode_number: showInfo.episode
            })
        } else {
            grouped[normalizedShowName].episodes.push(item)
        }
    })
    
    return grouped
}

function createOfflineContentCard(item) {
    const title = item.title || item.original_filename || 'Unknown'
    const fileSize = formatFileSize(item.file_size)
    
    console.log('📱 Creating offline card for:', {
        title: title,
        original_path: item.file_path,
        file_size: item.file_size
    })
    
    // Store the original file path in a data attribute instead of escaping for onclick
    const cardId = `offline_card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Store the file path in a global object to avoid HTML escaping issues
    if (!window.offlineFilePaths) {
        window.offlineFilePaths = {}
    }
    window.offlineFilePaths[cardId] = item.file_path
    
    return `
        <div class="content-item" onclick="playOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">
            <div class="content-thumbnail">
                🎬
                <div class="play-overlay">
                    <button class="play-button" onclick="playOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">▶</button>
                </div>
            </div>
            <div class="content-info">
                <div class="content-title">${title}</div>
                <div class="content-meta">
                    <span class="content-duration">${fileSize}</span>
                    <div class="content-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); playOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">
                            ▶ Play
                        </button>
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">
                            🗑️ Delete
                        </button>
                        <span class="offline-badge">📱 Offline</span>
                    </div>
                </div>
            </div>
        </div>
    `
}

function createOfflineSeriesCard(seriesName, seriesData) {
    const totalEpisodes = Object.values(seriesData.seasons).flat().length + seriesData.episodes.length
    const totalSeasons = Object.keys(seriesData.seasons).length
    
    return `
        <div class="series-card" onclick="openOfflineSeriesDetail('${seriesName}')">
            <div class="series-poster">
                <div class="series-thumbnail">📺</div>
                </div>
            <div class="series-card-info">
                <div class="series-card-title">${seriesName}</div>
                <div class="series-card-meta">
                    <span>${totalSeasons} Season${totalSeasons !== 1 ? 's' : ''}</span>
                    <span>${totalEpisodes} Episode${totalEpisodes !== 1 ? 's' : ''}</span>
                </div>
                <div class="series-card-description">Downloaded episodes available offline</div>
            </div>
        </div>
    `
}

function showOfflineSeriesLibraryView() {
    document.getElementById('offlineSeriesLibraryView').classList.add('active')
    document.getElementById('offlineSeriesDetailView').classList.remove('active')
}

function showOfflineSeriesDetailView() {
    document.getElementById('offlineSeriesLibraryView').classList.remove('active')
    document.getElementById('offlineSeriesDetailView').classList.add('active')
}

function openOfflineSeriesDetail(seriesName) {
    console.log('📺 Opening offline series detail for:', seriesName)
    
    const tvShows = offlineContent.filter(item => item.category === 'tv-show')
    const groupedShows = groupOfflineTVShowsByName(tvShows)
    const seriesData = groupedShows[seriesName]
    
    if (!seriesData) {
        console.error('Series not found:', seriesName)
        return
    }
    
    currentOfflineSeries = seriesName
    
    // Update series info
    document.getElementById('offlineSeriesTitle').textContent = seriesName
    const totalEpisodes = Object.values(seriesData.seasons).flat().length + seriesData.episodes.length
    const totalSeasons = Object.keys(seriesData.seasons).length
    document.getElementById('offlineSeriesEpisodeCount').textContent = `${totalEpisodes} Episode${totalEpisodes !== 1 ? 's' : ''}`
    document.getElementById('offlineSeriesSeasonCount').textContent = `${totalSeasons} Season${totalSeasons !== 1 ? 's' : ''}`
    
    // Populate season dropdown
    const seasonSelect = document.getElementById('offlineSeasonSelect')
    seasonSelect.innerHTML = ''
    
    const seasons = Object.keys(seriesData.seasons).map(Number).sort((a, b) => a - b)
    seasons.forEach(season => {
        const option = document.createElement('option')
        option.value = season
        option.textContent = `Season ${season}`
        seasonSelect.appendChild(option)
    })
    
    // Set current season to first available season
    currentOfflineSeason = seasons[0] || 1
    seasonSelect.value = currentOfflineSeason
    
    // Render episodes for current season
    renderOfflineCurrentSeasonEpisodes()
    
    // Show detail view
    showOfflineSeriesDetailView()
}

function renderOfflineCurrentSeasonEpisodes() {
    const tvShows = offlineContent.filter(item => item.category === 'tv-show')
    const groupedShows = groupOfflineTVShowsByName(tvShows)
    const seriesData = groupedShows[currentOfflineSeries]
    
    if (!seriesData) return
    
    const seasonEpisodes = seriesData.seasons[currentOfflineSeason] || []
    
    // Update season info
    document.getElementById('offlineCurrentSeasonInfo').textContent = `${seasonEpisodes.length} episode${seasonEpisodes.length !== 1 ? 's' : ''}`
    
    if (seasonEpisodes.length === 0) {
        offlineEpisodesGrid.innerHTML = ''
        document.getElementById('noOfflineEpisodes').classList.remove('hidden')
        return
    }
    
    document.getElementById('noOfflineEpisodes').classList.add('hidden')
    
    // Sort episodes by episode number
    seasonEpisodes.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
    
    offlineEpisodesGrid.innerHTML = seasonEpisodes.map(episode => createOfflineEpisodeCard(episode)).join('')
}

function createOfflineEpisodeCard(episode) {
    const title = episode.title || episode.original_filename || 'Unknown Episode'
    const episodeNumber = episode.episode_number ? `E${episode.episode_number.toString().padStart(2, '0')}` : ''
    const fileSize = formatFileSize(episode.file_size)
    
    console.log('📱 Creating offline episode card for:', {
        title: title,
        original_path: episode.file_path,
        episode_number: episode.episode_number
    })
    
    // Store the original file path in a data attribute instead of escaping for onclick
    const cardId = `offline_episode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Store the file path in a global object to avoid HTML escaping issues
    if (!window.offlineFilePaths) {
        window.offlineFilePaths = {}
    }
    window.offlineFilePaths[cardId] = episode.file_path
    
    return `
        <div class="episode-card" onclick="playOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">
            <div class="episode-thumbnail">
                📺
                <div class="play-overlay">
                    <button class="play-button" onclick="playOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">▶</button>
                </div>
            </div>
            <div class="episode-info">
                <div class="episode-number">${episodeNumber}</div>
                <div class="episode-title">${title}</div>
                <div class="episode-duration">${fileSize} • 📱 Offline</div>
                <div class="episode-actions">
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteOfflineContentById('${cardId}', '${title.replace(/'/g, "\\'")}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        </div>
    `
}

function switchOfflineTab(tabName) {
    currentOfflineTab = tabName
    
    // Update tab buttons
    offlineTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.offlineTab === tabName)
    })
    
    // Update tab content
    offlineTabContents.forEach(content => {
        const contentId = tabName === 'movies' ? 'offlineMoviesTab' : 'offlineTVShowsTab'
        content.classList.toggle('active', content.id === contentId)
    })
    
    // Render content for the active tab
    renderOfflineContent()
}

// New function that gets file path from the global storage
async function playOfflineContentById(cardId, title) {
    console.log('📱 Playing offline content by ID:', cardId, 'Title:', title)
    
    if (!window.offlineFilePaths || !window.offlineFilePaths[cardId]) {
        console.error('❌ File path not found for card ID:', cardId)
        await ipcRenderer.invoke('show-notification', 'Playback Error', 'File path not found')
        return
    }
    
    const filePath = window.offlineFilePaths[cardId]
    console.log('📱 Retrieved file path:', filePath)
    
    return playOfflineContent(filePath, title)
}

// Delete offline content function
async function deleteOfflineContentById(cardId, title) {
    console.log('🗑️ Deleting offline content by ID:', cardId, 'Title:', title)
    
    if (!window.offlineFilePaths || !window.offlineFilePaths[cardId]) {
        console.error('❌ File path not found for card ID:', cardId)
        await ipcRenderer.invoke('show-notification', 'Delete Error', 'File path not found')
        return
    }
    
    const filePath = window.offlineFilePaths[cardId]
    console.log('🗑️ Retrieved file path for deletion:', filePath)
    
    // Confirm deletion
    const confirmed = confirm(`Are you sure you want to delete "${title}" from offline storage?\n\nThis action cannot be undone.`)
    
    if (!confirmed) {
        console.log('🗑️ Deletion cancelled by user')
        return
    }
    
    try {
        // Call main process to delete the file
        await ipcRenderer.invoke('delete-offline-content', filePath)
        
        // Remove from global storage
        delete window.offlineFilePaths[cardId]
        
        // Refresh offline content display
        await loadOfflineContent()
        renderOfflineContent()
        
        await ipcRenderer.invoke('show-notification', 'File Deleted', `"${title}" has been removed from offline storage`)
        
        console.log('✅ Offline content deleted successfully')
        
    } catch (error) {
        console.error('❌ Failed to delete offline content:', error)
        await ipcRenderer.invoke('show-notification', 'Delete Error', `Could not delete "${title}": ${error.message}`)
    }
}

async function playOfflineContent(filePath, title) {
    console.log('📱 Playing offline content:', filePath)
    console.log('📱 File path type:', typeof filePath)
    console.log('📱 File path length:', filePath.length)
    
    try {
        // Hide all media elements first
        videoPlayer.style.display = 'none'
        audioPlayer.style.display = 'none'
        imagePlayer.style.display = 'none'
        documentPlayer.style.display = 'none'
        
        // Update media info
        mediaTitle.textContent = title
        mediaDescription.textContent = 'Playing offline content'
        mediaType.textContent = 'Type: Offline Video'
        mediaSize.textContent = ''
        mediaDuration.textContent = ''
        
        // Set up video player with direct file path
        videoPlayer.controls = true
        videoPlayer.preload = 'metadata'
        
        // Enhanced error handling
        videoPlayer.onerror = (e) => {
            console.error('❌ Video error:', videoPlayer.error)
            const errorMessage = videoPlayer.error ? 
                `Video playback failed (Error ${videoPlayer.error.code}: ${videoPlayer.error.message})` :
                'Video playback failed'
            ipcRenderer.invoke('show-notification', 'Playback Error', errorMessage)
        }
        
        videoPlayer.onloadedmetadata = () => {
            console.log('📱 Video loaded successfully in built-in player')
            if (videoPlayer.duration) {
                mediaDuration.textContent = `Duration: ${formatDuration(Math.floor(videoPlayer.duration))}`
            }
        }
        
        videoPlayer.oncanplay = () => {
            console.log('📱 Video can start playing')
        }
        
        videoPlayer.onloadstart = () => {
            console.log('📱 Video load started')
        }
        
        // Try different URL formats for maximum compatibility
        const normalizedPath = filePath.replace(/\\/g, '/')
        const fileUrl1 = `file:///${normalizedPath}`
        const fileUrl2 = `file://${normalizedPath}`
        const fileUrl3 = filePath
        
        console.log('📱 Trying URL format 1:', fileUrl1)
        videoPlayer.src = fileUrl1
        
        // Progressive fallback to other formats if needed
        setTimeout(() => {
            if (videoPlayer.networkState === videoPlayer.NETWORK_NO_SOURCE || videoPlayer.error) {
                console.log('📱 Trying URL format 2:', fileUrl2)
                videoPlayer.src = fileUrl2
                
                setTimeout(() => {
                    if (videoPlayer.networkState === videoPlayer.NETWORK_NO_SOURCE || videoPlayer.error) {
                        console.log('📱 Trying direct path:', fileUrl3)
                        videoPlayer.src = fileUrl3
                    }
                }, 1000)
            }
        }, 1000)
        
        videoPlayer.style.display = 'block'
        
        // Show the media player modal
        mediaPlayer.classList.remove('hidden')
        
        console.log('📱 Offline video player setup complete')
        
    } catch (error) {
        console.error('❌ Failed to play offline content:', error)
        await ipcRenderer.invoke('show-notification', 'Playback Error', `Could not play offline content: ${error.message}`)
    }
}

function renderAllContent() {
    if (filteredContent.length === 0) {
        contentGrid.innerHTML = ''
        document.getElementById('noContent').classList.remove('hidden')
        return
    }
    
    document.getElementById('noContent').classList.add('hidden')
    contentGrid.innerHTML = filteredContent.map(item => createContentCard(item)).join('')
}

function createContentCard(item) {
    const thumbnailUrl = item.thumbnail_path ? `${serverUrl}${item.thumbnail_path}` : null
    const title = item.title || item.original_filename || 'Unknown'
    const duration = item.duration ? formatDuration(item.duration) : 'Unknown'
    const fileSize = formatFileSize(item.file_size)
    
    // Debug content item structure
    console.log('Creating content card for item:', {
        id: item.id,
        title: title,
        media_type: item.media_type,
        mime_type: item.mime_type,
        original_filename: item.original_filename,
        file_path: item.file_path
    })
    
    return `
        <div class="content-item" onclick="console.log('🎯 Card clicked for ID:', ${item.id}); window.playContent(${item.id})">
            <div class="content-thumbnail">
                ${thumbnailUrl 
                    ? `<img src="${thumbnailUrl}" alt="${title}" onerror="this.style.display='none'; this.parentNode.innerHTML='🎬'">`
                    : '🎬'
                }
                <div class="play-overlay">
                    <button class="play-button" onclick="console.log('🎯 Play overlay clicked for ID:', ${item.id}); window.playContent(${item.id})">▶</button>
                </div>
            </div>
            <div class="content-info">
                <div class="content-title">${title}</div>
                <div class="content-meta">
                    <span class="content-duration">${duration}</span>
                    <div class="content-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); console.log('🎯 Play button clicked for ID:', ${item.id}); window.playContent(${item.id})">
                            ▶ Play
                        </button>
                        <button class="download-btn" onclick="event.stopPropagation(); console.log('🎯 Download button clicked for ID:', ${item.id}); window.downloadContent(${item.id}, '${item.original_filename || 'content'}')">
                            📥 Download
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
}

// Media playback
async function playContent(contentId) {
    console.log('🎬 playContent called with ID:', contentId)
    
    // Show the media player modal
    const mediaPlayerElement = document.getElementById('mediaPlayer')
    if (!mediaPlayerElement) {
        console.error('❌ Media player element NOT found!')
        return
    }
    
    // Test if DOM elements exist
    console.log('Testing DOM elements:')
    console.log('- mediaPlayer element:', document.getElementById('mediaPlayer'))
    console.log('- videoPlayer element:', document.getElementById('videoPlayer'))
    console.log('- closePlayer element:', document.getElementById('closePlayer'))
    
    if (!authToken) {
        console.error('No auth token available')
        await ipcRenderer.invoke('show-notification', 'Authentication Error', 'Please log in to play content')
        return
    }
    
    try {
        console.log('Fetching content details for ID:', contentId)
        // Get content details
        const response = await fetch(`${serverUrl}/api/content/${contentId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
        
        console.log('Content details response status:', response.status)
        
        if (!response.ok) {
            const errorText = await response.text()
            console.error('Content details error:', errorText)
            throw new Error(`Failed to load content details: ${response.status}`)
        }
        
        const responseData = await response.json()
        console.log('API response:', responseData)
        
        // Extract the actual content from the API response
        const content = responseData.content || responseData
        console.log('Content details loaded:', content)
        console.log('Content ID:', content.id)
        console.log('Content keys:', Object.keys(content))
        openMediaPlayer(content)
        
    } catch (error) {
        console.error('Failed to play content:', error)
        await ipcRenderer.invoke('show-notification', 'Playback Error', error.message)
    }
}

function openMediaPlayer(content) {
    console.log('Opening media player for content:', content)
    
    // Get the content ID - it might be in different properties
    const contentId = content.id || content.content_id || content.media_id
    console.log('Content ID for streaming:', contentId)
    
    if (!contentId) {
        console.error('No content ID found in content object:', content)
        return
    }
    
    // Use the same streaming URL format as the website
    const streamUrl = `${serverUrl}/api/content/${contentId}/stream?token=${encodeURIComponent(authToken)}`
    console.log('Stream URL:', streamUrl)
    
    // Test if the streaming URL is accessible
    fetch(streamUrl, { method: 'HEAD' })
        .then(response => {
            // Stream URL test successful
            console.log('Response headers:', [...response.headers.entries()])
            if (!response.ok) {
                console.error('Stream URL not accessible:', response.status)
            } else {
                console.log('✅ Stream URL is accessible!')
                
                // Test a small range request to see if partial content works
                return fetch(streamUrl, { 
                    method: 'GET',
                    headers: { 'Range': 'bytes=0-1023' }
                })
            }
        })
        .then(response => {
            if (response) {
                // Range request test successful
                console.log('Content-Length:', response.headers.get('content-length'))
                console.log('Content-Range:', response.headers.get('content-range'))
            }
        })
        .catch(error => {
            console.error('Stream URL test failed:', error)
        })
    
    // Hide all media elements
    videoPlayer.style.display = 'none'
    audioPlayer.style.display = 'none'
    imagePlayer.style.display = 'none'
    documentPlayer.style.display = 'none'
    
    // Update media info
    mediaTitle.textContent = content.title || content.original_filename || 'Unknown'
    mediaDescription.textContent = content.description || ''
    document.getElementById('mediaType').textContent = `Type: ${content.media_type || 'Unknown'}`
    mediaSize.textContent = `Size: ${formatFileSize(content.file_size)}`
    mediaDuration.textContent = content.duration ? `Duration: ${formatDuration(content.duration)}` : ''
    
    // Show media info overlay
    const mediaInfo = document.getElementById('mediaInfo')
    if (mediaInfo) {
        mediaInfo.style.display = 'block'
    }
    
    // Show appropriate player based on media type
    console.log('Content media type:', content.media_type)
    console.log('Content mime type:', content.mime_type)
    console.log('Content filename:', content.original_filename)
    
    // Determine media type - check both media_type field and file extension
    let mediaType = content.media_type
    if (!mediaType && content.original_filename) {
        const ext = content.original_filename.toLowerCase()
        if (ext.match(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ogv|ts|mts|m2ts)$/)) {
            mediaType = 'video'
        } else if (ext.match(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/)) {
            mediaType = 'audio'
        } else if (ext.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/)) {
            mediaType = 'image'
        }
    }
    
    console.log('Determined media type:', mediaType)
    
    if (mediaType === 'video') {
        console.log('🎥 Setting up video player')
        console.log('🎥 Video player element:', videoPlayer)
        console.log('🎥 Video player display style:', videoPlayer.style.display)
        console.log('🎥 Video player computed style:', window.getComputedStyle(videoPlayer).display)
        
        // Clear any previous source
        videoPlayer.src = ''
        videoPlayer.load()
        
        // Set up video element exactly like the website
        videoPlayer.preload = 'metadata'
        videoPlayer.controls = true
        
        // Add poster if available
        if (content.thumbnail_path) {
            videoPlayer.poster = `${serverUrl}${content.thumbnail_path}`
            console.log('🎥 Set poster:', videoPlayer.poster)
        }
        
        // FORCE video element to be visible with aggressive styling
        videoPlayer.style.display = 'block'
        videoPlayer.style.width = '100%'
        videoPlayer.style.height = '100%'
        videoPlayer.style.backgroundColor = 'black'
        videoPlayer.style.position = 'relative'
        videoPlayer.style.top = '0'
        videoPlayer.style.left = '0'
        videoPlayer.style.zIndex = '5'
        videoPlayer.style.objectFit = 'contain'
        videoPlayer.style.maxWidth = 'none'
        videoPlayer.style.maxHeight = 'none'
        videoPlayer.style.minWidth = '100%'
        videoPlayer.style.minHeight = '100%'
        console.log('🎥 Forced video element styles with aggressive positioning')
        
        // Create source element for better compatibility
        const source = document.createElement('source')
        source.src = streamUrl
        source.type = content.mime_type || 'video/mp4'
        
        console.log('🎥 Setting video source:', source.src)
        console.log('🎥 Video MIME type:', source.type)
        
        // Clear existing sources and add new one
        while (videoPlayer.firstChild) {
            videoPlayer.removeChild(videoPlayer.firstChild)
        }
        videoPlayer.appendChild(source)
        
        // Add comprehensive error handling
        videoPlayer.onerror = (e) => {
            console.error('🚨 Video player error event:', e)
            console.error('🚨 Video error details:', videoPlayer.error)
            if (videoPlayer.error) {
                console.error('🚨 Error code:', videoPlayer.error.code)
                console.error('🚨 Error message:', videoPlayer.error.message)
                
                // Decode error codes
                const errorMessages = {
                    1: 'MEDIA_ERR_ABORTED - The video playback was aborted',
                    2: 'MEDIA_ERR_NETWORK - A network error occurred while fetching the video',
                    3: 'MEDIA_ERR_DECODE - An error occurred while decoding the video',
                    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - The video format is not supported'
                }
                console.error('🚨 Error description:', errorMessages[videoPlayer.error.code] || 'Unknown error')
            }
        }
        
        // Add source error handling
        source.onerror = (e) => {
            console.error('🚨 Video source error:', e)
            console.error('🚨 Source URL:', source.src)
        }
        
        videoPlayer.onloadstart = () => console.log('🎥 Video load started')
        videoPlayer.onloadedmetadata = () => {
            console.log('🎥 Video metadata loaded')
            console.log('🎥 Video dimensions:', videoPlayer.videoWidth, 'x', videoPlayer.videoHeight)
            console.log('🎥 Video duration:', videoPlayer.duration)
            
            // Force video to be visible after metadata loads
            if (videoPlayer.videoWidth > 0 && videoPlayer.videoHeight > 0) {
                console.log('🎥 Video has valid dimensions, forcing visibility')
                videoPlayer.style.visibility = 'visible'
                videoPlayer.style.opacity = '1'
                
                // Calculate aspect ratio and set proper size
                const aspectRatio = videoPlayer.videoWidth / videoPlayer.videoHeight
                console.log('🎥 Video aspect ratio:', aspectRatio)
                
                // Force the video to take up the full container
                videoPlayer.style.width = '100%'
                videoPlayer.style.height = '100%'
            } else {
                console.error('🚨 Video has invalid dimensions!')
            }
        }
        videoPlayer.oncanplay = () => console.log('🎥 Video can play')
        videoPlayer.onplay = () => console.log('🎥 Video started playing')
        videoPlayer.onpause = () => console.log('🎥 Video paused')
        videoPlayer.onwaiting = () => console.log('🎥 Video waiting for data')
        videoPlayer.onstalled = () => console.log('🎥 Video stalled')
        videoPlayer.onsuspend = () => console.log('🎥 Video suspended')
        videoPlayer.onabort = () => console.log('🎥 Video aborted')
        
        // Try direct src approach as fallback
        console.log('🎥 Trying direct src approach as well...')
        videoPlayer.src = streamUrl
        
        videoPlayer.load()
        console.log('🎥 Video load() called')
        
        // Check video element visibility after setup
        setTimeout(() => {
            console.log('🎥 POST-SETUP CHECK:')
            console.log('🎥 Video display:', videoPlayer.style.display)
            console.log('🎥 Video computed display:', window.getComputedStyle(videoPlayer).display)
            console.log('🎥 Video width:', videoPlayer.offsetWidth)
            console.log('🎥 Video height:', videoPlayer.offsetHeight)
            console.log('🎥 Video readyState:', videoPlayer.readyState)
            console.log('🎥 Video networkState:', videoPlayer.networkState)
            
            console.log('🎥 Attempting to play video...')
            videoPlayer.play().then(() => {
                console.log('🎥 Video play() succeeded')
            }).catch(error => {
                console.error('🚨 Video play() failed:', error)
                console.log('🎥 Trying alternative blob approach...')
                
                // Alternative approach: fetch the video and create a blob URL
                fetch(streamUrl)
                    .then(response => response.blob())
                    .then(blob => {
                        const blobUrl = URL.createObjectURL(blob)
                        console.log('🎥 Created blob URL:', blobUrl)
                        videoPlayer.src = blobUrl
                        videoPlayer.load()
                        return videoPlayer.play()
                    })
                    .then(() => {
                        console.log('🎥 Blob video play() succeeded')
                    })
                    .catch(blobError => {
                        console.error('🚨 Blob approach also failed:', blobError)
                    })
            })
        }, 1000)
        
    } else if (mediaType === 'audio') {
        console.log('Setting up audio player')
        
        // Clear any previous source
        audioPlayer.src = ''
        audioPlayer.load()
        
        audioPlayer.preload = 'metadata'
        audioPlayer.controls = true
        
        // Create source element
        const source = document.createElement('source')
        source.src = streamUrl
        source.type = content.mime_type || 'audio/mpeg'
        
        // Clear existing sources and add new one
        while (audioPlayer.firstChild) {
            audioPlayer.removeChild(audioPlayer.firstChild)
        }
        audioPlayer.appendChild(source)
        
        // Add error handling
        audioPlayer.onerror = (e) => {
            console.error('Audio player error:', e)
            console.error('Audio error details:', audioPlayer.error)
        }
        
        audioPlayer.onloadstart = () => console.log('Audio load started')
        audioPlayer.oncanplay = () => console.log('Audio can play')
        
        audioPlayer.style.display = 'block'
        audioPlayer.load()
        
    } else if (mediaType === 'image') {
        console.log('Setting up image player')
        imagePlayer.src = streamUrl
        imagePlayer.style.display = 'block'
        
        // Add error handling for image
        imagePlayer.onerror = (e) => {
            console.error('Image load error:', e)
        }
        
        imagePlayer.onload = () => console.log('Image loaded successfully')
        
    } else {
        console.log('Setting up document player')
        // Document or other types
        document.getElementById('documentTitle').textContent = content.title || content.original_filename || 'Document'
        document.getElementById('downloadDocument').onclick = () => downloadContent(content.id, content.original_filename || 'document')
        documentPlayer.style.display = 'block'
    }
    
    // Show media player
    console.log('Showing media player modal')
    
    // Remove the hidden class first (this is critical because it has !important)
    mediaPlayer.classList.remove('hidden')
    
    // FORCE the media container to be properly sized for video
    const mediaContainer = mediaPlayer.querySelector('.media-player-container')
    const mediaContent = mediaPlayer.querySelector('.media-content')
    
    if (mediaContainer) {
        mediaContainer.style.width = '95vw'
        mediaContainer.style.height = '95vh'
        mediaContainer.style.maxWidth = 'none'
        mediaContainer.style.display = 'flex'
        mediaContainer.style.flexDirection = 'column'
        console.log('🎥 Forced media container sizing')
    }
    
    if (mediaContent) {
        mediaContent.style.width = '100%'
        mediaContent.style.height = '100%'
        mediaContent.style.display = 'flex'
        mediaContent.style.alignItems = 'center'
        mediaContent.style.justifyContent = 'center'
        mediaContent.style.overflow = 'hidden'
        console.log('🎥 Forced media content sizing')
    }
    
    console.log('Media player modal should now be visible')
    
    // Debug: Check if modal is actually visible
    setTimeout(() => {
        const modalStyle = window.getComputedStyle(mediaPlayer)
        console.log('Media player modal computed style:')
        console.log('- display:', modalStyle.display)
        console.log('- visibility:', modalStyle.visibility)
        console.log('- opacity:', modalStyle.opacity)
        console.log('- z-index:', modalStyle.zIndex)
        
        const videoStyle = window.getComputedStyle(videoPlayer)
        console.log('Video player computed style:')
        console.log('- display:', videoStyle.display)
        console.log('- width:', videoStyle.width)
        console.log('- height:', videoStyle.height)
        console.log('- position:', videoStyle.position)
    }, 100)
}

function closeMediaPlayer() {
    mediaPlayer.classList.add('hidden')
    
    // Stop all media
    videoPlayer.pause()
    videoPlayer.src = ''
    audioPlayer.pause()
    audioPlayer.src = ''
    imagePlayer.src = ''
}

// Download functionality
async function downloadContent(contentId, filename) {
    try {
        if (!authToken) {
            throw new Error('Authentication required')
        }
        
        // Get content details for proper organization
        let contentInfo = null
        try {
            const response = await fetch(`${serverUrl}/api/content/${contentId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            })
            
            if (response.ok) {
                const responseData = await response.json()
                contentInfo = responseData.content || responseData
                console.log('Content info for download:', contentInfo)
            }
        } catch (error) {
            console.warn('Could not fetch content details for download organization:', error)
        }
        
        const downloadUrl = `${serverUrl}/api/content/${contentId}/stream`
        
        // Show notification that download is starting
        const displayName = contentInfo?.title || filename
        await ipcRenderer.invoke('show-notification', 'Download Started', `Starting download of ${displayName}`)
        
        // Use Electron's download functionality with content info for organization
        const result = await ipcRenderer.invoke('download-content', downloadUrl, filename, authToken, contentInfo)
        
        if (result) {
            console.log('Download completed:', result)
            // Refresh offline content if we're on the offline page
            if (currentPage === 'offline') {
                await loadOfflineContent()
                renderOfflineContent()
            }
        }
    } catch (error) {
        console.error('Download failed:', error)
        await ipcRenderer.invoke('show-notification', 'Download Failed', error.message)
    }
}

// Navigation
function switchPage(pageName) {
    // Update navigation
    navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.page === pageName)
    })
    
    // Convert kebab-case to camelCase for page IDs
    const pageId = pageName === 'tv-shows' ? 'tvShowsPage' : 
                   pageName === 'offline' ? 'offlinePage' : 
                   `${pageName}Page`
    
    // Update pages
    pages.forEach(page => {
        page.classList.toggle('active', page.id === pageId)
    })
    
    currentPage = pageName
    
    // Load page-specific content
    switch (pageName) {
        case 'movies':
            renderMovies()
            break
        case 'tv-shows':
            renderTVShows()
            break
        case 'offline':
            // Only reload offline content if it's empty or if user authentication state has changed
            if (offlineContent.length === 0 || !isAuthenticated || !currentUser) {
                console.log('📱 Reloading offline content due to empty content or auth state change')
                // Add a small delay to ensure user authentication state is fully established
                setTimeout(() => {
                    loadOfflineContent().then(() => {
                        renderOfflineContent()
                    })
                }, 100)
            } else {
                console.log('📱 Using cached offline content')
                renderOfflineContent()
            }
            break
        case 'content':
            filteredContent = [...allContent]
            renderAllContent()
            break
    }
}

// Search functionality
function filterContent(searchTerm, mediaType = '') {
    filteredContent = allContent.filter(item => {
        const matchesSearch = !searchTerm || 
            (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.original_filename && item.original_filename.toLowerCase().includes(searchTerm.toLowerCase()))
        
        const matchesType = !mediaType || item.media_type === mediaType
        
        return matchesSearch && matchesType
    })
    
    renderAllContent()
}

// Event listeners
function setupEventListeners() {
    // Title bar controls
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('minimize-to-tray')
    })
    
    closeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('close-window')
    })
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape: Close media player or other modals
        if (e.key === 'Escape') {
            if (!document.getElementById('mediaPlayer').classList.contains('hidden')) {
                closeMediaPlayer()
            }
        }
    })
    
    // Connection error
    reconnectBtn.addEventListener('click', () => {
        serverUrl = serverUrlInput.value.trim()
        if (!serverUrl.startsWith('http')) {
            serverUrl = 'http://' + serverUrl
        }
        checkConnection()
    })
    
    // Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault()
            switchPage(link.dataset.page)
        })
    })
    
    // Quick action cards
    document.querySelectorAll('.action-card').forEach(card => {
        card.addEventListener('click', () => {
            const page = card.dataset.page
            if (page) {
                switchPage(page)
            }
        })
    })
    
    // User menu
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        userDropdown.classList.toggle('hidden')
    })
    
    document.addEventListener('click', () => {
        userDropdown.classList.add('hidden')
    })
    
    logoutBtn.addEventListener('click', logout)
    
    // Media player
    closePlayer.addEventListener('click', closeMediaPlayer)
    
    // Search functionality
    if (movieSearch) {
        movieSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value
            const movies = allContent.filter(item => 
                // Only include items that are explicitly categorized as movies
                item.category === 'movie'
            ).filter(item => 
                !searchTerm || 
                (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (item.original_filename && item.original_filename.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            
            if (movies.length === 0) {
                moviesGrid.innerHTML = ''
                document.getElementById('noMovies').classList.remove('hidden')
            } else {
                document.getElementById('noMovies').classList.add('hidden')
                moviesGrid.innerHTML = movies.map(item => createContentCard(item)).join('')
            }
        })
    }
    
    if (tvSearch) {
        tvSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase()
            const tvShows = allContent.filter(item => 
                item.category === 'tv-show' &&
                (!searchTerm || 
                 (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                 (item.original_filename && item.original_filename.toLowerCase().includes(searchTerm)) ||
                 (item.tv_show_name && item.tv_show_name.toLowerCase().includes(searchTerm)))
            )
            
            if (tvShows.length === 0) {
                seriesGrid.innerHTML = ''
                document.getElementById('noTVShows').classList.remove('hidden')
            } else {
                document.getElementById('noTVShows').classList.add('hidden')
                // Group and render series cards for search results
                const groupedShows = groupTVShowsByName(tvShows)
                seriesGrid.innerHTML = Object.keys(groupedShows).map(seriesName => 
                    createSeriesCard(seriesName, groupedShows[seriesName])
                ).join('')
            }
        })
    }
    
    if (contentSearch) {
        contentSearch.addEventListener('input', (e) => {
            filterContent(e.target.value, contentFilter.value)
        })
    }
    
    if (contentFilter) {
        contentFilter.addEventListener('change', (e) => {
            filterContent(contentSearch.value, e.target.value)
        })
    }

    // Series detail event listeners
    const backToSeriesLibrary = document.getElementById('backToSeriesLibrary')
    if (backToSeriesLibrary) {
        backToSeriesLibrary.addEventListener('click', () => {
            showSeriesLibraryView()
            currentSeries = null
        })
    }

    const seasonSelect = document.getElementById('seasonSelect')
    if (seasonSelect) {
        seasonSelect.addEventListener('change', (e) => {
            currentSeason = e.target.value === 'episodes' ? 'episodes' : parseInt(e.target.value)
            renderCurrentSeasonEpisodes()
        })
    }

    // Offline functionality event listeners
    offlineTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchOfflineTab(tab.dataset.offlineTab)
        })
    })

    // Offline search functionality
    if (offlineMovieSearch) {
        offlineMovieSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase()
            const movies = offlineContent.filter(item => 
                item.category === 'movie' &&
                (!searchTerm || 
                 (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                 (item.original_filename && item.original_filename.toLowerCase().includes(searchTerm)))
            )
            
            if (movies.length === 0) {
                offlineMoviesGrid.innerHTML = ''
                document.getElementById('noOfflineMovies').classList.remove('hidden')
            } else {
                document.getElementById('noOfflineMovies').classList.add('hidden')
                offlineMoviesGrid.innerHTML = movies.map(item => createOfflineContentCard(item)).join('')
            }
        })
    }

    if (offlineTVSearch) {
        offlineTVSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase()
            const tvShows = offlineContent.filter(item => 
                item.category === 'tv-show' &&
                (!searchTerm || 
                 (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                 (item.original_filename && item.original_filename.toLowerCase().includes(searchTerm)))
            )
            
            if (tvShows.length === 0) {
                offlineSeriesGrid.innerHTML = ''
                document.getElementById('noOfflineTVShows').classList.remove('hidden')
            } else {
                document.getElementById('noOfflineTVShows').classList.add('hidden')
                const groupedShows = groupOfflineTVShowsByName(tvShows)
                offlineSeriesGrid.innerHTML = Object.keys(groupedShows).map(seriesName => 
                    createOfflineSeriesCard(seriesName, groupedShows[seriesName])
                ).join('')
            }
        })
    }

    // Offline series detail event listeners
    const backToOfflineSeriesLibrary = document.getElementById('backToOfflineSeriesLibrary')
    if (backToOfflineSeriesLibrary) {
        backToOfflineSeriesLibrary.addEventListener('click', () => {
            showOfflineSeriesLibraryView()
            currentOfflineSeries = null
        })
    }

    const offlineSeasonSelect = document.getElementById('offlineSeasonSelect')
    if (offlineSeasonSelect) {
        offlineSeasonSelect.addEventListener('change', (e) => {
            currentOfflineSeason = parseInt(e.target.value)
            renderOfflineCurrentSeasonEpisodes()
        })
    }
}

// Auto-refresh content every 30 seconds if connected
setInterval(() => {
    if (isConnected && isAuthenticated && !loadingScreen.classList.contains('hidden') === false) {
        loadDashboardData().then(() => {
            if (currentPage === 'home') {
                renderRecentContent()
            } else if (currentPage === 'movies') {
                renderMovies()
            } else if (currentPage === 'tv-shows') {
                renderTVShows()
            } else if (currentPage === 'content') {
                renderAllContent()
            }
        })
    }
}, 30000)

// Initialize the app when DOM is loaded
// Test function to verify media player setup
function testMediaPlayer() {
    // Media player element verification (for debugging if needed)
    const elements = {
        mediaPlayer: document.getElementById('mediaPlayer'),
        videoPlayer: document.getElementById('videoPlayer'),
        audioPlayer: document.getElementById('audioPlayer'),
        imagePlayer: document.getElementById('imagePlayer'),
        documentPlayer: document.getElementById('documentPlayer'),
        closePlayer: document.getElementById('closePlayer')
    }
    return elements
}

// Make functions available globally for onclick handlers and debugging
window.playContent = playContent
window.downloadContent = downloadContent
window.testMediaPlayer = testMediaPlayer
window.openSeriesDetail = openSeriesDetail

// Make functions available globally for onclick handlers
window.playContent = playContent
window.downloadContent = downloadContent
window.playOfflineContent = playOfflineContent
window.openSeriesDetail = openSeriesDetail
window.openOfflineSeriesDetail = openOfflineSeriesDetail

document.addEventListener('DOMContentLoaded', () => {
    console.log('Obselis Desktop starting...')
    setupEventListeners()
    checkConnection()
}) 