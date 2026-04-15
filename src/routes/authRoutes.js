const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  changePassword
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { uploadProfilePic } = require('../controllers/authController');

// Add this endpoint to your existing routes
router.post('/profile-picture', authMiddleware, upload.single('profile'), uploadProfilePic);

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authMiddleware, getProfile);
router.put('/change-password', authMiddleware, changePassword);

module.exports = router;