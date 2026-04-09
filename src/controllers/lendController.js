const db = require('../config/db');

const getLendBalances = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT lb.*,
        (SELECT MAX(date) FROM transactions
         WHERE user_id = $1 AND person_name = lb.person_name) as last_transaction
       FROM lend_balance lb
       WHERE lb.user_id = $2
       ORDER BY lb.balance DESC`,
      [req.userId, req.userId]
    );

    res.json({ balances: result.rows });
  } catch (err) {
    console.error('Lend balances error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getPersonTransactions = async (req, res) => {
  try {
    const { person_name } = req.params;

    const transactions = await db.query(
      `SELECT * FROM transactions
       WHERE user_id = $1 AND person_name = $2
       AND type IN ('lend', 'return', 'borrow') -- ADDED 'borrow' HERE
       ORDER BY date DESC`,
      [req.userId, decodeURIComponent(person_name)]
    );

    const balance = await db.query(
      `SELECT balance FROM lend_balance
       WHERE user_id = $1 AND person_name = $2`,
      [req.userId, decodeURIComponent(person_name)]
    );

    res.json({
      transactions: transactions.rows,
      balance: balance.rows.length > 0 ? balance.rows[0].balance : 0
    });

  } catch (err) {
    console.error('Person transactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const settlePerson = async (req, res) => {
  try {
    const { person_name } = req.params;

    await db.query(
      `UPDATE lend_balance SET balance = 0
       WHERE user_id = $1 AND person_name = $2`,
      [req.userId, decodeURIComponent(person_name)]
    );

    res.json({ message: 'Settled successfully' });
  } catch (err) {
    console.error('Settle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getLendBalances, getPersonTransactions, settlePerson };