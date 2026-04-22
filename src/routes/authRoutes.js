const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  changePassword,
  uploadProfilePic,
  updateProfileName,
  deleteAccount,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authMiddleware, getProfile);
router.put('/change-password', authMiddleware, changePassword);
router.post('/profile-picture', authMiddleware, upload.single('profile'), uploadProfilePic);

// NEW routes
router.put('/update-name', authMiddleware, updateProfileName);
router.delete('/delete-account', authMiddleware, deleteAccount);

module.exports = router;