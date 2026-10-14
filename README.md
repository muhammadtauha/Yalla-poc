# Yalla personalized feed POC

Behaviour-based feed: interactions update **creator** and **topic** affinity, which changes the ranking of future posts. Rule/score based, no ML.

**New:** the "Not interested" button is now a menu with three options — "Not interested in this plan" (hides only, no score change), "See less: [topic]" (topic only), "See less from [creator]" (creator only). This decouples creator and topic scoring: picking one never touches the other.

## Run

```bash
npm install
npm start          # http://localhost:3000
npm test           # 14 tests
npm run build:demo # dist/yalla-demo.html — one file, no backend
```

## Demo script

1. Like Ali's football photo. Note `Ali +5 · football +3 · sports +1.5` in the panel.
2. On a DIFFERENT Ali post, click "Not interested ▾" → "See less from Ali." Ali drops, football stays exactly where it was.
3. On a football post from a DIFFERENT creator, click "Not interested ▾" → "See less: football." Football drops, that creator's own score is untouched.
4. Click "Not interested in this plan" on any post — it disappears, and the log confirms "no score changed."

## How the three options map to code (`src/core/engine.js`)

| Button | Action | Touches |
|---|---|---|
| Not interested in this plan | `hide_plan` | Neither map. Just hides the post. |
| See less: [topic] | `demote_topic` | Only `topicAffinity[topic]` (+ related topics via `TOPIC_GRAPH`). |
| See less from [creator] | `demote_creator` | Only `creatorAffinity[creatorId]`. |

Every other action (like, watch, skip, share...) still updates both dimensions together, because a single like IS evidence about both the creator and the topic at once — only the three explicit "tell us why" actions are decoupled.

See `Yalla_Feed_POC_Documentation.md` (if provided separately) for the full API reference, ranking formula, and architecture.
