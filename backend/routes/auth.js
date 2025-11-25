import express from 'express';
import { verifyCredentials, ADMIN_USER } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Sets session on success
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Username and password required' 
    });
  }

  try {
    // Check if users table exists and query it
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .limit(1);

    if (error) {
      // Fallback to hardcoded admin if users table doesn't exist yet
      console.warn('Users table not found, using fallback admin');
      const isValid = await verifyCredentials(username, password);
      
      if (!isValid) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid credentials' 
        });
      }

      req.session.isAuthenticated = true;
      req.session.user = { username: ADMIN_USER.username, role: 'admin' };

      return res.json({ 
        success: true, 
        message: 'Login successful',
        user: { username: ADMIN_USER.username, role: 'admin' }
      });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid credentials' 
      });
    }

    const user = users[0];
    
    // Verify password (implement proper bcrypt comparison later)
    const isValid = await verifyCredentials(username, password);
    
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid credentials' 
      });
    }

    // Set session with role and teacherId
    const userData = {
      username: user.username,
      role: user.role,
      teacherId: user.teacher_id || undefined
    };

    req.session.isAuthenticated = true;
    req.session.user = userData;

    res.json({ 
      success: true, 
      message: 'Login successful',
      user: userData
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Login failed' 
    });
  }
});

/**
 * POST /api/auth/logout
 * Destroys session
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ 
        error: 'Internal Server Error', 
        message: 'Logout failed' 
      });
    }
    res.clearCookie('connect.sid');
    res.json({ 
      success: true, 
      message: 'Logout successful' 
    });
  });
});

/**
 * GET /api/auth/verify
 * Checks if session is authenticated
 */
router.get('/verify', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.json({ 
      authenticated: true, 
      user: req.session.user || { username: ADMIN_USER.username }
    });
  }
  res.json({ 
    authenticated: false 
  });
});

export default router;
