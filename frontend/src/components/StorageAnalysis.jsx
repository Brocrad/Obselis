import React, { useState, useEffect } from 'react';
import { formatFileSize } from '../utils/formatters';
import DuplicateCleanup from './DuplicateCleanup';

// Helper function to get filename from path
const getFilename = (filePath) => {
  if (!filePath) return '';
  return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
};

const StorageAnalysis = () => {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showPieChart, setShowPieChart] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showDuplicateCleanup, setShowDuplicateCleanup] = useState(false);

  // Analysis categories for pie chart
  const analysisCategories = {
    originalFiles: { label: 'Original Files', color: '#3B82F6', icon: '📁' },
    transcodedFiles: { label: 'Transcoded Files', color: '#10B981', icon: '🗜️' },
    duplicates: { label: 'Duplicates', color: '#F59E0B', icon: '🔄' },
    orphans: { label: 'Orphaned Files', color: '#EF4444', icon: '👻' },
    emptyFiles: { label: 'Empty Files', color: '#8B5CF6', icon: '📭' },
    corruptedFiles: { label: 'Corrupted Files', color: '#DC2626', icon: '💥' }
  };

  const analyzeStorage = async () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      const token = sessionStorage.getItem('token');
      
      // Step 1: Get storage analytics (30%) - with timeout
      setAnalysisProgress(10);
      const analyticsResponse = await Promise.race([
        fetch('/api/storage/analytics', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analytics request timeout')), 30000)
        )
      ]);
      
      if (!analyticsResponse.ok) {
        throw new Error(`Analytics request failed: ${analyticsResponse.status}`);
      }
      
      const analyticsData = await analyticsResponse.json();
      setAnalysisProgress(30);

      // Step 2: Get duplicate analysis (60%) - with timeout
      setAnalysisProgress(40);
      const duplicateResponse = await Promise.race([
        fetch('/api/admin/cleanup/analyze-duplicates', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Duplicate analysis request timeout')), 60000)
        )
      ]);
      
      if (!duplicateResponse.ok) {
        throw new Error(`Duplicate analysis request failed: ${duplicateResponse.status}`);
      }
      
      const duplicateData = await duplicateResponse.json();
      setAnalysisProgress(70);

      // Step 3: Process and combine data (90%)
      setAnalysisProgress(80);
      const combinedAnalysis = {
        timestamp: new Date().toISOString(),
        storage: analyticsData.analytics,
        duplicates: duplicateData,
        summary: {
          totalOriginalSize: analyticsData.analytics?.original?.totalSize || 0,
          totalTranscodedSize: analyticsData.analytics?.transcoded?.totalSize || 0,
          totalDuplicates: (duplicateData.analysis?.totalDuplicatesToDelete || 0) + 
                          (duplicateData.analysis?.fsDuplicateFiles || 0) + 
                          (duplicateData.analysis?.transcodedFsDuplicateFiles || 0),
          totalOrphans: (duplicateData.analysis?.orphanedTranscoded || 0) + 
                       (duplicateData.analysis?.totalOrphanedFiles || 0),
          totalEmptyFiles: 0, // Will be calculated
          totalCorruptedFiles: 0, // Will be calculated
          spaceSavings: analyticsData.analytics?.potentialSavings?.bytes || 0
        }
      };

      console.log('Analytics data:', analyticsData);
      console.log('Duplicate data:', duplicateData);
      console.log('Combined analysis:', combinedAnalysis);
      console.log('Content breakdown:', analyticsData.analytics?.contentBreakdown);
      console.log('Original files:', analyticsData.analytics?.original);
      console.log('Transcoded files:', analyticsData.analytics?.transcoded);

      setAnalysis(combinedAnalysis);
      setAnalysisProgress(90);
      
      // Step 4: Generate CSV data (100%)
      generateCsvData(combinedAnalysis);
      setAnalysisProgress(100);
      
      // Reset progress after a short delay
      setTimeout(() => setAnalysisProgress(0), 1000);
    } catch (error) {
      console.error('Storage analysis failed:', error);
      setAnalysisProgress(0);
      
      // Show user-friendly error message
      let errorMessage = 'Storage analysis failed. ';
      if (error.message.includes('timeout')) {
        errorMessage += 'The analysis is taking longer than expected. Please try again.';
      } else if (error.message.includes('401')) {
        errorMessage += 'Authentication failed. Please log in again.';
      } else if (error.message.includes('403')) {
        errorMessage += 'Access denied. You may not have permission to perform this analysis.';
      } else if (error.message.includes('500')) {
        errorMessage += 'Server error. Please try again later.';
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateCsvData = (analysisData) => {
    const csvRows = [];
    
    // Header
    csvRows.push([
      'Category',
      'File Count',
      'Total Size (bytes)',
      'Total Size (formatted)',
      'Percentage of Total',
      'Details'
    ]);

    // Original files
    csvRows.push([
      'Original Files',
      analysisData.storage?.original?.totalFiles || 0,
      analysisData.storage?.original?.totalSize || 0,
      formatFileSize(analysisData.storage?.original?.totalSize || 0),
      '100%',
      'Source media files'
    ]);

    // Transcoded files
    csvRows.push([
      'Transcoded Files',
      analysisData.storage?.transcoded?.totalFiles || 0,
      analysisData.storage?.transcoded?.totalSize || 0,
      formatFileSize(analysisData.storage?.transcoded?.totalSize || 0),
      `${Math.round((analysisData.storage?.transcoded?.totalSize || 0) / (analysisData.storage?.original?.totalSize || 1) * 100)}%`,
      'Compressed versions'
    ]);

    // Duplicates
    csvRows.push([
      'Duplicate Files',
      analysisData.summary.totalDuplicates,
      0, // Size calculation would need detailed analysis
      'N/A',
      'N/A',
      'Files that can be safely removed'
    ]);

    // Orphans
    csvRows.push([
      'Orphaned Files',
      analysisData.summary.totalOrphans,
      0, // Size calculation would need detailed analysis
      'N/A',
      'N/A',
      'Files without database references'
    ]);

    // Potential savings
    csvRows.push([
      'Potential Savings',
      'N/A',
      analysisData.summary.spaceSavings,
      formatFileSize(analysisData.summary.spaceSavings),
      `${Math.round(analysisData.summary.spaceSavings / (analysisData.storage?.original?.totalSize || 1) * 100)}%`,
      'Space that could be freed'
    ]);

    setCsvData(csvRows);
  };

  const downloadCsv = () => {
    if (!csvData) return;

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storage-analysis-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getPieChartData = () => {
    if (!analysis) return [];

    const data = [];
    
    // Get content breakdown from storage analytics
    const contentBreakdown = analysis.storage?.contentBreakdown;
    const originalFiles = analysis.storage?.original?.totalSize || 0;
    const transcodedFiles = analysis.storage?.transcoded?.totalSize || 0;
    
    console.log('Pie chart data calculation:');
    console.log('- Content breakdown:', contentBreakdown);
    console.log('- Original files size:', originalFiles);
    console.log('- Transcoded files size:', transcodedFiles);
    
    // Calculate total size for percentages - use only original files for content breakdown
    const totalSize = originalFiles;
    
    console.log('- Total size for calculation:', totalSize);
    
    // If no data, return empty array
    if (totalSize === 0) return [];

    // Color scheme for different categories
    const colors = {
      movies: '#EF4444',      // Red
      tvShows: '#8B5CF6',     // Purple
      other: '#F59E0B',       // Amber
      original: '#3B82F6',    // Blue
      transcoded: '#10B981',  // Emerald
      duplicates: '#F97316',  // Orange
      orphans: '#6B7280'      // Gray
    };

    // Add content breakdown (Movies, TV Shows, Other) - only if we have content data
    if (contentBreakdown) {
      const moviesSize = contentBreakdown.movies?.size || 0;
      const tvShowsSize = contentBreakdown.tvShows?.size || 0;
      const otherSize = contentBreakdown.other?.size || 0;
      
      // Only add categories that have actual data
      if (moviesSize > 0) {
        data.push({
          name: 'Movies',
          value: moviesSize,
          percentage: Math.round((moviesSize / totalSize) * 100),
          color: colors.movies,
          icon: '🎬',
          count: contentBreakdown.movies.count
        });
      }

      if (tvShowsSize > 0) {
        data.push({
          name: 'TV Shows',
          value: tvShowsSize,
          percentage: Math.round((tvShowsSize / totalSize) * 100),
          color: colors.tvShows,
          icon: '📺',
          count: contentBreakdown.tvShows.count
        });
      }

      if (otherSize > 0) {
        data.push({
          name: 'Other Content',
          value: otherSize,
          percentage: Math.round((otherSize / totalSize) * 100),
          color: colors.other,
          icon: '📄',
          count: contentBreakdown.other.count
        });
      }
    }

    // If we don't have content breakdown, show storage type breakdown
    if (data.length === 0) {
      if (originalFiles > 0) {
        data.push({
          name: 'Original Files',
          value: originalFiles,
          percentage: 100,
          color: colors.original,
          icon: '📁'
        });
      }

      if (transcodedFiles > 0) {
        data.push({
          name: 'Transcoded Files',
          value: transcodedFiles,
          percentage: Math.round((transcodedFiles / (originalFiles + transcodedFiles)) * 100),
          color: colors.transcoded,
          icon: '🗜️'
        });
      }
    }

    // Add duplicate and orphaned files if they exist (as separate category)
    const duplicateSize = (analysis.summary.totalDuplicates || 0) * 1024 * 1024; // Rough estimate
    if (duplicateSize > 0 && duplicateSize < totalSize * 0.5) { // Only add if reasonable size
      data.push({
        name: 'Duplicate Files',
        value: duplicateSize,
        percentage: Math.round((duplicateSize / totalSize) * 100),
        color: colors.duplicates,
        icon: '🔄',
        count: analysis.summary.totalDuplicates
      });
    }

    const orphanedSize = (analysis.summary.totalOrphans || 0) * 1024 * 1024; // Rough estimate
    if (orphanedSize > 0 && orphanedSize < totalSize * 0.5) { // Only add if reasonable size
      data.push({
        name: 'Orphaned Files',
        value: orphanedSize,
        percentage: Math.round((orphanedSize / totalSize) * 100),
        color: colors.orphans,
        icon: '👻',
        count: analysis.summary.totalOrphans
      });
    }

    // If still no data, add a default entry
    if (data.length === 0) {
      data.push({
        name: 'No Data',
        value: 1,
        percentage: 100,
        color: '#6B7280',
        icon: '❓'
      });
    }

    // Sort by value (largest first) for better visual representation
    data.sort((a, b) => b.value - a.value);

    // Ensure percentages add up to 100% (or close to it)
    const totalPercentage = data.reduce((sum, item) => sum + item.percentage, 0);
    if (totalPercentage > 0 && Math.abs(totalPercentage - 100) > 5) {
      // Adjust percentages to be more reasonable
      data.forEach(item => {
        item.percentage = Math.round((item.value / totalSize) * 100);
      });
    }

    return data;
  };

    const renderPieChart = () => {
    const data = getPieChartData();
    const total = data.reduce((sum, item) => sum + item.value, 0);

    console.log('Pie chart data:', data);
    console.log('Total:', total);

    // If no real data, create a test pie chart to verify rendering works
    if (data.length === 0 || total === 0) {
      const testData = [
        { name: 'Test 1', value: 50, color: '#EF4444' },
        { name: 'Test 2', value: 30, color: '#8B5CF6' },
        { name: 'Test 3', value: 20, color: '#10B981' }
      ];
      const testTotal = 100;
      
      console.log('Using test data for pie chart:', testData);
      
      return (
        <div className="relative w-[400px] h-[400px] mx-auto">
          <svg width="400" height="400" viewBox="0 0 400 400" className="transform -rotate-90">
            {testData.map((item, index) => {
              const segmentAngle = (item.value / testTotal) * 360;
              let startAngle = 0;
              for (let i = 0; i < index; i++) {
                startAngle += (testData[i].value / testTotal) * 360;
              }
              
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = ((startAngle + segmentAngle) * Math.PI) / 180;
              
              const radius = 150;
              const centerX = 200;
              const centerY = 200;
              
              const x1 = centerX + radius * Math.cos(startRad);
              const y1 = centerY + radius * Math.sin(startRad);
              const x2 = centerX + radius * Math.cos(endRad);
              const y2 = centerY + radius * Math.sin(endRad);
              
              const largeArcFlag = segmentAngle > 180 ? 1 : 0;
              
              const pathData = [
                `M ${centerX} ${centerY}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
              ].join(' ');
              
              console.log(`Test segment ${index}:`, { pathData });
              
              return (
                <path
                  key={index}
                  d={pathData}
                  fill={item.color}
                  stroke="#1F2937"
                  strokeWidth="3"
                />
              );
            })}
          </svg>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-gray-900/80 rounded-lg p-3">
              <div className="text-white text-lg font-bold">Test Pie Chart</div>
              <div className="text-gray-300 text-sm">No real data available</div>
            </div>
          </div>
        </div>
      );
    }

    // Show the actual pie chart with real data
    return (
      <div className="relative w-[400px] h-[400px] mx-auto">
        <svg width="400" height="400" viewBox="0 0 400 400" className="transform -rotate-90">
          {data.length === 1 ? (
            // Show a full circle if only one segment
            <circle cx="200" cy="200" r="150" fill={data[0].color} stroke="#1F2937" strokeWidth="3" />
          ) : (
            // Show actual pie chart segments using a simpler approach
            data.map((item, index) => {
              // Calculate the angle for this segment
              const segmentAngle = (item.value / total) * 360;
              
              // Calculate the starting angle (cumulative of all previous segments)
              let startAngle = 0;
              for (let i = 0; i < index; i++) {
                startAngle += (data[i].value / total) * 360;
              }
              
              // Convert angles to radians
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = ((startAngle + segmentAngle) * Math.PI) / 180;
              
              // Calculate coordinates
              const radius = 150;
              const centerX = 200;
              const centerY = 200;
              
              const x1 = centerX + radius * Math.cos(startRad);
              const y1 = centerY + radius * Math.sin(startRad);
              const x2 = centerX + radius * Math.cos(endRad);
              const y2 = centerY + radius * Math.sin(endRad);
              
              // Determine if we need the large arc flag
              const largeArcFlag = segmentAngle > 180 ? 1 : 0;
              
              // Create the path
              const pathData = [
                `M ${centerX} ${centerY}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
              ].join(' ');
              
              console.log(`Segment ${index} (${item.name}):`, {
                value: item.value,
                percentage: Math.round((item.value / total) * 100),
                startAngle: Math.round(startAngle),
                endAngle: Math.round(startAngle + segmentAngle),
                segmentAngle: Math.round(segmentAngle),
                pathData: pathData
              });
              
              return (
                <path
                  key={index}
                  d={pathData}
                  fill={item.color}
                  stroke="#1F2937"
                  strokeWidth="3"
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => setSelectedCategory(item)}
                />
              );
            })
          )}
        </svg>
        
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center bg-gray-900/80 rounded-lg p-3">
            <div className="text-white text-lg font-bold">
              {data.length} Categories
            </div>
            <div className="text-gray-300 text-sm">
              Total: {formatFileSize(total)}
            </div>
            <div className="text-blue-400 text-xs mt-1">
              Click segments for details
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    // Auto-analyze on component mount
    analyzeStorage();
  }, []);

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">📊 Storage Analysis</h1>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={analyzeStorage}
            disabled={isAnalyzing}
            className="btn-modern bg-blue-600 hover:bg-blue-700 text-white text-sm"
          >
            {isAnalyzing ? '🔄 Analyzing...' : '🔄 Refresh Analysis'}
          </button>
          
          {/* Show other buttons only after analysis is complete */}
          {analysis && !isAnalyzing && (
            <>
              <button
                onClick={() => setShowPieChart(true)}
                className="btn-modern bg-purple-600 hover:bg-purple-700 text-white text-sm"
              >
                📊 View Pie Chart
              </button>
              
              <button
                onClick={() => setShowCsvModal(true)}
                disabled={!csvData}
                className="btn-modern bg-green-600 hover:bg-green-700 text-white text-sm"
              >
                📄 Export CSV
              </button>
              
              <button
                onClick={() => setShowDuplicateCleanup(true)}
                className="btn-modern bg-orange-600 hover:bg-orange-700 text-white text-sm"
              >
                🧹 Duplicate Cleanup
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isAnalyzing && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium">Analyzing Storage...</span>
            <span className="text-blue-400 font-bold">{analysisProgress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${analysisProgress}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Fetching analytics...</span>
            <span>Processing data...</span>
            <span>Generating report...</span>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-500/20 rounded-lg p-4 border border-blue-500/30">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">📁</span>
                <div>
                  <div className="text-xl font-bold text-white">
                    {formatFileSize(analysis.summary.totalOriginalSize)}
                  </div>
                  <div className="text-sm text-blue-300">Original Files</div>
                </div>
              </div>
            </div>

            <div className="bg-green-500/20 rounded-lg p-4 border border-green-500/30">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🗜️</span>
                <div>
                  <div className="text-xl font-bold text-white">
                    {formatFileSize(analysis.summary.totalTranscodedSize)}
                  </div>
                  <div className="text-sm text-green-300">Transcoded Files</div>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/20 rounded-lg p-4 border border-yellow-500/30">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🔄</span>
                <div>
                  <div className="text-xl font-bold text-white">
                    {analysis.summary.totalDuplicates}
                  </div>
                  <div className="text-sm text-yellow-300">Duplicate Files</div>
                </div>
              </div>
            </div>

            <div className="bg-red-500/20 rounded-lg p-4 border border-red-500/30">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">👻</span>
                <div>
                  <div className="text-xl font-bold text-white">
                    {analysis.summary.totalOrphans}
                  </div>
                  <div className="text-sm text-red-300">Orphaned Files</div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Storage Breakdown */}
            <div className="bg-gray-800/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">💾 Storage Breakdown</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Original Files</span>
                  <span className="text-white font-medium">
                    {formatFileSize(analysis.summary.totalOriginalSize)}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: '100%' }}
                  ></div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Transcoded Files</span>
                  <span className="text-white font-medium">
                    {formatFileSize(analysis.summary.totalTranscodedSize)}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ 
                      width: `${Math.round((analysis.summary.totalTranscodedSize / analysis.summary.totalOriginalSize) * 100)}%` 
                    }}
                  ></div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Potential Savings</span>
                  <span className="text-yellow-400 font-medium">
                    {formatFileSize(analysis.summary.spaceSavings)}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ 
                      width: `${Math.round((analysis.summary.spaceSavings / analysis.summary.totalOriginalSize) * 100)}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Issues Summary */}
            <div className="bg-gray-800/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">⚠️ Issues Found</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🔄</span>
                    <div>
                      <div className="text-white font-medium">Duplicate Files</div>
                      <div className="text-sm text-gray-400">Files with identical content</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">{analysis.summary.totalDuplicates}</div>
                    <div className="text-sm text-gray-400">files</div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">👻</span>
                    <div>
                      <div className="text-white font-medium">Orphaned Files</div>
                      <div className="text-sm text-gray-400">Files without database references</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">{analysis.summary.totalOrphans}</div>
                    <div className="text-sm text-gray-400">files</div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">💾</span>
                    <div>
                      <div className="text-white font-medium">Space Savings</div>
                      <div className="text-sm text-gray-400">Potential space to be freed</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">{formatFileSize(analysis.summary.spaceSavings)}</div>
                    <div className="text-sm text-gray-400">available</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Duplicate Analysis */}
          {analysis.duplicates && (
            <div className="bg-gray-800/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">🔄 Duplicate Analysis</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-400">
                    {analysis.duplicates.analysis?.duplicateGroupsCount || 0}
                  </div>
                  <div className="text-sm text-gray-400">Duplicate Groups</div>
                </div>
                <div className="text-center p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <div className="text-2xl font-bold text-orange-400">
                    {analysis.duplicates.analysis?.totalDuplicatesToDelete || 0}
                  </div>
                  <div className="text-sm text-gray-400">Database Duplicates</div>
                </div>
                <div className="text-center p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="text-2xl font-bold text-red-400">
                    {analysis.duplicates.analysis?.fsDuplicateFiles || 0}
                  </div>
                  <div className="text-sm text-gray-400">Filesystem Duplicates</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State - Only show if no progress bar is visible */}
      {isAnalyzing && analysisProgress === 0 && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <div className="text-white text-lg">Starting analysis...</div>
            <div className="text-gray-400 text-sm">Initializing storage scan</div>
          </div>
        </div>
      )}

             {/* Pie Chart Modal */}
       {showPieChart && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-2">
           <div className="bg-gray-900 rounded-xl shadow-2xl p-4 w-full max-w-5xl max-h-[90vh] overflow-y-auto relative">
             <button
               onClick={() => setShowPieChart(false)}
               className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl z-10 bg-gray-800 rounded-full w-7 h-7 flex items-center justify-center"
             >
               ×
             </button>
             
             <h2 className="text-xl font-bold text-white mb-4 text-center">📊 Storage Distribution Analysis</h2>
             
             {/* Main Content - Pie Chart Centered */}
             <div className="relative">
               {/* Pie Chart - Center and Large */}
               <div className="flex justify-center mb-4">
                 {renderPieChart()}
               </div>

               {/* Pie Chart Legend */}
               <div className="mt-6 mb-6">
                 <h4 className="text-lg font-bold text-white mb-4 text-center">Storage Breakdown</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                   {getPieChartData().map((item, index) => (
                     <div 
                       key={index}
                       className="flex items-center space-x-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:bg-gray-700/50 transition-colors cursor-pointer"
                       onClick={() => setSelectedCategory(item)}
                     >
                       <div 
                         className="w-4 h-4 rounded-full border-2 border-gray-600"
                         style={{ backgroundColor: item.color }}
                       ></div>
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center space-x-2">
                           <span className="text-lg">{item.icon}</span>
                           <span className="text-white font-medium truncate">{item.name}</span>
                         </div>
                         <div className="flex justify-between items-center mt-1">
                           <span className="text-gray-300 text-sm">
                             {item.percentage}%
                           </span>
                           <span className="text-blue-300 text-sm font-medium">
                             {formatFileSize(item.value)}
                           </span>
                         </div>
                         {item.count && (
                           <div className="text-gray-400 text-xs mt-1">
                             {item.count} files
                           </div>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>

                                {/* Comprehensive Breakdown */}
               <div className="mt-6 space-y-4">
                 {/* Total Files Summary */}
                 <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-lg p-4 border border-blue-500/30">
                   <div className="flex items-center space-x-3 mb-3">
                     <span className="text-2xl">📁</span>
                     <h4 className="text-lg font-bold text-blue-300">Total Files Found</h4>
                   </div>
                   <div className="text-3xl font-bold text-white text-center">
                     {(analysis?.storage?.original?.totalFiles || 0) + (analysis?.storage?.transcoded?.totalFiles || 0)}
                   </div>
                   <div className="text-sm text-blue-200 mt-2 text-center">
                     Original: {analysis?.storage?.original?.totalFiles || 0} | Transcoded: {analysis?.storage?.transcoded?.totalFiles || 0}
                   </div>
                 </div>

                 {/* Issues Breakdown */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Orphaned Data */}
                   <div className="bg-gradient-to-br from-red-500/10 to-red-600/10 rounded-lg p-4 border border-red-500/30">
                     <div className="flex items-center space-x-3 mb-3">
                       <span className="text-xl">🗑️</span>
                       <h4 className="text-base font-bold text-red-300">Orphaned Data</h4>
                     </div>
                     <div className="space-y-2">
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Orphaned Files:</span>
                         <span className="text-white font-bold text-lg">{analysis?.duplicates?.analysis?.orphanedTranscoded || 0}</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Orphaned Transcoded:</span>
                         <span className="text-white font-bold text-lg">{analysis?.duplicates?.analysis?.totalOrphanedFiles || 0}</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Total Orphaned:</span>
                         <span className="text-red-400 font-bold text-lg">
                           {(analysis?.duplicates?.analysis?.orphanedTranscoded || 0) + (analysis?.duplicates?.analysis?.totalOrphanedFiles || 0)}
                         </span>
                       </div>
                     </div>
                   </div>

                   {/* Duplicate Data */}
                   <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/10 rounded-lg p-4 border border-yellow-500/30">
                     <div className="flex items-center space-x-3 mb-3">
                       <span className="text-xl">🔄</span>
                       <h4 className="text-base font-bold text-yellow-300">Duplicate Data</h4>
                     </div>
                     <div className="space-y-2">
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Database Duplicates:</span>
                         <span className="text-white font-bold text-lg">{analysis?.duplicates?.analysis?.totalDuplicatesToDelete || 0}</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Filesystem Duplicates:</span>
                         <span className="text-white font-bold text-lg">{analysis?.duplicates?.analysis?.fsDuplicateFiles || 0}</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Transcoded Duplicates:</span>
                         <span className="text-white font-bold text-lg">{analysis?.duplicates?.analysis?.transcodedFsDuplicateFiles || 0}</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-gray-300 text-sm">Total Duplicates:</span>
                         <span className="text-yellow-400 font-bold text-lg">{analysis?.summary?.totalDuplicates || 0}</span>
                       </div>
                     </div>
                   </div>
                 </div>

                 {/* Content Type Breakdown */}
                 <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-lg p-4 border border-purple-500/30">
                   <div className="flex items-center space-x-3 mb-4">
                     <span className="text-xl">🎬</span>
                     <h4 className="text-lg font-bold text-purple-300">Content Breakdown</h4>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {/* Movies */}
                     <div className="space-y-3">
                       <h5 className="text-base font-bold text-purple-200 flex items-center">
                         <span className="text-lg mr-2">🎥</span>
                         Movies
                       </h5>
                       <div className="space-y-2">
                         <div className="flex justify-between items-center">
                           <span className="text-gray-300 text-sm">Movie Files:</span>
                           <span className="text-white font-bold">
                             {analysis?.storage?.contentBreakdown?.movies?.count || 0}
                           </span>
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-gray-300 text-sm">Movie Size:</span>
                           <span className="text-white font-bold">
                             {formatFileSize(analysis?.storage?.contentBreakdown?.movies?.size || 0)}
                           </span>
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-gray-300 text-sm">Sample Movies:</span>
                           <span className="text-white font-bold text-xs">
                             {analysis?.storage?.contentBreakdown?.movies?.files?.slice(0, 3).map(f => f.title).join(', ') || 'None'}
                           </span>
                         </div>
                       </div>
                     </div>

                     {/* TV Shows */}
                     <div className="space-y-3">
                       <h5 className="text-base font-bold text-purple-200 flex items-center">
                         <span className="text-lg mr-2">📺</span>
                         TV Shows
                       </h5>
                       <div className="space-y-2">
                         <div className="flex justify-between items-center">
                           <span className="text-gray-300 text-sm">TV Show Files:</span>
                           <span className="text-white font-bold">
                             {analysis?.storage?.contentBreakdown?.tvShows?.count || 0}
                           </span>
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-gray-300 text-sm">TV Show Size:</span>
                           <span className="text-white font-bold">
                             {formatFileSize(analysis?.storage?.contentBreakdown?.tvShows?.size || 0)}
                           </span>
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-gray-300 text-sm">Sample Shows:</span>
                           <span className="text-white font-bold text-xs">
                             {analysis?.storage?.contentBreakdown?.tvShows?.files?.slice(0, 3).map(f => f.show_title || f.title).join(', ') || 'None'}
                           </span>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>

             </div>
           </div>
         </div>
       )}

      {/* Category Details Modal */}
      {selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-gray-900 rounded-xl shadow-2xl p-8 w-full max-w-2xl relative">
            <button
              onClick={() => setSelectedCategory(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
            
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">{selectedCategory.icon}</div>
              <h2 className="text-2xl font-bold text-white">{selectedCategory.name}</h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{selectedCategory.percentage}%</div>
                    <div className="text-gray-300 text-sm">of total storage</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{formatFileSize(selectedCategory.value)}</div>
                    <div className="text-gray-300 text-sm">total size</div>
                  </div>
                </div>
              </div>
              
              {selectedCategory.count && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">{selectedCategory.count}</div>
                    <div className="text-gray-300 text-sm">files</div>
                  </div>
                </div>
              )}
              
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">Details</h3>
                <div className="space-y-2 text-sm text-gray-300">
                  {selectedCategory.name === 'Movies' && (
                    <>
                      <div>• Video files categorized as movies</div>
                      <div>• Typically feature-length content</div>
                      <div>• Stored in original quality</div>
                    </>
                  )}
                  {selectedCategory.name === 'TV Shows' && (
                    <>
                      <div>• Episodic content with seasons</div>
                      <div>• Organized by show title and episode</div>
                      <div>• May include multiple quality versions</div>
                    </>
                  )}
                  {selectedCategory.name === 'Original Files' && (
                    <>
                      <div>• Source files as uploaded</div>
                      <div>• Highest quality available</div>
                      <div>• May be large in size</div>
                    </>
                  )}
                  {selectedCategory.name === 'Transcoded Files' && (
                    <>
                      <div>• Compressed versions for streaming</div>
                      <div>• Optimized for different devices</div>
                      <div>• Smaller file sizes</div>
                    </>
                  )}
                  {selectedCategory.name === 'Duplicate Files' && (
                    <>
                      <div>• Identical or similar files</div>
                      <div>• Wastes storage space</div>
                      <div>• Can be safely removed</div>
                    </>
                  )}
                  {selectedCategory.name === 'Orphaned Files' && (
                    <>
                      <div>• Files not linked to database</div>
                      <div>• May be leftover from deletions</div>
                      <div>• Safe to remove if confirmed</div>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedCategory(null)}
                className="btn-modern bg-blue-600 hover:bg-blue-700 text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Export Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-gray-900 rounded-xl shadow-2xl p-8 w-full max-w-4xl relative">
            <button
              onClick={() => setShowCsvModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
            
            <h2 className="text-2xl font-bold text-white mb-6">📄 CSV Export Preview</h2>
            
            <div className="bg-gray-800 rounded-lg p-4 mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    {csvData?.[0]?.map((header, index) => (
                      <th key={index} className="text-left p-2 text-gray-300 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData?.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-gray-700">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="p-2 text-gray-200">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowCsvModal(false)}
                className="btn-modern bg-gray-600 hover:bg-gray-700 text-white"
              >
                Cancel
              </button>
              <button
                onClick={downloadCsv}
                className="btn-modern bg-green-600 hover:bg-green-700 text-white"
              >
                📥 Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Cleanup Modal */}
      {showDuplicateCleanup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] relative overflow-hidden">
            <button
              onClick={() => setShowDuplicateCleanup(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl z-10"
            >
              ×
            </button>
            
            <div className="h-full overflow-y-auto p-6">
              <h2 className="text-2xl font-bold text-white mb-6">🧹 Duplicate Cleanup</h2>
              <DuplicateCleanup 
                onAnalysisComplete={() => {
                  // Refresh analysis after cleanup
                  analyzeStorage();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageAnalysis; 