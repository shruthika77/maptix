/**
 * 3D Model Viewer Component
 * 
 * Uses React Three Fiber (Three.js) to render the 3D indoor model.
 * Supports orbit controls, wireframe/solid modes, procedural geometry from spatial model.
 */

import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  PerspectiveCamera,
  Html,
} from '@react-three/drei';
import * as THREE from 'three';

interface ThreeViewerProps {
  modelUrl?: string;
  spatialModel?: any;
  onElementClick?: (element: any) => void;
}

function WallMesh({ wall, height, isWireframe }: { wall: any; height: number; isWireframe: boolean }) {
  const start = wall.start;
  const end = wall.end;
  const thickness = wall.thickness_m || 0.15;
  const isExterior = wall.type === 'exterior';

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const centerX = (start.x + end.x) / 2;
  const centerZ = (start.y + end.y) / 2;

  const [hovered, setHovered] = useState(false);

  return (
    <mesh
      position={[centerX, height / 2, centerZ]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial
        color={hovered ? '#60a5fa' : isExterior ? '#94a3b8' : '#cbd5e1'}
        roughness={0.85}
        wireframe={isWireframe}
        transparent={isWireframe}
        opacity={isWireframe ? 0.6 : 1}
      />
    </mesh>
  );
}

function RoomFloor({ room, isWireframe }: { room: any; isWireframe: boolean }) {
  const vertices = room.polygon?.vertices;
  if (!vertices || vertices.length < 3) return null;

  const xs = vertices.map((v: any) => v.x);
  const ys = vertices.map((v: any) => v.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const depth = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minY + maxY) / 2;

  const roomColors: Record<string, string> = {
    living_room: '#FFF8DC',
    bedroom: '#E6E6FA',
    kitchen: '#FFE4C4',
    bathroom: '#B0E0E6',
    hallway: '#F5F5DC',
    office: '#F0FFF0',
    dining_room: '#FFEFD5',
    unknown: '#E6E6E6',
  };

  const [hovered, setHovered] = useState(false);

  return (
    <group>
      <mesh
        position={[centerX, 0.02, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={hovered ? '#93c5fd' : (roomColors[room.type] || roomColors.unknown)}
          side={THREE.DoubleSide}
          transparent
          opacity={isWireframe ? 0.2 : 0.8}
        />
      </mesh>
      <Html position={[centerX, 0.1, centerZ]} center>
        <div className="pointer-events-none select-none text-center">
          <div className="text-[10px] font-semibold text-white bg-black/50 px-2 py-0.5 rounded-full whitespace-nowrap backdrop-blur-sm">
            {room.label}
          </div>
          <div className="text-[8px] text-white/60 mt-0.5">
            {room.area_sqm?.toFixed(1)} m²
          </div>
        </div>
      </Html>
    </group>
  );
}

function DoorMesh({ door }: { door: any }) {
  const pos = door.position;
  const h = 2.1;
  return (
    <mesh position={[pos.x, h / 2, pos.y]}>
      <boxGeometry args={[door.width_m || 0.9, h, 0.08]} />
      <meshStandardMaterial color="#7c3aed" transparent opacity={0.6} />
    </mesh>
  );
}

function WindowMesh({ win }: { win: any }) {
  const pos = win.position;
  const sillHeight = 0.9;
  const windowHeight = 1.2;
  return (
    <mesh position={[pos.x, sillHeight + windowHeight / 2, pos.y]}>
      <boxGeometry args={[win.width_m || 1.2, windowHeight, 0.06]} />
      <meshStandardMaterial color="#38bdf8" transparent opacity={0.4} />
    </mesh>
  );
}

function CeilingPlane({ bbox, height }: { bbox: any; height: number }) {
  const w = bbox.max.x - bbox.min.x;
  const d = bbox.max.y - bbox.min.y;
  const cx = (bbox.min.x + bbox.max.x) / 2;
  const cz = (bbox.min.y + bbox.max.y) / 2;
  return (
    <mesh position={[cx, height, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#f1f5f9" side={THREE.DoubleSide} transparent opacity={0.15} />
    </mesh>
  );
}

function ProceduralModel({ spatialModel, isWireframe }: { spatialModel: any; isWireframe: boolean }) {
  if (!spatialModel?.floors) return null;

  return (
    <group>
      {spatialModel.floors.map((floor: any, floorIndex: number) => {
        const floorHeight = floor.height_m || 2.8;
        return (
          <group key={floorIndex} position={[0, floor.elevation_m || 0, 0]}>
            {floor.walls?.map((wall: any, i: number) => (
              <WallMesh key={`wall-${i}`} wall={wall} height={floorHeight} isWireframe={isWireframe} />
            ))}
            {floor.rooms?.map((room: any, i: number) => (
              <RoomFloor key={`room-${i}`} room={room} isWireframe={isWireframe} />
            ))}
            {floor.doors?.map((door: any, i: number) => (
              <DoorMesh key={`door-${i}`} door={door} />
            ))}
            {floor.windows?.map((win: any, i: number) => (
              <WindowMesh key={`win-${i}`} win={win} />
            ))}
            {spatialModel.metadata?.bounding_box && !isWireframe && (
              <CeilingPlane bbox={spatialModel.metadata.bounding_box} height={floorHeight} />
            )}
          </group>
        );
      })}
    </group>
  );
}

export default function ThreeViewer({ modelUrl, spatialModel, onElementClick }: ThreeViewerProps) {
  const [viewMode, setViewMode] = useState<'solid' | 'wireframe'>('solid');
  const isWireframe = viewMode === 'wireframe';

  // Calculate camera position based on model size
  const bbox = spatialModel?.metadata?.bounding_box;
  const modelW = bbox ? bbox.max.x - bbox.min.x : 12;
  const modelD = bbox ? bbox.max.y - bbox.min.y : 10;
  const maxDim = Math.max(modelW, modelD, 10);
  const camDist = maxDim * 1.2;
  const camPos: [number, number, number] = [
    (bbox ? (bbox.min.x + bbox.max.x) / 2 : 6) + camDist * 0.6,
    camDist * 0.6,
    (bbox ? (bbox.min.y + bbox.max.y) / 2 : 5) + camDist * 0.6,
  ];

  return (
    <div className="relative w-full h-full min-h-[500px] bg-slate-950">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-1 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-lg p-1">
        <button
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            viewMode === 'solid'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-white/50 hover:bg-white/5 hover:text-white/70'
          }`}
          onClick={() => setViewMode('solid')}
        >
          Solid
        </button>
        <button
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            viewMode === 'wireframe'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-white/50 hover:bg-white/5 hover:text-white/70'
          }`}
          onClick={() => setViewMode('wireframe')}
        >
          Wireframe
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/40 backdrop-blur-sm border border-white/[0.06] rounded-lg p-3">
        <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <div className="w-3 h-3 rounded-sm bg-[#94a3b8]" /> Exterior Wall
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <div className="w-3 h-3 rounded-sm bg-[#cbd5e1]" /> Interior Wall
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <div className="w-3 h-3 rounded-sm bg-[#7c3aed]" style={{ opacity: 0.6 }} /> Door
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <div className="w-3 h-3 rounded-sm bg-[#38bdf8]" style={{ opacity: 0.4 }} /> Window
          </div>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute top-4 right-4 z-10 text-[10px] text-white/20 space-y-0.5 text-right">
        <div>🖱️ Left drag: Rotate</div>
        <div>🖱️ Right drag: Pan</div>
        <div>🖱️ Scroll: Zoom</div>
      </div>

      {/* 3D Canvas */}
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={camPos} fov={50} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
        <pointLight position={[6, 5, 5]} intensity={0.4} color="#fef3c7" />
        <hemisphereLight args={['#dbeafe', '#1e293b', 0.3]} />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          maxPolarAngle={Math.PI / 2.05}
          target={
            spatialModel?.metadata?.bounding_box
              ? [
                  (spatialModel.metadata.bounding_box.min.x + spatialModel.metadata.bounding_box.max.x) / 2,
                  0,
                  (spatialModel.metadata.bounding_box.min.y + spatialModel.metadata.bounding_box.max.y) / 2,
                ]
              : [6, 0, 5]
          }
        />

        <Grid
          args={[50, 50]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#334155"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={40}
          position={[0, -0.01, 0]}
        />

        {spatialModel ? (
          <ProceduralModel spatialModel={spatialModel} isWireframe={isWireframe} />
        ) : (
          <Html center>
            <div className="text-white/40 text-center">
              <p className="text-lg font-medium">No 3D model available</p>
              <p className="text-sm mt-1 text-white/25">Process a floor plan to generate a 3D model</p>
            </div>
          </Html>
        )}

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
