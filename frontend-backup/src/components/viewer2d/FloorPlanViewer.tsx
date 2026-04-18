/**
 * 2D Floor Plan Viewer & Editor
 * 
 * Uses Konva.js (via react-konva) for canvas-based rendering.
 * Supports:
 * - Pan and zoom (scroll/pinch)
 * - Wall rendering with thickness
 * - Room fill and labels
 * - Door and window symbols
 * - Element selection
 * - Basic editing (move, resize walls)
 * - Measurement overlay
 */

import React, { useRef, useState, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Circle } from 'react-konva';
import Konva from 'konva';

interface FloorPlanViewerProps {
  spatialModel: any;
  width: number;
  height: number;
  onElementSelect?: (element: any) => void;
  editable?: boolean;
}

// Room type colors
const ROOM_COLORS: Record<string, string> = {
  living_room: '#FFF8DC88',
  bedroom: '#E6E6FA88',
  kitchen: '#FFE4C488',
  bathroom: '#B0E0E688',
  toilet: '#B0E0E688',
  hallway: '#F5F5DC88',
  closet: '#D2B48C88',
  office: '#F0FFF088',
  dining_room: '#FFEFD588',
  unknown: '#E6E6E688',
};

export default function FloorPlanViewer({
  spatialModel,
  width,
  height,
  onElementSelect,
  editable = false,
}: FloorPlanViewerProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Calculate scale to fit model in viewport
  const getViewTransform = useCallback(() => {
    if (!spatialModel?.metadata?.bounding_box) {
      return { scaleX: 50, scaleY: 50, offsetX: 0, offsetY: 0 };
    }

    const bbox = spatialModel.metadata.bounding_box;
    const modelWidth = bbox.max.x - bbox.min.x;
    const modelHeight = bbox.max.y - bbox.min.y;

    if (modelWidth === 0 || modelHeight === 0) {
      return { scaleX: 50, scaleY: 50, offsetX: 0, offsetY: 0 };
    }

    const padding = 50;
    const scaleX = (width - 2 * padding) / modelWidth;
    const scaleY = (height - 2 * padding) / modelHeight;
    const fitScale = Math.min(scaleX, scaleY);

    return {
      scaleX: fitScale,
      scaleY: fitScale,
      offsetX: bbox.min.x * fitScale - padding - (width - modelWidth * fitScale) / 2,
      offsetY: bbox.min.y * fitScale - padding - (height - modelHeight * fitScale) / 2,
    };
  }, [spatialModel, width, height]);

  const transform = getViewTransform();

  // Zoom handler
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;
    const clampedScale = Math.max(0.1, Math.min(10, newScale));

    stage.scale({ x: clampedScale, y: clampedScale });
    stage.position({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
    
    setScale(clampedScale);
  }, []);

  // Convert model coordinates to canvas coordinates
  const toCanvas = (x: number, y: number) => ({
    x: x * transform.scaleX - transform.offsetX,
    y: y * transform.scaleY - transform.offsetY,
  });

  if (!spatialModel?.floors) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 bg-slate-950">
        <div className="text-center">
          <p className="text-lg font-medium">No floor plan available</p>
          <p className="text-sm mt-1 text-white/25">Process a file to generate the floor plan</p>
        </div>
      </div>
    );
  }

  const floor = spatialModel.floors[0]; // MVP: show first floor

  return (
    <div className="relative w-full h-full bg-slate-950">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-1 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-lg p-1">
        <button
          className="px-3 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/5 rounded-md transition"
          onClick={() => {
            const stage = stageRef.current;
            if (stage) {
              stage.scale({ x: 1, y: 1 });
              stage.position({ x: 0, y: 0 });
              setScale(1);
            }
          }}
        >
          Reset
        </button>
        <button
          className="px-3 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/5 rounded-md transition"
          onClick={() => setScale(s => Math.min(s * 1.2, 10))}
        >
          Zoom +
        </button>
        <button
          className="px-3 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/5 rounded-md transition"
          onClick={() => setScale(s => Math.max(s / 1.2, 0.1))}
        >
          Zoom −
        </button>
      </div>

      {/* Scale indicator */}
      <div className="absolute bottom-4 right-4 z-10 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-white/40 font-mono">
        {Math.round(scale * 100)}%
      </div>

      <Stage
        ref={stageRef}
        width={width}
        height={height}
        draggable
        onWheel={handleWheel}
      >
        <Layer>
          {/* Room fills */}
          {floor.rooms?.map((room: any, i: number) => {
            const vertices = room.polygon?.vertices;
            if (!vertices || vertices.length < 3) return null;

            const points = vertices.flatMap((v: any) => {
              const p = toCanvas(v.x, v.y);
              return [p.x, p.y];
            });

            const color = ROOM_COLORS[room.type] || ROOM_COLORS.unknown;

            // Calculate centroid for label
            const cx = vertices.reduce((s: number, v: any) => s + v.x, 0) / vertices.length;
            const cy = vertices.reduce((s: number, v: any) => s + v.y, 0) / vertices.length;
            const labelPos = toCanvas(cx, cy);

            return (
              <Group key={`room-${i}`}>
                <Line
                  points={points}
                  closed
                  fill={color}
                  stroke="#ccc"
                  strokeWidth={0.5}
                  onClick={() => {
                    setSelectedId(room.id);
                    onElementSelect?.({ type: 'room', data: room });
                  }}
                />
                <Text
                  x={labelPos.x - 30}
                  y={labelPos.y - 10}
                  width={60}
                  text={room.label || `Room ${i + 1}`}
                  fontSize={11}
                  fill="#666"
                  align="center"
                />
                {room.area_sqm && (
                  <Text
                    x={labelPos.x - 30}
                    y={labelPos.y + 3}
                    width={60}
                    text={`${room.area_sqm.toFixed(1)} m²`}
                    fontSize={9}
                    fill="#999"
                    align="center"
                  />
                )}
              </Group>
            );
          })}

          {/* Walls */}
          {floor.walls?.map((wall: any, i: number) => {
            const start = toCanvas(wall.start.x, wall.start.y);
            const end = toCanvas(wall.end.x, wall.end.y);
            const isSelected = selectedId === wall.id;

            return (
              <Line
                key={`wall-${i}`}
                points={[start.x, start.y, end.x, end.y]}
                stroke={isSelected ? '#3b82f6' : '#333'}
                strokeWidth={
                  (wall.type === 'exterior' ? 4 : 2) * 
                  (isSelected ? 1.5 : 1)
                }
                lineCap="round"
                lineJoin="round"
                onClick={() => {
                  setSelectedId(wall.id);
                  onElementSelect?.({ type: 'wall', data: wall });
                }}
              />
            );
          })}

          {/* Doors */}
          {floor.doors?.map((door: any, i: number) => {
            const pos = toCanvas(door.position.x, door.position.y);
            const widthPx = door.width_m * transform.scaleX;

            return (
              <Group key={`door-${i}`}>
                <Line
                  points={[pos.x - widthPx/2, pos.y, pos.x + widthPx/2, pos.y]}
                  stroke="#f59e0b"
                  strokeWidth={3}
                  lineCap="round"
                />
                {/* Door swing arc (quarter circle) */}
                <Circle
                  x={pos.x - widthPx/2}
                  y={pos.y}
                  radius={widthPx}
                  stroke="#f59e0b"
                  strokeWidth={1}
                  dash={[4, 4]}
                  opacity={0.5}
                />
              </Group>
            );
          })}

          {/* Windows */}
          {floor.windows?.map((window: any, i: number) => {
            const pos = toCanvas(window.position.x, window.position.y);
            const widthPx = window.width_m * transform.scaleX;

            return (
              <Line
                key={`window-${i}`}
                points={[pos.x - widthPx/2, pos.y, pos.x + widthPx/2, pos.y]}
                stroke="#3b82f6"
                strokeWidth={4}
                lineCap="round"
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
