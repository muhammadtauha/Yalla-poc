(() => {
  const api = window.YallaApi;
  const SHOW = 10;
  const DEMO_SPEED = 5;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { userId: 'U1', items: [], prevRank: null, pending: 0, posts: {}, profile: null, timers: new Map() };

  const ICON = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    comment: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M5 12v7h14v-7M12 15V4M8 8l4-4 4 4"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M6 4h12v16l-6-4-6 4z"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n * 10) / 10);

  /* ---------- feed ---------- */
  async function loadFeed({ animate = false } = {}) {
    const before = animate ? snapshotTops() : null;
    const res = await api.feed(S.userId, 24);
    res.items.forEach((i) => (S.posts[i.id] = i));
    S.items = res.items.slice(0, SHOW);
    renderFeed(before);
    S.prevRank = Object.fromEntries(res.items.map((i) => [i.id, i.rank]));
    S.pending = 0;
    updatePending();
  }

  function snapshotTops() {
    const m = {};
    document.querySelectorAll('.card[data-id]').forEach((c) => (m[c.dataset.id] = c.getBoundingClientRect().top));
    return m;
  }

  function renderFeed(beforeTops) {
    stopAllVideos();
    closeMenu();
    const feed = $('#feed');
    feed.innerHTML = '';
    S.items.forEach((item) => feed.appendChild(card(item)));

    if (beforeTops && !reduceMotion) {
      document.querySelectorAll('.card[data-id]').forEach((c) => {
        const prev = beforeTops[c.dataset.id];
        if (prev == null) return c.classList.add('entering');
        const dy = prev - c.getBoundingClientRect().top;
        if (!dy) return;
        c.style.transition = 'none';
        c.style.transform = `translateY(${dy}px)`;
        c.getBoundingClientRect();
        c.style.transition = 'transform .65s cubic-bezier(.2,.8,.2,1)';
        c.style.transform = '';
      });
    }
    observeViews();
  }

  function rankChip(item) {
    if (!S.prevRank || S.prevRank[item.id] == null) return '';
    const d = S.prevRank[item.id] - item.rank;
    if (!d) return '';
    return `<span class="rankchip ${d > 0 ? 'up' : 'down'}" title="Previous position #${S.prevRank[item.id]}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
  }

  function card(item) {
    const c = el('article', 'card');
    c.dataset.id = item.id;
    const hue = item.visual.hue;
    const isVideo = item.type === 'video';
    const cr = item.creator;

    c.innerHTML = `
      <div class="chead">
        <div class="avatar" style="background:${cr.color}">${esc(cr.name[0])}</div>
        <div class="who2"><strong>${esc(cr.name)}</strong><span>@${esc(cr.handle)}</span></div>
        <div class="spacer"></div>
        ${rankChip(item)}
        <button class="follow ${item.following ? 'on' : ''}" data-act="follow">${item.following ? 'Following' : 'Follow'}</button>
      </div>
      <div class="media" style="background:linear-gradient(140deg, hsl(${hue} 78% 58%), hsl(${(hue + 40) % 360} 70% 38%))">
        <span class="kind">${isVideo ? 'Video · ' + fmtT(item.duration) : 'Photo'}</span>
        <span class="emoji" aria-hidden="true">${item.visual.emoji}</span>
        ${isVideo ? `<div class="play"><button data-act="play" aria-label="Play video">${ICON.play}</button><div class="track"><i></i></div><span class="time">0:00 / ${fmtT(item.duration)}</span></div>` : ''}
      </div>
      <div class="cbody">
        <p class="caption">${esc(item.caption)}</p>
        <div class="chips">${item.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
        <p class="why">${item.reasons.map((r, i) => (i === 0 ? `<b>Why this:</b> ${esc(r)}` : esc(r))).join('. ')}</p>
        <details class="score"><summary>Score ${item.score.toFixed(3)}, position ${item.rank}</summary>
          <div class="calc">${['creator', 'topic', 'watch', 'engagement', 'freshness', 'seenPenalty']
            .map((k) => `<span>${{ creator: 'Creator affinity', topic: 'Topic affinity', watch: 'Watch history', engagement: 'Engagement', freshness: 'Freshness', seenPenalty: 'Already seen' }[k]}</span><span class="${item.breakdown[k] < 0 ? 'neg' : ''}">${item.breakdown[k].toFixed(3)}</span>`)
            .join('')}</div>
        </details>
      </div>
      <div class="actions"></div>`;
    paintActions(c, item);
    c.addEventListener('click', (e) => onClick(e, c, item));
    return c;
  }

  function paintActions(c, item) {
    const s = item.state;
    const a = c.querySelector('.actions');
    a.innerHTML = `
      <button class="act like ${s.liked ? 'on' : ''}" data-act="like" aria-pressed="${!!s.liked}" aria-label="${s.liked ? 'Unlike' : 'Like'}">${ICON.heart}<span>${s.liked ? 'Liked' : 'Like'}</span></button>
      <button class="act ${s.commented ? 'on' : ''}" data-act="comment" aria-label="Comment">${ICON.comment}</button>
      <button class="act ${s.shared ? 'on' : ''}" data-act="share" aria-label="Share">${ICON.share}</button>
      <button class="act ${s.saved ? 'on' : ''}" data-act="save" aria-label="Save">${ICON.save}</button>
      <span class="spacer"></span>
      <button class="act text" data-act="skip">Skip</button>
      <button class="act text" data-act="menu" aria-haspopup="true" aria-expanded="false">Not interested <i>▾</i></button>`;
  }

  async function onClick(e, c, item) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'play') return togglePlay(c, item);
    if (act === 'follow') {
      const on = item.following;
      await send(item, on ? 'unfollow' : 'follow');
      item.following = !on;
      Object.values(S.posts).forEach((p) => p.creator.id === item.creator.id && (p.following = !on));
      S.items.forEach((p) => p.creator.id === item.creator.id && (p.following = !on));
      document.querySelectorAll('.card').forEach((cd) => {
        const it = S.posts[cd.dataset.id];
        if (it && it.creator.id === item.creator.id) {
          const f = cd.querySelector('.follow');
          f.textContent = item.following ? 'Following' : 'Follow';
          f.classList.toggle('on', item.following);
        }
      });
      return;
    }
    if (act === 'like') {
      const on = !!item.state.liked;
      await send(item, on ? 'unlike' : 'like');
      item.state.liked = !on;
    } else if (act === 'save') {
      if (item.state.saved) return;
      await send(item, 'save');
      item.state.saved = true;
    } else if (act === 'share') {
      await send(item, 'share');
      item.state.shared = true;
    } else if (act === 'comment') {
      await send(item, 'comment');
      item.state.commented = true;
    } else if (act === 'skip') {
      await send(item, 'skip');
      return leave(c);
    } else if (act === 'menu') {
      return openNotInterestedMenu(c, item, b);
    }
    paintActions(c, item);
  }

  /* ---------- "tell us why" menu: three separate, decoupled options ---------- */
  function closeMenu() {
    document.querySelectorAll('.why-menu').forEach((m) => m.remove());
    document.querySelectorAll('[data-act="menu"][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    document.removeEventListener('click', onOutsideMenuClick, true);
  }
  function onOutsideMenuClick(e) {
    if (!e.target.closest('.why-menu') && !e.target.closest('[data-act="menu"]')) closeMenu();
  }
  function openNotInterestedMenu(card, item, anchorBtn) {
    const alreadyOpenHere = anchorBtn.getAttribute('aria-expanded') === 'true';
    closeMenu();
    if (alreadyOpenHere) return; // tapping the same button again just closes it
    anchorBtn.setAttribute('aria-expanded', 'true');
    const topic = item.topics[0];
    const menu = el('div', 'why-menu');
    menu.innerHTML = `
      <button type="button" data-why="hide"><b>Not interested in this plan</b><small>Just this one, nothing else changes</small></button>
      ${topic ? `<button type="button" data-why="topic"><b>See less: ${esc(topic)}</b><small>Lowers this category, not the creator</small></button>` : ''}
      <button type="button" data-why="creator"><b>See less from ${esc(item.creator.name)}</b><small>Lowers this creator, not the category</small></button>`;
    menu.addEventListener('click', async (e) => {
      const w = e.target.closest('[data-why]');
      if (!w) return;
      const why = w.dataset.why;
      closeMenu();
      if (why === 'hide') await send(item, 'hide_plan');
      else if (why === 'topic') await send(item, 'demote_topic', { topic });
      else if (why === 'creator') await send(item, 'demote_creator');
      leave(card);
    });
    anchorBtn.insertAdjacentElement('afterend', menu);
    // Defer attaching the outside-click listener so the click that OPENED the menu
    // (currently bubbling) doesn't immediately close it.
    setTimeout(() => document.addEventListener('click', onOutsideMenuClick, true), 0);
  }

  function leave(c) {
    stopVideo(c);
    c.style.maxHeight = c.offsetHeight + 'px';
    c.getBoundingClientRect();
    c.classList.add('leaving');
    setTimeout(() => c.remove(), 700);
  }

  /* ---------- video (simulated playback) ---------- */
  function togglePlay(c, item) {
    if (S.timers.has(c)) return finishPlay(c, item, false);
    stopAllVideos();
    let t = 0;
    const btn = c.querySelector('[data-act="play"]');
    btn.innerHTML = ICON.stop;
    btn.setAttribute('aria-label', 'Stop video');
    const bar = c.querySelector('.track i');
    const time = c.querySelector('.time');
    const id = setInterval(() => {
      t = Math.min(item.duration, t + (0.1 * DEMO_SPEED));
      bar.style.width = (t / item.duration) * 100 + '%';
      time.textContent = `${fmtT(t)} / ${fmtT(item.duration)}`;
      S.timers.get(c).t = t;
      if (t >= item.duration) finishPlay(c, item, true);
    }, 100);
    S.timers.set(c, { id, t: 0 });
  }

  async function finishPlay(c, item, completed) {
    const rec = S.timers.get(c);
    if (!rec) return;
    clearInterval(rec.id);
    S.timers.delete(c);
    const btn = c.querySelector('[data-act="play"]');
    if (btn) { btn.innerHTML = ICON.play; btn.setAttribute('aria-label', 'Play video'); }
    const watched = completed ? item.duration : Math.round(rec.t * 10) / 10;
    const again = item.state.watched;
    await send(item, again && completed ? 'rewatch' : 'watch', { watchTime: watched, contentDuration: item.duration });
    item.state.watched = true;
  }
  function stopVideo(c) {
    const rec = S.timers.get(c);
    if (rec) { clearInterval(rec.id); S.timers.delete(c); }
  }
  function stopAllVideos() {
    [...S.timers.keys()].forEach((c) => {
      const item = S.posts[c.dataset.id];
      if (c.isConnected && item) finishPlay(c, item, false); else stopVideo(c);
    });
  }

  /* ---------- views (impressions) ---------- */
  let io;
  function observeViews() {
    if (io) io.disconnect();
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const c = en.target;
        clearTimeout(c._vt);
        if (en.isIntersecting) {
          c._vt = setTimeout(() => {
            const item = S.posts[c.dataset.id];
            if (item && !item.state.viewed) {
              item.state.viewed = true;
              api.interact({ userId: S.userId, postId: item.id, creatorId: item.creator.id, action: 'view' }).then((r) => paintProfile(r.profile, null));
            }
            io.unobserve(c);
          }, 900);
        }
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('.card[data-id]').forEach((c) => io.observe(c));
  }

  /* ---------- sending + learning panel ---------- */
  async function send(item, action, extra = {}) {
    try {
      const r = await api.interact({ userId: S.userId, postId: item.id, creatorId: item.creator.id, action, ...extra });
      if (r.ignored) return r;
      S.pending += 1;
      updatePending();
      paintProfile(r.profile, r.deltas);
      addLog(item, action, r.deltas);
      return r;
    } catch (e) {
      $('#hint').textContent = 'Could not record that action: ' + e.message;
    }
  }

  function updatePending() {
    const b = $('#pending');
    b.hidden = S.pending === 0;
    b.textContent = S.pending;
    $('#refresh').classList.toggle('ready', S.pending > 0);
    $('#hint').textContent = S.pending
      ? `Yalla has learned from ${S.pending} new action${S.pending > 1 ? 's' : ''}. Refresh to re-rank.`
      : 'Like, watch or skip a post, then refresh the feed to see it re-rank.';
  }

  const rowsByKey = { creators: new Map(), topics: new Map() };
  function paintBars(container, kind, rows, deltaMap) {
    const box = $(container);
    const map = rowsByKey[kind];
    if (!rows.length) { box.innerHTML = '<p class="empty">Nothing yet. Interact with a post to start.</p>'; map.clear(); return; }
    if (box.querySelector('.empty')) box.innerHTML = '';
    const max = Math.max(12, ...rows.map((r) => Math.abs(r.value)));
    rows.forEach((r) => {
      let row = map.get(r.key);
      if (!row) {
        row = el('div', 'row', `<span class="lbl"></span><div class="track2"><i></i></div><span class="val"></span>`);
        map.set(r.key, row);
        box.appendChild(row);
      }
      row.querySelector('.lbl').innerHTML = esc(r.label) + (kind === 'creators' && !r.following ? ' <small>· not followed</small>' : '');
      const w = (Math.abs(r.value) / max) * 50;
      const fill = row.querySelector('i');
      fill.style.width = w + '%';
      fill.style.left = r.value >= 0 ? '50%' : 50 - w + '%';
      fill.style.background = r.value >= 0 ? 'var(--accent)' : 'var(--neg)';
      const val = row.querySelector('.val');
      val.textContent = signed(r.value);
      val.className = 'val ' + (r.value > 0 ? 'pos' : r.value < 0 ? 'neg' : '');
      const d = deltaMap && deltaMap[r.key];
      if (d) {
        row.querySelector('.delta')?.remove();
        row.appendChild(el('span', 'delta ' + (d > 0 ? 'pos' : 'neg'), signed(d)));
      }
    });
    rows.forEach((r) => box.appendChild(map.get(r.key)));
  }

  function paintProfile(profile, deltas) {
    S.profile = profile;
    paintBars('#creators', 'creators', profile.creatorAffinity, deltas && deltas.creatorDelta && deltas.creatorId ? { [deltas.creatorId]: deltas.creatorDelta } : null);
    paintBars('#topics', 'topics', profile.topicAffinity, deltas && deltas.topicDeltas);
  }

  const VERB = { like: 'Liked', unlike: 'Unliked', watch: 'Watched', rewatch: 'Rewatched', share: 'Shared', save: 'Saved', comment: 'Commented on', skip: 'Skipped', follow: 'Followed', unfollow: 'Unfollowed' };
  function describe(action, creatorName, post, deltas) {
    const what = post ? `${creatorName}'s ${post.topics[0]} ${post.type}` : creatorName;
    if (action === 'follow' || action === 'unfollow') return `${VERB[action]} ${creatorName}`;
    if (action === 'hide_plan') return `Hid ${what} — no score changed`;
    if (action === 'demote_creator') return `Asked to see less from ${creatorName}`;
    if (action === 'demote_topic') {
      const t = (deltas && Object.keys(deltas.topicDeltas || {})[0]) || (post && post.topics[0]);
      return `Asked to see less of ${t}`;
    }
    if (action === 'watch' && deltas && deltas.effective === 'skip') return `Left ${what} almost at once`;
    if (action === 'watch' && deltas && deltas.completion != null) return `Watched ${Math.round(deltas.completion * 100)}% of ${what}`;
    return `${VERB[action]} ${what}`;
  }
  function addLog(item, action, deltas, isNew = true) {
    const ol = $('#log');
    ol.querySelector('.empty')?.remove();
    const parts = [];
    if (deltas) {
      if (deltas.creatorDelta) parts.push(`${deltas.creatorName} ${signed(deltas.creatorDelta)}`);
      Object.entries(deltas.topicDeltas || {}).forEach(([t, d]) => parts.push(`${t} ${signed(d)}`));
      if (!parts.length) parts.push('no score changed');
    }
    const li = el('li', isNew ? 'new' : '', `${esc(describe(action, item.creator.name, item, deltas))}<span class="d">${esc(parts.join(' · '))}</span>`);
    ol.prepend(li);
    while (ol.children.length > 8) ol.lastChild.remove();
  }

  async function loadActivity() {
    const ol = $('#log');
    ol.innerHTML = '';
    const rows = await api.activity(S.userId);
    if (!rows.length) { ol.innerHTML = '<li class="empty">No actions yet.</li>'; return; }
    rows.slice().reverse().forEach((r) => {
      const post = S.posts[r.postId];
      const li = el('li', '', esc(describe(r.action, r.creatorName, post, null)));
      ol.prepend(li);
    });
  }

  /* ---------- boot ---------- */
  async function switchUser(id) {
    S.userId = id;
    S.prevRank = null;
    rowsByKey.creators.clear(); rowsByKey.topics.clear();
    $('#creators').innerHTML = ''; $('#topics').innerHTML = '';
    await loadFeed();
    paintProfile(await api.profile(id), null);
    await loadActivity();
  }

  async function init() {
    const users = await api.users();
    const sel = $('#user');
    sel.innerHTML = users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    sel.addEventListener('change', () => switchUser(sel.value));
    $('#refresh').addEventListener('click', () => loadFeed({ animate: true }));
    $('#reset').addEventListener('click', async () => {
      await api.reset(S.userId);
      await switchUser(S.userId);
    });
    if (matchMedia('(max-width: 900px)').matches) $('#learnedbox').open = false;
    await switchUser(users[0].id);
  }
  init().catch((e) => { $('#hint').textContent = 'Could not load the feed: ' + e.message; });
})();
