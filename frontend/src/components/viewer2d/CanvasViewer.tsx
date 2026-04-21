"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Line, Text, Group, Circle } from 'react-konva';
import Konva from 'konva';

// ── Room type color palette (dark UI) ──────────────────────────────────────
const ROOM_FILL: Record<string, string> = {
  living_room: '#6366f1',
  bedroom:     '#8b5cf6',
  kitchen:     '#f59e0b',
  bathroom:    '#06b6d4',
  toilet:      '#06b6d4',
  hallway:     '#64748b',
  closet:      '#84cc16',
  office:      '#10b981',
  dining_room: '#f43f5e',
  unknown:     '#475569',
};

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface CanvasViewerProps {
  spatialModel: any;
  width?: number;   // optional — overridden by container resize
  height?: number;
  onElementSelect?: (element: any) => void;
  editable?: boolean;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CanvasViewer({
  spatialModel,
  onElementSelect,
  editable = false,
}: CanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef     = useRef<Konva.Stage>(null);

  // Track actual rendered size via ResizeObserver
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);

  // ResizeObserver — keeps canvas filling its container exactly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width, height });
        }
      }
    });

    observer.observe(el);
    // Initial measure
    setSize({ width: el.clientWidth || 800, height: el.clientHeight || 600 });

    return () => observer.disconnect();
  }, []);

  // ── Compute scale/offset to fit model in viewport ─────────────────────
  const getViewTransform = useCallback(() => {
    const bbox = spatialModel?.metadata?.bounding_box;
    if (!bbox) return { scaleX: 30, scaleY: 30, offsetX: 0, offsetY: 0 };

    const modelW = bbox.max.x - bbox.min.x;
    const modelH = bbox.max.y - bbox.min.y;
    if (modelW === 0 || modelH === 0) return { scaleX: 30, scaleY: 30, offsetX: 0, offsetY: 0 };

    const padding = 80;
    const scaleX = (size.width  - padding * 2) / modelW;
    const scaleY = (size.height - padding * 2) / modelH;
    const fitScale = Math.min(scaleX, scaleY);

    const scaledW = modelW * fitScale;
    const scaledH = modelH * fitScale;

    return {
      scaleX:  fitScale,
      scaleY:  fitScale,
      offsetX: bbox.min.x * fitScale - (size.width  - scaledW) / 2,
      offsetY: bbox.min.y * fitScale - (size.height - scaledH) / 2,
    };
  }, [spatialModel, size]);

  const transform = getViewTransform();

  // World → canvas pixel
  const toCanvas = useCallback((x: number, y: number) => ({
    x: x * transform.scaleX - transform.offsetX,
    y: y * transform.scaleY - transform.offsetY,
  }), [transform]);

  // ── Zoom with scroll wheel (pointer-anchored) ─────────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer  = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const factor    = e.evt.deltaY > 0 ? 0.92 : 1.08;
    const newScale  = Math.max(0.15, Math.min(20, oldScale * factor));

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, []);

  // ── Guard ─────────────────────────────────────────────────────────────
  if (!spatialModel?.floors) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center text-white/30 text-sm">
        No spatial data loaded.
      </div>
    );
  }

  const floor = spatialModel.floors[0];

  return (
    <div ref={containerRef} className="w-full h-full">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable
        onWheel={handleWheel}
        style={{ cursor: 'grab' }}
      >
        <Layer>
          {/* ── Rooms ─────────────────────────────────────────────── */}
          {floor.rooms?.map((room: any, i: number) => {
            const vertices = room.polygon?.vertices;
            if (!vertices || vertices.length < 3) return null;

            const points = vertices.flatMap((v: any) => {
              const p = toCanvas(v.x, v.y);
              return [p.x, p.y];
            });

            const isHovered  = hoveredId  === room.id;
            const isSelected = selectedId === room.id;

            const baseColor  = ROOM_FILL[room.type] || ROOM_FILL.unknown;
            const fillAlpha  = isSelected ? 0.35 : isHovered ? 0.25 : 0.12;
            const fillColor  = hexToRgba(baseColor, fillAlpha);
            const strokeOpacity = isSelected || isHovered ? 1 : 0.45;

            const cx = room.center?.x ?? room.centroid?.x ?? (vertices.reduce((s: number, v: any) => s + v.x, 0) / vertices.length);
            const cy = room.center?.y ?? room.centroid?.y ?? (vertices.reduce((s: number, v: any) => s + v.y, 0) / vertices.length);
            const lp = toCanvas(cx, cy);

            return (
              <Group
                key={`room-${room.id ?? i}`}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = 'pointer';
                  setHoveredId(room.id);
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = 'grab';
                  setHoveredId(null);
                }}
                onClick={() => {
                  setSelectedId(room.id === selectedId ? null : room.id);
                  onElementSelect?.({ type: 'room', data: room });
                }}
                onTap={() => {
                  setSelectedId(room.id === selectedId ? null : room.id);
                  onElementSelect?.({ type: 'room', data: room });
                }}
              >
                <Line
                  points={points}
                  closed
                  fill={fillColor}
                  stroke={baseColor}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  opacity={strokeOpacity}
                  shadowColor={isSelected ? baseColor : undefined}
                  shadowBlur={isSelected ? 12 : 0}
                  shadowOpacity={0.6}
                  tension={0}
                />
                <Text
                  x={lp.x - 60}
                  y={lp.y - 10}
                  width={120}
                  text={room.label || `Room ${i + 1}`}
                  fontSize={11}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontStyle="600"
                  fill={isSelected ? '#ffffff' : '#cbd5e1'}
                  align="center"
                  listening={false}
                />
                {room.area_sqm && (
                  <Text
                    x={lp.x - 60}
                    y={lp.y + 4}
                    width={120}
                    text={`${room.area_sqm.toFixed(1)} m²`}
                    fontSize={9}
                    fontFamily="Inter, system-ui, sans-serif"
                    fill="#64748b"
                    align="center"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {/* ── Walls ─────────────────────────────────────────────── */}
          {floor.walls?.map((wall: any, i: number) => {
            const start = toCanvas(wall.start.x, wall.start.y);
            const end   = toCanvas(wall.end.x,   wall.end.y);
            const isExterior = wall.type === 'exterior';
            const isSelected = selectedId === wall.id;
            const isHovered  = hoveredId  === wall.id;

            return (
              <Line
                key={wall.id || `wall-${i}`}
                points={[start.x, start.y, end.x, end.y]}
                stroke={
                  isSelected ? '#38bdf8'
                  : isHovered ? '#94a3b8'
                  : isExterior ? '#e2e8f0'
                  : '#94a3b8'
                }
                strokeWidth={isExterior ? (isSelected ? 4.5 : 3.5) : (isSelected ? 2.5 : 1.5)}
                lineCap="round"
                lineJoin="round"
                opacity={isHovered || isSelected ? 1 : isExterior ? 0.85 : 0.55}
                onMouseEnter={() => setHoveredId(wall.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => {
                  setSelectedId(wall.id === selectedId ? null : wall.id);
                  onElementSelect?.({ type: 'wall', data: wall });
                }}
                hitStrokeWidth={10}
              />
            );
          })}

          {/* ── Doors ─────────────────────────────────────────────── */}
          {floor.doors?.map((door: any, i: number) => {
            const pos     = toCanvas(door.position.x, door.position.y);
            const widthPx = (door.width_m || 0.9) * transform.scaleX;

            return (
              <Group key={`door-${door.id ?? i}`}>
                <Line
                  points={[pos.x - widthPx / 2, pos.y, pos.x + widthPx / 2, pos.y]}
                  stroke="#10b981"
                  strokeWidth={3}
                  lineCap="round"
                />
                <Circle
                  x={pos.x - widthPx / 2}
                  y={pos.y}
                  radius={widthPx * 0.85}
                  stroke="#10b981"
                  strokeWidth={1}
                  dash={[4, 4]}
                  opacity={0.3}
                  listening={false}
                />
              </Group>
            );
          })}

          {/* ── Windows ───────────────────────────────────────────── */}
          {floor.windows?.map((win: any, i: number) => {
            const pos     = toCanvas(win.position.x, win.position.y);
            const widthPx = (win.width_m || 1.2) * transform.scaleX;

            return (
              <Line
                key={`window-${win.id ?? i}`}
                points={[pos.x - widthPx / 2, pos.y, pos.x + widthPx / 2, pos.y]}
                stroke="#0ea5e9"
                strokeWidth={3.5}
                lineCap="round"
                opacity={0.9}
                listening={false}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
