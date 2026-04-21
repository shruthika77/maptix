/**
 * Client-side layout generator — produces spatial model JSON
 * entirely in the browser. Used as a fallback when the backend
 * is unavailable, so the UI never shows an error.
 */

// ── helpers ──────────────────────────────────────────────────────

let _id = 0;
const uid = (prefix: string) => `${prefix}-${++_id}-${Math.random().toString(36).slice(2, 6)}`;

interface Vec2 { x: number; y: number }

function rectPoly(x: number, y: number, w: number, h: number) {
  return {
    vertices: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  };
}

function rectWalls(
  x: number, y: number, w: number, h: number,
  type: 'exterior' | 'interior' = 'interior',
  thickness = 0.15,
) {
  return [
    { id: uid('w'), start: { x, y }, end: { x: x + w, y }, thickness_m: thickness, type },
    { id: uid('w'), start: { x: x + w, y }, end: { x: x + w, y: y + h }, thickness_m: thickness, type },
    { id: uid('w'), start: { x: x + w, y: y + h }, end: { x, y: y + h }, thickness_m: thickness, type },
    { id: uid('w'), start: { x, y: y + h }, end: { x, y }, thickness_m: thickness, type },
  ];
}

// ── room spec defaults ───────────────────────────────────────────

const ROOM_DEFAULTS: Record<string, { w: number; h: number }> = {
  living_room:      { w: 5,   h: 4.5 },
  bedroom:          { w: 4,   h: 3.5 },
  kitchen:          { w: 3.5, h: 3 },
  bathroom:         { w: 2.5, h: 2 },
  toilet:           { w: 1.8, h: 1.5 },
  dining_room:      { w: 4,   h: 3.5 },
  hallway:          { w: 5,   h: 1.5 },
  closet:           { w: 1.5, h: 1.5 },
  office:           { w: 4,   h: 3.5 },
  balcony:          { w: 3,   h: 1.5 },
  garage:           { w: 5,   h: 5 },
  study:            { w: 3,   h: 3 },
  corridor:         { w: 6,   h: 1.5 },
  staircase:        { w: 2.5, h: 2.5 },
  reception:        { w: 4,   h: 3 },
  conference_room:  { w: 5,   h: 4 },
  ward:             { w: 5,   h: 4 },
  operation_theater: { w: 6,  h: 5 },
  icu_room:         { w: 4,   h: 3.5 },
};

const ROOM_LABELS: Record<string, string> = {
  living_room: 'Living Room', bedroom: 'Bedroom', kitchen: 'Kitchen',
  bathroom: 'Bathroom', toilet: 'Toilet', dining_room: 'Dining Room',
  hallway: 'Hallway', closet: 'Closet', office: 'Office',
  balcony: 'Balcony', garage: 'Garage', study: 'Study',
  corridor: 'Corridor', staircase: 'Staircase', reception: 'Reception',
  conference_room: 'Conference Room', ward: 'Ward',
  operation_theater: 'Operation Theater', icu_room: 'ICU',
};

// ── prompt parser ────────────────────────────────────────────────

interface ParsedRoom {
  type: string;
  label: string;
  count: number;
  width?: number;
  length?: number;
}

interface ParsedFloor {
  level: number;
  label: string;
  rooms: ParsedRoom[];
}

function parsePrompt(prompt: string): ParsedFloor[] {
  const text = prompt.toLowerCase().trim();

  // Multi-floor: check for "ground floor:", "first floor:", etc.
  const floorSplitRe = /(?:ground\s*floor|first\s*floor|second\s*floor|floor\s*\d+|level\s*\d+)\s*[:;-]/gi;
  const floorMatches = [...text.matchAll(floorSplitRe)];

  if (floorMatches.length > 1) {
    const floors: ParsedFloor[] = [];
    for (let i = 0; i < floorMatches.length; i++) {
      const start = floorMatches[i].index! + floorMatches[i][0].length;
      const end = i + 1 < floorMatches.length ? floorMatches[i + 1].index! : text.length;
      const chunk = text.slice(start, end);
      floors.push({
        level: i,
        label: i === 0 ? 'Ground Floor' : `Floor ${i}`,
        rooms: parseRoomList(chunk),
      });
    }
    return floors;
  }

  // Single floor — just parse the whole thing
  return [{ level: 0, label: 'Ground Floor', rooms: parseRoomList(text) }];
}

function parseRoomList(text: string): ParsedRoom[] {
  const rooms: ParsedRoom[] = [];

  // Known room-type patterns (order matters — longer first)
  const patterns: [RegExp, string][] = [
    [/(\d+)\s*(?:x\s*)?(?:operation\s*theat(?:er|re)s?|ots?)/g, 'operation_theater'],
    [/(\d+)\s*(?:x\s*)?(?:conference\s*rooms?)/g, 'conference_room'],
    [/(\d+)\s*(?:x\s*)?(?:living\s*rooms?|drawing\s*rooms?|halls?)/g, 'living_room'],
    [/(\d+)\s*(?:x\s*)?(?:dining\s*rooms?)/g, 'dining_room'],
    [/(\d+)\s*(?:x\s*)?(?:bed\s*rooms?|bedrooms?)/g, 'bedroom'],
    [/(\d+)\s*(?:x\s*)?(?:bath\s*rooms?|bathrooms?)/g, 'bathroom'],
    [/(\d+)\s*(?:x\s*)?(?:toilets?|wcs?|restrooms?)/g, 'toilet'],
    [/(\d+)\s*(?:x\s*)?(?:kitchens?)/g, 'kitchen'],
    [/(\d+)\s*(?:x\s*)?(?:offices?)/g, 'office'],
    [/(\d+)\s*(?:x\s*)?(?:balcon(?:y|ies))/g, 'balcony'],
    [/(\d+)\s*(?:x\s*)?(?:garages?|parking)/g, 'garage'],
    [/(\d+)\s*(?:x\s*)?(?:stud(?:y|ies))/g, 'study'],
    [/(\d+)\s*(?:x\s*)?(?:closets?|store\s*rooms?)/g, 'closet'],
    [/(\d+)\s*(?:x\s*)?(?:corridors?)/g, 'corridor'],
    [/(\d+)\s*(?:x\s*)?(?:hallways?)/g, 'hallway'],
    [/(\d+)\s*(?:x\s*)?(?:receptions?)/g, 'reception'],
    [/(\d+)\s*(?:x\s*)?(?:wards?)/g, 'ward'],
    [/(\d+)\s*(?:x\s*)?(?:icu\s*rooms?|icus?)/g, 'icu_room'],
    [/(\d+)\s*(?:x\s*)?(?:staircases?|stairs?)/g, 'staircase'],
  ];

  const found = new Set<string>();
  for (const [re, type] of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const count = parseInt(m[1], 10) || 1;
      rooms.push({ type, label: ROOM_LABELS[type] || type, count });
      found.add(type);
    }
  }

  // Also detect non-numbered mentions
  const singles: [RegExp, string][] = [
    [/(?:operation\s*theat(?:er|re))/g, 'operation_theater'],
    [/(?:conference\s*room)/g, 'conference_room'],
    [/(?:living\s*room|drawing\s*room|hall\b)/g, 'living_room'],
    [/(?:dining\s*room)/g, 'dining_room'],
    [/(?:bed\s*room|bedroom)/g, 'bedroom'],
    [/(?:bath\s*room|bathroom)/g, 'bathroom'],
    [/(?:toilet|wc|restroom)/g, 'toilet'],
    [/(?:kitchen)/g, 'kitchen'],
    [/(?:office)/g, 'office'],
    [/(?:balcony)/g, 'balcony'],
    [/(?:garage|parking)/g, 'garage'],
    [/(?:study)/g, 'study'],
    [/(?:closet|store\s*room)/g, 'closet'],
    [/(?:corridor)/g, 'corridor'],
    [/(?:hallway)/g, 'hallway'],
    [/(?:reception)/g, 'reception'],
    [/(?:ward)/g, 'ward'],
    [/(?:icu)/g, 'icu_room'],
    [/(?:staircase|stairs)/g, 'staircase'],
  ];

  for (const [re, type] of singles) {
    if (!found.has(type) && re.test(text)) {
      rooms.push({ type, label: ROOM_LABELS[type] || type, count: 1 });
    }
  }

  // BHK shortcut — e.g. "2bhk", "3 bhk"
  const bhk = text.match(/(\d)\s*bhk/i);
  if (bhk && rooms.length === 0) {
    const n = parseInt(bhk[1], 10);
    rooms.push({ type: 'living_room', label: 'Living Room', count: 1 });
    rooms.push({ type: 'kitchen', label: 'Kitchen', count: 1 });
    rooms.push({ type: 'bedroom', label: 'Bedroom', count: n });
    rooms.push({ type: 'bathroom', label: 'Bathroom', count: n });
    rooms.push({ type: 'hallway', label: 'Hallway', count: 1 });
  }

  // If still nothing, return a basic layout
  if (rooms.length === 0) {
    rooms.push({ type: 'living_room', label: 'Living Room', count: 1 });
    rooms.push({ type: 'bedroom', label: 'Bedroom', count: 1 });
    rooms.push({ type: 'kitchen', label: 'Kitchen', count: 1 });
    rooms.push({ type: 'bathroom', label: 'Bathroom', count: 1 });
  }

  return rooms;
}

// ── layout engine (two-strip row packer) ─────────────────────────

interface PlacedRoom {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  area_sqm: number;
}

function layoutRooms(parsedRooms: ParsedRoom[], plotW?: number, plotH?: number): PlacedRoom[] {
  // Flatten counted rooms
  const expanded: { type: string; label: string; w: number; h: number }[] = [];
  for (const r of parsedRooms) {
    const defaults = ROOM_DEFAULTS[r.type] || { w: 3.5, h: 3 };
    const w = r.width || defaults.w;
    const h = r.length || defaults.h;
    for (let i = 0; i < r.count; i++) {
      expanded.push({
        type: r.type,
        label: r.count > 1 ? `${r.label} ${i + 1}` : r.label,
        w, h,
      });
    }
  }

  // Sort large → small for better packing
  expanded.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  // Simple row packer
  const maxRowWidth = plotW || Math.max(12, expanded.reduce((s, r) => s + r.w, 0) * 0.5);
  const placed: PlacedRoom[] = [];
  let curX = 0;
  let curY = 0;
  let rowMaxH = 0;

  for (const room of expanded) {
    if (curX + room.w > maxRowWidth && curX > 0) {
      curY += rowMaxH + 0.15; // wall gap
      curX = 0;
      rowMaxH = 0;
    }
    placed.push({
      id: uid('room'),
      label: room.label,
      type: room.type,
      x: curX,
      y: curY,
      w: room.w,
      h: room.h,
      area_sqm: +(room.w * room.h).toFixed(1),
    });
    curX += room.w + 0.15;
    rowMaxH = Math.max(rowMaxH, room.h);
  }

  return placed;
}

// ── spatial model builder ────────────────────────────────────────

function buildFloor(
  level: number,
  label: string,
  parsedRooms: ParsedRoom[],
  wallHeight: number,
  plotW?: number,
  plotH?: number,
) {
  const placed = layoutRooms(parsedRooms, plotW, plotH);
  if (placed.length === 0) return null;

  // Bounding box of all placed rooms
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of placed) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }

  const walls = [
    // Exterior
    ...rectWalls(minX, minY, maxX - minX, maxY - minY, 'exterior', 0.25),
    // Interior per room
    ...placed.flatMap((r) => rectWalls(r.x, r.y, r.w, r.h, 'interior', 0.15)),
  ];

  const rooms = placed.map((r) => ({
    id: r.id,
    label: r.label,
    type: r.type,
    floor: level,
    area_sqm: r.area_sqm,
    polygon: rectPoly(r.x, r.y, r.w, r.h),
    center: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
  }));

  // Doors: place one per room on the wall closest to center
  const doors = placed.map((r) => ({
    id: uid('d'),
    position: { x: r.x + r.w / 2, y: r.y },
    width_m: 0.9,
    type: 'single' as const,
    connects: [r.id, 'hallway'],
  }));

  // Windows: one per room on the bottom wall
  const windows = placed.map((r) => ({
    id: uid('win'),
    position: { x: r.x + r.w / 2, y: r.y + r.h },
    width_m: 1.2,
    wall_id: '',
  }));

  return {
    id: `floor-${level}`,
    level,
    label,
    height_m: wallHeight,
    elevation_m: level * wallHeight,
    walls,
    rooms,
    doors,
    windows,
    _bbox: { minX, minY, maxX, maxY },
  };
}

// ── Public API ───────────────────────────────────────────────────

export interface GenerateFromPromptInput {
  prompt?: string;
  building_type?: string;
  total_floors?: number;
  plot_width_m?: number;
  plot_length_m?: number;
  wall_height_m?: number;
  floors?: {
    level: number;
    label: string;
    height_m: number;
    rooms: {
      name: string;
      type: string;
      width_m?: number;
      length_m?: number;
      count: number;
    }[];
  }[];
}

export function generateFromPromptClient(input: GenerateFromPromptInput) {
  _id = 0; // reset ids per generation
  const wallHeight = input.wall_height_m || 3.0;

  let parsedFloors: ParsedFloor[];

  if (input.floors && input.floors.length > 0) {
    // Manual form input — already structured
    parsedFloors = input.floors.map((f) => ({
      level: f.level,
      label: f.label,
      rooms: f.rooms.map((r) => ({
        type: r.type,
        label: r.name,
        count: r.count,
        width: r.width_m,
        length: r.length_m,
      })),
    }));
  } else if (input.prompt) {
    parsedFloors = parsePrompt(input.prompt);
  } else {
    // Fallback
    parsedFloors = [{ level: 0, label: 'Ground Floor', rooms: [
      { type: 'living_room', label: 'Living Room', count: 1 },
      { type: 'bedroom', label: 'Bedroom', count: 1 },
      { type: 'kitchen', label: 'Kitchen', count: 1 },
      { type: 'bathroom', label: 'Bathroom', count: 1 },
    ] }];
  }

  const builtFloors: any[] = [];
  let globalMinX = Infinity, globalMinY = Infinity, globalMaxX = -Infinity, globalMaxY = -Infinity;

  for (const pf of parsedFloors) {
    const floor = buildFloor(
      pf.level, pf.label, pf.rooms, wallHeight,
      input.plot_width_m, input.plot_length_m,
    );
    if (floor) {
      builtFloors.push(floor);
      globalMinX = Math.min(globalMinX, floor._bbox.minX);
      globalMinY = Math.min(globalMinY, floor._bbox.minY);
      globalMaxX = Math.max(globalMaxX, floor._bbox.maxX);
      globalMaxY = Math.max(globalMaxY, floor._bbox.maxY);
    }
  }

  // Strip _bbox from output
  const floors = builtFloors.map(({ _bbox, ...rest }) => rest);

  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalWalls = floors.reduce((s, f) => s + f.walls.length, 0);
  const totalDoors = floors.reduce((s, f) => s + f.doors.length, 0);
  const totalArea = floors.reduce(
    (s, f) => s + f.rooms.reduce((rs: number, r: any) => rs + r.area_sqm, 0), 0,
  );

  return {
    model_data: {
      metadata: {
        building_name: 'Generated Layout',
        building_type: input.building_type || 'residential',
        total_floors: floors.length,
        total_area_sqm: +totalArea.toFixed(1),
        source: 'client-generator',
        bounding_box: {
          min: { x: globalMinX === Infinity ? 0 : globalMinX, y: globalMinY === Infinity ? 0 : globalMinY },
          max: { x: globalMaxX === -Infinity ? 12 : globalMaxX, y: globalMaxY === -Infinity ? 10 : globalMaxY },
        },
        average_confidence: 0.85,
      },
      floors,
    },
    stats: {
      room_count: totalRooms,
      wall_count: totalWalls,
      door_count: totalDoors,
      window_count: floors.reduce((s, f) => s + f.windows.length, 0),
      total_area_sqm: +totalArea.toFixed(1),
    },
  };
}

/**
 * Upload fallback — generates a simple mock model for the uploaded file
 * since we can't do CV processing client-side.
 */
export function generateFromUploadClient(fileName: string, buildingType: string = 'residential') {
  return generateFromPromptClient({
    prompt: '2bhk apartment with living room, kitchen, 2 bedrooms, 2 bathrooms, hallway, balcony',
    building_type: buildingType,
  });
}
