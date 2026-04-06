const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  addTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  getMonthlySummary
} = require('../controllers/transactionController');

router.use(authMiddleware);

router.post('/', addTransaction);
router.get('/', getTransactions);
router.get('/summary', getMonthlySummary);
router.get('/:id', getTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;