/**
 * Project state management using Zustand — LIVE MODE.
 */

import { create } from 'zustand';

export interface Project {
  id: string;
  name: string;
  description?: string;
  building_type: string;
  status: string;
  files: any[];
  file_count?: number;
  has_spatial_model: boolean;
  has_3d_model: boolean;
  created_at: string;
  updated_at: string;
  latest_job?: any;
  spatial_model_stats: {
    wall_count: number;
    room_count: number;
    door_count: number;
    window_count: number;
    total_area_sqm: number;
    average_confidence: number;
  };
}

interface ProcessingJob {
  id: string;
  status: string;
  progress: number;
  current_stage: string;
  stages: any[];
}

interface ProjectState {
  currentProject: Project | null;
  spatialModel: any | null;
  activeJob: ProcessingJob | null;
  activeView: '2d' | '3d' | 'upload' | 'prompt';
  selectedElement: any | null;

  setCurrentProject: (project: Project | null) => void;
  setSpatialModel: (model: any | null) => void;
  setActiveJob: (job: ProcessingJob | null) => void;
  setActiveView: (view: '2d' | '3d' | 'upload' | 'prompt') => void;
  setSelectedElement: (element: any | null) => void;
  updateJobProgress: (progress: number, stage: string) => void;
}

export const useProjectStore = create<ProjectState>()((set) => ({
  currentProject: null,
  spatialModel: null,
  activeJob: null,
  activeView: 'upload',
  selectedElement: null,

  setCurrentProject: (project) => set({ currentProject: project }),
  setSpatialModel: (model) => set({ spatialModel: model }),
  setActiveJob: (job) => set({ activeJob: job }),
  setActiveView: (view) => set({ activeView: view }),
  setSelectedElement: (element) => set({ selectedElement: element }),
  updateJobProgress: (progress, stage) =>
    set((state) => ({
      activeJob: state.activeJob
        ? { ...state.activeJob, progress, current_stage: stage }
        : null,
    })),
}));
