const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getLendBalances, getPersonTransactions, settlePerson } = require('../controllers/lendController');

router.use(authMiddleware);

router.get('/', getLendBalances);
router.get('/:person_name', getPersonTransactions);
router.put('/:person_name/settle', settlePerson);
router.delete('/settled/:person_name', authMiddleware, lendController.deleteSettledPerson);

module.exports = router;