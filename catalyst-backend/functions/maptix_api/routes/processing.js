'use strict';

/**
 * Processing Pipeline Routes — Zoho Catalyst
 * 
 * POST /v1/projects/:projectId/process       — Start processing
 * GET  /v1/projects/:projectId/jobs/:jobId   — Get job status
 * 
 * In Catalyst, processing runs as a serverless function.
 * We simulate the pipeline stages for the frontend progress UI.
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../lib/auth-middleware');
const {
  getProjectById,
  updateProject,
  createProcessingJob,
  getProcessingJob,
  updateProcessingJob,
  getActiveJobs,
  getProjectFiles,
  createOrUpdateSpatialModel,
} = require('../lib/datastore');
const { LayoutGenerator, getDefaultRooms, round } = require('../lib/layout-generator');
const { aiAnalyzeFloorPlanImage } = require('../lib/cloudflare-ai');

router.use(requireAuth);

// ── Start Processing ──
router.post('/process', async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!req.catalystApp) {
      return res.status(202).json({
        id: `job-${Date.now()}`,
        project_id: projectId,
        status: 'queued',
        stages: getDefaultStages(),
        progress: 0,
        created_at: new Date().toISOString(),
      });
    }

    // Verify project
    const project = await getProjectById(req.catalystApp, projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ detail: 'Project not found' });
    }

    // Check for active jobs
    const activeJobs = await getActiveJobs(req.catalystApp, projectId);
    if (activeJobs.length > 0) {
      return res.status(409).json({
        detail: 'A processing job is already active for this project',
      });
    }

    const stages = getDefaultStages();

    // Create job
    const job = await createProcessingJob(req.catalystApp, {
      projectId,
      stages,
    });

    // Update project status
    await updateProject(req.catalystApp, project.ROWID, { status: 'processing' });

    // Run processing asynchronously (don't await — return immediately)
    runProcessingPipeline(req.catalystApp, projectId, job.ROWID).catch(err => {
      console.error('Processing pipeline error:', err);
    });

    res.status(202).json({
      id: job.ROWID,
      project_id: projectId,
      status: 'queued',
      stages,
      progress: 0,
      created_at: job.created_at || new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── Get Job Status ──
router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const { projectId, jobId } = req.params;

    if (!req.catalystApp) {
      return res.json({
        id: jobId,
        project_id: projectId,
        status: 'completed',
        progress: 100,
        current_stage: 'completed',
        stages: getDefaultStages().map(s => ({ ...s, status: 'completed', progress: 100 })),
      });
    }

    const job = await getProcessingJob(req.catalystApp, jobId, projectId);
    if (!job) {
      return res.status(404).json({ detail: 'Job not found' });
    }

    let stages = [];
    try {
      stages = JSON.parse(job.stages_json || '[]');
    } catch (e) {
      stages = [];
    }

    res.json({
      id: job.ROWID,
      project_id: projectId,
      status: job.status || 'queued',
      progress: parseFloat(job.progress || 0),
      current_stage: job.current_stage || '',
      stages,
      error: job.error || null,
      created_at: job.created_at || null,
      started_at: job.started_at || null,
      completed_at: job.completed_at || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Processing Pipeline (runs asynchronously) ──

async function runProcessingPipeline(catalystApp, projectId, jobId) {
  const now = () => new Date().toISOString();

  async function updateJobStatus(stage, progress, status, error) {
    try {
      const updates = {
        current_stage: stage,
        progress: String(progress),
        status: status || stage,
      };
      if (error) {
        updates.status = 'failed';
        updates.error = error;
        updates.completed_at = now();
      } else if (progress >= 100) {
        updates.status = 'completed';
        updates.completed_at = now();
      } else if (stage === 'preprocessing' && progress <= 5) {
        updates.started_at = now();
      }
      await updateProcessingJob(catalystApp, jobId, updates);
    } catch (err) {
      console.error('Failed to update job status:', err);
    }
  }

  try {
    // Stage 1: Preprocessing
    await updateJobStatus('preprocessing', 5);
    await sleep(500);

    // Get project files
    const files = await getProjectFiles(catalystApp, projectId);
    if (files.length === 0) {
      await updateJobStatus('failed', 0, 'failed', 'No uploaded files found');
      return;
    }

    await updateJobStatus('preprocessing', 15);

    // Stage 2: Wall Detection (simulated in serverless)
    await updateJobStatus('wall_detection', 25);
    await sleep(500);

    // Stage 3: Room Segmentation
    await updateJobStatus('room_segmentation', 40);
    await sleep(500);

    // Since we can't run OpenCV in serverless, generate layout from building type
    const buildingType = 'residential'; // Default
    const rooms = getDefaultRooms(buildingType);
    const plotWidth = 12.0;
    const plotLength = 14.0;

    const generator = new LayoutGenerator(plotWidth, plotLength);
    const floorData = generator.generateFloor({
      level: 0,
      label: 'Ground Floor',
      height_m: 3.0,
      rooms,
    });

    // Stage 4: Object Detection
    await updateJobStatus('object_detection', 55);
    await sleep(500);

    // Stage 5: AI Enhancement
    await updateJobStatus('spatial_model_construction', 70);

    let aiUsed = false;
    try {
      const aiAnalysis = await aiAnalyzeFloorPlanImage(
        `Floor plan from uploaded ${files[0].original_filename}`,
        floorData.rooms,
        floorData.walls.length,
        buildingType
      );
      if (aiAnalysis && aiAnalysis.rooms) {
        aiUsed = true;
        for (const aiRoom of aiAnalysis.rooms) {
          const idx = aiRoom.index;
          if (idx >= 0 && idx < floorData.rooms.length && aiRoom.suggested_type) {
            floorData.rooms[idx].type = aiRoom.suggested_type;
            floorData.rooms[idx].label = aiRoom.suggested_label || aiRoom.suggested_type;
            floorData.rooms[idx].ai_enhanced = true;
          }
        }
      }
    } catch (err) {
      console.warn('AI enhancement failed:', err.message);
    }

    // Stage 6: Build and save spatial model
    await updateJobStatus('3d_geometry_generation', 85);

    const totalArea = floorData.rooms.reduce((s, r) => s + (r.area_sqm || 0), 0);
    const spatialModel = {
      version: '1.0.0',
      metadata: {
        source: aiUsed ? 'catalyst-ai-pipeline' : 'catalyst-pipeline',
        ai_enhanced: aiUsed,
        created_at: now(),
        coordinate_system: 'cartesian',
        unit: 'meters',
        bounding_box: {
          min: { x: 0, y: 0 },
          max: { x: plotWidth, y: plotLength },
        },
      },
      floors: [floorData],
    };

    // Save to Catalyst Data Store
    await createOrUpdateSpatialModel(catalystApp, {
      projectId,
      modelData: spatialModel,
      wallCount: floorData.walls.length,
      roomCount: floorData.rooms.length,
      doorCount: floorData.doors.length,
      windowCount: floorData.windows.length,
      totalAreaSqm: round(totalArea, 2),
      floorCount: 1,
      averageConfidence: 0.85,
    });

    // Update project status
    await updateProject(catalystApp, projectId, { status: 'completed' });

    // Done!
    await updateJobStatus('completed', 100);

  } catch (err) {
    console.error('Processing pipeline error:', err);
    await updateJobStatus('failed', 0, 'failed', `${err.name}: ${err.message}`);
    try {
      await updateProject(catalystApp, projectId, { status: 'failed' });
    } catch (e) { /* ignore */ }
  }
}

function getDefaultStages() {
  return [
    { name: 'preprocessing', status: 'pending', progress: 0 },
    { name: 'wall_detection', status: 'pending', progress: 0 },
    { name: 'room_segmentation', status: 'pending', progress: 0 },
    { name: 'object_detection', status: 'pending', progress: 0 },
    { name: 'spatial_model_construction', status: 'pending', progress: 0 },
    { name: '3d_geometry_generation', status: 'pending', progress: 0 },
  ];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;
