window.YallaApi = (() => {
  const j = async (url, opts) => {
    const r = await fetch(url, opts);
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || r.statusText);
    return body;
  };
  const post = (url, data) =>
    j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return {
    users: () => j('/api/users'),
    feed: (userId, limit) => j(`/api/feed?userId=${userId}&limit=${limit}`),
    interact: (body) => post('/api/interactions', body),
    profile: (userId) => j(`/api/profile?userId=${userId}`),
    activity: (userId) => j(`/api/interactions/recent?userId=${userId}&limit=8`),
    reset: (userId) => post('/api/dev/reset', { userId }),
  };
})();
