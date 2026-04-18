/**
 * Maptix 3D — Main Application Component
 * 
 * Layout:
 * ┌──────────────────────────────────────────────────────────┐
 * │ Header (Logo, Navigation, User Menu)                     │
 * ├──────────┬───────────────────────────────────────────────┤
 * │ Sidebar  │ Main Content Area                             │
 * │          │                                               │
 * │ Projects │ ┌───────────────────────────────────────────┐ │
 * │ List     │ │ Upload / 2D Viewer / 3D Viewer            │ │
 * │          │ │ (Tab-based switching)                      │ │
 * │          │ │                                            │ │
 * │          │ │                                            │ │
 * │          │ └───────────────────────────────────────────┘ │
 * │          │ ┌───────────────────────────────────────────┐ │
 * │          │ │ Properties Panel / Processing Status       │ │
 * │          │ └───────────────────────────────────────────┘ │
 * └──────────┴───────────────────────────────────────────────┘
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectPage from './pages/ProjectPage';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route
            path="/login"
            element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />}
          />
          <Route
            path="/"
            element={isAuthenticated ? <DashboardPage /> : <Navigate to="/login" />}
          />
          <Route
            path="/project/:projectId"
            element={isAuthenticated ? <ProjectPage /> : <Navigate to="/login" />}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
