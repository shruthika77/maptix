"use client";

import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  PerspectiveCamera,
  Html,
  Environment,
} from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Cuboid, Layers } from 'lucide-react';
import { motion } from 'framer-motion';

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
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial
        color={hovered ? '#38bdf8' : isExterior ? '#64748b' : '#94a3b8'}
        roughness={0.7}
        metalness={0.1}
        wireframe={isWireframe}
        transparent={isWireframe || hovered}
        opacity={isWireframe ? 0.4 : (hovered ? 0.9 : 1)}
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
    living_room: '#6366f1',
    bedroom: '#8b5cf6',
    kitchen: '#f59e0b',
    bathroom: '#06b6d4',
    hallway: '#64748b',
    office: '#10b981',
    dining_room: '#f43f5e',
    unknown: '#475569',
  };

  const [hovered, setHovered] = useState(false);

  return (
    <group>
      <mesh
        position={[centerX, 0.02, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={hovered ? '#38bdf8' : (roomColors[room.type] || roomColors.unknown)}
          side={THREE.DoubleSide}
          transparent
          opacity={isWireframe ? 0.1 : 0.4}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      <Html position={[centerX, 0.1, centerZ]} center zIndexRange={[100, 0]}>
        <div className="pointer-events-none select-none text-center">
          <div className="text-[10px] font-semibold text-white bg-black/60 px-2 py-0.5 rounded-md whitespace-nowrap backdrop-blur-md border border-white/10 shadow-xl">
            {room.label}
          </div>
          {room.area_sqm && (
             <div className="text-[8px] text-white/50 mt-0.5">
               {room.area_sqm.toFixed(1)} m²
             </div>
          )}
        </div>
      </Html>
    </group>
  );
}

function DoorMesh({ door }: { door: any }) {
  const pos = door.position;
  const h = 2.1;
  return (
    <mesh position={[pos.x, h / 2, pos.y]} castShadow receiveShadow>
      <boxGeometry args={[door.width_m || 0.9, h, 0.08]} />
      <meshPhysicalMaterial 
        color="#10b981" 
        transparent 
        opacity={0.6} 
        roughness={0.2} 
        transmission={0.5} 
        thickness={0.5} 
      />
    </mesh>
  );
}

function WindowMesh({ win }: { win: any }) {
  const pos = win.position;
  const sillHeight = 0.9;
  const windowHeight = 1.2;
  return (
    <mesh position={[pos.x, sillHeight + windowHeight / 2, pos.y]} castShadow receiveShadow>
      <boxGeometry args={[win.width_m || 1.2, windowHeight, 0.06]} />
      <meshPhysicalMaterial 
        color="#0ea5e9" 
        transparent 
        opacity={0.4} 
        roughness={0.1}
        transmission={0.9} 
        thickness={0.1} 
      />
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
          </group>
        );
      })}
    </group>
  );
}

export default function Canvas3D({ spatialModel, isWireframe }: { spatialModel: any, isWireframe: boolean }) {
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
    <Canvas shadows>
      <PerspectiveCamera makeDefault position={camPos} fov={50} />
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[15, 20, 15]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[6, 5, 5]} intensity={0.5} color="#38bdf8" />
      <Environment preset="city" />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
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
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={50}
        position={[0, -0.01, 0]}
      />

      {spatialModel && (
        <ProceduralModel spatialModel={spatialModel} isWireframe={isWireframe} />
      )}

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>
    </Canvas>
  );
}
