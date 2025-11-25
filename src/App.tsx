import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BookingApp } from './components/BookingApp'
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminTeachers } from './pages/AdminTeachers';
import { Impressum } from './pages/Impressum';
import { Datenschutz } from './pages/Datenschutz';
import { MaintenancePage } from './pages/MaintenancePage';
import { Footer } from './components/Footer';
import './App.css'

// Setze auf true um Maintenance-Modus zu aktivieren
const MAINTENANCE_MODE = false;

function App() {
  // Zeige Maintenance-Seite wenn aktiviert
  if (MAINTENANCE_MODE) {
    return <MaintenancePage />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<BookingApp />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/impressum" element={<Impressum />} />
              <Route path="/datenschutz" element={<Datenschutz />} />
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
            </Routes>
          </div>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
