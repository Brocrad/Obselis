const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/security');

// Get transcoding integration status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ 
        error: 'Transcoding integration not available',
        fallback: 'old-service'
      });
    }
    
    const status = integration.getIntegrationStatus();
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting transcoding status:', error);
    res.status(500).json({ error: 'Failed to get transcoding status' });
  }
});

// Enhanced file analysis using new engine
router.post('/analyze', authenticateToken, async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('file-analysis');
    if (!engine) {
      return res.status(503).json({ error: 'File analysis service not available' });
    }
    
    const analysis = await engine.fileAnalyzer.analyzeFile(filePath);
    
    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error analyzing file:', error);
    res.status(500).json({ error: 'Failed to analyze file' });
  }
});

// Batch file analysis
router.post('/analyze-batch', authenticateToken, async (req, res) => {
  try {
    const { filePaths } = req.body;
    
    if (!filePaths || !Array.isArray(filePaths)) {
      return res.status(400).json({ error: 'File paths array is required' });
    }
    
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('batch-analysis');
    if (!engine) {
      return res.status(503).json({ error: 'Batch analysis service not available' });
    }
    
    const analyses = await engine.fileAnalyzer.analyzeBatch(filePaths);
    const summary = engine.fileAnalyzer.getAnalysisSummary(analyses);
    
    res.json({
      success: true,
      analyses,
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error analyzing batch:', error);
    res.status(500).json({ error: 'Failed to analyze batch' });
  }
});

// Get system information
router.get('/system-info', authenticateToken, async (req, res) => {
  try {
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('system-info');
    if (!engine) {
      return res.status(503).json({ error: 'System info service not available' });
    }
    
    const systemInfo = await engine.transcoder.getSystemInfo();
    
    res.json({
      success: true,
      systemInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({ error: 'Failed to get system info' });
  }
});

// Get performance statistics
router.get('/performance-stats', authenticateToken, async (req, res) => {
  try {
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('performance-stats');
    if (!engine) {
      return res.status(503).json({ error: 'Performance stats service not available' });
    }
    
    const stats = engine.transcoder.getPerformanceStats();
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    res.status(500).json({ error: 'Failed to get performance stats' });
  }
});

// Advanced cleanup operations
router.post('/cleanup', authenticateToken, async (req, res) => {
  try {
    const { type = 'all' } = req.body;
    
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('advanced-cleanup');
    if (!engine) {
      return res.status(503).json({ error: 'Cleanup service not available' });
    }
    
    let result;
    if (type === 'all') {
      result = await engine.cleanupService.forceCleanup();
    } else {
      result = await engine.cleanupService.performCleanup();
    }
    
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error performing cleanup:', error);
    res.status(500).json({ error: 'Failed to perform cleanup' });
  }
});

// Get quality presets from new engine
router.get('/quality-presets', authenticateToken, async (req, res) => {
  try {
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('system-info');
    if (!engine) {
      return res.status(503).json({ error: 'Quality presets service not available' });
    }
    
    const presets = engine.transcoder.getQualityPresets();
    
    res.json({
      success: true,
      presets,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting quality presets:', error);
    res.status(500).json({ error: 'Failed to get quality presets' });
  }
});

// Test GPU availability
router.get('/test-gpu', authenticateToken, async (req, res) => {
  try {
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    const engine = integration.getService('system-info');
    if (!engine) {
      return res.status(503).json({ error: 'GPU test service not available' });
    }
    
    const gpuAvailable = await engine.transcoder.testGPUAvailability();
    
    res.json({
      success: true,
      gpuAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing GPU:', error);
    res.status(500).json({ error: 'Failed to test GPU' });
  }
});

// Migrate existing jobs (admin only)
router.post('/migrate-jobs', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const integration = global.transcodingIntegration;
    if (!integration) {
      return res.status(503).json({ error: 'Transcoding integration not available' });
    }
    
    await integration.migrateExistingJobs();
    
    res.json({
      success: true,
      message: 'Job migration completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error migrating jobs:', error);
    res.status(500).json({ error: 'Failed to migrate jobs' });
  }
});

module.exports = router; 
