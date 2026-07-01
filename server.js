const express = require('express');
const cors = require('cors');
const db = require('./firebase');

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

// Calculate grade and WQI from sensor readings
function calculateGradeAndWQI({ ph, tds, turbidity }) {
  const phVal        = Number(ph)        || 0;
  const tdsVal       = Number(tds)       || 0;
  const turbidityVal = Number(turbidity) || 0;

  let grade, wqi;

  if (phVal >= 6.5 && phVal <= 8.5 && tdsVal < 300 && turbidityVal < 3) {
    grade = 'A';
    wqi   = 90;
  } else if (tdsVal < 500) {
    grade = 'B';
    wqi   = 75;
  } else if (tdsVal < 700) {
    grade = 'C';
    wqi   = 60;
  } else if (tdsVal < 900) {
    grade = 'D';
    wqi   = 40;
  } else {
    grade = 'F';
    wqi   = 20;
  }

  return { grade, wqi };
}

// GET / - Health check
app.get('/', (req, res) => {
  res.send('Server Running');
});

// POST /sensor - Compute WQI + grade, then save to Firebase
app.post('/sensor', async (req, res) => {
  try {
    const {
      city,
      country,
      lat,
      lng,
      ph,
      tds,
      turbidity,
      gas,
      temp,
    } = req.body;

    // Compute grade and WQI using defined rules
    const { grade, wqi } = calculateGradeAndWQI({ ph, tds, turbidity });

    // Build the full record to store
    const record = {
      city:      city      ?? null,
      country:   country   ?? null,
      lat:       lat       ?? null,
      lng:       lng       ?? null,
      ph:        ph        ?? null,
      tds:       tds       ?? null,
      turbidity: turbidity ?? null,
      gas:       gas       ?? null,
      temp:      temp      ?? null,
      wqi,
      grade,
      timestamp: Date.now(),
    };

    await db.ref('water-data').push(record);

    res.json({ success: true, message: 'Data stored successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
