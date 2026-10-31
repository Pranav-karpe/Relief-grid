import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { ThemeProvider } from './lib/ThemeContext'
import { ProtectedRoute, RoleRoute } from './components/RouteGuards'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardRedirect from './pages/DashboardRedirect'
import CitizenDashboard from './pages/dashboard/CitizenDashboard'
import DonorDashboard from './pages/dashboard/DonorDashboard'
import NgoDashboard from './pages/dashboard/NgoDashboard'
import VolunteerDashboard from './pages/dashboard/VolunteerDashboard'
import AdminDashboard from './pages/dashboard/AdminDashboard'

import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected — redirect to role dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardRedirect />
                </ProtectedRoute>
              }
            />

            {/* Role-specific dashboards */}
            <Route
              path="/dashboard/citizen"
              element={
                <ProtectedRoute>
                  <RoleRoute role="citizen">
                    <CitizenDashboard />
                  </RoleRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/donor"
              element={
                <ProtectedRoute>
                  <RoleRoute role="donor">
                    <DonorDashboard />
                  </RoleRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/ngo"
              element={
                <ProtectedRoute>
                  <RoleRoute role="ngo">
                    <NgoDashboard />
                  </RoleRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/volunteer"
              element={
                <ProtectedRoute>
                  <RoleRoute role="volunteer">
                    <VolunteerDashboard />
                  </RoleRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin"
              element={
                <ProtectedRoute>
                  <RoleRoute role="admin">
                    <AdminDashboard />
                  </RoleRoute>
                </ProtectedRoute>
              }
            />

            {/* 404 Fallback */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
