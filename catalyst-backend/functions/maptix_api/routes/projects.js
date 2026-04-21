'use strict';

/**
 * Project CRUD Routes — Zoho Catalyst Data Store
 * 
 * GET    /v1/projects           — List all projects for current user
 * POST   /v1/projects           — Create a new project
 * GET    /v1/projects/:id       — Get project details
 * DELETE /v1/projects/:id       — Delete a project
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth-middleware');
const {
  createProject,
  getProjectsByOwner,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectFiles,
  getSpatialModel,
} = require('../lib/datastore');

// All project routes require authentication
router.use(requireAuth);

// ── List Projects ──
router.get('/', async (req, res, next) => {
  try {
    if (!req.catalystApp) {
      return res.json({ projects: [], total: 0 });
    }

    const projects = await getProjectsByOwner(req.catalystApp, req.user.id);

    const projectList = [];
    for (const p of projects) {
      const model = await getSpatialModel(req.catalystApp, p.ROWID);
      const files = await getProjectFiles(req.catalystApp, p.ROWID);

      projectList.push({
        id: p.ROWID,
        name: p.name,
        description: p.description || '',
        building_type: p.building_type || 'residential',
        status: p.status || 'draft',
        has_spatial_model: !!model,
        has_3d_model: model ? !!model.model_3d_path : false,
        file_count: files.length,
        spatial_model_stats: model ? {
          wall_count: parseInt(model.wall_count || 0),
          room_count: parseInt(model.room_count || 0),
          door_count: parseInt(model.door_count || 0),
          window_count: parseInt(model.window_count || 0),
          total_area_sqm: parseFloat(model.total_area_sqm || 0),
          average_confidence: parseFloat(model.average_confidence || 0),
        } : {
          wall_count: 0, room_count: 0, door_count: 0,
          window_count: 0, total_area_sqm: 0, average_confidence: 0,
        },
        created_at: p.created_at || '',
        updated_at: p.updated_at || '',
      });
    }

    res.json({ projects: projectList, total: projectList.length });
  } catch (err) {
    next(err);
  }
});

// ── Create Project ──
router.post('/', async (req, res, next) => {
  try {
    const { name, description, building_type } = req.body;

    if (!name) {
      return res.status(400).json({ detail: 'Project name is required' });
    }

    if (!req.catalystApp) {
      return res.status(201).json({
        id: `local-${Date.now()}`,
        name,
        description: description || '',
        building_type: building_type || 'residential',
        status: 'draft',
        created_at: new Date().toISOString(),
      });
    }

    const project = await createProject(req.catalystApp, {
      ownerId: req.user.id,
      name,
      description,
      buildingType: building_type,
    });

    res.status(201).json({
      id: project.ROWID,
      name: project.name,
      description: project.description || '',
      building_type: project.building_type || 'residential',
      status: 'draft',
      created_at: project.created_at || new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── Get Project ──
router.get('/:projectId', async (req, res, next) => {
  try {
    if (!req.catalystApp) {
      return res.status(404).json({ detail: 'Project not found' });
    }

    const project = await getProjectById(req.catalystApp, req.params.projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ detail: 'Project not found' });
    }

    const model = await getSpatialModel(req.catalystApp, project.ROWID);
    const files = await getProjectFiles(req.catalystApp, project.ROWID);

    res.json({
      id: project.ROWID,
      name: project.name,
      description: project.description || '',
      building_type: project.building_type || 'residential',
      status: project.status || 'draft',
      files: files.map(f => ({
        id: f.ROWID,
        filename: f.original_filename,
        mime_type: f.mime_type,
        size_bytes: parseInt(f.size_bytes || 0),
        status: f.status || 'uploaded',
        uploaded_at: f.uploaded_at || '',
      })),
      has_spatial_model: !!model,
      spatial_model_stats: model ? {
        wall_count: parseInt(model.wall_count || 0),
        room_count: parseInt(model.room_count || 0),
        door_count: parseInt(model.door_count || 0),
        window_count: parseInt(model.window_count || 0),
        total_area_sqm: parseFloat(model.total_area_sqm || 0),
        average_confidence: parseFloat(model.average_confidence || 0),
      } : null,
      has_3d_model: model ? !!model.model_3d_path : false,
      created_at: project.created_at || '',
      updated_at: project.updated_at || '',
    });
  } catch (err) {
    next(err);
  }
});

// ── Delete Project ──
router.delete('/:projectId', async (req, res, next) => {
  try {
    if (!req.catalystApp) {
      return res.sendStatus(204);
    }

    const project = await getProjectById(req.catalystApp, req.params.projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ detail: 'Project not found' });
    }

    await deleteProject(req.catalystApp, project.ROWID);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
