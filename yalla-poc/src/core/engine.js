'use strict';
/**
 * Yalla recommendation engine — rule/score based, no ML.
 *
 * Pure functions only (no I/O), so it runs unchanged in Node and in the browser demo.
 *
 *   applyInteraction()  behaviour  -> updates creator / topic / content-type affinity
 *   rankFeed()          affinity   -> scored, sorted candidate posts (+ explanation)
 */

const CONFIG = {
  // Feed Score = Σ weight × component  −  seen penalty      (spec §10)
  weights: { creator: 0.3, topic: 0.25, watch: 0.2, engagement: 0.15, freshness: 0.1 },
  // Raw affinity is squashed with tanh(x / scale) into (-1, 1) so scores stay bounded
  // and negative affinity pushes content DOWN.
  scale: { creator: 8, topic: 8, type: 10 },
  freshnessHalfLifeHours: 72,
  seenPenalty: 0.1, // small: already-seen posts drift down, they don't vanish
  secondaryTopicFactor: 0.5, // 2nd+ topic on a post gets half the topic signal
  typeFactor: 0.4, // how much of the creator delta also trains photo/video preference
  quickSkipThreshold: 0.1, // a "watch" under 10% is really a swipe-away -> treated as skip
  affinityClamp: [-100, 100],
};

// Starting weights from the spec (§6). creator = creator affinity delta, topic = topic delta.
const SIGNALS = {
  view: { creator: 1, topic: 0.5 },
  like: { creator: 5, topic: 3 },
  unlike: { creator: -5, topic: -3 },
  share: { creator: 10, topic: 6 },
  save: { creator: 8, topic: 5 },
  comment: { creator: 7, topic: 4 },
  rewatch: { creator: 8, topic: 8 },
  follow: { creator: 10, topic: 0 },
  unfollow: { creator: -10, topic: 0 },
  skip: { creator: -3, topic: -3 },
  // Deliberately NOT combined like "skip" above: the person told us exactly which
  // dimension they meant, so only that one dimension moves. See applyInteraction().
  demote_topic: { creator: 0, topic: -10 },
  demote_creator: { creator: -10, topic: 0 },
  hide_plan: { creator: 0, topic: 0 }, // hides the post only; no score changes at all
  // "watch" is computed from completion, see signalFor()
};

const ACTIONS = [...Object.keys(SIGNALS), 'watch'];

// Related-topic graph: engaging with X also nudges these (spec §12: Football -> Sports).
const TOPIC_GRAPH = {
  football: { sports: 0.5 },
  'champions-league': { football: 0.7, sports: 0.5 },
  cricket: { sports: 0.5 },
  fitness: { sports: 0.4 },
  gaming: { technology: 0.2 },
};

/* ---------- helpers ---------- */
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const add = (map, key, d) => {
  map[key] = (map[key] || 0) + d;
};

function completionOf(watchTime, duration) {
  if (!duration || duration <= 0) return 0;
  return clamp((watchTime || 0) / duration, 0, 1);
}

/** Watch strength: +3 (barely watched) … +8 (90%+ completion). */
function watchStrength(completion) {
  return completion >= 0.9 ? 8 : 3 + 5 * completion;
}

/** Resolve an action (+ context) to { effective, creator, topic }. */
function signalFor(action, ctx = {}, cfg = CONFIG) {
  if (action === 'watch') {
    const c = completionOf(ctx.watchTime, ctx.contentDuration);
    if (c < cfg.quickSkipThreshold) return { effective: 'skip', ...SIGNALS.skip, completion: c };
    const s = round(watchStrength(c), 1);
    return { effective: 'watch', creator: s, topic: s, completion: c };
  }
  const s = SIGNALS[action];
  if (!s) return null;
  if (action === 'demote_topic') return { effective: action, ...s, topicKey: ctx.topic };
  return { effective: action, ...s };
}

function emptyProfile(userId) {
  return {
    userId,
    creatorAffinity: {},
    topicAffinity: {},
    typeAffinity: { photo: 0, video: 0 },
    creatorWatch: {}, // creatorId -> { n, sum }   (sum of completion ratios)
    updatedAt: null,
  };
}

/* ---------- learning ---------- */

/**
 * Update a user's profile from one interaction. Mutates `profile`, returns the deltas
 * (used by the UI to show "Ali +5, football +3").
 */
function applyInteraction(profile, post, action, ctx = {}, cfg = CONFIG, now = Date.now()) {
  const sig = signalFor(action, ctx, cfg);
  if (!sig) return null;
  const [lo, hi] = cfg.affinityClamp;
  const creatorId = post ? post.creatorId : ctx.creatorId;

  // These three are the "tell us why" menu actions: the person picked exactly one
  // dimension, so ONLY that dimension's map gets touched below — the other map is
  // never read or written, not even with a zero delta. That's the actual guarantee,
  // not just "the number happens to be zero."
  let creatorDelta = 0;
  let topicDeltas = {};

  if (sig.effective === 'hide_plan') {
    // No affinity change at all. Hiding is handled entirely via summarizeHistory()
    // (state.hidden) and the filter in rankFeed() — this call just records the event.
  } else if (sig.effective === 'demote_creator') {
    creatorDelta = sig.creator;
    profile.creatorAffinity[creatorId] = round(
      clamp((profile.creatorAffinity[creatorId] || 0) + creatorDelta, lo, hi)
    );
    // topicAffinity is intentionally never touched here.
  } else if (sig.effective === 'demote_topic') {
    const topic = sig.topicKey || (post && post.topics[0]);
    if (topic) {
      add(topicDeltas, topic, sig.topic);
      for (const [rel, w] of Object.entries(TOPIC_GRAPH[topic] || {})) {
        add(topicDeltas, rel, sig.topic * w);
      }
      for (const [t, d] of Object.entries(topicDeltas)) {
        topicDeltas[t] = round(d);
        profile.topicAffinity[t] = round(clamp((profile.topicAffinity[t] || 0) + d, lo, hi));
      }
    }
    // creatorAffinity is intentionally never touched here.
  } else {
    // Every other action (like, watch, skip, share...) is ambiguous behaviour, not a
    // stated intent — a single like IS evidence about both the creator and the topic
    // at once, so both update together here, same as before.
    creatorDelta = sig.creator;
    const topics = (post && post.topics) || [];
    topics.forEach((t, i) => {
      const d = sig.topic * (i === 0 ? 1 : cfg.secondaryTopicFactor);
      if (!d) return;
      add(topicDeltas, t, d);
      for (const [rel, w] of Object.entries(TOPIC_GRAPH[t] || {})) add(topicDeltas, rel, d * w);
    });
    profile.creatorAffinity[creatorId] = round(
      clamp((profile.creatorAffinity[creatorId] || 0) + creatorDelta, lo, hi)
    );
    for (const [t, d] of Object.entries(topicDeltas)) {
      topicDeltas[t] = round(d);
      profile.topicAffinity[t] = round(clamp((profile.topicAffinity[t] || 0) + d, lo, hi));
    }
  }

  // Content-type preference (photo vs video) — feeds the "engagement" component.
  // Only ambiguous, creator-linked actions train this; the three intent-specific
  // actions above never touch it either (demote_topic has creatorDelta===0, so it's
  // automatically excluded by the check below).
  let typeDelta = 0;
  if (post && creatorDelta && !['follow', 'unfollow'].includes(sig.effective)) {
    typeDelta = round(creatorDelta * cfg.typeFactor);
    profile.typeAffinity[post.type] = round(
      clamp((profile.typeAffinity[post.type] || 0) + typeDelta, lo, hi)
    );
  }

  if (sig.effective === 'watch' || sig.effective === 'rewatch') {
    const w = profile.creatorWatch[creatorId] || { n: 0, sum: 0 };
    w.n += 1;
    w.sum += sig.effective === 'rewatch' ? 1 : sig.completion;
    profile.creatorWatch[creatorId] = w;
  }

  profile.updatedAt = now;
  return {
    action,
    effective: sig.effective,
    completion: sig.completion,
    creatorId,
    creatorDelta: round(creatorDelta),
    topicDeltas,
    typeDelta,
  };
}

/* ---------- history helpers ---------- */

/** Collapse a user's interaction log into per-post state. */
function summarizeHistory(interactions) {
  const state = {};
  for (const it of interactions) {
    if (!it.postId) continue;
    const s = (state[it.postId] ||= {});
    switch (it.action) {
      case 'view': s.viewed = true; break;
      case 'like': s.liked = true; break;
      case 'unlike': s.liked = false; break;
      case 'save': s.saved = true; break;
      case 'share': s.shared = true; break;
      case 'comment': s.commented = true; break;
      case 'watch':
      case 'rewatch': s.watched = true; break;
      case 'skip': s.skipped = true; break;
      case 'hide_plan': s.hidden = true; break;
      case 'demote_topic': s.demotedTopic = it.topic || null; break;
      case 'demote_creator': s.demotedCreator = true; break;
    }
  }
  return state;
}

/* ---------- ranking ---------- */

function popularityRaw(stats = {}) {
  return Math.log1p((stats.likes || 0) + 3 * (stats.shares || 0) + 2 * (stats.saves || 0));
}

function topicComponent(profile, topics, cfg) {
  if (!topics.length) return 0;
  const vals = topics.map((t) => Math.tanh((profile.topicAffinity[t] || 0) / cfg.scale.topic));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const extreme = vals.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
  return (extreme + mean) / 2;
}

function explain(post, creator, profile, following, cfg) {
  const reasons = [];
  const cAff = profile.creatorAffinity[post.creatorId] || 0;
  const name = creator ? creator.name : 'this creator';
  if (cAff >= 3) {
    reasons.push(following ? `You engage with ${name}` : `You've engaged with ${name}, who you don't follow yet`);
  }
  const bestTopic = [...post.topics]
    .map((t) => [t, profile.topicAffinity[t] || 0])
    .sort((a, b) => b[1] - a[1])[0];
  if (bestTopic && bestTopic[1] >= 2) reasons.push(`You've shown interest in ${bestTopic[0]}`);
  if (cAff <= -3) reasons.push(`You asked to see less from ${name}`);
  const worst = [...post.topics].sort(
    (a, b) => (profile.topicAffinity[a] || 0) - (profile.topicAffinity[b] || 0)
  )[0];
  if (worst && (profile.topicAffinity[worst] || 0) <= -3) reasons.push(`You asked to see less of ${worst}`);
  if (!reasons.length) reasons.push('New and popular right now');
  return reasons;
}

/**
 * Score and sort candidate posts for one user.
 * @returns {Array<{post, score, breakdown, reasons}>} highest score first
 */
function rankFeed({
  profile,
  posts,
  creators = {},
  following = [],
  history = [],
  now = Date.now(),
  limit = 20,
  config = CONFIG,
}) {
  const cfg = config;
  const state = summarizeHistory(history);
  const maxPop = Math.max(1e-9, ...posts.map((p) => popularityRaw(p.stats)));
  const followSet = new Set(following);

  const ranked = posts
    .filter((p) => !(state[p.id] && state[p.id].hidden))
    .map((post) => {
      const cAff = profile.creatorAffinity[post.creatorId] || 0;
      const w = profile.creatorWatch[post.creatorId];
      const ageH = Math.max(0, (now - new Date(post.createdAt).getTime()) / 3.6e6);

      const comp = {
        creator: Math.tanh(cAff / cfg.scale.creator),
        topic: topicComponent(profile, post.topics, cfg),
        watch: w && w.n ? w.sum / w.n : 0,
        engagement:
          0.5 * Math.tanh((profile.typeAffinity[post.type] || 0) / cfg.scale.type) +
          0.5 * (popularityRaw(post.stats) / maxPop),
        freshness: Math.pow(0.5, ageH / cfg.freshnessHalfLifeHours),
      };
      const seen = state[post.id] && (state[post.id].viewed || state[post.id].watched || state[post.id].liked || state[post.id].skipped);
      const seenPenalty = seen ? cfg.seenPenalty : 0;

      const breakdown = {};
      let score = -seenPenalty;
      for (const k of Object.keys(cfg.weights)) {
        breakdown[k] = round(comp[k] * cfg.weights[k], 3);
        score += comp[k] * cfg.weights[k];
      }
      breakdown.seenPenalty = -seenPenalty;

      return {
        post,
        score: round(score, 3),
        breakdown,
        reasons: explain(post, creators[post.creatorId], profile, followSet.has(post.creatorId), cfg),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.post.createdAt) - new Date(a.post.createdAt) ||
        (a.post.id < b.post.id ? -1 : 1)
    );

  return ranked.slice(0, limit);
}

/** Sigmoid 0..1 (0.5 = neutral) — for progress bars / display, spec §13 "normalize". */
function normalize(x) {
  return round(1 / (1 + Math.exp(-x / 10)), 2);
}

module.exports = {
  CONFIG,
  SIGNALS,
  ACTIONS,
  TOPIC_GRAPH,
  emptyProfile,
  signalFor,
  applyInteraction,
  summarizeHistory,
  rankFeed,
  completionOf,
  normalize,
};
