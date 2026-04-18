import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
import CombinedInput from '../components/input/CombinedInput';
import FloorPlanViewer from '../components/viewer2d/FloorPlanViewer';
import ThreeViewer from '../components/viewer3d/ThreeViewer';
import { apiGetProject, apiGetSpatialModel, apiGetJobStatus, getExportUrl } from '../services/api';

type ViewTab = 'upload' | '2d' | '3d';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const {
    currentProject,
    setCurrentProject,
    spatialModel,
    setSpatialModel,
    activeView,
    setActiveView,
    activeJob,
    setActiveJob,
  } = useProjectStore();

  const [loading, setLoading] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const pollRef = useRef<number | null>(null);

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (mainRef.current) {
        const rect = mainRef.current.getBoundingClientRect();
        const hasSidebar = (activeView === '2d' || activeView === '3d') && spatialModel;
        setContainerSize({
          width: rect.width - (hasSidebar ? 288 : 0),
          height: rect.height,
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeView, spatialModel]);

  useEffect(() => {
    fetchProject();
    return () => {
      setCurrentProject(null);
      setSpatialModel(null);
      setActiveJob(null);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId]);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const project = await apiGetProject(projectId!);
      setCurrentProject(project);

      if (project.has_spatial_model) {
        try {
          const modelData = await apiGetSpatialModel(projectId!);
          setSpatialModel(modelData.model_data);
          setActiveView('2d');
        } catch {
          setActiveView('upload');
        }
      } else {
        setActiveView('upload');
      }

      // If processing, start polling
      if (project.status === 'processing' && project.latest_job) {
        startPolling(project.latest_job.id);
      }
    } catch (err) {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    setActiveJob({
      id: jobId,
      status: 'queued',
      progress: 0,
      current_stage: 'queued',
      stages: [],
    });

    pollRef.current = window.setInterval(async () => {
      try {
        const job = await apiGetJobStatus(projectId!, jobId);
        setActiveJob({
          id: job.id,
          status: job.status,
          progress: job.progress,
          current_stage: job.current_stage || job.status,
          stages: job.stages || [],
        });

        if (job.status === 'completed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          // Reload project + spatial model
          const project = await apiGetProject(projectId!);
          setCurrentProject(project);
          if (project.has_spatial_model) {
            const modelData = await apiGetSpatialModel(projectId!);
            setSpatialModel(modelData.model_data);
          }
          setTimeout(() => {
            setActiveJob(null);
            setActiveView('2d');
          }, 800);
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          const project = await apiGetProject(projectId!);
          setCurrentProject(project);
          setTimeout(() => setActiveJob(null), 3000);
        }
      } catch {
        // Ignore polling errors
      }
    }, 1500);
  }, [projectId]);

  const handleProcessStart = useCallback((jobId: string) => {
    startPolling(jobId);
  }, [startPolling]);

  const handlePromptGenerated = useCallback(async (modelData: any) => {
    setSpatialModel(modelData);
    // Reload project to get updated status/stats
    try {
      const project = await apiGetProject(projectId!);
      setCurrentProject(project);
    } catch {}
    // Auto-switch to 2D view after a brief delay
    setTimeout(() => setActiveView('2d'), 500);
  }, [projectId]);

  const getStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
      processing: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
      uploaded: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
      draft: 'bg-white/5 text-white/40 ring-1 ring-white/10',
      failed: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
    };
    return styles[status] || styles.draft;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full" />
      </div>
    );
  }

  const isProcessing = activeJob && !['completed', 'failed'].includes(activeJob.status);

  const VIEW_TABS: { key: ViewTab; label: string; icon: string }[] = [
    {
      key: 'upload',
      label: 'Input',
      icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
    },
    {
      key: '2d',
      label: '2D Plan',
      icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
    },
    {
      key: '3d',
      label: '3D View',
      icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur-lg px-6 py-3 flex items-center justify-between z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-white/30 hover:text-white/60 transition flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="w-px h-5 bg-white/10" />
          <h1 className="text-base font-semibold text-white">
            {currentProject?.name || 'Project'}
          </h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusStyle(currentProject?.status || 'draft')}`}>
            {currentProject?.status || 'draft'}
          </span>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                activeView === tab.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-white/40 hover:text-white/60'
              }`}
              onClick={() => setActiveView(tab.key as ViewTab)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Export */}
        <div className="flex items-center gap-3">
          {spatialModel && (
            <select
              className="text-xs bg-white/5 border border-white/10 text-white/60 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                if (e.target.value) {
                  const url = getExportUrl(projectId!, e.target.value);
                  window.open(url, '_blank');
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Export ↓</option>
              <option value="svg">SVG (2D Plan)</option>
              <option value="json">JSON (Spatial Model)</option>
            </select>
          )}
        </div>
      </header>

      {/* Processing Progress Bar */}
      {isProcessing && (
        <div className="bg-blue-500/5 border-b border-blue-500/10 px-6 py-3">
          <div className="flex items-center gap-4 max-w-3xl mx-auto">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-blue-400 flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {activeJob!.current_stage?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
                <span className="text-xs text-blue-300/60">{Math.round(activeJob!.progress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-blue-500/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${activeJob!.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failed job message */}
      {activeJob?.status === 'failed' && (
        <div className="bg-red-500/5 border-b border-red-500/10 px-6 py-3 text-center">
          <span className="text-sm text-red-400">Processing failed. Please try again or use the Prompt generator.</span>
        </div>
      )}

      {/* Main Content */}
      <main ref={mainRef} className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative overflow-auto">
          {activeView === 'upload' && (
            <CombinedInput
              projectId={projectId!}
              onUploadComplete={() => fetchProject()}
              onProcessStart={handleProcessStart}
              onPromptGenerated={handlePromptGenerated}
            />
          )}

          {activeView === '2d' && (
            spatialModel ? (
              <FloorPlanViewer
                spatialModel={spatialModel}
                width={containerSize.width}
                height={containerSize.height}
                editable={true}
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-center p-8">
                <div>
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <svg className="w-10 h-10 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-white/40">No floor plan yet</p>
                  <p className="text-sm text-white/25 mt-1 max-w-sm">
                    Upload an image on the <strong>Upload</strong> tab and process it, or use the <strong>Prompt</strong> tab to generate from a description
                  </p>
                </div>
              </div>
            )
          )}

          {activeView === '3d' && (
            <ThreeViewer
              spatialModel={spatialModel}
              modelUrl={undefined}
            />
          )}
        </div>

        {/* Properties Sidebar */}
        {(activeView === '2d' || activeView === '3d') && spatialModel && (
          <aside className="w-72 bg-white/[0.02] border-l border-white/[0.06] p-5 overflow-y-auto flex-shrink-0">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">Project Stats</h3>

            {currentProject?.spatial_model_stats && (
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Walls', value: currentProject.spatial_model_stats.wall_count, color: 'text-white' },
                  { label: 'Rooms', value: currentProject.spatial_model_stats.room_count, color: 'text-blue-400' },
                  { label: 'Doors', value: currentProject.spatial_model_stats.door_count, color: 'text-amber-400' },
                  { label: 'Windows', value: currentProject.spatial_model_stats.window_count, color: 'text-cyan-400' },
                ].map((stat) => (
                  <div key={stat.label} className="flex justify-between items-center">
                    <span className="text-white/40">{stat.label}</span>
                    <span className={`font-medium ${stat.color}`}>{stat.value}</span>
                  </div>
                ))}

                <div className="border-t border-white/5 pt-3 mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/40">Total Area</span>
                    <span className="font-medium text-white">
                      {currentProject.spatial_model_stats.total_area_sqm?.toFixed(1)} m²
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/40">Confidence</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(currentProject.spatial_model_stats.average_confidence || 0) * 100}%` }}
                        />
                      </div>
                      <span className="font-medium text-emerald-400 text-xs">
                        {((currentProject.spatial_model_stats.average_confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Room breakdown */}
                {spatialModel?.floors?.[0]?.rooms && spatialModel.floors[0].rooms.length > 0 && (
                  <div className="border-t border-white/5 pt-3 mt-3">
                    <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Rooms</h4>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {spatialModel.floors[0].rooms.map((room: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <span className="text-white/50 truncate mr-2">{room.label}</span>
                          <span className="text-white/70 flex-shrink-0">{room.area_sqm?.toFixed(1)} m²</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source info */}
                {spatialModel?.metadata?.source && (
                  <div className="border-t border-white/5 pt-3 mt-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-white/30">Source</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        spatialModel.metadata.source === 'prompt-generator'
                          ? 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20'
                          : 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20'
                      }`}>
                        {spatialModel.metadata.source === 'prompt-generator' ? 'Prompt' : 'Image Processing'}
                      </span>
                    </div>
                    {spatialModel.metadata.prompt && (
                      <p className="text-[10px] text-white/20 mt-2 italic leading-relaxed">
                        "{spatialModel.metadata.prompt}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
