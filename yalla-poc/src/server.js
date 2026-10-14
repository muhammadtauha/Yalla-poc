'use strict';
const path = require('path');
const express = require('express');
const { createService } = require('./core/service');
const { loadDb } = require('./store/fileStore');

function createApp({ db, persist } = {}) {
  if (!db) ({ db, persist } = loadDb());
  const svc = createService(db, { persist });
  const app = express();
  app.use(express.json());
  app.use('/api', require('./routes')(svc));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(path.join(__dirname, '../public')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}
if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Yalla POC running on http://localhost:${port}`));
}
module.exports = { createApp };
