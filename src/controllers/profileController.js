'use strict';
const uid = (req) => req.query.userId || req.get('x-user-id') || 'U1';
module.exports = (svc) => ({
  profile: (req, res) => res.json(svc.getProfile(uid(req))),
  affinity: (req, res) => res.json(svc.getProfile(uid(req)).creatorAffinity),
  interests: (req, res) => res.json(svc.getProfile(uid(req)).topicAffinity),
  users: (_req, res) => res.json(svc.listUsers()),
  creators: (_req, res) => res.json(svc.listCreators()),
  reset: (req, res) => res.json(svc.resetUser(req.body.userId || uid(req))),
});
