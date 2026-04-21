"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateStore, RoomEntry, FloorEntry } from "@/stores/createStore";

const ROOM_TYPES = [
  { value: "living_room", label: "Living Room", icon: "🛋️" },
  { value: "bedroom", label: "Bedroom", icon: "🛏️" },
  { value: "kitchen", label: "Kitchen", icon: "🍳" },
  { value: "bathroom", label: "Bathroom", icon: "🚿" },
  { value: "toilet", label: "Toilet", icon: "🚽" },
  { value: "dining_room", label: "Dining Room", icon: "🍽️" },
  { value: "hallway", label: "Hallway", icon: "🚪" },
  { value: "office", label: "Office", icon: "💼" },
  { value: "balcony", label: "Balcony", icon: "🌿" },
  { value: "garage", label: "Garage", icon: "🚗" },
  { value: "closet", label: "Closet", icon: "👔" },
  { value: "study", label: "Study", icon: "📚" },
  { value: "corridor", label: "Corridor", icon: "🏃" },
  { value: "staircase", label: "Staircase", icon: "🪜" },
  { value: "reception", label: "Reception", icon: "🛎️" },
  { value: "conference_room", label: "Conference", icon: "📋" },
  { value: "ward", label: "Ward", icon: "🏥" },
  { value: "operation_theater", label: "OT", icon: "🔬" },
  { value: "icu_room", label: "ICU", icon: "❤️‍🩹" },
];

const BUILDING_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "hospital", label: "Hospital" },
  { value: "office", label: "Office" },
  { value: "commercial", label: "Commercial" },
  { value: "school", label: "School" },
];

export default function ManualPanel() {
  const { manualForm, setManualForm, addFloor, removeFloor, addRoom, removeRoom } =
    useCreateStore();
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(
    new Set(["floor-0"])
  );
  const [addingRoom, setAddingRoom] = useState<string | null>(null);

  const toggleFloor = (id: string) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddRoom = (floorId: string, type: string, label: string) => {
    const room: RoomEntry = {
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: label,
      type,
      count: 1,
    };
    addRoom(floorId, room);
    setAddingRoom(null);
  };

  return (
    <div className="space-y-5">
      {/* Building config */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Building Type
          </label>
          <select
            value={manualForm.buildingType}
            onChange={(e) => setManualForm({ buildingType: e.target.value })}
            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/40"
          >
            {BUILDING_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-zinc-900">
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Wall Height (m)
          </label>
          <Input
            type="number"
            value={manualForm.wallHeight}
            onChange={(e) =>
              setManualForm({ wallHeight: parseFloat(e.target.value) || 3 })
            }
            className="bg-white/[0.03] border-white/10"
            step={0.1}
            min={2}
            max={6}
          />
        </div>
      </div>

      {/* Plot dimensions */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Plot Width (m)
          </label>
          <Input
            type="number"
            placeholder="Auto"
            value={manualForm.plotWidth ?? ""}
            onChange={(e) =>
              setManualForm({
                plotWidth: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            className="bg-white/[0.03] border-white/10"
            step={0.5}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Plot Length (m)
          </label>
          <Input
            type="number"
            placeholder="Auto"
            value={manualForm.plotLength ?? ""}
            onChange={(e) =>
              setManualForm({
                plotLength: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            className="bg-white/[0.03] border-white/10"
            step={0.5}
          />
        </div>
      </div>

      {/* Floors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Floors
          </label>
          <Button
            variant="ghost"
            size="xs"
            onClick={addFloor}
            className="text-indigo-400 hover:text-indigo-300 gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Floor
          </Button>
        </div>

        <div className="space-y-2">
          {manualForm.floors.map((floor) => {
            const isExpanded = expandedFloors.has(floor.id);
            const isAdding = addingRoom === floor.id;

            return (
              <div
                key={floor.id}
                className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden"
              >
                {/* Floor header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => toggleFloor(floor.id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <Building className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-medium">{floor.label}</span>
                    <span className="text-xs text-muted-foreground">
                      ({floor.rooms.length} room
                      {floor.rooms.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                  {manualForm.floors.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-slate-500 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFloor(floor.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* Floor content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {/* Room list */}
                    {floor.rooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs">
                            {ROOM_TYPES.find((t) => t.value === room.type)
                              ?.icon || "📦"}
                          </span>
                          <span className="text-sm text-slate-300">
                            {room.name}
                          </span>
                          {room.count > 1 && (
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                              ×{room.count}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-slate-600 hover:text-red-400"
                          onClick={() => removeRoom(floor.id, room.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}

                    {/* Add room */}
                    {isAdding ? (
                      <div className="bg-black/30 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          Select room type:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ROOM_TYPES.map((type) => (
                            <button
                              key={type.value}
                              onClick={() =>
                                handleAddRoom(
                                  floor.id,
                                  type.value,
                                  type.label
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-white/5 text-white/60 hover:bg-indigo-500/10 hover:border-indigo-500/20 hover:text-indigo-300 transition-all"
                            >
                              {type.icon} {type.label}
                            </button>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-slate-500"
                          onClick={() => setAddingRoom(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddingRoom(floor.id)}
                        className="w-full border border-dashed border-white/10 text-white/40 hover:text-indigo-300 hover:border-indigo-500/30 gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Room
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
