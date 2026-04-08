const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const lendRoutes = require('./routes/lendRoutes');
const budgetRoutes = require('./routes/budgetRoutes');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://finflow-frontend-taupe.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/lend', lendRoutes);
app.use('/api/budget', budgetRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'FinFlow API is live 🚀' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FinFlow server running on port ${PORT}`);
});