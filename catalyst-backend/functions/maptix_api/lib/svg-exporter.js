'use strict';

/**
 * SVG Floor Plan Exporter — ported from Python to Node.js
 * Generates clean SVG from the Unified Spatial Model.
 */

const ROOM_COLORS = {
  living_room: '#FFF8DC',
  bedroom: '#E6E6FA',
  kitchen: '#FFE4C4',
  bathroom: '#B0E0E6',
  toilet: '#B0E0E6',
  hallway: '#F5F5DC',
  closet: '#D2B48C',
  office: '#F0FFF0',
  dining_room: '#FFEFD5',
  corridor: '#F5F5DC',
  unknown: '#E6E6E6',
};

function generateSVG(spatialModel, width = 800, height = 600) {
  const bbox = (spatialModel.metadata || {}).bounding_box || {};
  const minPt = bbox.min || { x: 0, y: 0 };
  const maxPt = bbox.max || { x: 10, y: 10 };

  let modelWidth = maxPt.x - minPt.x;
  let modelHeight = maxPt.y - minPt.y;
  if (modelWidth === 0 || modelHeight === 0) modelWidth = modelHeight = 10;

  const padding = Math.max(modelWidth, modelHeight) * 0.1;
  const vbX = minPt.x - padding;
  const vbY = minPt.y - padding;
  const vbW = modelWidth + 2 * padding;
  const vbH = modelHeight + 2 * padding;

  const scaleLength = Math.round(modelWidth / 5 * 10) / 10;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
<defs><style>
.wall { stroke: #333; stroke-linecap: round; fill: none; }
.wall-exterior { stroke-width: 0.3; }
.wall-interior { stroke-width: 0.15; }
.room-fill { fill-opacity: 0.3; stroke: none; }
.room-label { font-family: Arial, sans-serif; font-size: 0.4px; fill: #555; text-anchor: middle; dominant-baseline: middle; }
.door { stroke: #666; stroke-width: 0.05; fill: none; }
.window { stroke: #4a9eff; stroke-width: 0.1; fill: none; stroke-dasharray: 0.1,0.05; }
.dimension { stroke: #999; stroke-width: 0.02; fill: none; }
.dim-text { font-family: Arial, sans-serif; font-size: 0.25px; fill: #999; text-anchor: middle; }
</style></defs>
`;

  for (const floor of (spatialModel.floors || [])) {
    // Room fills
    for (const room of (floor.rooms || [])) {
      const verts = (room.polygon || {}).vertices || [];
      if (verts.length < 3) continue;
      const points = verts.map(v => `${v.x},${v.y}`).join(' ');
      const color = ROOM_COLORS[room.type] || ROOM_COLORS.unknown;
      svg += `<polygon points="${points}" class="room-fill" fill="${color}"/>\n`;

      const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
      const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
      svg += `<text x="${cx}" y="${cy}" class="room-label">${escXml(room.label || '')}</text>\n`;
      if (room.area_sqm) {
        svg += `<text x="${cx}" y="${cy + 0.5}" class="room-label" font-size="0.3px">${room.area_sqm.toFixed(1)} m²</text>\n`;
      }
    }

    // Walls
    for (const wall of (floor.walls || [])) {
      const s = wall.start || {};
      const e = wall.end || {};
      const cls = `wall wall-${wall.type === 'exterior' ? 'exterior' : 'interior'}`;
      svg += `<line x1="${s.x || 0}" y1="${s.y || 0}" x2="${e.x || 0}" y2="${e.y || 0}" class="${cls}"/>\n`;
    }

    // Doors
    for (const door of (floor.doors || [])) {
      const p = door.position || {};
      const w = door.width_m || 0.9;
      svg += `<path d="M ${p.x - w / 2},${p.y} A ${w},${w} 0 0 1 ${p.x + w / 2},${p.y}" class="door"/>\n`;
    }

    // Windows
    for (const win of (floor.windows || [])) {
      const p = win.position || {};
      const w = win.width_m || 1.2;
      svg += `<line x1="${p.x - w / 2}" y1="${p.y}" x2="${p.x + w / 2}" y2="${p.y}" class="window"/>\n`;
    }
  }

  // Scale bar
  const sbX = vbX + padding;
  const sbY = vbY + vbH - padding / 2;
  svg += `<line x1="${sbX}" y1="${sbY}" x2="${sbX + scaleLength}" y2="${sbY}" class="dimension" stroke-width="0.05"/>\n`;
  svg += `<text x="${sbX + scaleLength / 2}" y="${sbY - 0.3}" class="dim-text">${scaleLength} m</text>\n`;

  svg += '</svg>';
  return svg;
}

function escXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generateSVG };
