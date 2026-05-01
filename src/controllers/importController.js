const db = require('../config/db');
const multer = require('multer');
const Papa = require('papaparse');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/import/analyze
const analyzeCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const csvText = req.file.buffer.toString('utf-8');

    // Parse CSV
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (!parsed.data || parsed.data.length === 0) {
      return res.status(400).json({ message: 'CSV is empty or invalid' });
    }

    const headers = parsed.meta.fields;
    const sampleRows = parsed.data.slice(0, 5);

    // Call Gemini to map columns
    const prompt = `You are a financial data parser. Analyze this CSV from a bank or finance app.

Headers: ${JSON.stringify(headers)}
Sample rows (first 5): ${JSON.stringify(sampleRows)}

Return ONLY a raw JSON object. No markdown. No backticks. No explanation.
{
  "date_column": "single date column name, or null if date is split across columns",
  "date_parts": {"year": "year column name or null", "month": "month column name or null", "day": "day column name or null"},
  "amount_column": "amount column if single, else null",
  "debit_column": "debit column if split, else null",
  "credit_column": "credit column if split, else null",
  "description_column": "description/note/category/narration column",
  "type_logic": "single or split",
  "notes": "brief observations"
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Gemini raw response:', rawText);
    // Extract JSON robustly — handle markdown fences, extra text
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini did not return valid JSON. Raw: ' + rawText.slice(0, 200));
    const mapping = JSON.parse(jsonMatch[0]);

    // Helper to build date string from mapping
    const buildDate = (row, mapping) => {
      if (mapping.date_column) return row[mapping.date_column] || '';
      if (mapping.date_parts) {
        const y = row[mapping.date_parts.year] || '';
        const m = row[mapping.date_parts.month] || '';
        const d = row[mapping.date_parts.day] || '';
        if (y && m && d) return \`\${d} \${m} \${y}\`;
      }
      return '';
    };

    // Generate preview rows using the mapping
    const preview = parsed.data.slice(0, 8).map(row => {
      let amount = 0;
      let type = 'expense';

      if (mapping.debit_column && mapping.credit_column) {
        const debit = parseFloat(row[mapping.debit_column]?.replace(/[,₹\s]/g, '') || '0');
        const credit = parseFloat(row[mapping.credit_column]?.replace(/[,₹\s]/g, '') || '0');
        if (credit > 0) { amount = credit; type = 'income'; }
        else { amount = debit; type = 'expense'; }
      } else {
        amount = parseFloat(row[mapping.amount_column]?.replace(/[,₹\s]/g, '') || '0');
        type = amount >= 0 ? 'expense' : 'income';
        amount = Math.abs(amount);
      }

      return {
        raw_date: buildDate(row, mapping),
        description: row[mapping.description_column] || '',
        amount,
        type,
      };
    }).filter(r => r.amount > 0);

    // Get user categories for mapping in frontend
    const categories = await db.query(
      'SELECT id, name, type FROM categories WHERE user_id = $1 AND is_active = true ORDER BY name',
      [req.userId]
    );

    res.json({
      mapping,
      preview,
      total_rows: parsed.data.length,
      headers,
      raw_data: parsed.data,
      categories: categories.rows,
      buildDateHelper: mapping.date_parts ? 'parts' : 'single'
    });

  } catch (err) {
    console.error('Import analyze error:', err);
    res.status(500).json({ message: 'Failed to analyze CSV: ' + err.message });
  }
};

// POST /api/import/confirm
const confirmImport = async (req, res) => {
  try {
    const { transactions } = req.body;
    const userId = req.userId;

    if (!transactions || transactions.length === 0) {
      return res.status(400).json({ message: 'No transactions to import' });
    }

    let imported = 0;
    let skipped = 0;

    for (const tx of transactions) {
      const { date, amount, type, category_id, note } = tx;

      if (!date || !amount || !type) { skipped++; continue; }

      // Duplicate check: same user + date + amount + category_id
      const dup = await db.query(
        `SELECT id FROM transactions 
         WHERE user_id = $1 AND date = $2 AND amount = $3 AND category_id = $4`,
        [userId, date, amount, category_id || null]
      );

      if (dup.rows.length > 0) { skipped++; continue; }

      await db.query(
        `INSERT INTO transactions (user_id, type, amount, category_id, note, date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, type, amount, category_id || null, note || null, date]
      );
      imported++;
    }

    res.json({ imported, skipped, total: transactions.length });

  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ message: 'Import failed: ' + err.message });
  }
};

module.exports = { upload, analyzeCSV, confirmImport };
