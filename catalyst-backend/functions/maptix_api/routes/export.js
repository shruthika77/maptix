'use strict';

/**
 * Export Routes — Download models in various formats
 * 
 * GET /v1/projects/:projectId/export?format=svg  — Export as SVG
 * GET /v1/projects/:projectId/export?format=json — Export as JSON
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../lib/auth-middleware');
const { getSpatialModel } = require('../lib/datastore');
const { generateSVG } = require('../lib/svg-exporter');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const format = req.query.format;

    if (!format) {
      return res.status(400).json({ detail: 'format query parameter is required (svg or json)' });
    }

    if (!req.catalystApp) {
      return res.status(404).json({ detail: 'No model found to export' });
    }

    const model = await getSpatialModel(req.catalystApp, projectId);
    if (!model) {
      return res.status(404).json({ detail: 'No model found to export' });
    }

    const modelData = model.model_data || (model.model_data_json ? JSON.parse(model.model_data_json) : {});

    if (format === 'svg') {
      const svgContent = generateSVG(modelData);
      res.set({
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': 'attachment; filename="floorplan.svg"',
      });
      return res.send(svgContent);
    }

    if (format === 'json') {
      const jsonContent = JSON.stringify(modelData, null, 2);
      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="spatial-model.json"',
      });
      return res.send(jsonContent);
    }

    res.status(400).json({
      detail: `Export format '${format}' not supported. Available: svg, json`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
