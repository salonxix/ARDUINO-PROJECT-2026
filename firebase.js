const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: 'https://aquavitals-7c1d3-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = getDatabase();

module.exports = db;
