const db = require('../config/db');

const getBudgets = async (req, res) => {
  try {
    const { month, year } = req.query;

    const result = await db.query(
      `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3`,
      [req.userId, month, year]
    );

    res.json({ budgets: result.rows });
  } catch (err) {
    console.error('Get budgets error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const setBudget = async (req, res) => {
  try {
    const { category_id, amount, month, year } = req.body;
    const userId = req.userId;

    if (!category_id || !amount || !month || !year) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const existing = await db.query(
      `SELECT id FROM budgets
       WHERE user_id = $1 AND category_id = $2 AND month = $3 AND year = $4`,
      [userId, category_id, month, year]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE budgets SET amount = $1
         WHERE user_id = $2 AND category_id = $3 AND month = $4 AND year = $5`,
        [amount, userId, category_id, month, year]
      );
    } else {
      await db.query(
        `INSERT INTO budgets (user_id, category_id, amount, month, year)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, category_id, amount, month, year]
      );
    }

    res.json({ message: 'Budget saved successfully' });
  } catch (err) {
    console.error('Set budget error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteBudget = async (req, res) => {
  try {
    await db.query(
      `DELETE FROM budgets WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    res.json({ message: 'Budget deleted' });
  } catch (err) {
    console.error('Delete budget error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getBudgetSummary = async (req, res) => {
  try {
    const { month, year } = req.query;

    const result = await db.query(
      `SELECT
        b.id,
        b.category_id,
        b.amount as budget_amount,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color,
        COALESCE(SUM(t.amount), 0) as spent_amount
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       LEFT JOIN transactions t
         ON t.category_id = b.category_id
         AND t.user_id = b.user_id
         AND EXTRACT(MONTH FROM t.date) = b.month
         AND EXTRACT(YEAR FROM t.date) = b.year
         AND t.type = 'expense'
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
       GROUP BY b.id, c.id, c.name, c.icon, c.color`,
      [req.userId, month, year]
    );

    res.json({ summary: result.rows });
  } catch (err) {
    console.error('Budget summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getBudgets, setBudget, deleteBudget, getBudgetSummary };