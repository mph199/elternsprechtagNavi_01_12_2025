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
import { AdminFeedback } from './pages/AdminFeedback';
import { TeacherLayout } from './pages/teacher/TeacherLayout';
import { TeacherBookings } from './pages/teacher/TeacherBookings';
import { TeacherRequests } from './pages/teacher/TeacherRequests';
import { TeacherHome } from './pages/teacher/TeacherHome';
import { TeacherPassword } from './pages/teacher/TeacherPassword';
import { TeacherFeedback } from './pages/teacher/TeacherFeedback';
import { Impressum } from './pages/Impressum';
import { Datenschutz } from './pages/Datenschutz';
import { VerifyEmail } from './pages/VerifyEmail';
import { MaintenancePage } from './pages/MaintenancePage';
import { Footer } from './components/Footer';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { GlobalTopHeader } from './components/GlobalTopHeader';
import './App.css'

// Maintenance-Modus via Env: VITE_MAINTENANCE_MODE=true|1|yes
const MAINTENANCE_MODE = (() => {
  const env = import.meta.env as unknown as Record<string, unknown>;
  const raw = env?.VITE_MAINTENANCE_MODE;
  return typeof raw === 'string' && /^(1|true|yes)$/i.test(raw);
})();

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <GlobalTopHeader />
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
                    <TeacherLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<TeacherHome />} />
                <Route path="requests" element={<TeacherRequests />} />
                <Route path="bookings" element={<TeacherBookings />} />
                <Route path="password" element={<TeacherPassword />} />
                <Route path="feedback" element={<TeacherFeedback />} />
                <Route path="*" element={<Navigate to="/teacher" replace />} />
              </Route>

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
              <Route 
                path="/admin/feedback" 
                element={
                  <ProtectedRoute>
                    <AdminFeedback />
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
