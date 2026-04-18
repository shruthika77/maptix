/**
 * API service — all requests go through the Vite proxy to the backend.
 * No VITE_API_URL needed — Vite proxies /v1/* to http://localhost:8000
 */

import { useAuthStore } from '../stores/authStore';

const API_BASE = '/v1';

function getHeaders(includeAuth = true): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (includeAuth) {
    const token = useAuthStore.getState().token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

function getAuthHeader(): HeadersInit {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(data.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Auth ──
export async function apiRegister(email: string, password: string, name: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  return handleResponse(res);
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

// ── Projects ──
export async function apiListProjects() {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

export async function apiCreateProject(name: string, description?: string, buildingType?: string) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, description, building_type: buildingType || 'residential' }),
  });
  return handleResponse(res);
}

export async function apiGetProject(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

export async function apiDeleteProject(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Delete failed');
}

// ── Files ──
export async function apiUploadFile(projectId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: formData,
  });
  return handleResponse(res);
}

// ── Processing ──
export async function apiStartProcessing(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/process`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ pipeline: 'full' }),
  });
  return handleResponse(res);
}

export async function apiGetJobStatus(projectId: string, jobId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/jobs/${jobId}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

// ── Spatial Model ──
export async function apiGetSpatialModel(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/model`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

// ── Generate from Prompt ──
export async function apiGenerateFromPrompt(projectId: string, data: {
  prompt?: string;
  building_type?: string;
  total_floors?: number;
  plot_width_m?: number;
  plot_length_m?: number;
  wall_height_m?: number;
  floors?: any[];
}) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/generate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── Export ──
export function getExportUrl(projectId: string, format: string) {
  return `${API_BASE}/projects/${projectId}/export?format=${format}`;
}
