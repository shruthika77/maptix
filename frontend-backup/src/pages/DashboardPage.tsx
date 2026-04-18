import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiListProjects, apiCreateProject, apiDeleteProject } from '../services/api';
import type { Project } from '../stores/projectStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiListProjects();
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const project = await apiCreateProject(newProjectName);
      setShowNewProject(false);
      setNewProjectName('');
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;
    try {
      await apiDeleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch {}
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
      processing: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
      uploaded: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
      draft: 'bg-gray-500/10 text-gray-400 ring-gray-500/20',
      failed: 'bg-red-500/10 text-red-400 ring-red-500/20',
    };
    return styles[status] || styles.draft;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/50 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">Maptix 3D</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 font-medium">
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/40">{user?.name}</span>
            <button onClick={logout} className="text-sm text-white/40 hover:text-white/70 transition">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Projects', value: projects.length, icon: '📁' },
            { label: 'Completed', value: projects.filter((p) => p.status === 'completed').length, icon: '✅' },
            { label: 'Processing', value: projects.filter((p) => p.status === 'processing').length, icon: '⚡' },
            { label: 'Total Area Mapped', value: `${projects.reduce((s, p) => s + (p.spatial_model_stats?.total_area_sqm || 0), 0).toFixed(0)} m²`, icon: '📐' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{stat.icon}</span>
                <span className="text-xs text-white/40 font-medium uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {error}
            <button onClick={fetchProjects} className="ml-3 underline">Retry</button>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Your Projects</h2>
          <button
            onClick={() => setShowNewProject(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {showNewProject && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-lg font-semibold text-white mb-4">Create New Project</h3>
              <input
                type="text"
                placeholder="Project name (e.g., My Apartment)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createProject()}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setShowNewProject(false); setNewProjectName(''); }} className="px-4 py-2 text-white/50 hover:text-white/70 transition">Cancel</button>
                <button onClick={createProject} disabled={!newProjectName.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition disabled:opacity-50">Create</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full mx-auto mb-4" />
            <p className="text-white/40">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-lg text-white/50">No projects yet</p>
            <p className="text-sm text-white/30 mt-1">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="group bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200 relative"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, project.id)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-white/20 hover:text-red-400 p-1"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>

                <div className="w-full h-32 rounded-lg bg-gradient-to-br from-slate-800 to-slate-700 mb-4 flex items-center justify-center overflow-hidden">
                  {project.has_spatial_model ? (
                    <svg className="w-16 h-16 text-white/10" viewBox="0 0 100 80" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="10" y="5" width="80" height="70" rx="2" />
                      <line x1="45" y1="5" x2="45" y2="35" />
                      <line x1="10" y1="35" x2="90" y2="35" />
                      <line x1="10" y1="50" x2="90" y2="50" />
                      <line x1="55" y1="50" x2="55" y2="75" />
                    </svg>
                  ) : (
                    <svg className="w-12 h-12 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </div>
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-white group-hover:text-blue-300 transition">{project.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 font-medium ${getStatusBadge(project.status)}`}>{project.status}</span>
                </div>
                <p className="text-xs text-white/30 mt-2">
                  {project.file_count || 0} file{(project.file_count || 0) !== 1 ? 's' : ''} • {project.updated_at ? new Date(project.updated_at).toLocaleDateString() : ''}
                </p>
                <div className="flex gap-2 mt-3">
                  {project.has_spatial_model && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 px-2 py-0.5 rounded-full font-medium">2D Plan</span>
                  )}
                  {project.has_3d_model && (
                    <span className="text-[10px] bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20 px-2 py-0.5 rounded-full font-medium">3D Model</span>
                  )}
                  {project.spatial_model_stats?.total_area_sqm > 0 && (
                    <span className="text-[10px] text-white/30">{project.spatial_model_stats.total_area_sqm.toFixed(0)} m²</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
