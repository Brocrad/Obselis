const { initializeTranscodingEngine, getTranscodingEngine, createCompatibilityAdapter } = require('./integration');
const { createTranscodingTables } = require('./databaseSchema');

class TranscodingEngineManager {
  constructor() {
    this.transcodingEngine = null;
    this.isInitialized = false;
  }

  async initialize(io = null) {
    try {
      
      // Set up transcoding engine database
      await createTranscodingTables();
      
      // Initialize transcoding engine
      this.transcodingEngine = await initializeTranscodingEngine(io);
      
      // Set up Socket.IO handlers
      if (io) {
        const { setupSocketIOHandlers } = require('./integration');
        setupSocketIOHandlers(io);
      }
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('❌ Failed to initialize transcoding engine:', error);
      throw error;
    }
  }

  // Get the transcoding service with compatibility adapter
  getService() {
    if (this.transcodingEngine) {
      return createCompatibilityAdapter(this.transcodingEngine);
    }
    
    console.error('❌ Transcoding engine not available');
    throw new Error('Transcoding engine not initialized');
  }

  // Get the raw engine for advanced operations
  getEngine() {
    return this.transcodingEngine;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      engineAvailable: !!this.transcodingEngine,
      primaryEngine: 'new'
    };
  }

  async cleanup() {
    try {
      if (this.transcodingEngine) {
        await this.transcodingEngine.cleanup();
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }
}

const transcodingManager = new TranscodingEngineManager();
module.exports = transcodingManager; 
