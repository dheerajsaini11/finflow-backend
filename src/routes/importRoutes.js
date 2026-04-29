const express = require('express');
const router = express.Router();
const { upload, analyzeCSV, confirmImport } = require('../controllers/importController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/analyze', authMiddleware, upload.single('csv'), analyzeCSV);
router.post('/confirm', authMiddleware, express.json(), confirmImport);

module.exports = router;
