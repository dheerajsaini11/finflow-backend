const db = require('../config/db');

const getDashboard = async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const summary = await db.query(
      `SELECT type, SUM(amount) as total
       FROM transactions
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM date) = $2
       AND EXTRACT(YEAR FROM date) = $3
       GROUP BY type`,
      [userId, month, year]
    );

    const totals = { income: 0, expense: 0, investment: 0 };
    summary.rows.forEach(row => {
      if (totals.hasOwnProperty(row.type)) {
        totals[row.type] = Number(row.total);
      }
    });
    totals.net = totals.income - totals.expense - totals.investment;

    const lastMonth = month === 1 ? 12 : month - 1;
    const lastMonthYear = month === 1 ? year - 1 : year;

    const lastSummary = await db.query(
      `SELECT type, SUM(amount) as total
       FROM transactions
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM date) = $2
       AND EXTRACT(YEAR FROM date) = $3
       GROUP BY type`,
      [userId, lastMonth, lastMonthYear]
    );

    const lastTotals = { income: 0, expense: 0, investment: 0 };
    lastSummary.rows.forEach(row => {
      if (lastTotals.hasOwnProperty(row.type)) {
        lastTotals[row.type] = Number(row.total);
      }
    });

    const recent = await db.query(
      `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT 5`,
      [userId]
    );

    const debtors = await db.query(
      `SELECT person_name, balance
       FROM lend_balance
       WHERE user_id = $1 AND balance > 0
       ORDER BY balance DESC
       LIMIT 3`,
      [userId]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM transactions WHERE user_id = $1',
      [userId]
    );
    const totalTransactions = Number(countResult.rows[0].total);

    const savingsRate = totals.income > 0
      ? ((totals.income - totals.expense) / totals.income) * 100 : 0;
    const investmentRate = totals.income > 0
      ? (totals.investment / totals.income) * 100 : 0;
    const healthScore = Math.min(
      100, Math.round(savingsRate * 0.6 + investmentRate * 0.4)
    );

    const daysInMonth = new Date(year, month, 0).getDate();
    const today = now.getDate();
    const monthProgress = (today / daysInMonth) * 100;
    const budgetProgress = totals.income > 0
      ? (totals.expense / totals.income) * 100 : 0;

    const burnRate = today > 0 ? Math.round(totals.expense / today) : 0;
    const projectedExpense = Math.round((totals.expense / today) * daysInMonth);

    res.json({
      currentMonth: { month, year, ...totals },
      lastMonth: lastTotals,
      recentTransactions: recent.rows,
      debtors: debtors.rows,
      healthScore,
      budgetUtilization: {
        budgetProgress: Math.round(budgetProgress),
        monthProgress: Math.round(monthProgress),
        isOverPacing: budgetProgress > monthProgress
      },
      burnRate,
      projectedExpense,
      total_transactions: totalTransactions,
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getYearlyAnalytics = async (req, res) => {
  try {
    const userId = req.userId;
    const year = req.query.year || new Date().getFullYear();

    const rows = await db.query(
      `SELECT
        EXTRACT(MONTH FROM date) as month,
        type,
        SUM(amount) as total
       FROM transactions
       WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2
       GROUP BY EXTRACT(MONTH FROM date), type
       ORDER BY month`,
      [userId, year]
    );

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, income: 0, expense: 0, investment: 0, net: 0
    }));

    rows.rows.forEach(row => {
      const monthData = months[Number(row.month) - 1];
      if (monthData.hasOwnProperty(row.type)) {
        monthData[row.type] = Number(row.total);
      }
    });

    months.forEach(m => {
      m.net = m.income - m.expense - m.investment;
    });

    const currentMonth = req.query.month || new Date().getMonth() + 1;
    const categoryBreakdown = await db.query(
      `SELECT c.name, c.icon, c.color, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
       AND EXTRACT(MONTH FROM t.date) = $2
       AND EXTRACT(YEAR FROM t.date) = $3
       AND t.type = 'expense'
       AND c.name IS NOT NULL
       GROUP BY c.id, c.name, c.icon, c.color
       ORDER BY total DESC`,
      [userId, currentMonth, year]
    );

    const heatmap = await db.query(
      `SELECT DATE(date) as day, SUM(amount) as total
       FROM transactions
       WHERE user_id = $1
       AND EXTRACT(YEAR FROM date) = $2
       AND type = 'expense'
       GROUP BY DATE(date)`,
      [userId, year]
    );

    res.json({
      months,
      categoryBreakdown: categoryBreakdown.rows,
      heatmap: heatmap.rows,
      year
    });

  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getStreak = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await db.query(
      `SELECT DISTINCT DATE(date) as day
       FROM transactions
       WHERE user_id = $1
       ORDER BY day DESC
       LIMIT 365`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ streak: 0, lastLoggedDate: null });
    }

    const days = result.rows.map(r => {
      const d = new Date(r.day);
      return d.toISOString().split('T')[0];
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    if (days[0] !== todayStr && days[0] !== yesterdayStr) {
      return res.json({ streak: 0, lastLoggedDate: days[0] });
    }

    let streak = 0;
    let expected = new Date(days[0]);

    for (let i = 0; i < days.length; i++) {
      const dayStr = days[i];
      const expectedStr = expected.toISOString().split('T')[0];
      if (dayStr === expectedStr) {
        streak++;
        expected.setDate(expected.getDate() - 1);
      } else {
        break;
      }
    }

    res.json({ streak, lastLoggedDate: days[0] });
  } catch (err) {
    console.error('Streak error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getDashboard, getYearlyAnalytics, getStreak };