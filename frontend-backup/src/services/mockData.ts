/**
 * Mock Data — Complete 3-floor office building
 * Provides realistic spatial data for the entire UI to function standalone.
 */

// ── Navigation Graph Types ──
export interface NavNode {
  id: string;
  x: number;
  y: number;
  floor: number;
  type: 'waypoint' | 'room_center' | 'door' | 'stairs' | 'elevator' | 'entrance';
  label?: string;
  roomId?: string;
}

export interface NavEdge {
  from: string;
  to: string;
  weight: number; // distance in meters
  type: 'hallway' | 'room' | 'stairs' | 'elevator';
}

export interface Room {
  id: string;
  label: string;
  type: string;
  floor: number;
  area_sqm: number;
  polygon: { vertices: { x: number; y: number }[] };
  center: { x: number; y: number };
  metadata?: {
    capacity?: number;
    amenities?: string[];
    accessibility?: boolean;
  };
}

export interface Wall {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness_m: number;
  type: 'exterior' | 'interior';
}

export interface Door {
  id: string;
  position: { x: number; y: number };
  width_m: number;
  type: 'single' | 'double' | 'sliding';
  connects: [string, string]; // room IDs
}

export interface WindowElement {
  id: string;
  position: { x: number; y: number };
  width_m: number;
  wall_id: string;
}

export interface Floor {
  id: string;
  level: number;
  label: string;
  height_m: number;
  elevation_m: number;
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: WindowElement[];
}

export interface SpatialModel {
  metadata: {
    building_name: string;
    building_type: string;
    total_floors: number;
    total_area_sqm: number;
    source: string;
    bounding_box: {
      min: { x: number; y: number };
      max: { x: number; y: number };
    };
    average_confidence: number;
  };
  floors: Floor[];
  navigation: {
    nodes: NavNode[];
    edges: NavEdge[];
  };
}

// ── Helper ──
let wallId = 0;
let doorId = 0;
let winId = 0;
const wid = () => `wall-${++wallId}`;
const did = () => `door-${++doorId}`;
const wiid = () => `win-${++winId}`;

function rect(id: string, x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function rectWalls(x: number, y: number, w: number, h: number, type: 'exterior' | 'interior' = 'interior', thickness = 0.15): Wall[] {
  return [
    { id: wid(), start: { x, y }, end: { x: x + w, y }, thickness_m: thickness, type },
    { id: wid(), start: { x: x + w, y }, end: { x: x + w, y: y + h }, thickness_m: thickness, type },
    { id: wid(), start: { x: x + w, y: y + h }, end: { x, y: y + h }, thickness_m: thickness, type },
    { id: wid(), start: { x, y: y + h }, end: { x, y }, thickness_m: thickness, type },
  ];
}

// ═══════════════════════════════════════
//  GROUND FLOOR (Level 0)
// ═══════════════════════════════════════
const groundFloorRooms: Room[] = [
  {
    id: 'g-lobby', label: 'Main Lobby', type: 'hallway', floor: 0, area_sqm: 48,
    polygon: { vertices: rect('g-lobby', 0, 0, 8, 6) },
    center: { x: 4, y: 3 },
    metadata: { capacity: 30, amenities: ['reception', 'seating'], accessibility: true },
  },
  {
    id: 'g-reception', label: 'Reception', type: 'office', floor: 0, area_sqm: 20,
    polygon: { vertices: rect('g-reception', 8, 0, 5, 4) },
    center: { x: 10.5, y: 2 },
    metadata: { capacity: 3, amenities: ['desk', 'phone'], accessibility: true },
  },
  {
    id: 'g-security', label: 'Security Room', type: 'office', floor: 0, area_sqm: 12,
    polygon: { vertices: rect('g-security', 8, 4, 5, 3) },
    center: { x: 10.5, y: 5.5 },
    metadata: { capacity: 2, amenities: ['monitors', 'desk'] },
  },
  {
    id: 'g-cafe', label: 'Café', type: 'dining_room', floor: 0, area_sqm: 40,
    polygon: { vertices: rect('g-cafe', 0, 6, 6, 7) },
    center: { x: 3, y: 9.5 },
    metadata: { capacity: 25, amenities: ['tables', 'counter', 'coffee_machine'], accessibility: true },
  },
  {
    id: 'g-kitchen', label: 'Kitchen', type: 'kitchen', floor: 0, area_sqm: 18,
    polygon: { vertices: rect('g-kitchen', 6, 6, 4.5, 4) },
    center: { x: 8.25, y: 8 },
    metadata: { capacity: 4, amenities: ['stove', 'fridge', 'sink'] },
  },
  {
    id: 'g-restroom-m', label: 'Men\'s Restroom', type: 'bathroom', floor: 0, area_sqm: 12,
    polygon: { vertices: rect('g-restroom-m', 10.5, 7, 3, 3) },
    center: { x: 12, y: 8.5 },
    metadata: { amenities: ['toilets', 'sinks'], accessibility: true },
  },
  {
    id: 'g-restroom-f', label: 'Women\'s Restroom', type: 'bathroom', floor: 0, area_sqm: 12,
    polygon: { vertices: rect('g-restroom-f', 10.5, 10, 3, 3) },
    center: { x: 12, y: 11.5 },
    metadata: { amenities: ['toilets', 'sinks'], accessibility: true },
  },
  {
    id: 'g-hallway', label: 'Ground Hallway', type: 'hallway', floor: 0, area_sqm: 20,
    polygon: { vertices: rect('g-hallway', 6, 10, 4.5, 3) },
    center: { x: 8.25, y: 11.5 },
    metadata: { accessibility: true },
  },
  {
    id: 'g-stairs', label: 'Stairwell', type: 'hallway', floor: 0, area_sqm: 8,
    polygon: { vertices: rect('g-stairs', 13, 0, 2.5, 3) },
    center: { x: 14.25, y: 1.5 },
    metadata: { amenities: ['stairs', 'elevator'] },
  },
];

const groundFloorWalls: Wall[] = [
  // Exterior
  ...rectWalls(0, 0, 15.5, 13, 'exterior', 0.25),
  // Interior divisions
  { id: wid(), start: { x: 8, y: 0 }, end: { x: 8, y: 6 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 8, y: 4 }, end: { x: 13, y: 4 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 0, y: 6 }, end: { x: 13, y: 6 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 6, y: 6 }, end: { x: 6, y: 13 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 10.5, y: 6 }, end: { x: 10.5, y: 13 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 10.5, y: 10 }, end: { x: 13.5, y: 10 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 6, y: 10 }, end: { x: 10.5, y: 10 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 13, y: 0 }, end: { x: 13, y: 7 }, thickness_m: 0.15, type: 'interior' },
];

const groundFloorDoors: Door[] = [
  { id: did(), position: { x: 4, y: 0 }, width_m: 1.8, type: 'double', connects: ['g-lobby', 'outside'] },
  { id: did(), position: { x: 8, y: 2 }, width_m: 0.9, type: 'single', connects: ['g-lobby', 'g-reception'] },
  { id: did(), position: { x: 8, y: 5 }, width_m: 0.9, type: 'single', connects: ['g-lobby', 'g-security'] },
  { id: did(), position: { x: 3, y: 6 }, width_m: 1.2, type: 'double', connects: ['g-lobby', 'g-cafe'] },
  { id: did(), position: { x: 8.25, y: 6 }, width_m: 0.9, type: 'single', connects: ['g-lobby', 'g-kitchen'] },
  { id: did(), position: { x: 12, y: 7 }, width_m: 0.9, type: 'single', connects: ['g-hallway', 'g-restroom-m'] },
  { id: did(), position: { x: 12, y: 10 }, width_m: 0.9, type: 'single', connects: ['g-hallway', 'g-restroom-f'] },
  { id: did(), position: { x: 13, y: 1.5 }, width_m: 0.9, type: 'single', connects: ['g-reception', 'g-stairs'] },
];

const groundFloorWindows: WindowElement[] = [
  { id: wiid(), position: { x: 2, y: 0 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 6, y: 0 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 0, y: 3 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 0, y: 8 }, width_m: 2.0, wall_id: '' },
  { id: wiid(), position: { x: 0, y: 11 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 3 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 9 }, width_m: 1.5, wall_id: '' },
];

// ═══════════════════════════════════════
//  FIRST FLOOR (Level 1)
// ═══════════════════════════════════════
const firstFloorRooms: Room[] = [
  {
    id: 'f1-openoffice', label: 'Open Office', type: 'office', floor: 1, area_sqm: 60,
    polygon: { vertices: rect('f1-openoffice', 0, 0, 8, 7.5) },
    center: { x: 4, y: 3.75 },
    metadata: { capacity: 30, amenities: ['desks', 'monitors', 'whiteboard'], accessibility: true },
  },
  {
    id: 'f1-meeting-a', label: 'Meeting Room A', type: 'office', floor: 1, area_sqm: 20,
    polygon: { vertices: rect('f1-meeting-a', 8, 0, 5, 4) },
    center: { x: 10.5, y: 2 },
    metadata: { capacity: 8, amenities: ['projector', 'whiteboard', 'video_conf'], accessibility: true },
  },
  {
    id: 'f1-meeting-b', label: 'Meeting Room B', type: 'office', floor: 1, area_sqm: 15,
    polygon: { vertices: rect('f1-meeting-b', 8, 4, 5, 3.5) },
    center: { x: 10.5, y: 5.75 },
    metadata: { capacity: 6, amenities: ['screen', 'whiteboard'] },
  },
  {
    id: 'f1-manager', label: 'Manager Office', type: 'office', floor: 1, area_sqm: 18,
    polygon: { vertices: rect('f1-manager', 0, 7.5, 5, 5.5) },
    center: { x: 2.5, y: 10.25 },
    metadata: { capacity: 3, amenities: ['desk', 'bookshelf', 'couch'] },
  },
  {
    id: 'f1-breakroom', label: 'Break Room', type: 'kitchen', floor: 1, area_sqm: 15,
    polygon: { vertices: rect('f1-breakroom', 5, 7.5, 5, 3) },
    center: { x: 7.5, y: 9 },
    metadata: { capacity: 8, amenities: ['microwave', 'fridge', 'coffee_machine', 'vending'], accessibility: true },
  },
  {
    id: 'f1-restroom', label: 'Restroom', type: 'bathroom', floor: 1, area_sqm: 10,
    polygon: { vertices: rect('f1-restroom', 10, 7.5, 3.5, 3) },
    center: { x: 11.75, y: 9 },
    metadata: { amenities: ['toilets', 'sinks'], accessibility: true },
  },
  {
    id: 'f1-hallway', label: 'First Floor Corridor', type: 'hallway', floor: 1, area_sqm: 18,
    polygon: { vertices: rect('f1-hallway', 5, 10.5, 8.5, 2.5) },
    center: { x: 9.25, y: 11.75 },
    metadata: { accessibility: true },
  },
  {
    id: 'f1-stairs', label: 'Stairwell', type: 'hallway', floor: 1, area_sqm: 8,
    polygon: { vertices: rect('f1-stairs', 13, 0, 2.5, 3) },
    center: { x: 14.25, y: 1.5 },
    metadata: { amenities: ['stairs', 'elevator'] },
  },
  {
    id: 'f1-server', label: 'Server Room', type: 'office', floor: 1, area_sqm: 10,
    polygon: { vertices: rect('f1-server', 13.5, 10.5, 2, 2.5) },
    center: { x: 14.5, y: 11.75 },
    metadata: { capacity: 1, amenities: ['servers', 'cooling'] },
  },
];

const firstFloorWalls: Wall[] = [
  ...rectWalls(0, 0, 15.5, 13, 'exterior', 0.25),
  { id: wid(), start: { x: 8, y: 0 }, end: { x: 8, y: 7.5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 8, y: 4 }, end: { x: 13, y: 4 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 0, y: 7.5 }, end: { x: 15.5, y: 7.5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 5, y: 7.5 }, end: { x: 5, y: 13 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 10, y: 7.5 }, end: { x: 10, y: 10.5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 5, y: 10.5 }, end: { x: 15.5, y: 10.5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 13, y: 0 }, end: { x: 13, y: 7.5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 13.5, y: 10.5 }, end: { x: 13.5, y: 13 }, thickness_m: 0.15, type: 'interior' },
];

const firstFloorDoors: Door[] = [
  { id: did(), position: { x: 8, y: 2 }, width_m: 1.2, type: 'double', connects: ['f1-openoffice', 'f1-meeting-a'] },
  { id: did(), position: { x: 8, y: 5.75 }, width_m: 0.9, type: 'single', connects: ['f1-openoffice', 'f1-meeting-b'] },
  { id: did(), position: { x: 2.5, y: 7.5 }, width_m: 0.9, type: 'single', connects: ['f1-openoffice', 'f1-manager'] },
  { id: did(), position: { x: 7.5, y: 7.5 }, width_m: 0.9, type: 'single', connects: ['f1-openoffice', 'f1-breakroom'] },
  { id: did(), position: { x: 11.75, y: 7.5 }, width_m: 0.9, type: 'single', connects: ['f1-hallway', 'f1-restroom'] },
  { id: did(), position: { x: 13, y: 1.5 }, width_m: 0.9, type: 'single', connects: ['f1-meeting-a', 'f1-stairs'] },
  { id: did(), position: { x: 9, y: 10.5 }, width_m: 0.9, type: 'single', connects: ['f1-breakroom', 'f1-hallway'] },
];

const firstFloorWindows: WindowElement[] = [
  { id: wiid(), position: { x: 0, y: 2 }, width_m: 2.0, wall_id: '' },
  { id: wiid(), position: { x: 0, y: 5 }, width_m: 2.0, wall_id: '' },
  { id: wiid(), position: { x: 0, y: 10 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 2 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 5 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 3, y: 13 }, width_m: 1.5, wall_id: '' },
];

// ═══════════════════════════════════════
//  SECOND FLOOR (Level 2)
// ═══════════════════════════════════════
const secondFloorRooms: Room[] = [
  {
    id: 'f2-exec', label: 'Executive Suite', type: 'office', floor: 2, area_sqm: 35,
    polygon: { vertices: rect('f2-exec', 0, 0, 7, 5) },
    center: { x: 3.5, y: 2.5 },
    metadata: { capacity: 5, amenities: ['desk', 'lounge', 'private_bathroom'], accessibility: true },
  },
  {
    id: 'f2-boardroom', label: 'Board Room', type: 'office', floor: 2, area_sqm: 40,
    polygon: { vertices: rect('f2-boardroom', 7, 0, 6, 5) },
    center: { x: 10, y: 2.5 },
    metadata: { capacity: 16, amenities: ['projector', 'video_conf', 'whiteboard', 'catering'], accessibility: true },
  },
  {
    id: 'f2-collab', label: 'Collaboration Space', type: 'living_room', floor: 2, area_sqm: 45,
    polygon: { vertices: rect('f2-collab', 0, 5, 8, 5.5) },
    center: { x: 4, y: 7.75 },
    metadata: { capacity: 20, amenities: ['sofas', 'tables', 'screens', 'bean_bags'], accessibility: true },
  },
  {
    id: 'f2-phone-1', label: 'Phone Booth 1', type: 'office', floor: 2, area_sqm: 4,
    polygon: { vertices: rect('f2-phone-1', 8, 5, 2, 2) },
    center: { x: 9, y: 6 },
    metadata: { capacity: 1, amenities: ['desk', 'sound_insulation'] },
  },
  {
    id: 'f2-phone-2', label: 'Phone Booth 2', type: 'office', floor: 2, area_sqm: 4,
    polygon: { vertices: rect('f2-phone-2', 10, 5, 2, 2) },
    center: { x: 11, y: 6 },
    metadata: { capacity: 1, amenities: ['desk', 'sound_insulation'] },
  },
  {
    id: 'f2-wellness', label: 'Wellness Room', type: 'bedroom', floor: 2, area_sqm: 15,
    polygon: { vertices: rect('f2-wellness', 8, 7, 5.5, 3) },
    center: { x: 10.75, y: 8.5 },
    metadata: { capacity: 2, amenities: ['couch', 'meditation_cushions', 'dim_lighting'] },
  },
  {
    id: 'f2-restroom', label: 'Restroom', type: 'bathroom', floor: 2, area_sqm: 10,
    polygon: { vertices: rect('f2-restroom', 8, 10, 3.5, 3) },
    center: { x: 9.75, y: 11.5 },
    metadata: { amenities: ['toilets', 'sinks'], accessibility: true },
  },
  {
    id: 'f2-hallway', label: 'Second Floor Corridor', type: 'hallway', floor: 2, area_sqm: 12,
    polygon: { vertices: rect('f2-hallway', 0, 10.5, 8, 2.5) },
    center: { x: 4, y: 11.75 },
    metadata: { accessibility: true },
  },
  {
    id: 'f2-stairs', label: 'Stairwell', type: 'hallway', floor: 2, area_sqm: 8,
    polygon: { vertices: rect('f2-stairs', 13, 0, 2.5, 3) },
    center: { x: 14.25, y: 1.5 },
    metadata: { amenities: ['stairs', 'elevator'] },
  },
  {
    id: 'f2-storage', label: 'Storage', type: 'closet', floor: 2, area_sqm: 8,
    polygon: { vertices: rect('f2-storage', 11.5, 10, 2, 3) },
    center: { x: 12.5, y: 11.5 },
  },
];

const secondFloorWalls: Wall[] = [
  ...rectWalls(0, 0, 15.5, 13, 'exterior', 0.25),
  { id: wid(), start: { x: 7, y: 0 }, end: { x: 7, y: 5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 0, y: 5 }, end: { x: 15.5, y: 5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 8, y: 5 }, end: { x: 8, y: 13 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 10, y: 5 }, end: { x: 10, y: 7 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 8, y: 7 }, end: { x: 13.5, y: 7 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 0, y: 10.5 }, end: { x: 8, y: 10.5 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 8, y: 10 }, end: { x: 15.5, y: 10 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 11.5, y: 10 }, end: { x: 11.5, y: 13 }, thickness_m: 0.15, type: 'interior' },
  { id: wid(), start: { x: 13, y: 0 }, end: { x: 13, y: 5 }, thickness_m: 0.15, type: 'interior' },
];

const secondFloorDoors: Door[] = [
  { id: did(), position: { x: 7, y: 2.5 }, width_m: 0.9, type: 'single', connects: ['f2-exec', 'f2-boardroom'] },
  { id: did(), position: { x: 4, y: 5 }, width_m: 1.2, type: 'double', connects: ['f2-exec', 'f2-collab'] },
  { id: did(), position: { x: 9, y: 5 }, width_m: 0.9, type: 'single', connects: ['f2-collab', 'f2-phone-1'] },
  { id: did(), position: { x: 11, y: 5 }, width_m: 0.9, type: 'single', connects: ['f2-collab', 'f2-phone-2'] },
  { id: did(), position: { x: 10.75, y: 7 }, width_m: 0.9, type: 'single', connects: ['f2-phone-2', 'f2-wellness'] },
  { id: did(), position: { x: 9.75, y: 10 }, width_m: 0.9, type: 'single', connects: ['f2-wellness', 'f2-restroom'] },
  { id: did(), position: { x: 4, y: 10.5 }, width_m: 0.9, type: 'single', connects: ['f2-collab', 'f2-hallway'] },
  { id: did(), position: { x: 13, y: 1.5 }, width_m: 0.9, type: 'single', connects: ['f2-boardroom', 'f2-stairs'] },
];

const secondFloorWindows: WindowElement[] = [
  { id: wiid(), position: { x: 0, y: 2 }, width_m: 2.0, wall_id: '' },
  { id: wiid(), position: { x: 0, y: 7 }, width_m: 2.5, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 2 }, width_m: 2.0, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 6 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 15.5, y: 8 }, width_m: 1.5, wall_id: '' },
  { id: wiid(), position: { x: 3, y: 0 }, width_m: 2.0, wall_id: '' },
  { id: wiid(), position: { x: 10, y: 0 }, width_m: 2.0, wall_id: '' },
];

// ═══════════════════════════════════════
//  NAVIGATION GRAPH
// ═══════════════════════════════════════
const navNodes: NavNode[] = [
  // Ground floor
  { id: 'n-g-entrance', x: 4, y: 0, floor: 0, type: 'entrance', label: 'Main Entrance' },
  { id: 'n-g-lobby', x: 4, y: 3, floor: 0, type: 'room_center', label: 'Lobby', roomId: 'g-lobby' },
  { id: 'n-g-reception', x: 10.5, y: 2, floor: 0, type: 'room_center', label: 'Reception', roomId: 'g-reception' },
  { id: 'n-g-security', x: 10.5, y: 5.5, floor: 0, type: 'room_center', label: 'Security', roomId: 'g-security' },
  { id: 'n-g-cafe', x: 3, y: 9.5, floor: 0, type: 'room_center', label: 'Café', roomId: 'g-cafe' },
  { id: 'n-g-kitchen', x: 8.25, y: 8, floor: 0, type: 'room_center', label: 'Kitchen', roomId: 'g-kitchen' },
  { id: 'n-g-restroom-m', x: 12, y: 8.5, floor: 0, type: 'room_center', label: 'Men\'s Restroom', roomId: 'g-restroom-m' },
  { id: 'n-g-restroom-f', x: 12, y: 11.5, floor: 0, type: 'room_center', label: 'Women\'s Restroom', roomId: 'g-restroom-f' },
  { id: 'n-g-hallway', x: 8.25, y: 11.5, floor: 0, type: 'waypoint', label: 'Hallway' },
  { id: 'n-g-stairs', x: 14.25, y: 1.5, floor: 0, type: 'stairs', label: 'Stairwell', roomId: 'g-stairs' },
  { id: 'n-g-d-lobby-cafe', x: 3, y: 6, floor: 0, type: 'door' },
  { id: 'n-g-d-lobby-rec', x: 8, y: 2, floor: 0, type: 'door' },
  { id: 'n-g-d-lobby-sec', x: 8, y: 5, floor: 0, type: 'door' },
  // First floor
  { id: 'n-f1-openoffice', x: 4, y: 3.75, floor: 1, type: 'room_center', label: 'Open Office', roomId: 'f1-openoffice' },
  { id: 'n-f1-meeting-a', x: 10.5, y: 2, floor: 1, type: 'room_center', label: 'Meeting Room A', roomId: 'f1-meeting-a' },
  { id: 'n-f1-meeting-b', x: 10.5, y: 5.75, floor: 1, type: 'room_center', label: 'Meeting Room B', roomId: 'f1-meeting-b' },
  { id: 'n-f1-manager', x: 2.5, y: 10.25, floor: 1, type: 'room_center', label: 'Manager Office', roomId: 'f1-manager' },
  { id: 'n-f1-breakroom', x: 7.5, y: 9, floor: 1, type: 'room_center', label: 'Break Room', roomId: 'f1-breakroom' },
  { id: 'n-f1-restroom', x: 11.75, y: 9, floor: 1, type: 'room_center', label: 'Restroom', roomId: 'f1-restroom' },
  { id: 'n-f1-hallway', x: 9.25, y: 11.75, floor: 1, type: 'waypoint', label: 'Corridor' },
  { id: 'n-f1-stairs', x: 14.25, y: 1.5, floor: 1, type: 'stairs', label: 'Stairwell', roomId: 'f1-stairs' },
  // Second floor
  { id: 'n-f2-exec', x: 3.5, y: 2.5, floor: 2, type: 'room_center', label: 'Executive Suite', roomId: 'f2-exec' },
  { id: 'n-f2-boardroom', x: 10, y: 2.5, floor: 2, type: 'room_center', label: 'Board Room', roomId: 'f2-boardroom' },
  { id: 'n-f2-collab', x: 4, y: 7.75, floor: 2, type: 'room_center', label: 'Collaboration Space', roomId: 'f2-collab' },
  { id: 'n-f2-phone-1', x: 9, y: 6, floor: 2, type: 'room_center', label: 'Phone Booth 1', roomId: 'f2-phone-1' },
  { id: 'n-f2-phone-2', x: 11, y: 6, floor: 2, type: 'room_center', label: 'Phone Booth 2', roomId: 'f2-phone-2' },
  { id: 'n-f2-wellness', x: 10.75, y: 8.5, floor: 2, type: 'room_center', label: 'Wellness Room', roomId: 'f2-wellness' },
  { id: 'n-f2-restroom', x: 9.75, y: 11.5, floor: 2, type: 'room_center', label: 'Restroom', roomId: 'f2-restroom' },
  { id: 'n-f2-hallway', x: 4, y: 11.75, floor: 2, type: 'waypoint', label: 'Corridor' },
  { id: 'n-f2-stairs', x: 14.25, y: 1.5, floor: 2, type: 'stairs', label: 'Stairwell', roomId: 'f2-stairs' },
];

const navEdges: NavEdge[] = [
  // Ground floor connections
  { from: 'n-g-entrance', to: 'n-g-lobby', weight: 3, type: 'hallway' },
  { from: 'n-g-lobby', to: 'n-g-d-lobby-rec', weight: 4, type: 'hallway' },
  { from: 'n-g-d-lobby-rec', to: 'n-g-reception', weight: 2.5, type: 'room' },
  { from: 'n-g-lobby', to: 'n-g-d-lobby-sec', weight: 4.5, type: 'hallway' },
  { from: 'n-g-d-lobby-sec', to: 'n-g-security', weight: 2.5, type: 'room' },
  { from: 'n-g-lobby', to: 'n-g-d-lobby-cafe', weight: 3.5, type: 'hallway' },
  { from: 'n-g-d-lobby-cafe', to: 'n-g-cafe', weight: 3.5, type: 'room' },
  { from: 'n-g-cafe', to: 'n-g-kitchen', weight: 5, type: 'room' },
  { from: 'n-g-kitchen', to: 'n-g-hallway', weight: 3.5, type: 'hallway' },
  { from: 'n-g-hallway', to: 'n-g-restroom-m', weight: 3.5, type: 'hallway' },
  { from: 'n-g-hallway', to: 'n-g-restroom-f', weight: 3, type: 'hallway' },
  { from: 'n-g-reception', to: 'n-g-stairs', weight: 4, type: 'hallway' },
  // Floor transitions via stairs
  { from: 'n-g-stairs', to: 'n-f1-stairs', weight: 5, type: 'stairs' },
  { from: 'n-f1-stairs', to: 'n-f2-stairs', weight: 5, type: 'stairs' },
  // First floor connections
  { from: 'n-f1-stairs', to: 'n-f1-meeting-a', weight: 4, type: 'hallway' },
  { from: 'n-f1-openoffice', to: 'n-f1-meeting-a', weight: 6.5, type: 'room' },
  { from: 'n-f1-openoffice', to: 'n-f1-meeting-b', weight: 5, type: 'room' },
  { from: 'n-f1-openoffice', to: 'n-f1-manager', weight: 7, type: 'room' },
  { from: 'n-f1-openoffice', to: 'n-f1-breakroom', weight: 5.5, type: 'room' },
  { from: 'n-f1-breakroom', to: 'n-f1-hallway', weight: 3, type: 'hallway' },
  { from: 'n-f1-hallway', to: 'n-f1-restroom', weight: 3, type: 'hallway' },
  { from: 'n-f1-hallway', to: 'n-f1-manager', weight: 5, type: 'hallway' },
  // Second floor connections
  { from: 'n-f2-stairs', to: 'n-f2-boardroom', weight: 4, type: 'hallway' },
  { from: 'n-f2-exec', to: 'n-f2-boardroom', weight: 5, type: 'hallway' },
  { from: 'n-f2-exec', to: 'n-f2-collab', weight: 5, type: 'room' },
  { from: 'n-f2-collab', to: 'n-f2-phone-1', weight: 5, type: 'room' },
  { from: 'n-f2-collab', to: 'n-f2-phone-2', weight: 5.5, type: 'room' },
  { from: 'n-f2-phone-2', to: 'n-f2-wellness', weight: 3, type: 'room' },
  { from: 'n-f2-wellness', to: 'n-f2-restroom', weight: 3, type: 'hallway' },
  { from: 'n-f2-collab', to: 'n-f2-hallway', weight: 4, type: 'hallway' },
  { from: 'n-f2-hallway', to: 'n-f2-restroom', weight: 5, type: 'hallway' },
];

// ═══════════════════════════════════════
//  ASSEMBLED SPATIAL MODEL
// ═══════════════════════════════════════
export const MOCK_SPATIAL_MODEL: SpatialModel = {
  metadata: {
    building_name: 'Maptix Innovation Hub',
    building_type: 'commercial',
    total_floors: 3,
    total_area_sqm: 604.5,
    source: 'mock-data',
    bounding_box: { min: { x: 0, y: 0 }, max: { x: 15.5, y: 13 } },
    average_confidence: 0.94,
  },
  floors: [
    {
      id: 'floor-0', level: 0, label: 'Ground Floor', height_m: 3.2, elevation_m: 0,
      walls: groundFloorWalls, rooms: groundFloorRooms, doors: groundFloorDoors, windows: groundFloorWindows,
    },
    {
      id: 'floor-1', level: 1, label: 'First Floor', height_m: 3.0, elevation_m: 3.2,
      walls: firstFloorWalls, rooms: firstFloorRooms, doors: firstFloorDoors, windows: firstFloorWindows,
    },
    {
      id: 'floor-2', level: 2, label: 'Second Floor', height_m: 3.0, elevation_m: 6.2,
      walls: secondFloorWalls, rooms: secondFloorRooms, doors: secondFloorDoors, windows: secondFloorWindows,
    },
  ],
  navigation: { nodes: navNodes, edges: navEdges },
};

// ── Mock Projects ──
export const MOCK_PROJECTS = [
  {
    id: 'proj-1',
    name: 'Maptix Innovation Hub',
    description: 'Main office campus — 3 floors',
    building_type: 'commercial',
    status: 'completed',
    files: [],
    file_count: 4,
    has_spatial_model: true,
    has_3d_model: true,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-04-10T14:30:00Z',
    spatial_model_stats: {
      wall_count: 38,
      room_count: 28,
      door_count: 23,
      window_count: 19,
      total_area_sqm: 604.5,
      average_confidence: 0.94,
    },
  },
  {
    id: 'proj-2',
    name: 'Downtown Mall — Wing A',
    description: 'Shopping center first floor',
    building_type: 'commercial',
    status: 'processing',
    files: [],
    file_count: 2,
    has_spatial_model: false,
    has_3d_model: false,
    created_at: '2026-04-01T09:00:00Z',
    updated_at: '2026-04-18T08:00:00Z',
    spatial_model_stats: { wall_count: 0, room_count: 0, door_count: 0, window_count: 0, total_area_sqm: 0, average_confidence: 0 },
  },
  {
    id: 'proj-3',
    name: 'Residential Complex B12',
    description: 'Apartment building — 5 units',
    building_type: 'residential',
    status: 'completed',
    files: [],
    file_count: 6,
    has_spatial_model: true,
    has_3d_model: true,
    created_at: '2026-02-20T14:00:00Z',
    updated_at: '2026-03-28T16:45:00Z',
    spatial_model_stats: {
      wall_count: 52,
      room_count: 18,
      door_count: 14,
      window_count: 22,
      total_area_sqm: 420,
      average_confidence: 0.89,
    },
  },
  {
    id: 'proj-4',
    name: 'Hospital Wing C',
    description: 'Emergency department floor plan',
    building_type: 'healthcare',
    status: 'uploaded',
    files: [],
    file_count: 1,
    has_spatial_model: false,
    has_3d_model: false,
    created_at: '2026-04-12T11:00:00Z',
    updated_at: '2026-04-12T11:30:00Z',
    spatial_model_stats: { wall_count: 0, room_count: 0, door_count: 0, window_count: 0, total_area_sqm: 0, average_confidence: 0 },
  },
];

export const MOCK_USER = {
  id: 'user-1',
  email: 'architect@maptix.io',
  name: 'Alex Chen',
};

export function getAllRooms(): Room[] {
  return MOCK_SPATIAL_MODEL.floors.flatMap((f) => f.rooms);
}

export function getRoomById(id: string): Room | undefined {
  return getAllRooms().find((r) => r.id === id);
}

export function getFloorByLevel(level: number): Floor | undefined {
  return MOCK_SPATIAL_MODEL.floors.find((f) => f.level === level);
}
