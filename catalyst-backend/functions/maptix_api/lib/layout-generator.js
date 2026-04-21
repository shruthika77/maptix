'use strict';

/**
 * Layout Generation Engine — ported from Python to Node.js
 * 
 * Rule-based floor plan layout generator:
 * - Parses room specs from prompt or manual form
 * - Places rooms in a two-strip arrangement
 * - Generates walls, doors, windows automatically
 * - No ML/AI needed for generation (AI only for prompt parsing)
 */

const crypto = require('crypto');
function uuidv4() { return crypto.randomUUID(); }

// ── Room type defaults (standard sizes in meters) ──
const ROOM_DEFAULTS = {
  // Residential
  living_room: { width: 5.0, length: 6.0, min_area: 15 },
  bedroom: { width: 4.0, length: 4.5, min_area: 10 },
  master_bedroom: { width: 5.0, length: 5.5, min_area: 16 },
  kitchen: { width: 3.5, length: 4.0, min_area: 8 },
  bathroom: { width: 2.5, length: 3.0, min_area: 4 },
  toilet: { width: 1.5, length: 2.0, min_area: 2.5 },
  dining_room: { width: 4.0, length: 5.0, min_area: 12 },
  hallway: { width: 1.5, length: 5.0, min_area: 5 },
  corridor: { width: 1.8, length: 8.0, min_area: 6 },
  closet: { width: 1.5, length: 2.0, min_area: 2 },
  study: { width: 3.0, length: 3.5, min_area: 8 },
  balcony: { width: 2.0, length: 4.0, min_area: 4 },
  garage: { width: 3.5, length: 6.0, min_area: 18 },
  laundry: { width: 2.5, length: 3.0, min_area: 5 },
  porch: { width: 3.0, length: 3.0, min_area: 6 },
  office: { width: 3.5, length: 4.0, min_area: 10 },
  guest_room: { width: 3.5, length: 4.0, min_area: 10 },
  // Hospital / Commercial
  operation_theater: { width: 6.0, length: 7.0, min_area: 35 },
  icu_room: { width: 5.0, length: 6.0, min_area: 20 },
  private_room: { width: 4.0, length: 5.0, min_area: 15 },
  ward: { width: 6.0, length: 8.0, min_area: 30 },
  general_ward: { width: 6.0, length: 8.0, min_area: 30 },
  labor_room: { width: 4.5, length: 5.5, min_area: 18 },
  nurse_station: { width: 3.0, length: 4.0, min_area: 8 },
  reception: { width: 4.0, length: 5.0, min_area: 15 },
  waiting_area: { width: 5.0, length: 6.0, min_area: 20 },
  pharmacy: { width: 3.5, length: 5.0, min_area: 12 },
  store: { width: 3.0, length: 4.0, min_area: 8 },
  sterilization_room: { width: 3.0, length: 4.0, min_area: 10 },
  nicu_room: { width: 4.0, length: 5.0, min_area: 15 },
  lab: { width: 4.0, length: 5.0, min_area: 15 },
  x_ray_room: { width: 4.0, length: 5.0, min_area: 15 },
  conference_room: { width: 5.0, length: 6.0, min_area: 20 },
  cafeteria: { width: 6.0, length: 8.0, min_area: 30 },
  lift: { width: 2.0, length: 2.0, min_area: 3 },
  staircase: { width: 3.0, length: 3.0, min_area: 6 },
  fhc: { width: 2.0, length: 2.5, min_area: 3 },
  wazu_area: { width: 2.5, length: 3.0, min_area: 5 },
  namaz_room: { width: 4.0, length: 5.0, min_area: 12 },
  gown_change_room: { width: 2.5, length: 3.0, min_area: 5 },
  scrub_area: { width: 2.0, length: 2.5, min_area: 4 },
  unknown: { width: 4.0, length: 4.0, min_area: 10 },
};

// ── Text Prompt Parser ──

function parsePrompt(prompt, buildingType = 'residential') {
  const promptLower = prompt.toLowerCase().trim();
  const floors = [];

  // Extract plot dimensions
  let plotWidth = null;
  let plotLength = null;
  const dimMatch = promptLower.match(/(\d+)\s*[xX×]\s*(\d+)\s*(ft|feet|m|meter|metre)?/);
  if (dimMatch) {
    let d1 = parseFloat(dimMatch[1]);
    let d2 = parseFloat(dimMatch[2]);
    const unit = dimMatch[3] || 'ft';
    if (unit.includes('ft') || unit.includes('feet')) {
      d1 *= 0.3048;
      d2 *= 0.3048;
    }
    plotWidth = Math.min(d1, d2);
    plotLength = Math.max(d1, d2);
  }

  // Check if multi-floor description
  const hasFloorSections = /ground\s*floor|first\s*floor|second\s*floor|floor\s*[01234]/.test(promptLower);

  if (hasFloorSections) {
    const sections = promptLower.split(/(?:ground\s*floor|first\s*floor|second\s*floor|third\s*floor|floor\s*\d)\s*[:;-]?\s*/);
    const labelMatches = promptLower.match(/(ground\s*floor|first\s*floor|second\s*floor|third\s*floor|floor\s*\d)/g) || [];

    labelMatches.forEach((labelMatch, i) => {
      const sectionText = sections[i + 1] || '';
      const rooms = extractRooms(sectionText, buildingType);
      const label = labelMatch.trim().replace(/\b\w/g, c => c.toUpperCase());
      floors.push({ level: i, label, rooms, height_m: 3.0 });
    });
  } else {
    let rooms = extractRooms(promptLower, buildingType);

    // BHK pattern
    const bhkMatch = promptLower.match(/(\d)\s*bhk/);
    if (bhkMatch) {
      const numBedrooms = parseInt(bhkMatch[1]);
      const bedroomCount = rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
      if (bedroomCount < numBedrooms) {
        for (let i = 0; i < numBedrooms - bedroomCount; i++) {
          rooms.push({ name: 'Bedroom', type: 'bedroom', count: 1 });
        }
      }
      const typesPresent = new Set(rooms.map(r => r.type));
      if (!typesPresent.has('living_room') && !typesPresent.has('hall')) {
        rooms.unshift({ name: 'Living Room', type: 'living_room', count: 1 });
      }
      if (!typesPresent.has('kitchen')) {
        rooms.push({ name: 'Kitchen', type: 'kitchen', count: 1 });
      }
      if (!typesPresent.has('bathroom') && !typesPresent.has('toilet')) {
        rooms.push({ name: 'Bathroom', type: 'bathroom', count: 1 });
      }
    }

    if (rooms.length === 0) {
      rooms = getDefaultRooms(buildingType);
    }

    floors.push({ level: 0, label: 'Ground Floor', rooms, height_m: 3.0 });
  }

  // Estimate plot dimensions if not provided
  if (!plotWidth || !plotLength) {
    let totalArea = 0;
    for (const floor of floors) {
      for (const room of floor.rooms) {
        if (room.area_sqm) {
          totalArea += room.area_sqm * (room.count || 1);
        } else {
          const defaults = ROOM_DEFAULTS[room.type] || ROOM_DEFAULTS.unknown;
          totalArea += defaults.width * defaults.length * (room.count || 1);
        }
      }
    }
    totalArea *= 1.3;
    plotLength = Math.sqrt(totalArea * 1.5);
    plotWidth = totalArea / plotLength;
  }

  return { floors, plotWidth, plotLength };
}

function extractRooms(text, buildingType) {
  const rooms = [];
  const roomPatterns = [
    [/operation\s*theat(?:er|re)/g, 'operation_theater', 'Operation Theater'],
    [/general\s*ward/g, 'general_ward', 'General Ward'],
    [/sterilization\s*room/g, 'sterilization_room', 'Sterilization Room'],
    [/gown\s*change\s*room/g, 'gown_change_room', 'Gown Change Room'],
    [/nurse\s*station/g, 'nurse_station', 'Nurse Station'],
    [/master\s*bed\s*room/g, 'master_bedroom', 'Master Bedroom'],
    [/living\s*room/g, 'living_room', 'Living Room'],
    [/dining\s*room/g, 'dining_room', 'Dining Room'],
    [/guest\s*room/g, 'guest_room', 'Guest Room'],
    [/private\s*room/g, 'private_room', 'Private Room'],
    [/labor\s*room/g, 'labor_room', 'Labor Room'],
    [/conference\s*room/g, 'conference_room', 'Conference Room'],
    [/namaz\s*room/g, 'namaz_room', 'Namaz Room'],
    [/nicu\s*room/g, 'nicu_room', 'NICU Room'],
    [/icu\s*room/g, 'icu_room', 'ICU Room'],
    [/x[\s-]*ray\s*room/g, 'x_ray_room', 'X-Ray Room'],
    [/waiting\s*area/g, 'waiting_area', 'Waiting Area'],
    [/wazu\s*area/g, 'wazu_area', 'Wazu Area'],
    [/scrub\s*area/g, 'scrub_area', 'Scrub Area'],
    [/bed\s*room/g, 'bedroom', 'Bedroom'],
    [/bath\s*room/g, 'bathroom', 'Bathroom'],
    [/stair\s*case/g, 'staircase', 'Staircase'],
    [/bedroom/g, 'bedroom', 'Bedroom'],
    [/bathroom/g, 'bathroom', 'Bathroom'],
    [/kitchen/g, 'kitchen', 'Kitchen'],
    [/toilet/g, 'toilet', 'Toilet'],
    [/hallway/g, 'hallway', 'Hallway'],
    [/corridor/g, 'corridor', 'Corridor'],
    [/closet/g, 'closet', 'Closet'],
    [/garage/g, 'garage', 'Garage'],
    [/balcony/g, 'balcony', 'Balcony'],
    [/study/g, 'study', 'Study'],
    [/office/g, 'office', 'Office'],
    [/laundry/g, 'laundry', 'Laundry'],
    [/porch/g, 'porch', 'Porch'],
    [/reception/g, 'reception', 'Reception'],
    [/pharmacy/g, 'pharmacy', 'Pharmacy'],
    [/cafeteria/g, 'cafeteria', 'Cafeteria'],
    [/store/g, 'store', 'Store'],
    [/lab(?:oratory)?/g, 'lab', 'Laboratory'],
    [/lift/g, 'lift', 'Lift'],
    [/icu/g, 'icu_room', 'ICU'],
    [/fhc/g, 'fhc', 'FHC'],
    [/ward/g, 'ward', 'Ward'],
    [/hall/g, 'living_room', 'Hall'],
  ];

  const foundTypes = new Set();
  for (const [pattern, roomType, label] of roomPatterns) {
    // Check for "N room_name" pattern
    const countRegex = new RegExp(`(\\d+)\\s*${pattern.source}s?`);
    const countMatch = text.match(countRegex);
    const simpleMatch = text.match(pattern);

    if (countMatch && !foundTypes.has(roomType)) {
      foundTypes.add(roomType);
      rooms.push({ name: label, type: roomType, count: parseInt(countMatch[1]) });
    } else if (simpleMatch && !foundTypes.has(roomType)) {
      foundTypes.add(roomType);
      rooms.push({ name: label, type: roomType, count: 1 });
    }
  }

  return rooms;
}

function getDefaultRooms(buildingType) {
  const defaults = {
    residential: [
      { name: 'Living Room', type: 'living_room', count: 1 },
      { name: 'Kitchen', type: 'kitchen', count: 1 },
      { name: 'Bedroom', type: 'bedroom', count: 2 },
      { name: 'Bathroom', type: 'bathroom', count: 1 },
      { name: 'Toilet', type: 'toilet', count: 1 },
    ],
    hospital: [
      { name: 'Reception', type: 'reception', count: 1 },
      { name: 'Waiting Area', type: 'waiting_area', count: 1 },
      { name: 'Private Room', type: 'private_room', count: 4 },
      { name: 'Toilet', type: 'toilet', count: 3 },
      { name: 'Nurse Station', type: 'nurse_station', count: 1 },
      { name: 'Corridor', type: 'corridor', count: 1 },
    ],
    office: [
      { name: 'Reception', type: 'reception', count: 1 },
      { name: 'Office', type: 'office', count: 4 },
      { name: 'Conference Room', type: 'conference_room', count: 1 },
      { name: 'Bathroom', type: 'bathroom', count: 2 },
      { name: 'Kitchen', type: 'kitchen', count: 1 },
      { name: 'Corridor', type: 'corridor', count: 1 },
    ],
    commercial: [
      { name: 'Store', type: 'store', count: 3 },
      { name: 'Office', type: 'office', count: 1 },
      { name: 'Bathroom', type: 'bathroom', count: 1 },
      { name: 'Store Room', type: 'store', count: 1 },
    ],
  };
  return defaults[buildingType] || defaults.residential;
}

// ── Layout Generation Engine ──

class LayoutGenerator {
  constructor(plotWidth, plotLength, wallHeight = 3.0, wallThickness = 0.15, extWallThickness = 0.25) {
    this.plotWidth = plotWidth;
    this.plotLength = plotLength;
    this.wallHeight = wallHeight;
    this.wallThickness = wallThickness;
    this.extWallThickness = extWallThickness;
  }

  generateFloor(floorSpec) {
    const roomsToPlace = [];

    for (const roomSpec of floorSpec.rooms) {
      const count = roomSpec.count || 1;
      for (let i = 0; i < count; i++) {
        const defaults = ROOM_DEFAULTS[roomSpec.type] || ROOM_DEFAULTS.unknown;
        let w = roomSpec.width_m || defaults.width;
        let l = roomSpec.length_m || defaults.length;

        if (roomSpec.area_sqm) {
          const currentArea = w * l;
          const scale = Math.sqrt(roomSpec.area_sqm / currentArea);
          w *= scale;
          l *= scale;
        }

        let label = roomSpec.name;
        if (count > 1) label = `${roomSpec.name} ${i + 1}`;

        roomsToPlace.push({ label, type: roomSpec.type, width: w, length: l, area: w * l });
      }
    }

    // Sort: corridors first, then large rooms, then small
    const corridorRooms = roomsToPlace.filter(r => r.type === 'corridor' || r.type === 'hallway');
    const otherRooms = roomsToPlace.filter(r => r.type !== 'corridor' && r.type !== 'hallway');
    otherRooms.sort((a, b) => b.area - a.area);

    const placed = this._placeRoomsTwoStrip([...corridorRooms, ...otherRooms]);
    const walls = this._generateWalls(placed);
    const doors = this._generateDoors(placed);
    const windows = this._generateWindows(placed);

    return {
      id: `floor-${floorSpec.level}`,
      level: floorSpec.level,
      label: floorSpec.label,
      elevation_m: floorSpec.level * this.wallHeight,
      height_m: floorSpec.height_m || this.wallHeight,
      walls,
      rooms: placed,
      doors,
      windows,
    };
  }

  _placeRoomsTwoStrip(rooms) {
    const placed = [];
    const corridorWidth = 1.8;
    const hasCorridor = rooms.some(r => r.type === 'corridor' || r.type === 'hallway');
    const nonCorridorRooms = rooms.filter(r => r.type !== 'corridor' && r.type !== 'hallway');

    if (nonCorridorRooms.length === 0) {
      let y = 0;
      for (const room of rooms) {
        placed.push(this._makeRoom(room, 0, y, this.plotWidth, room.length));
        y += room.length;
      }
      return placed;
    }

    const usableWidth = this.plotWidth;
    let topStripHeight, bottomStripHeight, corridorY;

    if (hasCorridor) {
      topStripHeight = (this.plotLength - corridorWidth) / 2;
      bottomStripHeight = (this.plotLength - corridorWidth) / 2;
      corridorY = topStripHeight;
    } else {
      topStripHeight = this.plotLength / 2;
      bottomStripHeight = this.plotLength / 2;
      corridorY = topStripHeight;
    }

    const [topRooms, bottomRooms] = this._splitRoomsEqual(nonCorridorRooms);

    // Place top strip
    let xCursor = 0;
    for (const room of topRooms) {
      let roomWidth = Math.min(room.width, usableWidth - xCursor);
      if (roomWidth < 1.5) roomWidth = usableWidth - xCursor;
      if (xCursor + roomWidth > usableWidth) roomWidth = usableWidth - xCursor;
      placed.push(this._makeRoom(room, xCursor, 0, roomWidth, topStripHeight));
      xCursor += roomWidth;
    }

    // Fill remaining top space
    if (xCursor < usableWidth - 0.5 && placed.length > 0) {
      const last = placed[placed.length - 1];
      for (const v of last.polygon.vertices) {
        if (Math.abs(v.x - xCursor) < 0.01) v.x = usableWidth;
      }
      last.area_sqm = this._polyArea(last.polygon.vertices);
    }

    // Place corridor
    if (hasCorridor) {
      placed.push(this._makeRoom(
        { label: 'Corridor', type: 'corridor', width: usableWidth, length: corridorWidth, area: usableWidth * corridorWidth },
        0, corridorY, usableWidth, corridorWidth
      ));
    }

    // Place bottom strip
    const bottomY = corridorY + (hasCorridor ? corridorWidth : 0);
    xCursor = 0;
    for (const room of bottomRooms) {
      let roomWidth = Math.min(room.width, usableWidth - xCursor);
      if (roomWidth < 1.5) roomWidth = usableWidth - xCursor;
      if (xCursor + roomWidth > usableWidth) roomWidth = usableWidth - xCursor;
      placed.push(this._makeRoom(room, xCursor, bottomY, roomWidth, bottomStripHeight));
      xCursor += roomWidth;
    }

    // Fill remaining bottom space
    if (xCursor < usableWidth - 0.5 && bottomRooms.length > 0) {
      const last = placed[placed.length - 1];
      for (const v of last.polygon.vertices) {
        if (Math.abs(v.x - xCursor) < 0.01) v.x = usableWidth;
      }
      last.area_sqm = this._polyArea(last.polygon.vertices);
    }

    return placed;
  }

  _splitRoomsEqual(rooms) {
    const totalArea = rooms.reduce((s, r) => s + r.area, 0);
    const target = totalArea / 2;
    const top = [];
    const bottom = [];
    let topArea = 0;

    for (const room of rooms) {
      if (topArea < target) {
        top.push(room);
        topArea += room.area;
      } else {
        bottom.push(room);
      }
    }

    if (bottom.length === 0 && top.length > 1) bottom.push(top.pop());
    if (top.length === 0 && bottom.length > 1) top.push(bottom.shift());

    return [top, bottom];
  }

  _makeRoom(room, x, y, w, h) {
    const vertices = [
      { x: round(x, 4), y: round(y, 4) },
      { x: round(x + w, 4), y: round(y, 4) },
      { x: round(x + w, 4), y: round(y + h, 4) },
      { x: round(x, 4), y: round(y + h, 4) },
    ];
    return {
      id: `room-${uuidv4().substring(0, 8)}`,
      polygon: { vertices },
      area_sqm: round(w * h, 2),
      type: room.type,
      label: room.label,
      confidence: 1.0,
      centroid: { x: round(x + w / 2, 4), y: round(y + h / 2, 4) },
      width_m: round(w, 2),
      height_m: round(h, 2),
    };
  }

  _polyArea(vertices) {
    const n = vertices.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return round(Math.abs(area) / 2, 2);
  }

  _generateWalls(rooms) {
    const walls = [];
    const wallSet = new Set();

    for (const room of rooms) {
      const verts = room.polygon.vertices;
      const n = verts.length;

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const v1 = verts[i];
        const v2 = verts[j];

        const key = wallKey(v1.x, v1.y, v2.x, v2.y);
        if (wallSet.has(key)) continue;
        wallSet.add(key);

        const isExterior = this._isExteriorEdge(v1, v2);

        walls.push({
          id: `w-${uuidv4().substring(0, 8)}`,
          start: { x: v1.x, y: v1.y },
          end: { x: v2.x, y: v2.y },
          thickness_m: isExterior ? this.extWallThickness : this.wallThickness,
          type: isExterior ? 'exterior' : 'interior',
          confidence: 1.0,
        });
      }
    }
    return walls;
  }

  _isExteriorEdge(v1, v2) {
    const eps = 0.1;
    if (Math.abs(v1.y) < eps && Math.abs(v2.y) < eps) return true;
    if (Math.abs(v1.y - this.plotLength) < eps && Math.abs(v2.y - this.plotLength) < eps) return true;
    if (Math.abs(v1.x) < eps && Math.abs(v2.x) < eps) return true;
    if (Math.abs(v1.x - this.plotWidth) < eps && Math.abs(v2.x - this.plotWidth) < eps) return true;
    return false;
  }

  _generateDoors(rooms) {
    const doors = [];
    for (const room of rooms) {
      if (room.type === 'corridor' || room.type === 'hallway') continue;
      const verts = room.polygon.vertices;
      if (verts.length < 4) continue;

      let bestEdge = null;
      let bestScore = -1;

      for (let i = 0; i < verts.length; i++) {
        const j = (i + 1) % verts.length;
        const v1 = verts[i], v2 = verts[j];
        const isExt = this._isExteriorEdge(v1, v2);
        const edgeLen = Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2);

        let score = 0;
        if (!isExt) score += 10;
        if (edgeLen > 1.5) score += 5;
        if (Math.abs(v1.y - v2.y) < 0.01) score += 3;

        if (score > bestScore) {
          bestScore = score;
          bestEdge = [v1, v2];
        }
      }

      if (bestEdge) {
        const [v1, v2] = bestEdge;
        const midX = (v1.x + v2.x) / 2;
        const midY = (v1.y + v2.y) / 2;
        let doorWidth = 0.9;
        if (['operation_theater', 'icu_room', 'ward', 'general_ward'].includes(room.type)) {
          doorWidth = 1.2;
        }
        doors.push({
          id: `door-${uuidv4().substring(0, 8)}`,
          position: { x: round(midX, 4), y: round(midY, 4) },
          width_m: doorWidth,
          height_m: 2.1,
          type: doorWidth > 1.0 ? 'double' : 'single',
          confidence: 1.0,
        });
      }
    }
    return doors;
  }

  _generateWindows(rooms) {
    const windows = [];
    const skipTypes = new Set(['corridor', 'hallway', 'closet', 'toilet', 'lift', 'staircase', 'fhc']);

    for (const room of rooms) {
      if (skipTypes.has(room.type)) continue;
      const verts = room.polygon.vertices;

      for (let i = 0; i < verts.length; i++) {
        const j = (i + 1) % verts.length;
        const v1 = verts[i], v2 = verts[j];

        if (this._isExteriorEdge(v1, v2)) {
          const edgeLen = Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2);
          if (edgeLen < 2.0) continue;

          const midX = (v1.x + v2.x) / 2;
          const midY = (v1.y + v2.y) / 2;
          const winWidth = Math.min(1.5, edgeLen * 0.5);

          windows.push({
            id: `win-${uuidv4().substring(0, 8)}`,
            position: { x: round(midX, 4), y: round(midY, 4) },
            width_m: round(winWidth, 2),
            height_m: 1.2,
            sill_height_m: 0.9,
            type: 'casement',
            confidence: 1.0,
          });
        }
      }
    }
    return windows;
  }
}

// ── Helpers ──

function round(num, decimals) {
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function wallKey(x1, y1, x2, y2) {
  const p1 = `${round(x1, 2)},${round(y1, 2)}`;
  const p2 = `${round(x2, 2)},${round(y2, 2)}`;
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

function buildResponse(floorDataList, buildingType, prompt, plotWidth, plotLength) {
  const allRooms = floorDataList.flatMap(f => f.rooms || []);
  const totalArea = allRooms.reduce((s, r) => s + (r.area_sqm || 0), 0);
  const totalWalls = floorDataList.reduce((s, f) => s + (f.walls || []).length, 0);
  const totalRooms = floorDataList.reduce((s, f) => s + (f.rooms || []).length, 0);
  const totalDoors = floorDataList.reduce((s, f) => s + (f.doors || []).length, 0);
  const totalWindows = floorDataList.reduce((s, f) => s + (f.windows || []).length, 0);

  const spatialModel = {
    version: '1.0.0',
    metadata: {
      building_name: 'Generated Building',
      building_type: buildingType,
      total_floors: floorDataList.length,
      total_area_sqm: round(totalArea, 2),
      source: 'ai-prompt-generator',
      prompt,
      created_at: new Date().toISOString(),
      coordinate_system: 'cartesian',
      unit: 'meters',
      bounding_box: {
        min: { x: 0, y: 0 },
        max: { x: round(plotWidth, 2), y: round(plotLength, 2) },
      },
      average_confidence: 1.0,
    },
    floors: floorDataList,
  };

  return {
    status: 'generated',
    model_data: spatialModel,
    stats: {
      wall_count: totalWalls,
      room_count: totalRooms,
      door_count: totalDoors,
      window_count: totalWindows,
      total_area_sqm: round(totalArea, 2),
      floor_count: floorDataList.length,
      plot_width_m: round(plotWidth, 2),
      plot_length_m: round(plotLength, 2),
    },
  };
}

module.exports = {
  ROOM_DEFAULTS,
  parsePrompt,
  extractRooms,
  getDefaultRooms,
  LayoutGenerator,
  buildResponse,
  round,
};
