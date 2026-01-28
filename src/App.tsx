import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BookingApp } from './components/BookingApp'
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminTeachers } from './pages/AdminTeachers';
import { AdminSlots } from './pages/AdminSlots';
import { AdminEvents } from './pages/AdminEvents';
import { AdminUsers } from './pages/AdminUsers';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { Impressum } from './pages/Impressum';
import { Datenschutz } from './pages/Datenschutz';
import { VerifyEmail } from './pages/VerifyEmail';
import { MaintenancePage } from './pages/MaintenancePage';
import { Footer } from './components/Footer';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './App.css'

// Maintenance-Modus via Env: VITE_MAINTENANCE_MODE=true|1|yes
const MAINTENANCE_MODE = (() => {
  const raw = (import.meta as any).env?.VITE_MAINTENANCE_MODE;
  return typeof raw === 'string' && /^(1|true|yes)$/i.test(raw);
})();

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <AppErrorBoundary>
            <Routes>
              {/* Login ist immer erreichbar, auch im Maintenance-Modus */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Hauptseite zeigt entweder Maintenance oder normale App */}
              <Route path="/" element={MAINTENANCE_MODE ? <MaintenancePage /> : <BookingApp />} />
              <Route path="/impressum" element={MAINTENANCE_MODE ? <MaintenancePage /> : <Impressum />} />
              <Route path="/datenschutz" element={MAINTENANCE_MODE ? <MaintenancePage /> : <Datenschutz />} />
              <Route path="/verify" element={<VerifyEmail />} />
              
              {/* Geschützter Teacher-Bereich */}
              <Route 
                path="/teacher"
                element={
                  <ProtectedRoute>
                    <TeacherDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Admin-Bereich ist immer erreichbar, auch im Maintenance-Modus */}
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/teachers" 
                element={
                  <ProtectedRoute>
                    <AdminTeachers />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/slots" 
                element={
                  <ProtectedRoute>
                    <AdminSlots />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/events" 
                element={
                  <ProtectedRoute>
                    <AdminEvents />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/users" 
                element={
                  <ProtectedRoute>
                    <AdminUsers />
                  </ProtectedRoute>
                } 
              />
              {/* Catch-All: leite unbekannte Pfade auf die Startseite um */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </AppErrorBoundary>
          </div>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
