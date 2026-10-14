'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/core/engine');
const { buildSeed } = require('../src/core/seed');
const { createService } = require('../src/core/service');
const { createApp } = require('../src/server');

const fresh = () => createService(buildSeed());
const ids = (svc, n = 5) => svc.getFeed('U1', { limit: n }).items.map((i) => i.id);
const rank = (svc, id) => svc.getFeed('U1', { limit: 30 }).items.find((i) => i.id === id).rank;

test('liking a non-followed creator\'s football photo updates creator + topic affinity', () => {
  const svc = fresh();
  const r = svc.recordInteraction({ userId: 'U1', postId: 'P101', creatorId: 'C01', action: 'like' });
  assert.equal(r.deltas.creatorDelta, 5);
  assert.equal(r.deltas.topicDeltas.football, 3);
  assert.equal(r.deltas.topicDeltas.sports, 1.5); // related-topic propagation
  const p = svc.getProfile('U1');
  assert.equal(p.creatorAffinity.find((c) => c.key === 'C01').value, 5);
  assert.equal(p.creatorAffinity.find((c) => c.key === 'C01').following, false);
});

test('feed re-ranks — Ali first, then other football, then sports; cooking last', () => {
  const svc = fresh();
  assert.ok(rank(svc, 'P102') > 1, 'Ali video is not #1 on a cold start');
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' });
  const top = ids(svc, 5);
  assert.deepEqual(top.slice(0, 3), ['P102', 'P101', 'P103']); // Ali's content
  assert.ok(top.includes('P301') && top.includes('P303'));    // other creators' football
  svc.recordInteraction({ userId: 'U1', postId: 'P102', action: 'watch', watchTime: 29, contentDuration: 30 });
  const p = svc.getProfile('U1');
  assert.ok(p.creatorAffinity.find((c) => c.key === 'C01').value >= 13);
  assert.ok(rank(svc, 'P703') < rank(svc, 'P401'), 'sports photo outranks tech photo');
});

test('similar content from OTHER creators rises (topic learning)', () => {
  const svc = fresh();
  const score = (id) => svc.getFeed('U1', { limit: 30 }).items.find((i) => i.id === id).score;
  const [f0, t0] = [score('P301'), score('P401')];
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' });
  assert.ok(score('P301') - f0 > 0.05, 'football from another creator gains score');
  assert.ok(score('P401') - t0 < (score('P301') - f0) / 2, 'unrelated topic gains far less');
});

test('negative behaviour: repeated skips push cooking down', () => {
  const svc = fresh();
  const before = rank(svc, 'P202');
  for (const p of ['P201', 'P203', 'P202']) svc.recordInteraction({ userId: 'U1', postId: p, action: 'skip' });
  assert.ok(rank(svc, 'P202') > before);
  const cook = svc.getProfile('U1').topicAffinity.find((t) => t.key === 'cooking');
  assert.equal(cook.value, -9);
});

test('demote_creator lowers ONLY the creator, topic is untouched', () => {
  const svc = fresh();
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' }); // Ali +5, football +3
  const r = svc.recordInteraction({ userId: 'U1', postId: 'P103', creatorId: 'C01', action: 'demote_creator' });
  assert.equal(r.deltas.creatorDelta, -10);
  assert.deepEqual(r.deltas.topicDeltas, {});
  const p = svc.getProfile('U1');
  assert.equal(p.creatorAffinity.find((c) => c.key === 'C01').value, -5); // 5 - 10
  assert.equal(p.topicAffinity.find((t) => t.key === 'football').value, 3); // unchanged
});

test('demote_topic lowers ONLY the topic, creator is untouched', () => {
  const svc = fresh();
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' }); // Ali +5, football +3
  const r = svc.recordInteraction({ userId: 'U1', postId: 'P301', creatorId: 'C03', action: 'demote_topic', topic: 'football' });
  assert.equal(r.deltas.creatorDelta, 0);
  assert.equal(r.deltas.topicDeltas.football, -10);
  const p = svc.getProfile('U1');
  assert.equal(p.creatorAffinity.find((c) => c.key === 'C01').value, 5); // unchanged
  assert.equal(p.topicAffinity.find((t) => t.key === 'football').value, -7); // 3 - 10
});

test('hide_plan hides the post with no affinity change at all', () => {
  const svc = fresh();
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' });
  const r = svc.recordInteraction({ userId: 'U1', postId: 'P201', action: 'hide_plan' });
  assert.equal(r.deltas.creatorDelta, 0);
  assert.deepEqual(r.deltas.topicDeltas, {});
  assert.ok(!svc.getFeed('U1', { limit: 30 }).items.some((i) => i.id === 'P201'));
  assert.equal(svc.getProfile('U1').creatorAffinity.find((c) => c.key === 'C01').value, 5); // untouched by the hide
});

test("demote_topic falls back to the post's own topic when none is given", () => {
  const svc = fresh();
  const r = svc.recordInteraction({ userId: 'U1', postId: 'P503', action: 'demote_topic' }); // topics: gaming, technology
  assert.equal(r.deltas.topicDeltas.gaming, -10);
});

test('watch strength scales with completion; quick swipe counts as skip', () => {
  assert.equal(engine.signalFor('watch', { watchTime: 27, contentDuration: 30 }).creator, 8);
  assert.equal(engine.signalFor('watch', { watchTime: 15, contentDuration: 30 }).creator, 5.5);
  assert.equal(engine.signalFor('watch', { watchTime: 1, contentDuration: 30 }).effective, 'skip');
});

test('like is idempotent; unlike reverses it; follow toggles', () => {
  const svc = fresh();
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' });
  assert.equal(svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' }).ignored, true);
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'unlike' });
  assert.equal(svc.getProfile('U1').creatorAffinity.find((c) => c.key === 'C01').value, 0);
  svc.recordInteraction({ userId: 'U1', creatorId: 'C01', action: 'follow' });
  assert.deepEqual(svc.listUsers()[0].following, ['C01']);
});

test('hide_plan is idempotent', () => {
  const svc = fresh();
  svc.recordInteraction({ userId: 'U1', postId: 'P201', action: 'hide_plan' });
  assert.equal(svc.recordInteraction({ userId: 'U1', postId: 'P201', action: 'hide_plan' }).ignored, true);
});

test('profiles are per-user', () => {
  const svc = fresh();
  svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'like' });
  assert.equal(svc.getProfile('U2').creatorAffinity.length, 0);
});

test('validation errors', () => {
  const svc = fresh();
  assert.throws(() => svc.recordInteraction({ userId: 'U1', postId: 'P101', action: 'dance' }), /Unknown action/);
  assert.throws(() => svc.recordInteraction({ userId: 'U1', postId: 'NOPE', action: 'like' }), /Unknown post/);
  assert.throws(() => svc.recordInteraction({ userId: 'U1', postId: 'P101', creatorId: 'C02', action: 'like' }), /does not match/);
  assert.throws(() => svc.recordInteraction({ userId: 'U1', postId: 'P102', action: 'watch' }), /contentDuration/);
});

test('HTTP API end-to-end', async () => {
  const db = buildSeed();
  const server = createApp({ db, persist() {} }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const j = async (path, opts) => (await fetch(base + path, opts)).json();
  const post = (path, body) => j(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const before = await j('/feed?userId=U1');
    assert.equal(before.items.length, 12);
    await post('/interactions', { userId: 'U1', postId: 'P101', creatorId: 'C01', action: 'like' });
    await post('/interactions', { userId: 'U1', postId: 'P102', creatorId: 'C01', action: 'watch', watchTime: 27, contentDuration: 30 });
    const after = await j('/feed?userId=U1');
    assert.equal(after.items[0].creator.name, 'Ali');
    const aff = await j('/profile/affinity?userId=U1');
    assert.equal(aff[0].label, 'Ali');
    const topics = await j('/profile/interests?userId=U1');
    assert.equal(topics[0].key, 'football');
    const discover = await j('/recommendations?userId=U1');
    assert.ok(discover.items.every((i) => !i.following));
    const bad = await fetch(base + '/interactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'U1', postId: 'P101', action: 'x' }) });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
