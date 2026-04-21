'use strict';

/**
 * Zoho Catalyst Data Store Helper
 * 
 * Replaces SQLite with Catalyst's cloud-native Data Store.
 * 
 * Tables (create these in Catalyst Console → Data Store):
 * ┌──────────────────┬────────────────────────────────────────────────┐
 * │ Table Name       │ Columns                                       │
 * ├──────────────────┼────────────────────────────────────────────────┤
 * │ Users            │ ROWID (auto), email, hashed_password, name,   │
 * │                  │ is_active, created_at, updated_at              │
 * ├──────────────────┼────────────────────────────────────────────────┤
 * │ Projects         │ ROWID (auto), owner_id, name, description,    │
 * │                  │ building_type, status, created_at, updated_at  │
 * ├──────────────────┼────────────────────────────────────────────────┤
 * │ ProjectFiles     │ ROWID (auto), project_id, original_filename,  │
 * │                  │ stored_filename, mime_type, size_bytes,        │
 * │                  │ file_id (Catalyst file ID), status, uploaded_at│
 * ├──────────────────┼────────────────────────────────────────────────┤
 * │ ProcessingJobs   │ ROWID (auto), project_id, status, progress,   │
 * │                  │ current_stage, stages_json, error,             │
 * │                  │ created_at, started_at, completed_at           │
 * ├──────────────────┼────────────────────────────────────────────────┤
 * │ SpatialModels    │ ROWID (auto), project_id, version,            │
 * │                  │ model_data_json, wall_count, room_count,       │
 * │                  │ door_count, window_count, total_area_sqm,      │
 * │                  │ floor_count, average_confidence, model_3d_path,│
 * │                  │ created_at, updated_at                         │
 * └──────────────────┴────────────────────────────────────────────────┘
 */

const TABLE_NAMES = {
  USERS: 'Users',
  PROJECTS: 'Projects',
  PROJECT_FILES: 'ProjectFiles',
  PROCESSING_JOBS: 'ProcessingJobs',
  SPATIAL_MODELS: 'SpatialModels',
};

/**
 * Get a Data Store table reference
 */
function getTable(catalystApp, tableName) {
  const datastore = catalystApp.datastore();
  return datastore.table(tableName);
}

/**
 * Execute ZCQL (Zoho Catalyst Query Language) — replaces SQL queries
 */
async function executeZCQL(catalystApp, query) {
  const zcql = catalystApp.zcql();
  const result = await zcql.executeZCQLQuery(query);
  return result;
}

// ── Users ──

async function createUser(catalystApp, { email, hashedPassword, name }) {
  const table = getTable(catalystApp, TABLE_NAMES.USERS);
  const now = new Date().toISOString();
  const row = await table.insertRow({
    email,
    hashed_password: hashedPassword,
    name,
    is_active: 'true',
    created_at: now,
    updated_at: now,
  });
  return row;
}

async function getUserByEmail(catalystApp, email) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.USERS} WHERE email = '${email.replace(/'/g, "''")}'`
  );
  if (results && results.length > 0) {
    return results[0][TABLE_NAMES.USERS] || results[0];
  }
  return null;
}

async function getUserById(catalystApp, userId) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.USERS} WHERE ROWID = '${userId}'`
  );
  if (results && results.length > 0) {
    return results[0][TABLE_NAMES.USERS] || results[0];
  }
  return null;
}

// ── Projects ──

async function createProject(catalystApp, { ownerId, name, description, buildingType }) {
  const table = getTable(catalystApp, TABLE_NAMES.PROJECTS);
  const now = new Date().toISOString();
  const row = await table.insertRow({
    owner_id: String(ownerId),
    name,
    description: description || '',
    building_type: buildingType || 'residential',
    status: 'draft',
    created_at: now,
    updated_at: now,
  });
  return row;
}

async function getProjectsByOwner(catalystApp, ownerId) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.PROJECTS} WHERE owner_id = '${ownerId}' ORDER BY updated_at DESC`
  );
  return (results || []).map(r => r[TABLE_NAMES.PROJECTS] || r);
}

async function getProjectById(catalystApp, projectId, ownerId) {
  const query = ownerId
    ? `SELECT * FROM ${TABLE_NAMES.PROJECTS} WHERE ROWID = '${projectId}' AND owner_id = '${ownerId}'`
    : `SELECT * FROM ${TABLE_NAMES.PROJECTS} WHERE ROWID = '${projectId}'`;
  const results = await executeZCQL(catalystApp, query);
  if (results && results.length > 0) {
    return results[0][TABLE_NAMES.PROJECTS] || results[0];
  }
  return null;
}

async function updateProject(catalystApp, projectId, updates) {
  const table = getTable(catalystApp, TABLE_NAMES.PROJECTS);
  const row = await table.updateRow({
    ROWID: projectId,
    ...updates,
    updated_at: new Date().toISOString(),
  });
  return row;
}

async function deleteProject(catalystApp, projectId) {
  const table = getTable(catalystApp, TABLE_NAMES.PROJECTS);
  await table.deleteRow(projectId);
}

// ── Project Files ──

async function createProjectFile(catalystApp, data) {
  const table = getTable(catalystApp, TABLE_NAMES.PROJECT_FILES);
  const now = new Date().toISOString();
  const row = await table.insertRow({
    project_id: String(data.projectId),
    original_filename: data.originalFilename,
    stored_filename: data.storedFilename,
    mime_type: data.mimeType || '',
    size_bytes: String(data.sizeBytes),
    file_id: String(data.fileId || ''),
    status: 'uploaded',
    uploaded_at: now,
  });
  return row;
}

async function getProjectFiles(catalystApp, projectId) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.PROJECT_FILES} WHERE project_id = '${projectId}'`
  );
  return (results || []).map(r => r[TABLE_NAMES.PROJECT_FILES] || r);
}

// ── Processing Jobs ──

async function createProcessingJob(catalystApp, { projectId, stages }) {
  const table = getTable(catalystApp, TABLE_NAMES.PROCESSING_JOBS);
  const now = new Date().toISOString();
  const row = await table.insertRow({
    project_id: String(projectId),
    status: 'queued',
    progress: '0',
    current_stage: '',
    stages_json: JSON.stringify(stages),
    error: '',
    created_at: now,
    started_at: '',
    completed_at: '',
  });
  return row;
}

async function getProcessingJob(catalystApp, jobId, projectId) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.PROCESSING_JOBS} WHERE ROWID = '${jobId}' AND project_id = '${projectId}'`
  );
  if (results && results.length > 0) {
    return results[0][TABLE_NAMES.PROCESSING_JOBS] || results[0];
  }
  return null;
}

async function updateProcessingJob(catalystApp, jobId, updates) {
  const table = getTable(catalystApp, TABLE_NAMES.PROCESSING_JOBS);
  await table.updateRow({
    ROWID: jobId,
    ...updates,
  });
}

async function getActiveJobs(catalystApp, projectId) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.PROCESSING_JOBS} WHERE project_id = '${projectId}' AND status NOT IN ('completed', 'failed')`
  );
  return (results || []).map(r => r[TABLE_NAMES.PROCESSING_JOBS] || r);
}

// ── Spatial Models ──

async function createOrUpdateSpatialModel(catalystApp, data) {
  const table = getTable(catalystApp, TABLE_NAMES.SPATIAL_MODELS);
  const now = new Date().toISOString();

  // Check if exists
  const existing = await getSpatialModel(catalystApp, data.projectId);
  
  if (existing) {
    return await table.updateRow({
      ROWID: existing.ROWID,
      version: String((parseInt(existing.version || '1') + 1)),
      model_data_json: typeof data.modelData === 'string' ? data.modelData : JSON.stringify(data.modelData),
      wall_count: String(data.wallCount || 0),
      room_count: String(data.roomCount || 0),
      door_count: String(data.doorCount || 0),
      window_count: String(data.windowCount || 0),
      total_area_sqm: String(data.totalAreaSqm || 0),
      floor_count: String(data.floorCount || 1),
      average_confidence: String(data.averageConfidence || 0),
      model_3d_path: data.model3dPath || '',
      updated_at: now,
    });
  }

  return await table.insertRow({
    project_id: String(data.projectId),
    version: '1',
    model_data_json: typeof data.modelData === 'string' ? data.modelData : JSON.stringify(data.modelData),
    wall_count: String(data.wallCount || 0),
    room_count: String(data.roomCount || 0),
    door_count: String(data.doorCount || 0),
    window_count: String(data.windowCount || 0),
    total_area_sqm: String(data.totalAreaSqm || 0),
    floor_count: String(data.floorCount || 1),
    average_confidence: String(data.averageConfidence || 0),
    model_3d_path: data.model3dPath || '',
    created_at: now,
    updated_at: now,
  });
}

async function getSpatialModel(catalystApp, projectId) {
  const results = await executeZCQL(
    catalystApp,
    `SELECT * FROM ${TABLE_NAMES.SPATIAL_MODELS} WHERE project_id = '${projectId}'`
  );
  if (results && results.length > 0) {
    const model = results[0][TABLE_NAMES.SPATIAL_MODELS] || results[0];
    // Parse JSON fields
    if (model.model_data_json && typeof model.model_data_json === 'string') {
      try {
        model.model_data = JSON.parse(model.model_data_json);
      } catch (e) {
        model.model_data = {};
      }
    }
    if (model.stages_json && typeof model.stages_json === 'string') {
      try {
        model.stages = JSON.parse(model.stages_json);
      } catch (e) {
        model.stages = [];
      }
    }
    return model;
  }
  return null;
}

module.exports = {
  TABLE_NAMES,
  getTable,
  executeZCQL,
  // Users
  createUser,
  getUserByEmail,
  getUserById,
  // Projects
  createProject,
  getProjectsByOwner,
  getProjectById,
  updateProject,
  deleteProject,
  // Files
  createProjectFile,
  getProjectFiles,
  // Jobs
  createProcessingJob,
  getProcessingJob,
  updateProcessingJob,
  getActiveJobs,
  // Spatial Models
  createOrUpdateSpatialModel,
  getSpatialModel,
};
