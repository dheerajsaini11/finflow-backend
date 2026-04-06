const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getDashboard,
  getYearlyAnalytics,
  getStreak
} = require('../controllers/dashboardController');

router.use(authMiddleware);

router.get('/', getDashboard);
router.get('/analytics', getYearlyAnalytics);
router.get('/streak', getStreak);

module.exports = router;