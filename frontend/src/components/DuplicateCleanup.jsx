import React, { useState } from 'react';
import { formatFileSize, formatDate } from '../utils/formatters';

const DuplicateCleanup = ({ onAnalysisComplete, onDetailedAnalytics }) => {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupResults, setCleanupResults] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);
  const [orphanDeleteLoading, setOrphanDeleteLoading] = useState({});
  const [orphanDeleteResult, setOrphanDeleteResult] = useState({});
  const [orphanHardDelete, setOrphanHardDelete] = useState({});

  const testAdminEndpoint = async () => {
    try {
      const token = sessionStorage.getItem('token');
      
      const response = await fetch('/api/admin/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Admin endpoint test failed:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      setTestResult(data);
      
    } catch (error) {
      console.error('Admin endpoint test error:', error);
      setTestResult({ error: error.message });
    }
  };

  const analyzeDuplicates = async () => {
    setIsAnalyzing(true);
    try {
      const token = sessionStorage.getItem('token');
      
      const response = await fetch('/api/admin/cleanup/analyze-duplicates', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      setAnalysis(data);
      
      // Call the callback to update parent component
      if (onAnalysisComplete) {
        onAnalysisComplete(data);
      }
    } catch (error) {
      console.error('Error analyzing duplicates:', error);
      alert(`Error analyzing duplicates: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executeDuplicateCleanup = async () => {
    if (!analysis || analysis.analysis.totalDuplicatesToDelete === 0) return;
    
    const confirmed = window.confirm(
      `⚠️ WARNING: This will permanently delete ${analysis.analysis.totalDuplicatesToDelete} duplicate media files and their associated data.\n\n` +
      `This action CANNOT be undone. Are you sure you want to proceed?`
    );
    
    if (!confirmed) return;
    
    setIsCleaningUp(true);
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/admin/cleanup/remove-duplicates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmed: true }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setCleanupResults(data.results);
      
      // Re-run analysis to show updated state
      setTimeout(() => {
        analyzeDuplicates();
      }, 1000);
      
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      alert(`Error cleaning up duplicates: ${error.message}`);
    } finally {
      setIsCleaningUp(false);
    }
  };

  // Using shared formatters from utils/formatters.js

  // Place the delete button at the top, always visible, but only enabled after analysis and if duplicates exist
  const totalDuplicates = (analysis?.totalDuplicatesToDelete || 0) + (analysis?.fsDuplicateFiles || 0) + (analysis?.analysis?.transcodedFsDuplicateFiles || 0);
  const canDelete = analysis && totalDuplicates > 0 && !deleteLoading;

  const handleDeleteDuplicates = async () => {
    setDeleteLoading(true);
    setDeleteResult(null);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/admin/cleanup/remove-duplicates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmed: true })
      });
      const data = await res.json();
      setDeleteResult(data);
      // Refresh analysis after deletion
      await analyzeDuplicates();
    } catch (e) {
      setDeleteResult({ error: 'Failed to delete duplicates' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteOrphanedTranscoded = async (transcodedPath, hardDelete = false) => {
    setOrphanDeleteLoading((prev) => ({ ...prev, [transcodedPath]: true }));
    setOrphanDeleteResult((prev) => ({ ...prev, [transcodedPath]: null }));
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/admin/cleanup/delete-orphaned-transcoded', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transcodedPath, hardDelete })
      });
      const data = await res.json();
      setOrphanDeleteResult((prev) => ({ ...prev, [transcodedPath]: data.success ? 'Deleted' : (data.error || 'Error') }));
      // Refresh analysis after deletion
      await analyzeDuplicates();
    } catch (e) {
      setOrphanDeleteResult((prev) => ({ ...prev, [transcodedPath]: 'Error' }));
    } finally {
      setOrphanDeleteLoading((prev) => ({ ...prev, [transcodedPath]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        {/* Primary Analyze Button */}
        <div className="mb-4">
          <button
            onClick={analyzeDuplicates}
            disabled={isAnalyzing}
            className={`btn-modern px-4 py-3 sm:px-6 sm:py-3 text-sm sm:text-base font-medium w-full ${
              isAnalyzing 
                ? 'bg-slate-600 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                Analyzing...
              </>
            ) : (
              '🔍 Analyze Duplicates'
            )}
          </button>
        </div>

        {/* Test Results */}
        {testResult && (
          <div className="mb-4">
            {testResult.error ? (
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                <h4 className="text-red-200 font-medium mb-2">❌ Test Failed</h4>
                <p className="text-red-300 text-sm">{testResult.error}</p>
              </div>
            ) : (
              <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4">
                <h4 className="text-green-200 font-medium mb-2">✅ Test Successful</h4>
                <p className="text-green-300 text-sm">
                  {testResult.message} - User: {testResult.user}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Analysis Results - Comprehensive Summary */}
        {analysis && (
          <div className="mt-6">
            <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 rounded-xl p-6 border border-slate-600/50">
              <h4 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="text-2xl mr-3">📊</span>
                Analysis Complete
              </h4>
              
              {/* Summary Statistics - Mobile optimized */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="bg-slate-700/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-blue-400">
                    {analysis.analysis?.totalMedia || 0}
                  </div>
                  <div className="text-slate-300 text-xs sm:text-sm">Files Analyzed</div>
                </div>
                
                <div className="bg-slate-700/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-amber-400">
                    {(analysis.duplicates?.length || 0) + (analysis.analysis?.duplicateGroups || 0)}
                  </div>
                  <div className="text-slate-300 text-xs sm:text-sm">Database Duplicates</div>
                </div>
                
                <div className="bg-slate-700/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-red-400">
                    {(analysis.orphanedTranscoded?.length || 0) + (analysis.transcodedOrphans?.length || 0)}
                  </div>
                  <div className="text-slate-300 text-xs sm:text-sm">Orphaned Files</div>
                </div>
                
                <div className="bg-slate-700/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-purple-400">
                    {(analysis.fsDuplicates?.length || 0) + (analysis.transcodedFsDuplicates?.length || 0)}
                  </div>
                  <div className="text-slate-300 text-xs sm:text-sm">Filesystem Duplicates</div>
                </div>
              </div>

              {/* Analysis Summary - Mobile optimized */}
              <div className="space-y-2 sm:space-y-3 mb-6">
                <div className="flex items-start text-slate-300 text-sm sm:text-base">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-2 sm:mr-3 mt-2 flex-shrink-0"></span>
                  <span>Scanned <strong className="text-white">{analysis.analysis?.totalMedia || 0}</strong> media files and <strong className="text-white">{analysis.analysis?.totalTranscoded || 0}</strong> transcoded files</span>
                </div>
                
                <div className="flex items-start text-slate-300 text-sm sm:text-base">
                  <span className="w-2 h-2 bg-amber-400 rounded-full mr-2 sm:mr-3 mt-2 flex-shrink-0"></span>
                  <span>Found <strong className="text-white">{(analysis.duplicates?.length || 0)}</strong> database duplicate groups with <strong className="text-white">{analysis.analysis?.totalDuplicatesToDelete || 0}</strong> files to clean</span>
                </div>
                
                <div className="flex items-start text-slate-300 text-sm sm:text-base">
                  <span className="w-2 h-2 bg-red-400 rounded-full mr-2 sm:mr-3 mt-2 flex-shrink-0"></span>
                  <span>Identified <strong className="text-white">{(analysis.orphanedTranscoded?.length || 0) + (analysis.transcodedOrphans?.length || 0)}</strong> orphaned transcoded files without originals</span>
                </div>
                
                <div className="flex items-start text-slate-300 text-sm sm:text-base">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-2 sm:mr-3 mt-2 flex-shrink-0"></span>
                  <span>Detected <strong className="text-white">{(analysis.fsDuplicates?.length || 0) + (analysis.transcodedFsDuplicates?.length || 0)}</strong> filesystem duplicate groups with <strong className="text-white">{(analysis.analysis?.fsDuplicateFiles || 0) + (analysis.analysis?.transcodedFsDuplicateFiles || 0)}</strong> redundant files</span>
                </div>
                
                <div className="flex items-start text-slate-300 text-sm sm:text-base">
                  <span className="w-2 h-2 bg-orange-400 rounded-full mr-2 sm:mr-3 mt-2 flex-shrink-0"></span>
                  <span><strong className="text-white">Total cleanup opportunity:</strong> <strong className="text-orange-400">{analysis.analysis?.totalAllDuplicates || 0}</strong> files can be safely removed</span>
                </div>
              </div>

              {/* Call to Action */}
              <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-lg p-4 border border-blue-500/30">
                <div className="flex items-start space-x-4">
                  <div className="text-3xl">📈</div>
                  <div className="flex-1">
                    <h5 className="text-lg font-semibold text-white mb-2">View Detailed Analytics</h5>
                    <p className="text-slate-300 text-sm mb-3">
                      Get comprehensive insights with visual breakdowns and actionable cleanup options.
                    </p>
                    <div className="space-y-2 text-xs text-slate-400 mb-4">
                      <div className="flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                        <span><strong>Interactive Pie Chart:</strong> Visual storage breakdown with deletion controls</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                        <span><strong>CSV Export:</strong> Detailed file lists for each duplicate and orphan found</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        // Trigger the detailed analytics modal from the parent component
                        if (onDetailedAnalytics) {
                          onDetailedAnalytics();
                        }
                      }}
                      className="btn-modern bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 text-sm font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25"
                    >
                      📊 Open Detailed Analytics
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons - Only show after analysis */}
        {analysis && (
          <div className="mt-6">
            <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 rounded-xl p-6 border border-slate-600/50">
              <h4 className="text-lg font-bold text-white mb-4 flex items-center">
                <span className="text-xl mr-3">⚡</span>
                Cleanup Actions
              </h4>
              
              {/* Primary action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={async () => {
                    if (!confirm('This will synchronize your database with filesystem files. Continue?')) return;
                    try {
                      const token = sessionStorage.getItem('token');
                      const response = await fetch('/api/admin/diagnostic/fix-protection', {
                        method: 'POST',
                        headers: { 
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json'
                        }
                      });
                      const data = await response.json();
                      console.log('🔧 Auto-Fix Results:', data);
                      alert(`Auto-Fix Complete!\n\n${data.message}\n\nFixed: ${data.results.fixed}\nErrors: ${data.results.errors}\n\nCheck console for details.`);
                    } catch (error) {
                      console.error('Auto-fix error:', error);
                      alert('Error running auto-fix - check console');
                    }
                  }}
                  className="btn-modern bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 text-sm font-medium"
                >
                  🔧 Fix Protection
                </button>
                
                <button
                  onClick={async () => {
                    try {
                      const token = sessionStorage.getItem('token');
                      const response = await fetch('/api/admin/diagnostic/protection-status', {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      const data = await response.json();
                      console.log('🛡️ Protection Status:', data);
                      
                      // Show detailed comparison in console
                      if (data.details) {
                        console.log('\n📊 DATABASE ENTRIES:');
                        data.details.database_entries.forEach((db, i) => {
                          console.log(`${i+1}. ${db.original_filename}`);
                          console.log(`   Path: ${db.file_path}`);
                          console.log(`   Normalized: ${db.normalized}`);
                          console.log(`   Resolution: ${db.resolution}`);
                          console.log(`   Hash: ${db.hash ? db.hash.substring(0, 16) + '...' : 'null'}`);
                          console.log(`   Exists: ${db.file_exists}`);
                          console.log('');
                        });
                        
                        console.log('\n📁 FILESYSTEM FILES:');
                        data.details.filesystem_files.forEach((fs, i) => {
                          console.log(`${i+1}. ${fs.filename}`);
                          console.log(`   Path: ${fs.file_path}`);
                          console.log(`   Normalized: ${fs.normalized}`);
                          console.log(`   Resolution: ${fs.resolution}`);
                          console.log(`   Hash: ${fs.hash ? fs.hash.substring(0, 16) + '...' : 'null'}`);
                          console.log(`   In DB: ${fs.in_database}`);
                          console.log('');
                        });
                        
                        if (data.details.mismatches.length > 0) {
                          console.log('\n❌ MISMATCHES (Files that should match but don\'t):');
                          data.details.mismatches.forEach((mismatch, i) => {
                            console.log(`${i+1}. ${mismatch.filename} - Not found in database`);
                          });
                        }
                      }
                      
                      alert(`Protection Diagnostic:\n\nDB Entries: ${data.summary.total_db_entries}\nFS Files: ${data.summary.total_fs_files}\nMatches: ${data.summary.perfect_matches}\nOrphaned: ${data.summary.fs_files_orphaned}\n\nCheck console for detailed comparison!`);
                    } catch (error) {
                      console.error('Diagnostic error:', error);
                      alert('Error running diagnostic - check console');
                    }
                  }}
                  className="btn-modern bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 text-sm font-medium"
                >
                  🛡️ Check Protection
                </button>
              </div>
              
              {/* Secondary diagnostic buttons */}
              <div className="flex justify-center">
                <button
                  onClick={testAdminEndpoint}
                  className="btn-modern bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-xs font-medium"
                >
                  🧪 Test Endpoint
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cleanup Results - Mobile optimized */}
        {cleanupResults && (
          <div className="mt-6 bg-slate-900 rounded-lg p-4 sm:p-6">
            <h4 className="text-lg sm:text-xl font-semibold text-white mb-4">Cleanup Results</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-green-900/30 rounded p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-green-400">{cleanupResults.duplicatesDeleted}</div>
                <div className="text-green-300 text-xs sm:text-sm">Duplicates Deleted</div>
              </div>
              <div className="bg-red-900/30 rounded p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-red-400">{cleanupResults.errors}</div>
                <div className="text-red-300 text-xs sm:text-sm">Errors</div>
              </div>
              <div className="bg-blue-900/30 rounded p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-blue-400">{formatFileSize(cleanupResults.totalSpaceCleaned)}</div>
                <div className="text-blue-300 text-xs sm:text-sm">Space Cleaned</div>
              </div>
              <div className="bg-orange-900/30 rounded p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-orange-400">{cleanupResults.orphanedTranscodedCleaned}</div>
                <div className="text-orange-300 text-xs sm:text-sm">Orphaned Files</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DuplicateCleanup; 