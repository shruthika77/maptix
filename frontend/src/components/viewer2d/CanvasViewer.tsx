"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Line, Text, Group, Circle } from 'react-konva';
import Konva from 'konva';
import { motion } from 'framer-motion';

// Room type colors for premium dark UI
const ROOM_COLORS: Record<string, string> = {
  living_room: '#6366f120',  // indigo with low opacity
  bedroom: '#8b5cf620',     // violet
  kitchen: '#f59e0b20',     // amber
  bathroom: '#06b6d420',    // cyan
  toilet: '#06b6d420',
  hallway: '#64748b20',     // slate
  closet: '#84cc1620',      // lime
  office: '#10b98120',      // emerald
  dining_room: '#f43f5e20', // rose
  unknown: '#33415520',     // slate
};

const ROOM_STROKES: Record<string, string> = {
  living_room: '#6366f1',
  bedroom: '#8b5cf6',
  kitchen: '#f59e0b',
  bathroom: '#06b6d4',
  toilet: '#06b6d4',
  hallway: '#64748b',
  closet: '#84cc16',
  office: '#10b981',
  dining_room: '#f43f5e',
  unknown: '#475569',
};

interface CanvasViewerProps {
  spatialModel: any;
  width: number;
  height: number;
  onElementSelect?: (element: any) => void;
  editable?: boolean;
}

export default function CanvasViewer({
  spatialModel,
  width,
  height,
  onElementSelect,
  editable = false,
}: CanvasViewerProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getViewTransform = useCallback(() => {
    if (!spatialModel?.metadata?.bounding_box) {
      return { scaleX: 30, scaleY: 30, offsetX: 0, offsetY: 0 };
    }

    const bbox = spatialModel.metadata.bounding_box;
    const modelWidth = bbox.max.x - bbox.min.x;
    const modelHeight = bbox.max.y - bbox.min.y;

    if (modelWidth === 0 || modelHeight === 0) {
      return { scaleX: 30, scaleY: 30, offsetX: 0, offsetY: 0 };
    }

    const padding = 100;
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
    const newScale = direction > 0 ? oldScale * 1.05 : oldScale / 1.05;
    const clampedScale = Math.max(0.2, Math.min(15, newScale));

    stage.scale({ x: clampedScale, y: clampedScale });
    stage.position({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
    
    setScale(clampedScale);
  }, []);

  const toCanvas = (x: number, y: number) => ({
    x: x * transform.scaleX - transform.offsetX,
    y: y * transform.scaleY - transform.offsetY,
  });

  if (!spatialModel?.floors) {
    return null;
  }

  const floor = spatialModel.floors[0];

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      draggable
      onWheel={handleWheel}
      className="cursor-grab active:cursor-grabbing"
    >
      <Layer>
        {/* Grid Background (Optional premium touch) */}
        {/* Rooms */}
        {floor.rooms?.map((room: any, i: number) => {
          const vertices = room.polygon?.vertices;
          if (!vertices || vertices.length < 3) return null;

          const points = vertices.flatMap((v: any) => {
            const p = toCanvas(v.x, v.y);
            return [p.x, p.y];
          });

          const isHovered = hoveredId === room.id;
          const isSelected = selectedId === room.id;
          
          const fillColor = ROOM_COLORS[room.type] || ROOM_COLORS.unknown;
          const strokeColor = ROOM_STROKES[room.type] || ROOM_STROKES.unknown;

          const cx = vertices.reduce((s: number, v: any) => s + v.x, 0) / vertices.length;
          const cy = vertices.reduce((s: number, v: any) => s + v.y, 0) / vertices.length;
          const labelPos = toCanvas(cx, cy);

          return (
            <Group 
              key={`room-${i}`}
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
                setSelectedId(room.id);
                onElementSelect?.({ type: 'room', data: room });
              }}
              onTap={() => {
                setSelectedId(room.id);
                onElementSelect?.({ type: 'room', data: room });
              }}
            >
              <Line
                points={points}
                closed
                fill={isSelected ? fillColor.replace('20', '40') : (isHovered ? fillColor.replace('20', '30') : fillColor)}
                stroke={isSelected || isHovered ? strokeColor : strokeColor + '50'}
                strokeWidth={isSelected ? 2 : 1}
                shadowColor={isSelected ? strokeColor : 'transparent'}
                shadowBlur={isSelected ? 15 : 0}
                shadowOpacity={0.5}
                tension={0} // Sharp corners for architecture
              />
              <Text
                x={labelPos.x - 50}
                y={labelPos.y - 12}
                width={100}
                text={room.label || `Room ${i + 1}`}
                fontSize={12}
                fontFamily="Inter, sans-serif"
                fill={isSelected ? "#ffffff" : "#cbd5e1"}
                align="center"
                fontStyle="500"
              />
              {room.area_sqm && (
                <Text
                  x={labelPos.x - 50}
                  y={labelPos.y + 4}
                  width={100}
                  text={`${room.area_sqm.toFixed(1)} m²`}
                  fontSize={10}
                  fontFamily="Inter, sans-serif"
                  fill="#64748b"
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
          const isHovered = hoveredId === wall.id;

          return (
            <Line
              key={wall.id || `wall-${i}`}
              points={[start.x, start.y, end.x, end.y]}
              stroke={isSelected ? '#38bdf8' : (isHovered ? '#94a3b8' : '#cbd5e1')}
              strokeWidth={
                (wall.type === 'exterior' ? 4 : 2) * 
                (isSelected ? 1.5 : 1)
              }
              lineCap="round"
              lineJoin="round"
              onMouseEnter={() => setHoveredId(wall.id)}
              onMouseLeave={() => setHoveredId(null)}
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
                stroke="#10b981"
                strokeWidth={3}
                lineCap="round"
              />
              <Circle
                x={pos.x - widthPx/2}
                y={pos.y}
                radius={widthPx}
                stroke="#10b981"
                strokeWidth={1}
                dash={[4, 4]}
                opacity={0.3}
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
              stroke="#0ea5e9"
              strokeWidth={3}
              lineCap="round"
              opacity={0.8}
            />
          );
        })}
      </Layer>
    </Stage>
  );
}
