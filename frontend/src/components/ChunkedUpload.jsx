import React, { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatFileSize, formatTime } from '../utils/formatters';

const ChunkedUpload = ({ onUploadComplete, onUploadError }) => {
  const [uploadState, setUploadState] = useState({
    isUploading: false,
    progress: 0,
    currentFile: null,
    uploadId: null,
    speed: 0,
    eta: 0,
    error: null
  });
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'movie',
    tags: '',
    published: true
  });
  
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const queryClient = useQueryClient();
  
  const CHUNK_SIZE = 200 * 1024 * 1024; // 200MB chunks
  const MAX_CONCURRENT_UPLOADS = 2; // Upload 2 chunks simultaneously (reduced to minimize race conditions)
  
  // Using shared formatters from utils/formatters.js
  
  const calculateSpeed = (uploadedBytes, startTime) => {
    const elapsedTime = (Date.now() - startTime) / 1000; // seconds
    return uploadedBytes / elapsedTime; // bytes per second
  };
  
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ogv|ts|mts|m2ts)$/i;
    if (!allowedTypes.test(file.name)) {
      setUploadState(prev => ({
        ...prev,
        error: 'Only video files are allowed (MP4, MKV, AVI, MOV, WMV, FLV, WebM, TS, etc.)'
      }));
      return;
    }
    
    // Check file size (75GB limit)
    if (file.size > 75 * 1024 * 1024 * 1024) {
      setUploadState(prev => ({
        ...prev,
        error: 'File size exceeds 75GB limit'
      }));
      return;
    }
    
    setUploadState(prev => ({
      ...prev,
      currentFile: file,
      error: null
    }));
    
    // Auto-fill title from filename
    if (!formData.title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setFormData(prev => ({ ...prev, title: nameWithoutExt }));
    }
  };
  
  const initializeUpload = async (file) => {
    const token = sessionStorage.getItem('token');
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    const response = await fetch('/api/upload/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        filename: file.name,
        fileSize: file.size,
        totalChunks
      })
    });
    
    if (!response.ok) {
      let error;
      try {
        error = await response.json();
      } catch (jsonError) {
        throw new Error(`Failed to initialize upload: ${response.status} ${response.statusText}`);
      }
      throw new Error(error.error || 'Failed to initialize upload');
    }
    
    try {
      return await response.json();
    } catch (jsonError) {
      throw new Error('Invalid response from server during upload initialization');
    }
  };
  
  const uploadChunk = async (file, uploadId, chunkIndex, totalChunks) => {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    
    const token = sessionStorage.getItem('token');
    
    const response = await fetch('/api/upload/chunk', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData,
      signal: abortControllerRef.current?.signal
    });
    
    if (!response.ok) {
      let error;
      try {
        error = await response.json();
      } catch (jsonError) {
        throw new Error(`Failed to upload chunk ${chunkIndex}: ${response.status} ${response.statusText}`);
      }
      throw new Error(error.error || `Failed to upload chunk ${chunkIndex}`);
    }
    
    try {
      return await response.json();
    } catch (jsonError) {
      throw new Error(`Invalid response from server for chunk ${chunkIndex}`);
    }
  };
  
  const completeUpload = async (uploadId) => {
    const token = sessionStorage.getItem('token');
    
    const response = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        uploadId,
        ...formData
      })
    });
    
    if (!response.ok) {
      let error;
      try {
        error = await response.json();
      } catch (jsonError) {
        throw new Error(`Failed to complete upload: ${response.status} ${response.statusText}`);
      }
      throw new Error(error.error || 'Failed to complete upload');
    }
    
    try {
      return await response.json();
    } catch (jsonError) {
      throw new Error('Invalid response from server during upload completion');
    }
  };
  
  const uploadChunksInParallel = async (file, uploadId, totalChunks) => {
    let uploadedChunks = 0;
    let uploadedBytes = 0;
    
    const uploadPromises = [];
    const semaphore = new Array(MAX_CONCURRENT_UPLOADS).fill(null);
    
    const uploadChunkWithSemaphore = async (chunkIndex, retries = 5) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await uploadChunk(file, uploadId, chunkIndex, totalChunks);
          uploadedChunks++;
          uploadedBytes += Math.min(CHUNK_SIZE, file.size - (chunkIndex * CHUNK_SIZE));
          
          // Update progress
          const progress = (uploadedChunks / totalChunks) * 100;
          const speed = calculateSpeed(uploadedBytes, uploadStartTimeRef.current);
          const remainingBytes = file.size - uploadedBytes;
          const eta = remainingBytes / speed;
          
          setUploadState(prev => ({
            ...prev,
            progress,
            speed,
            eta
          }));
          
          console.log(`✅ Chunk ${chunkIndex} uploaded successfully`);
          return result;
        } catch (error) {
          console.error(`❌ Chunk ${chunkIndex} failed (attempt ${attempt + 1}):`, error.message);
          
          if (attempt === retries) {
            console.error(`🚫 Chunk ${chunkIndex} failed permanently after ${retries + 1} attempts`);
            throw error;
          }
          
          // Wait before retry (exponential backoff with jitter)
          const baseDelay = 1000 * Math.pow(2, attempt);
          const jitter = Math.random() * 500; // Add randomness to prevent thundering herd
          const delay = Math.min(baseDelay + jitter, 10000);
          
          console.warn(`🔄 Retrying chunk ${chunkIndex} in ${Math.round(delay)}ms (attempt ${attempt + 2}/${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };
    
    // Create upload queue
    for (let i = 0; i < totalChunks; i++) {
      uploadPromises.push(uploadChunkWithSemaphore(i));
    }
    
    // Execute uploads with concurrency limit
    const results = [];
    for (let i = 0; i < uploadPromises.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = uploadPromises.slice(i, i + MAX_CONCURRENT_UPLOADS);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    
    return results;
  };
  
  const handleUpload = async () => {
    if (!uploadState.currentFile) return;
    
    try {
      setUploadState(prev => ({
        ...prev,
        isUploading: true,
        progress: 0,
        error: null,
        speed: 0,
        eta: 0
      }));
      
      abortControllerRef.current = new AbortController();
      uploadStartTimeRef.current = Date.now();
      
      const file = uploadState.currentFile;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      
      // Initialize upload
      const initResult = await initializeUpload(file);
      const uploadId = initResult.uploadId;
      
      setUploadState(prev => ({
        ...prev,
        uploadId
      }));
      
      // Upload chunks in parallel
      await uploadChunksInParallel(file, uploadId, totalChunks);
      
      // Complete upload
      const result = await completeUpload(uploadId);
      
      // Reset form
      setUploadState({
        isUploading: false,
        progress: 0,
        currentFile: null,
        uploadId: null,
        speed: 0,
        eta: 0,
        error: null
      });
      
      setFormData({
        title: '',
        description: '',
        category: 'movie',
        tags: '',
        published: true
      });
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh content list
      queryClient.invalidateQueries(['content']);
      
      if (onUploadComplete) {
        onUploadComplete(result);
      }
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      
      // Show detailed error information
      let errorMessage = error.message;
      if (error.message.includes('Missing chunks')) {
        errorMessage = `Upload incomplete: Some chunks failed to upload. ${error.message}`;
      }
      
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: errorMessage
      }));
      
      if (onUploadError) {
        onUploadError(error);
      }
    }
  };
  
  const handleCancel = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (uploadState.uploadId) {
      try {
        const token = sessionStorage.getItem('token');
        await fetch(`/api/upload/cancel/${uploadState.uploadId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Cancel upload error:', error);
      }
    }
    
    setUploadState({
      isUploading: false,
      progress: 0,
      currentFile: null,
      uploadId: null,
      speed: 0,
      eta: 0,
      error: null
    });
  };
  
  return (
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-large p-6 border border-gray-700/50">
      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="text-2xl">⚡</span>
        High-Speed Upload (Up to 75GB)
      </h3>
      
      {/* File Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Video File
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mkv,.avi,.mov,.wmv,.flv,.webm,.m4v,.3gp,.ogv,.ts,.mts,.m2ts"
          onChange={handleFileSelect}
          disabled={uploadState.isUploading}
          className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer bg-gray-700/50 border border-gray-600 rounded-lg"
        />
        {uploadState.currentFile && (
          <p className="mt-2 text-sm text-gray-400">
            Selected: {uploadState.currentFile.name} ({formatFileSize(uploadState.currentFile.size)})
          </p>
        )}
      </div>
      
      {/* Form Fields */}
      {uploadState.currentFile && !uploadState.isUploading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter video title"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="movie">🎬 Movie</option>
              <option value="tv-show">📺 TV Show</option>
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter video description"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Additional Tags
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="action, comedy, 2023"
            />
          </div>
          
          <div className="flex items-center">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.published}
                onChange={(e) => setFormData(prev => ({ ...prev, published: e.target.checked }))}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors ${formData.published ? 'bg-blue-600' : 'bg-gray-600'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.published ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="ml-3 text-sm text-gray-300">Publish immediately</span>
            </label>
          </div>
        </div>
      )}
      
      {/* Upload Progress */}
      {uploadState.isUploading && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-300">Uploading...</span>
            <span className="text-sm text-gray-400">{uploadState.progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Speed: {formatFileSize(uploadState.speed)}/s</span>
            <span>ETA: {formatTime(uploadState.eta)}</span>
          </div>
        </div>
      )}
      
      {/* Error Display */}
      {uploadState.error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
          <p className="text-red-400 text-sm">{uploadState.error}</p>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="flex gap-3">
        {!uploadState.isUploading ? (
          <button
            onClick={handleUpload}
            disabled={!uploadState.currentFile || !formData.title.trim()}
            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span className="text-lg">🚀</span>
            Start High-Speed Upload
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span className="text-lg">⏹️</span>
            Cancel Upload
          </button>
        )}
      </div>
      
      <div className="mt-4 text-xs text-gray-500 text-center">
        <p>✨ Optimized for large 4K videos • Parallel chunk uploads • Resume capability</p>
        <p>📁 Supports: MP4, MKV, AVI, MOV, WMV, FLV, WebM, TS, and more • Max: 75GB</p>
      </div>
    </div>
  );
};

export default ChunkedUpload; 