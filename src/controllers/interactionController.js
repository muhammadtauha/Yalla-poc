'use strict';
module.exports = (svc) => ({
  create: (req, res) => {
    const userId = req.body.userId || req.get('x-user-id') || 'U1';
    res.status(201).json(svc.recordInteraction({ ...req.body, userId }));
  },
  activity: (req, res) => res.json(svc.recentActivity(req.query.userId || 'U1', Number(req.query.limit) || 10)),
});
