import { create } from 'zustand';

interface UIState {
  currentFloor: string;
  setFloor: (floor: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentFloor: '1',
  setFloor: (floor) => set({ currentFloor: floor }),
}));
