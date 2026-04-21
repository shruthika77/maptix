'use strict';

/**
 * Spatial Model Routes — Zoho Catalyst Data Store
 * 
 * GET /v1/projects/:projectId/model — Get spatial model
 * PUT /v1/projects/:projectId/model — Update spatial model (manual edits)
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../lib/auth-middleware');
const { getSpatialModel, createOrUpdateSpatialModel } = require('../lib/datastore');

router.use(requireAuth);

// ── Get Spatial Model ──
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!req.catalystApp) {
      return res.status(404).json({ detail: 'No spatial model found. Process the project first.' });
    }

    const model = await getSpatialModel(req.catalystApp, projectId);
    if (!model) {
      return res.status(404).json({ detail: 'No spatial model found. Process the project first.' });
    }

    const modelData = model.model_data || (model.model_data_json ? JSON.parse(model.model_data_json) : {});

    res.json({
      version: parseInt(model.version || 1),
      model_data: modelData,
      stats: {
        wall_count: parseInt(model.wall_count || 0),
        room_count: parseInt(model.room_count || 0),
        door_count: parseInt(model.door_count || 0),
        window_count: parseInt(model.window_count || 0),
        total_area_sqm: parseFloat(model.total_area_sqm || 0),
        average_confidence: parseFloat(model.average_confidence || 0),
        floor_count: parseInt(model.floor_count || 1),
      },
      has_3d_model: !!model.model_3d_path,
      updated_at: model.updated_at || '',
    });
  } catch (err) {
    next(err);
  }
});

// ── Update Spatial Model ──
router.put('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;

    if (!req.catalystApp) {
      return res.json({ status: 'updated', version: 1 });
    }

    const model = await getSpatialModel(req.catalystApp, projectId);
    if (!model) {
      return res.status(404).json({ detail: 'No spatial model found' });
    }

    let modelData = model.model_data || {};
    if (typeof modelData === 'string') {
      modelData = JSON.parse(modelData);
    }

    // Apply floor updates
    if (updates.floors) {
      for (const floorUpdate of updates.floors) {
        const level = floorUpdate.level;
        const existingFloor = (modelData.floors || []).find(f => f.level === level);
        if (existingFloor) {
          Object.assign(existingFloor, floorUpdate);
        } else {
          modelData.floors = modelData.floors || [];
          modelData.floors.push(floorUpdate);
        }
      }
    }

    // Recalculate stats
    let walls = 0, rooms = 0, doors = 0, windows = 0, totalArea = 0;
    for (const floor of (modelData.floors || [])) {
      walls += (floor.walls || []).length;
      rooms += (floor.rooms || []).length;
      doors += (floor.doors || []).length;
      windows += (floor.windows || []).length;
      for (const room of (floor.rooms || [])) {
        totalArea += room.area_sqm || 0;
      }
    }

    const newVersion = parseInt(model.version || 1) + 1;

    await createOrUpdateSpatialModel(req.catalystApp, {
      projectId,
      modelData,
      wallCount: walls,
      roomCount: rooms,
      doorCount: doors,
      windowCount: windows,
      totalAreaSqm: totalArea,
      floorCount: (modelData.floors || []).length,
      averageConfidence: parseFloat(model.average_confidence || 0),
    });

    res.json({ status: 'updated', version: newVersion });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
