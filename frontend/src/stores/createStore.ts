/**
 * Create Flow Store — manages the input-first creation pipeline state.
 */

import { create } from 'zustand';

export type InputMode = 'upload' | 'prompt' | 'manual';
export type CreateStage = 'input' | 'processing' | 'result';

export interface RoomEntry {
  id: string;
  name: string;
  type: string;
  width?: number;
  length?: number;
  count: number;
}

export interface FloorEntry {
  id: string;
  level: number;
  label: string;
  rooms: RoomEntry[];
  height_m: number;
}

export interface ManualFormData {
  buildingType: string;
  totalFloors: number;
  plotWidth?: number;
  plotLength?: number;
  wallHeight: number;
  floors: FloorEntry[];
}

export interface ProcessingStage {
  name: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: number;
}

interface CreateState {
  // Current input mode tab
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;

  // Current stage of the create flow
  stage: CreateStage;
  setStage: (stage: CreateStage) => void;

  // Upload state
  uploadedFiles: File[];
  addFiles: (files: File[]) => void;
  removeFile: (name: string) => void;
  clearFiles: () => void;

  // Prompt state
  promptText: string;
  setPromptText: (text: string) => void;
  promptBuildingType: string;
  setPromptBuildingType: (type: string) => void;

  // Manual form state
  manualForm: ManualFormData;
  setManualForm: (data: Partial<ManualFormData>) => void;
  addFloor: () => void;
  removeFloor: (id: string) => void;
  addRoom: (floorId: string, room: RoomEntry) => void;
  removeRoom: (floorId: string, roomId: string) => void;

  // Processing state
  isProcessing: boolean;
  processingProgress: number;
  processingStages: ProcessingStage[];
  setProcessing: (processing: boolean) => void;
  setProcessingProgress: (progress: number) => void;
  setProcessingStages: (stages: ProcessingStage[]) => void;

  // Result
  generatedModel: any | null;
  setGeneratedModel: (model: any) => void;

  // Reset
  resetAll: () => void;
}

const defaultManualForm: ManualFormData = {
  buildingType: 'residential',
  totalFloors: 1,
  plotWidth: undefined,
  plotLength: undefined,
  wallHeight: 3.0,
  floors: [
    {
      id: 'floor-0',
      level: 0,
      label: 'Ground Floor',
      height_m: 3.0,
      rooms: [],
    },
  ],
};

const defaultProcessingStages: ProcessingStage[] = [
  { name: 'parsing', label: 'Parsing Input', status: 'pending', progress: 0 },
  { name: 'ai_analysis', label: 'AI Analysis (Meta Llama 3)', status: 'pending', progress: 0 },
  { name: 'extraction', label: 'Feature Extraction', status: 'pending', progress: 0 },
  { name: 'spatial', label: 'Spatial Model', status: 'pending', progress: 0 },
  { name: 'map2d', label: '2D Map Generation', status: 'pending', progress: 0 },
  { name: 'model3d', label: '3D Model Generation', status: 'pending', progress: 0 },
];

export const useCreateStore = create<CreateState>()((set, get) => ({
  inputMode: 'upload',
  setInputMode: (mode) => set({ inputMode: mode }),

  stage: 'input',
  setStage: (stage) => set({ stage }),

  uploadedFiles: [],
  addFiles: (files) => set((state) => ({ uploadedFiles: [...state.uploadedFiles, ...files] })),
  removeFile: (name) => set((state) => ({ uploadedFiles: state.uploadedFiles.filter((f) => f.name !== name) })),
  clearFiles: () => set({ uploadedFiles: [] }),

  promptText: '',
  setPromptText: (text) => set({ promptText: text }),
  promptBuildingType: 'residential',
  setPromptBuildingType: (type) => set({ promptBuildingType: type }),

  manualForm: defaultManualForm,
  setManualForm: (data) =>
    set((state) => ({ manualForm: { ...state.manualForm, ...data } })),
  addFloor: () =>
    set((state) => {
      const nextLevel = state.manualForm.floors.length;
      return {
        manualForm: {
          ...state.manualForm,
          totalFloors: state.manualForm.totalFloors + 1,
          floors: [
            ...state.manualForm.floors,
            {
              id: `floor-${nextLevel}`,
              level: nextLevel,
              label: `Floor ${nextLevel}`,
              height_m: 3.0,
              rooms: [],
            },
          ],
        },
      };
    }),
  removeFloor: (id) =>
    set((state) => ({
      manualForm: {
        ...state.manualForm,
        totalFloors: Math.max(1, state.manualForm.totalFloors - 1),
        floors: state.manualForm.floors.filter((f) => f.id !== id),
      },
    })),
  addRoom: (floorId, room) =>
    set((state) => ({
      manualForm: {
        ...state.manualForm,
        floors: state.manualForm.floors.map((f) =>
          f.id === floorId ? { ...f, rooms: [...f.rooms, room] } : f
        ),
      },
    })),
  removeRoom: (floorId, roomId) =>
    set((state) => ({
      manualForm: {
        ...state.manualForm,
        floors: state.manualForm.floors.map((f) =>
          f.id === floorId
            ? { ...f, rooms: f.rooms.filter((r) => r.id !== roomId) }
            : f
        ),
      },
    })),

  isProcessing: false,
  processingProgress: 0,
  processingStages: defaultProcessingStages,
  setProcessing: (processing) => set({ isProcessing: processing }),
  setProcessingProgress: (progress) => set({ processingProgress: progress }),
  setProcessingStages: (stages) => set({ processingStages: stages }),

  generatedModel: null,
  setGeneratedModel: (model) => set({ generatedModel: model }),

  resetAll: () =>
    set({
      inputMode: 'upload',
      stage: 'input',
      uploadedFiles: [],
      promptText: '',
      promptBuildingType: 'residential',
      manualForm: defaultManualForm,
      isProcessing: false,
      processingProgress: 0,
      processingStages: defaultProcessingStages,
      generatedModel: null,
    }),
}));
