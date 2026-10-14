window.YallaApi = (() => {
  const svc = __require('./core/service').createService(__require('./core/seed').buildSeed());
  const wrap = (fn) => (...a) => new Promise((res, rej) => { try { res(JSON.parse(JSON.stringify(fn(...a)))); } catch (e) { rej(e); } });
  return {
    users: wrap(() => svc.listUsers()),
    feed: wrap((u, limit) => svc.getFeed(u, { limit })),
    interact: wrap((b) => svc.recordInteraction(b)),
    profile: wrap((u) => svc.getProfile(u)),
    activity: wrap((u) => svc.recentActivity(u, 8)),
    reset: wrap((u) => svc.resetUser(u)),
  };
})();
