'use strict';
const engine = require('./engine');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createService(db, { persist = () => {}, now = () => Date.now() } = {}) {
  let seq = db.interactions.length;

  const getUser = (id) => {
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new HttpError(404, `Unknown user ${id}`);
    return u;
  };
  const profileOf = (userId) => (db.profiles[userId] ||= engine.emptyProfile(userId));
  const creatorMap = () => Object.fromEntries(db.creators.map((c) => [c.id, c]));
  const historyOf = (userId) => db.interactions.filter((i) => i.userId === userId);

  function viewModel(entry, rank, following, state) {
    const p = entry.post;
    const c = db.creators.find((x) => x.id === p.creatorId);
    return {
      id: p.id,
      rank,
      type: p.type,
      topics: p.topics,
      caption: p.caption,
      mediaUrl: p.mediaUrl,
      visual: p.visual,
      duration: p.duration,
      stats: p.stats,
      createdAt: p.createdAt,
      creator: { id: c.id, name: c.name, handle: c.handle, color: c.color },
      following: following.includes(c.id),
      state: state[p.id] || {},
      score: entry.score,
      breakdown: entry.breakdown,
      reasons: entry.reasons,
    };
  }

  function getFeed(userId, { limit = 12, discoverOnly = false } = {}) {
    const user = getUser(userId);
    const history = historyOf(userId);
    const state = engine.summarizeHistory(history);
    let posts = db.posts;
    if (discoverOnly) posts = posts.filter((p) => !user.following.includes(p.creatorId));
    const ranked = engine.rankFeed({
      profile: profileOf(userId),
      posts,
      creators: creatorMap(),
      following: user.following,
      history,
      now: now(),
      limit,
    });
    return {
      userId,
      generatedAt: new Date(now()).toISOString(),
      items: ranked.map((e, i) => viewModel(e, i + 1, user.following, state)),
    };
  }

  function recordInteraction(input = {}) {
    const { userId, postId, action, watchTime, contentDuration, topic } = input;
    if (!userId) throw new HttpError(400, 'userId is required');
    if (!engine.ACTIONS.includes(action)) throw new HttpError(400, `Unknown action "${action}"`);
    const user = getUser(userId);

    const isFollowAction = action === 'follow' || action === 'unfollow';
    let post = null;
    let creatorId = input.creatorId;
    if (postId) {
      post = db.posts.find((p) => p.id === postId);
      if (!post) throw new HttpError(404, `Unknown post ${postId}`);
      if (creatorId && creatorId !== post.creatorId) throw new HttpError(400, 'creatorId does not match post');
      creatorId = post.creatorId;
    } else if (!isFollowAction) {
      throw new HttpError(400, 'postId is required for this action');
    }
    if (!db.creators.some((c) => c.id === creatorId)) throw new HttpError(400, 'A valid creatorId is required');
    if (action === 'watch' && !(contentDuration > 0)) throw new HttpError(400, 'watch needs contentDuration > 0');
    if (action === 'demote_topic' && !(topic || (post && post.topics[0]))) {
      throw new HttpError(400, 'demote_topic needs a topic (pick which category to see less of)');
    }

    // Idempotency for toggles so double-clicks don't inflate affinity.
    const state = postId ? engine.summarizeHistory(historyOf(userId))[postId] || {} : {};
    const following = user.following.includes(creatorId);
    if (
      (action === 'like' && state.liked) ||
      (action === 'unlike' && !state.liked) ||
      (action === 'save' && state.saved) ||
      (action === 'follow' && following) ||
      (action === 'unfollow' && !following) ||
      (action === 'hide_plan' && state.hidden)
    ) {
      return { ignored: true, reason: 'duplicate', profile: getProfile(userId) };
    }

    const t = now();
    const profile = profileOf(userId);
    const resolvedTopic = topic || (post && post.topics[0]) || null;
    const deltas = engine.applyInteraction(
      profile, post, action, { watchTime, contentDuration, creatorId, topic: resolvedTopic }, engine.CONFIG, t
    );

    const interaction = {
      id: `I${++seq}`,
      userId,
      postId: postId || null,
      creatorId,
      action,
      topic: action === 'demote_topic' ? resolvedTopic : null,
      watchTime: watchTime ?? null,
      contentDuration: contentDuration ?? null,
      timestamp: new Date(t).toISOString(),
    };
    db.interactions.push(interaction);

    if (action === 'follow') user.following.push(creatorId);
    if (action === 'unfollow') user.following = user.following.filter((c) => c !== creatorId);
    if (post) {
      const s = post.stats;
      if (action === 'like') s.likes++;
      if (action === 'unlike') s.likes = Math.max(0, s.likes - 1);
      if (action === 'share') s.shares++;
      if (action === 'save') s.saves++;
    }
    persist();

    const c = db.creators.find((x) => x.id === creatorId);
    return {
      interaction,
      deltas: { ...deltas, creatorName: c.name },
      profile: getProfile(userId),
    };
  }

  function getProfile(userId) {
    const user = getUser(userId);
    const p = profileOf(userId);
    const names = creatorMap();
    const rows = (map, label) =>
      Object.entries(map)
        .map(([key, value]) => ({ key, label: label(key), value, normalized: engine.normalize(value) }))
        .sort((a, b) => b.value - a.value);
    return {
      userId,
      name: user.name,
      following: user.following,
      creatorAffinity: rows(p.creatorAffinity, (k) => (names[k] ? names[k].name : k)).map((r) => ({
        ...r,
        following: user.following.includes(r.key),
      })),
      topicAffinity: rows(p.topicAffinity, (k) => k),
      typeAffinity: p.typeAffinity,
      interactionCount: historyOf(userId).length,
    };
  }

  function recentActivity(userId, n = 10) {
    const names = creatorMap();
    return historyOf(userId)
      .filter((i) => i.action !== 'view')
      .slice(-n)
      .reverse()
      .map((i) => ({ ...i, creatorName: names[i.creatorId].name }));
  }

  function resetUser(userId) {
    const user = getUser(userId);
    db.interactions = db.interactions.filter((i) => i.userId !== userId);
    delete db.profiles[userId];
    const seedFollowing = { U1: [], U2: ['C02', 'C04'] };
    user.following = seedFollowing[userId] || [];
    persist();
    return { ok: true };
  }

  return {
    HttpError,
    listUsers: () => db.users.map((u) => ({ id: u.id, name: u.name, following: u.following })),
    listCreators: () => db.creators,
    getFeed,
    recordInteraction,
    getProfile,
    recentActivity,
    resetUser,
  };
}

module.exports = { createService, HttpError };
