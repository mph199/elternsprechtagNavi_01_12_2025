import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BookingApp } from './components/BookingApp'
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminTeachers } from './pages/AdminTeachers';
import { AdminSettings } from './pages/AdminSettings';
import { AdminSlots } from './pages/AdminSlots';
import { Impressum } from './pages/Impressum';
import { Datenschutz } from './pages/Datenschutz';
import { MaintenancePage } from './pages/MaintenancePage';
import { Footer } from './components/Footer';
import './App.css'

// Setze auf true um Maintenance-Modus zu aktivieren
const MAINTENANCE_MODE = false;

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <Routes>
              {/* Login ist immer erreichbar, auch im Maintenance-Modus */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Hauptseite zeigt entweder Maintenance oder normale App */}
              <Route path="/" element={MAINTENANCE_MODE ? <MaintenancePage /> : <BookingApp />} />
              <Route path="/impressum" element={MAINTENANCE_MODE ? <MaintenancePage /> : <Impressum />} />
              <Route path="/datenschutz" element={MAINTENANCE_MODE ? <MaintenancePage /> : <Datenschutz />} />
              
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
                path="/admin/settings" 
                element={
                  <ProtectedRoute>
                    <AdminSettings />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </div>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
