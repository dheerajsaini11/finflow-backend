const db = require('../config/db');

const addTransaction = async (req, res) => {
  try {
    const { type, amount, category_id, note, date, person_name } = req.body;
    const userId = req.userId;

    if (!type || !amount || !date) {
      return res.status(400).json({ message: 'Type, amount and date are required' });
    }

    const result = await db.query(
      `INSERT INTO transactions
       (user_id, type, amount, category_id, note, date, person_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, type, amount, category_id || null, note || null, date, person_name || null]
    );

    if (type === 'lend' || type === 'return' || type === 'borrow' || type === 'borrow_return') {
      if (!person_name) {
        return res.status(400).json({ message: 'Person name required for lend/return/borrow' });
      }

      // Delta logic:
      // lend          → +amount (they owe you more)
      // return        → -amount (they paid you back, reduces what they owe)
      // borrow        → -amount (you owe them more)
      // borrow_return → +amount (you paid them back, reduces what you owe)
      const getDelta = (t, amt) => {
        if (t === 'lend') return Number(amt);
        if (t === 'return') return -Number(amt);
        if (t === 'borrow') return -Number(amt);
        if (t === 'borrow_return') return Number(amt);
        return 0;
      };

      const existing = await db.query(
        'SELECT id, balance FROM lend_balance WHERE user_id = $1 AND person_name = $2',
        [userId, person_name]
      );

      if (existing.rows.length === 0) {
        const initialBalance = getDelta(type, amount);
        await db.query(
          'INSERT INTO lend_balance (user_id, person_name, balance) VALUES ($1, $2, $3)',
          [userId, person_name, initialBalance]
        );
      } else {
        const delta = getDelta(type, amount);
        await db.query(
          'UPDATE lend_balance SET balance = balance + $1 WHERE user_id = $2 AND person_name = $3',
          [delta, userId, person_name]
        );
      }
    }

    res.status(201).json({
      message: 'Transaction added successfully',
      transactionId: result.rows[0].id
    });

  } catch (err) {
    console.error('Add transaction error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getTransactions = async (req, res) => {
  try {
    const userId = req.userId;
    const { type, start_date, end_date, category_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
    `;
    const params = [userId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      query += ` AND t.type = $${paramCount}`;
      params.push(type);
    }
    if (start_date) {
      paramCount++;
      query += ` AND t.date >= $${paramCount}`;
      params.push(start_date);
    }
    if (end_date) {
      paramCount++;
      query += ` AND t.date <= $${paramCount}`;
      params.push(end_date);
    }
    if (category_id) {
      paramCount++;
      query += ` AND t.category_id = $${paramCount}`;
      params.push(category_id);
    }

    paramCount++;
    query += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset));

    const result = await db.query(query, params);
    res.json({ transactions: result.rows });

  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getTransaction = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, c.name as category_name, c.icon as category_icon
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = $1 AND t.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ transaction: result.rows[0] });
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateTransaction = async (req, res) => {
  try {
    const { type, amount, category_id, note, date, person_name } = req.body;

    const existing = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const tx = existing.rows[0];

    await db.query(
      `UPDATE transactions
       SET type=$1, amount=$2, category_id=$3, note=$4, date=$5, person_name=$6
       WHERE id = $7 AND user_id = $8`,
      [
        type || tx.type,
        amount || tx.amount,
        category_id || tx.category_id,
        note || tx.note,
        date || tx.date,
        person_name || tx.person_name,
        req.params.id,
        req.userId
      ]
    );

    res.json({ message: 'Transaction updated successfully' });
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await db.query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMonthlySummary = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, year } = req.query;

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const result = await db.query(
      `SELECT type, SUM(amount) as total, COUNT(*) as count
       FROM transactions
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM date) = $2
       AND EXTRACT(YEAR FROM date) = $3
       GROUP BY type`,
      [userId, targetMonth, targetYear]
    );

    const summary = {
      income: 0, expense: 0,
      investment: 0, lend: 0, return: 0
    };

    result.rows.forEach(row => {
      summary[row.type] = Number(row.total);
    });

    summary.net = summary.income - summary.expense - summary.investment;

    res.json({ summary, month: targetMonth, year: targetYear });

  } catch (err) {
    console.error('Monthly summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  addTransaction, getTransactions, getTransaction,
  updateTransaction, deleteTransaction, getMonthlySummary
};