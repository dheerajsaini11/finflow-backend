const db = require('../config/db');

const getCategories = async (req, res) => {
  try {
    const userId = req.userId;
    const { type } = req.query;

    let query = 'SELECT * FROM categories WHERE user_id = $1';
    const params = [userId];

    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }

    query += ' AND is_active = TRUE ORDER BY name ASC';

    const result = await db.query(query, params);
    res.json({ categories: result.rows });

  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const addCategory = async (req, res) => {
  try {
    const { name, icon, color, type } = req.body;
    const userId = req.userId;

    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const result = await db.query(
      'INSERT INTO categories (user_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, name, icon || '📦', color || '#6C63FF', type]
    );

    res.status(201).json({
      message: 'Category added successfully',
      categoryId: result.rows[0].id
    });

  } catch (err) {
    console.error('Add category error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { name, icon, color, is_active } = req.body;

    const existing = await db.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const cat = existing.rows[0];

    await db.query(
      `UPDATE categories SET name=$1, icon=$2, color=$3, is_active=$4
       WHERE id = $5 AND user_id = $6`,
      [
        name || cat.name,
        icon || cat.icon,
        color || cat.color,
        is_active !== undefined ? is_active : cat.is_active,
        req.params.id,
        req.userId
      ]
    );

    res.json({ message: 'Category updated successfully' });

  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const transactions = await db.query(
      'SELECT id FROM transactions WHERE category_id = $1 LIMIT 1',
      [req.params.id]
    );

    if (transactions.rows.length > 0) {
      await db.query(
        'UPDATE categories SET is_active = FALSE WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId]
      );
      return res.json({ message: 'Category archived successfully' });
    }

    await db.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    res.json({ message: 'Category deleted successfully' });

  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getCategories, addCategory, updateCategory, deleteCategory };