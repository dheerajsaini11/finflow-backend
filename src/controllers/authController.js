const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1', [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
      [name, email, hashedPassword]
    );

    const userId = result.rows[0].id;

    const defaultCategories = [
      { name: 'Food & Dining', icon: '🍕', color: '#FF6B6B', type: 'expense' },
      { name: 'Travel', icon: '🚗', color: '#4ECDC4', type: 'expense' },
      { name: 'Shopping', icon: '🛍️', color: '#45B7D1', type: 'expense' },
      { name: 'Rent & Home', icon: '🏠', color: '#96CEB4', type: 'expense' },
      { name: 'Medical', icon: '💊', color: '#FF6348', type: 'expense' },
      { name: 'Entertainment', icon: '🎬', color: '#A29BFE', type: 'expense' },
      { name: 'Utilities', icon: '⚡', color: '#FD79A8', type: 'expense' },
      { name: 'Salary', icon: '💰', color: '#00B894', type: 'income' },
      { name: 'Freelance', icon: '💻', color: '#FDCB6E', type: 'income' },
      { name: 'SIP', icon: '📈', color: '#6C5CE7', type: 'investment' },
    ];

    for (const cat of defaultCategories) {
      await db.query(
        'INSERT INTO categories (user_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5)',
        [userId, cat.name, cat.icon, cat.color, cat.type]
      );
    }

    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: userId, name, email }
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const result = await db.query(
      'SELECT * FROM users WHERE email = $1', [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'All fields required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const result = await db.query(
      'SELECT * FROM users WHERE id = $1', [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashed, req.userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // Generate a unique file name using the user ID
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${req.userId}_${Date.now()}.${fileExt}`;

    // Upload the file buffer to your Supabase public bucket
    const { error } = await supabase.storage
     .from('avatars')
     .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (error) throw error;

    // Retrieve the permanent public URL
    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    // Update your users table using $1 parameterization
    await db.query(
      'UPDATE users SET avatars_url = $1 WHERE id = $2',
      [publicUrl, req.userId]
    );

    res.json({ message: 'Profile picture updated', avatars_url: publicUrl });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, getProfile, changePassword, uploadProfilePic };