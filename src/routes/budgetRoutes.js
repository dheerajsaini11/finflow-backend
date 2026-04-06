const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getBudgets,
  setBudget,
  deleteBudget,
  getBudgetSummary
} = require('../controllers/budgetController');

router.use(authMiddleware);

router.get('/', getBudgets);
router.get('/summary', getBudgetSummary);
router.post('/', setBudget);
router.delete('/:id', deleteBudget);

module.exports = router;