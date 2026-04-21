'use strict';

/**
 * File Upload Routes — Zoho Catalyst File Store
 * 
 * POST /v1/projects/:projectId/files — Upload a file to project
 */

const express = require('express');
const { requireAuth } = require('../lib/auth-middleware');
const { getProjectById, createProjectFile, getProjectFiles } = require('../lib/datastore');

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp',
  '.pdf', '.dxf', '.dwg', '.json', '.geojson',
]);
const MAX_UPLOAD_SIZE_MB = 100;

module.exports = function (upload) {
  const router = express.Router({ mergeParams: true });

  router.use(requireAuth);

  // ── List Files ──
  router.get('/', async (req, res, next) => {
    try {
      const { projectId } = req.params;

      if (!req.catalystApp) {
        return res.json({ files: [] });
      }

      const project = await getProjectById(req.catalystApp, projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ detail: 'Project not found' });
      }

      const files = await getProjectFiles(req.catalystApp, projectId);
      res.json({
        files: files.map(f => ({
          id: f.ROWID,
          filename: f.original_filename,
          mime_type: f.mime_type,
          size_bytes: parseInt(f.size_bytes || 0),
          status: f.status || 'uploaded',
          uploaded_at: f.uploaded_at || '',
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Upload File ──
  router.post('/', upload.single('file'), async (req, res, next) => {
    try {
      const { projectId } = req.params;

      if (!req.file) {
        return res.status(400).json({ detail: 'No file uploaded' });
      }

      const filename = req.file.originalname || 'upload';
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();

      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({
          detail: `File type '${ext}' not supported. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
        });
      }

      const sizeMb = req.file.size / (1024 * 1024);
      if (sizeMb > MAX_UPLOAD_SIZE_MB) {
        return res.status(400).json({
          detail: `File too large (${sizeMb.toFixed(1)}MB). Maximum: ${MAX_UPLOAD_SIZE_MB}MB`,
        });
      }

      if (!req.catalystApp) {
        return res.status(201).json({
          id: `local-${Date.now()}`,
          filename,
          mime_type: req.file.mimetype,
          size_bytes: req.file.size,
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
        });
      }

      // Verify project ownership
      const project = await getProjectById(req.catalystApp, projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ detail: 'Project not found' });
      }

      // Upload to Catalyst File Store
      let catalystFileId = '';
      try {
        const fileStore = req.catalystApp.filestore();
        const folder = fileStore.folder(process.env.CATALYST_FOLDER_ID || 1);
        const uploadedFile = await folder.uploadFile({
          code: req.file.buffer,
          name: `${projectId}_${Date.now()}_${filename}`,
        });
        catalystFileId = uploadedFile.id || uploadedFile.ROWID || '';
      } catch (fileErr) {
        console.warn('File Store upload failed (storing metadata only):', fileErr.message);
      }

      // Save metadata to Data Store
      const fileRecord = await createProjectFile(req.catalystApp, {
        projectId,
        originalFilename: filename,
        storedFilename: `${projectId}_${Date.now()}_${filename}`,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        fileId: catalystFileId,
      });

      // Update project status
      if (project.status === 'draft') {
        const { updateProject } = require('../lib/datastore');
        await updateProject(req.catalystApp, project.ROWID, { status: 'uploaded' });
      }

      res.status(201).json({
        id: fileRecord.ROWID,
        filename,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
        status: 'uploaded',
        uploaded_at: fileRecord.uploaded_at || new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
