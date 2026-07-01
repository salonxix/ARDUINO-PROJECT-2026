/**
 * computeWQI.js
 * Calculates Water Quality Index (WQI) and assigns a grade
 * based on pH, TDS, turbidity, gas level, and temperature.
 *
 * Each parameter is normalized to a 0–100 sub-index score,
 * then combined using weighted average.
 */

/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Score pH (ideal: 7.0, acceptable: 6.5–8.5, limits: 0–14)
 * Returns 100 at pH 7, degrades linearly toward the edges.
 */
function scorePH(ph) {
  if (ph === undefined || ph === null) return 50; // neutral assumption
  const val = Number(ph);
  if (val >= 6.5 && val <= 8.5) {
    // Perfect range: scale 100 at 7.0, 80 at edges 6.5/8.5
    return 100 - Math.abs(val - 7.0) * (20 / 1.5);
  }
  if (val >= 5.0 && val < 6.5) return clamp(80 - (6.5 - val) * 40, 0, 80);
  if (val > 8.5 && val <= 10.0) return clamp(80 - (val - 8.5) * 40, 0, 80);
  return 0;
}

/**
 * Score TDS in ppm (ideal: <300, acceptable: <600, poor: >1200)
 */
function scoreTDS(tds) {
  if (tds === undefined || tds === null) return 50;
  const val = Number(tds);
  if (val <= 300) return 100;
  if (val <= 600) return 100 - ((val - 300) / 300) * 40;   // 100 → 60
  if (val <= 900) return 60 - ((val - 600) / 300) * 30;    // 60  → 30
  if (val <= 1200) return 30 - ((val - 900) / 300) * 20;   // 30  → 10
  return clamp(10 - ((val - 1200) / 300) * 10, 0, 10);
}

/**
 * Score turbidity in NTU (ideal: <1, acceptable: <4, WHO limit: 5)
 */
function scoreTurbidity(turbidity) {
  if (turbidity === undefined || turbidity === null) return 50;
  const val = Number(turbidity);
  if (val <= 1) return 100;
  if (val <= 4) return 100 - ((val - 1) / 3) * 40;  // 100 → 60
  if (val <= 10) return 60 - ((val - 4) / 6) * 40;  // 60  → 20
  return clamp(20 - ((val - 10) / 10) * 20, 0, 20);
}

/**
 * Score gas level (arbitrary ADC units, 0–1023 typical for MQ sensors)
 * Lower is better. >400 considered poor air/dissolved gas quality.
 */
function scoreGas(gas) {
  if (gas === undefined || gas === null) return 50;
  const val = Number(gas);
  if (val <= 100) return 100;
  if (val <= 300) return 100 - ((val - 100) / 200) * 40;  // 100 → 60
  if (val <= 600) return 60 - ((val - 300) / 300) * 40;   // 60  → 20
  return clamp(20 - ((val - 600) / 423) * 20, 0, 20);
}

/**
 * Score temperature in °C (ideal: 15–25, acceptable: 10–30)
 */
function scoreTemperature(temp) {
  if (temp === undefined || temp === null) return 50;
  const val = Number(temp);
  if (val >= 15 && val <= 25) return 100;
  if (val >= 10 && val < 15) return 100 - ((15 - val) / 5) * 30;  // 100 → 70
  if (val > 25 && val <= 30) return 100 - ((val - 25) / 5) * 30;  // 100 → 70
  if (val >= 5 && val < 10)  return 70 - ((10 - val) / 5) * 30;   // 70  → 40
  if (val > 30 && val <= 40) return 70 - ((val - 30) / 10) * 30;  // 70  → 40
  return clamp(40 - Math.abs(val - 22.5) * 2, 0, 40);
}

/**
 * Assign letter grade from WQI score (0–100)
 */
function assignGrade(wqi) {
  if (wqi >= 90) return 'A+';
  if (wqi >= 80) return 'A';
  if (wqi >= 70) return 'B';
  if (wqi >= 60) return 'C';
  if (wqi >= 40) return 'D';
  return 'F';
}

/**
 * Main export: compute WQI and grade from raw sensor readings.
 *
 * @param {object} params
 * @param {number} params.ph
 * @param {number} params.tds
 * @param {number} params.turbidity
 * @param {number} params.gas
 * @param {number} params.temp
 * @returns {{ wqi: number, grade: string }}
 */
function computeWQI({ ph, tds, turbidity, gas, temp }) {
  // Weights must sum to 1.0
  const weights = {
    ph:          0.30,
    tds:         0.25,
    turbidity:   0.20,
    gas:         0.10,
    temperature: 0.15,
  };

  const scores = {
    ph:          scorePH(ph),
    tds:         scoreTDS(tds),
    turbidity:   scoreTurbidity(turbidity),
    gas:         scoreGas(gas),
    temperature: scoreTemperature(temp),
  };

  const wqi = Math.round(
    scores.ph          * weights.ph          +
    scores.tds         * weights.tds         +
    scores.turbidity   * weights.turbidity   +
    scores.gas         * weights.gas         +
    scores.temperature * weights.temperature
  );

  return {
    wqi:   clamp(wqi, 0, 100),
    grade: assignGrade(wqi),
  };
}

module.exports = computeWQI;
