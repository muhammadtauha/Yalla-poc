'use strict';
const fs = require('fs');
const path = require('path');
const { buildSeed } = require('../core/seed');

function loadDb(file = path.join(__dirname, '../../data/db.json')) {
  let db;
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = buildSeed();
  }
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(db, null, 2));
      } catch (e) {
        console.error('persist failed:', e.message);
      }
    }, 100);
  };
  persist();
  return { db, persist };
}
module.exports = { loadDb };
