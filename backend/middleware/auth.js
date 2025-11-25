import bcrypt from 'bcryptjs';

// Admin User Credentials
export const ADMIN_USER = {
  username: 'admin',
  passwordHash: '$2b$10$K7KzIVafYIWYoOIIXB2tTeBmrC16USa2HRzx22cC985UDuRKcDpWS' // bksb2024
};

/**
 * Middleware: Requires authenticated session
 * Checks if req.session.isAuthenticated is true
 */
export function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  return res.status(401).json({ 
    error: 'Unauthorized', 
    message: 'Authentication required' 
  });
}

/**
 * Middleware: Requires admin role
 * Checks if user is authenticated AND has admin role
 */
export function requireAdmin(req, res, next) {
  if (req.session && req.session.isAuthenticated && req.session.user?.role === 'admin') {
    return next();
  }
  return res.status(403).json({ 
    error: 'Forbidden', 
    message: 'Admin access required' 
  });
}

/**
 * Verify login credentials
 */
export async function verifyCredentials(username, password) {
  if (username !== ADMIN_USER.username) {
    return false;
  }
  return bcrypt.compare(password, ADMIN_USER.passwordHash);
}
