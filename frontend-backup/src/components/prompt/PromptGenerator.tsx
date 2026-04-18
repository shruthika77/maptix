/**
 * Prompt Generator Component
 * 
 * Allows users to describe their building via text prompt or structured form,
 * then generates a floor plan + 3D model from the description.
 */

import React, { useState } from 'react';
import { apiGenerateFromPrompt } from '../../services/api';

interface PromptGeneratorProps {
  projectId: string;
  onGenerated?: (modelData: any) => void;
}

const EXAMPLE_PROMPTS = [
  {
    label: '2BHK Apartment',
    prompt: '2BHK apartment with living room, kitchen, 2 bedrooms, bathroom, toilet, balcony',
    type: 'residential',
  },
  {
    label: '3BHK House',
    prompt: '3BHK house with large living room, dining room, kitchen, master bedroom, 2 bedrooms, 2 bathrooms, garage',
    type: 'residential',
  },
  {
    label: 'Hospital Floor',
    prompt: 'Hospital floor with operation theater, 4 private rooms, ICU room, NICU room, labor room, 6 toilets, nurse station, sterilization room, store, corridor, bed lift',
    type: 'hospital',
  },
  {
    label: 'Office Space',
    prompt: 'Office space with reception, 4 offices, conference room, 2 bathrooms, kitchen, server room, corridor',
    type: 'office',
  },
  {
    label: 'Clinic',
    prompt: 'Small clinic with reception, waiting area, 3 consultation rooms, pharmacy, lab, 2 toilets, store',
    type: 'hospital',
  },
];

const BUILDING_TYPES = [
  { value: 'residential', label: '🏠 Residential', icon: '🏠' },
  { value: 'hospital', label: '🏥 Hospital', icon: '🏥' },
  { value: 'office', label: '🏢 Office', icon: '🏢' },
  { value: 'commercial', label: '🏬 Commercial', icon: '🏬' },
];

export default function PromptGenerator({ projectId, onGenerated }: PromptGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [buildingType, setBuildingType] = useState('residential');
  const [plotWidth, setPlotWidth] = useState<string>('');
  const [plotLength, setPlotLength] = useState<string>('');
  const [wallHeight, setWallHeight] = useState<string>('3.0');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generatedStats, setGeneratedStats] = useState<any>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a building description');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedStats(null);

    try {
      const result = await apiGenerateFromPrompt(projectId, {
        prompt: prompt.trim(),
        building_type: buildingType,
        plot_width_m: plotWidth ? parseFloat(plotWidth) : undefined,
        plot_length_m: plotLength ? parseFloat(plotLength) : undefined,
        wall_height_m: wallHeight ? parseFloat(wallHeight) : undefined,
      });

      setGeneratedStats(result.stats);
      onGenerated?.(result.model_data);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyExample = (example: typeof EXAMPLE_PROMPTS[0]) => {
    setPrompt(example.prompt);
    setBuildingType(example.type);
    setError('');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20 mb-4">
          <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white">Generate from Description</h2>
        <p className="text-sm text-white/40 mt-1">
          Describe your building and we'll create the floor plan + 3D model
        </p>
      </div>

      {/* Building Type Selector */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Building Type
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BUILDING_TYPES.map((type) => (
            <button
              key={type.value}
              className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                buildingType === type.value
                  ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.05] hover:border-white/10'
              }`}
              onClick={() => setBuildingType(type.value)}
            >
              <span className="text-lg block mb-1">{type.icon}</span>
              {type.value.charAt(0).toUpperCase() + type.value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Describe your building
        </label>
        <textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setError(''); }}
          placeholder={
            buildingType === 'hospital'
              ? 'e.g., Hospital with operation theater, 4 private rooms, ICU, 6 toilets, nurse station, corridor, bed lift...'
              : buildingType === 'office'
              ? 'e.g., Office with reception, 4 offices, conference room, 2 bathrooms, kitchen, corridor...'
              : 'e.g., 3BHK apartment with living room, kitchen, 3 bedrooms, 2 bathrooms, balcony...'
          }
          className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/30 transition min-h-[120px] resize-y text-sm leading-relaxed"
          rows={4}
        />
      </div>

      {/* Example Prompts */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Quick Examples
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example.label}
              onClick={() => applyExample(example)}
              className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-lg text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.06] hover:border-white/10 transition"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Options */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Advanced Options
        </button>

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-3 gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Plot Width (m)</label>
              <input
                type="number"
                value={plotWidth}
                onChange={(e) => setPlotWidth(e.target.value)}
                placeholder="Auto"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-white/20 focus:ring-2 focus:ring-violet-500/50"
                min="3"
                max="100"
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Plot Length (m)</label>
              <input
                type="number"
                value={plotLength}
                onChange={(e) => setPlotLength(e.target.value)}
                placeholder="Auto"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-white/20 focus:ring-2 focus:ring-violet-500/50"
                min="3"
                max="100"
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Wall Height (m)</label>
              <input
                type="number"
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                placeholder="3.0"
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-white/20 focus:ring-2 focus:ring-violet-500/50"
                min="2"
                max="6"
                step="0.1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          {error}
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
      >
        {isGenerating ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating Floor Plan...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Generate Floor Plan & 3D Model
          </>
        )}
      </button>

      {/* Success Stats */}
      {generatedStats && (
        <div className="mt-6 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-emerald-400">Floor Plan Generated Successfully!</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Rooms', value: generatedStats.room_count, icon: '🏠' },
              { label: 'Walls', value: generatedStats.wall_count, icon: '🧱' },
              { label: 'Doors', value: generatedStats.door_count, icon: '🚪' },
              { label: 'Windows', value: generatedStats.window_count, icon: '🪟' },
            ].map((s) => (
              <div key={s.label} className="text-center p-2 bg-white/[0.03] rounded-lg">
                <span className="text-lg">{s.icon}</span>
                <p className="text-lg font-bold text-white mt-0.5">{s.value}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs text-white/40">
            <span>Total Area: {generatedStats.total_area_sqm} m²</span>
            <span>Plot: {generatedStats.plot_width_m}m × {generatedStats.plot_length_m}m</span>
          </div>
          <p className="text-xs text-emerald-400/60 mt-3">
            Switch to the <strong>2D Plan</strong> or <strong>3D View</strong> tab to see the result!
          </p>
        </div>
      )}
    </div>
  );
}
