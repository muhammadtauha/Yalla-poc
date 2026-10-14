'use strict';
const uid = (req) => req.query.userId || req.get('x-user-id') || 'U1';
module.exports = (svc) => ({
  feed: (req, res) => res.json(svc.getFeed(uid(req), { limit: Number(req.query.limit) || 12 })),
  recommendations: (req, res) => res.json(svc.getFeed(uid(req), { limit: Number(req.query.limit) || 12, discoverOnly: true })),
});
