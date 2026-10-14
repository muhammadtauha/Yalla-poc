'use strict';
/** Sample users, creators and posts. */

const HOUR = 3600 * 1000;

const creators = [
  { id: 'C01', name: 'Ali', handle: 'ali.goals', bio: 'Match-day photos and football clips', color: '#2f6bff' },
  { id: 'C02', name: 'Sara', handle: 'sara.cooks', bio: 'Home cooking, fast', color: '#e0559b' },
  { id: 'C03', name: 'Ahmed', handle: 'ahmed.plays', bio: 'Football highlights and ranked gaming', color: '#13a37f' },
  { id: 'C04', name: 'Nadia', handle: 'nadia.tech', bio: 'Gadgets and desk setups', color: '#7a4dff' },
  { id: 'C05', name: 'Zain', handle: 'zain.gg', bio: 'Competitive gaming clips', color: '#f2792c' },
  { id: 'C06', name: 'Hina', handle: 'hina.roams', bio: 'Northern Pakistan, one trip at a time', color: '#0e9bb5' },
  { id: 'C07', name: 'Bilal', handle: 'bilal.cricket', bio: 'Cricket nets to finals', color: '#c2410c' },
  { id: 'C08', name: 'Layla', handle: 'layla.moves', bio: 'Home workouts, no gym needed', color: '#b83280' },
];

// [id, creator, type, topics, caption, emoji, hue, ageHours, duration(s), likes, shares, saves]
const rows = [
  ['P101', 'C01', 'photo', ['football'], 'Match day! Full house tonight.', '⚽', 215, 1, null, 40, 4, 6],
  ['P102', 'C01', 'video', ['football'], 'Free-kick masterclass in 30 seconds', '🥅', 222, 6, 30, 55, 8, 12],
  ['P103', 'C01', 'photo', ['champions-league'], 'Champions League night lights', '🏆', 228, 20, null, 35, 5, 8],

  ['P201', 'C02', 'video', ['cooking'], '10-minute chicken karahi', '🍛', 20, 2, 28, 90, 12, 30],
  ['P202', 'C02', 'photo', ['cooking'], 'Biryani layers, done right', '🍚', 35, 12, null, 60, 6, 18],
  ['P203', 'C02', 'video', ['cooking'], 'Homemade naan on a skillet', '🫓', 42, 30, 25, 45, 5, 14],

  ['P301', 'C03', 'video', ['football'], 'Top 5 goals this week', '🎯', 150, 5, 24, 70, 10, 9],
  ['P302', 'C03', 'video', ['gaming'], 'Clutch round in ranked', '🎮', 265, 3, 20, 48, 6, 4],
  ['P303', 'C03', 'photo', ['football'], 'My jersey collection so far', '👕', 160, 30, null, 30, 2, 5],

  ['P401', 'C04', 'photo', ['technology'], 'Foldable phone hands-on', '📱', 250, 4, null, 55, 7, 10],
  ['P402', 'C04', 'video', ['technology'], 'Build a PC in 60 seconds', '🖥️', 245, 16, 22, 65, 9, 15],
  ['P403', 'C04', 'photo', ['technology'], 'Desk setup tour', '⌨️', 255, 34, null, 25, 2, 7],

  ['P501', 'C05', 'video', ['gaming'], '1v4 ace, no scope', '🕹️', 280, 8, 18, 50, 6, 3],
  ['P502', 'C05', 'photo', ['gaming'], 'New controller just landed', '🎛️', 290, 22, null, 28, 2, 4],
  ['P503', 'C05', 'video', ['gaming', 'technology'], 'Graphics settings that win games', '📊', 270, 38, 26, 33, 4, 6],

  ['P601', 'C06', 'video', ['travel'], 'Hunza at golden hour', '🏔️', 190, 9, 27, 75, 11, 22],
  ['P602', 'C06', 'photo', ['travel'], 'Attabad Lake blues', '🏞️', 185, 26, null, 52, 5, 16],
  ['P603', 'C06', 'photo', ['travel'], 'Street tea in Skardu', '☕', 30, 44, null, 22, 2, 5],

  ['P701', 'C07', 'photo', ['cricket'], 'Nets session before the final', '🏏', 20, 10, null, 34, 3, 4],
  ['P702', 'C07', 'video', ['cricket'], 'Six over long-on', '🚀', 15, 26, 15, 46, 6, 5],
  ['P703', 'C07', 'photo', ['sports'], 'Stadium at sunrise', '🏟️', 205, 40, null, 20, 1, 3],

  ['P801', 'C08', 'video', ['fitness'], '20-minute home workout', '💪', 340, 7, 29, 42, 5, 20],
  ['P802', 'C08', 'photo', ['fitness'], 'Sunday stretch routine', '🧘', 320, 18, null, 26, 2, 9],
  ['P803', 'C08', 'video', ['fitness', 'sports'], 'Sprint intervals for footballers', '🏃', 175, 36, 21, 30, 4, 8],
];

function buildSeed(now = Date.now()) {
  return {
    users: [
      { id: 'U1', name: 'Muhammad', email: 'muhammad@example.com', following: [] },
      { id: 'U2', name: 'Fatima', email: 'fatima@example.com', following: ['C02', 'C04'] },
    ],
    creators: creators.map((c) => ({ ...c })),
    posts: rows.map(([id, creatorId, type, topics, caption, emoji, hue, ageH, duration, likes, shares, saves]) => ({
      id,
      creatorId,
      type,
      topics,
      caption,
      mediaUrl: null,
      visual: { emoji, hue },
      duration,
      stats: { likes, shares, saves },
      createdAt: new Date(now - ageH * HOUR).toISOString(),
    })),
    interactions: [],
    profiles: {},
  };
}

module.exports = { buildSeed };
