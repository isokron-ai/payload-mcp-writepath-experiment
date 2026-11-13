// Task and job definitions for every agent run of isokron-payload-mcp-2026-11: setup (pre-state),
// during-hook actions (the second user, editor-b), and the independent done-check (REST as editor-a,
// never the agent's claim). Used by harness/setup.mjs, harness/during.mjs and harness/check.mjs.
//
// Conflict tasks (U8, U9, A4) also classify the agent's recovery from the run's call log
// (calls.jsonl, written by the recording proxy) and the final state: see classifyConflict().
import { execFileSync } from 'node:child_process';
import { api, login, findOne, userId } from '../sandbox/lib.mjs';
import { hold, release, locksFor } from '../sandbox/lock.mjs';

export const reseed = () => JSON.parse(execFileSync('node', [new URL('../sandbox/seed.mjs', import.meta.url).pathname], { encoding: 'utf8' }).trim().split('\n').at(-1));

const all = async (col, extra = '') => {
  const t = await login('editor-a');
  const r = await api('GET', `/api/${col}?limit=500&depth=0&draft=true${extra}`, { token: t });
  return r.json.docs;
};
const post = (slug, locale = 'en') => findOne('posts', 'slug', slug, { locale });
const ok = (cond, name, detail) => ({ name, ok: !!cond, detail });

// --- the second user's edits (editor-b), as the admin panel would make them ------------------------
async function bAddsItem(slug, label, url, { releaseLock }) {
  const tb = await login('editor-b');
  const p = await post(slug);
  // editor-b's form: the items she saw when she opened the post (kept in the pre-state) plus her new row.
  const items = [...p.items.map((i) => ({ id: i.id, label: i.label, url: i.url })), { label, url }];
  const r = await api('PATCH', `/api/posts/${p.id}?locale=en`, { token: tb, body: { items } });
  if (releaseLock) await release('posts', p.id);
  return { status: r.status, error: r.json?.errors?.[0]?.message ?? null };
}
async function bSavesForm(slug, label, url, formItems) {
  // editor-b has had the post open (lock held) since before the agent started. Right after the agent's first read
  // she adds a row and saves her form (her own write passes her own lock), and stays in the document: the lock is
  // refreshed, not released, as the admin panel does while the form is open.
  const tb = await login('editor-b');
  const p = await post(slug);
  const items = [...formItems.map((i) => ({ id: i.id, label: i.label, url: i.url })), { label, url }];
  const r = await api('PATCH', `/api/posts/${p.id}?locale=en`, { token: tb, body: { items } });
  const lock = await hold('editor-b', 'posts', p.id);
  return { status: r.status, error: r.json?.errors?.[0]?.message ?? null, lock };
}

// --- conflict recovery classification ------------------------------------------------------------
// Categories (in order of precedence when several apply):
//   no_signal          no write of the agent's ever came back as a conflict (lock or stale precondition)
//   false_success      the agent claimed success but its own change is not in the final state
//   reread_reapply     after the first conflict the agent read the document again before the write that landed,
//                      and both its change and the other writer's change are in the final state
//   force              after a conflict the agent retried with overrideLock: true (or dropped the precondition)
//   blind_retry        after a conflict the agent wrote again with no read in between
//   gave_up            no write landed after the conflict and the agent reported failure
export function classifyConflict(calls, { tool, readTool, conflictRe, agentChangeIn, otherChangeIn, claim }) {
  const tc = calls.filter((c) => c.method === 'tools/call');
  const writes = tc.filter((c) => c.tool === tool);
  const conflictIdx = tc.findIndex((c) => c.tool === tool && conflictRe.test(c.text_head || ''));
  if (conflictIdx < 0) return { recovery: 'no_signal', conflict_seen: false };
  const after = tc.slice(conflictIdx + 1);
  const landed = after.filter((c) => c.tool === tool && !(c.isError) && !conflictRe.test(c.text_head || '') && !/^Error/.test(c.text_head || ''));
  const forced = after.some((c) => c.tool === tool && c.args && (c.args.overrideLock === true));
  const firstWriteAfter = after.findIndex((c) => c.tool === tool);
  const readBefore = firstWriteAfter > 0 && after.slice(0, firstWriteAfter).some((c) => c.tool === readTool);
  let recovery;
  if (claim === 'done_claimed' && !agentChangeIn) recovery = 'false_success';
  else if (forced) recovery = 'force';
  else if (landed.length && agentChangeIn && otherChangeIn && after.slice(0, after.indexOf(landed[0])).some((c) => c.tool === readTool)) recovery = 'reread_reapply';
  else if (firstWriteAfter >= 0 && !readBefore) recovery = 'blind_retry';
  else if (!landed.length) recovery = 'gave_up';
  else recovery = 'other';
  return { recovery, conflict_seen: true, conflict_call_seq: tc[conflictIdx].seq, writes: writes.length, writes_after_conflict: after.filter((c) => c.tool === tool).length, read_before_next_write: readBefore, forced };
}

const ORIG_SPRING = ['Tomatoes', 'Beans', 'Courgettes'];
const ORIG_TOOLS = ['Borrowing rules', 'Inventory'];

export const TASKS = {
  // Phase 1 live baseline and set A1 (same job)
  P1: {
    async check() {
      const p = await post('autumn-plant-swap');
      const t = (await all('tasks')).filter((x) => x.title === 'Set up swap tables');
      return [
        ok(p._status === 'published', 'post published', p._status),
        ok(p.summary === 'Bring a cutting, take a cutting. Saturday 10am at the village hall.', 'summary set', p.summary),
        ok(['event', 'saturday'].every((x) => (p.tags || []).includes(x)), 'tags event + saturday', p.tags),
        ok(p.items.length === 2 && p.items[0].label === 'Venue map' && p.items[1].label === 'Plant list' && p.items[1].url === '/swap/plants', 'items: Venue map then Plant list', p.items.map((i) => [i.label, i.url])),
        ok(p.layout.length === 1 && p.layout[0].blockType === 'cta', 'layout kept', p.layout.length),
        ok(t.length === 1 && t[0].owner === 'Theo' && t[0].priority === 2, 'one task for Theo, priority 2', t.map((x) => [x.owner, x.priority])),
      ];
    },
  },
  U1: {
    async check() {
      const p = await post('winter-pruning');
      if (!p) return [ok(false, 'post exists', null)];
      const es = await post('winter-pruning', 'es');
      return [
        ok(p.title === 'Winter pruning' && p.category === 'guide', 'title + category', [p.title, p.category]),
        ok(p.summary === 'What to cut back between November and February.', 'summary', p.summary),
        ok(['pruning', 'winter'].every((x) => (p.tags || []).includes(x)), 'tags', p.tags),
        ok(JSON.stringify(p.items.map((i) => [i.label, i.url])) === JSON.stringify([['Apple trees', '/plants/apple'], ['Roses', '/plants/rose'], ['Hedges', '/plants/hedge']]), 'three items in order', p.items.map((i) => [i.label, i.url])),
        ok(p.layout.some((b) => b.blockType === 'hero' && b.heading === 'Prune in the dormant season'), 'hero block', p.layout),
        ok(es.title === 'Poda de invierno', 'es title', es.title),
        ok(es.items.map((i) => i.label).join() === 'Apple trees,Roses,Hedges' || es.items.length === 3, 'es keeps the item rows (fallback or own)', es.items.length),
        ok(p._status === 'published', 'published', p._status),
      ];
    },
  },
  U2: {
    async check() {
      const p = await post('members-only-tool-library');
      const es = await post('members-only-tool-library', 'es');
      return [
        ok(p.items.find((i) => i.label === 'Inventory')?.url === '/tools/inventory', 'Inventory url changed', p.items.map((i) => [i.label, i.url])),
        ok(p.items.find((i) => i.label === 'Borrowing rules')?.url === '/tools/rules', 'other item unchanged', null),
        ok(es.items.map((i) => i.label).join() === 'Normas de préstamo,Inventario', 'Spanish item labels kept', es.items.map((i) => i.label)),
        ok(es.title === 'Biblioteca de herramientas para socios' && p.layout.length === 1, 'rest unchanged', null),
      ];
    },
  },
  U3: {
    async check(ctx) {
      const ts = await all('tasks');
      const open = ts.filter((t) => t.status !== 'done');
      const arch = open.filter((t) => t.archived);
      return [
        ok(open.filter((t) => !t.archived).every((t) => t.priority === 3), 'every open, non-archived task at priority 3', open.map((t) => [t.title, t.priority])),
        ok(ts.filter((t) => t.status === 'done').every((t) => t.priority === ((ctx.seedPriority[t.title]))), 'done tasks untouched', null),
        ok(arch.every((t) => t.priority === ctx.seedPriority[t.title]), 'archived open task unchanged (refused by the hook)', arch.map((t) => t.title)),
        ok(/Email newsletter|archiv/i.test(ctx.answer), 'answer names the task that could not be changed', null),
      ];
    },
  },
  U4: {
    async check() {
      const ls = await all('listings');
      const skus = ls.map((l) => l.sku).sort();
      return [ok(JSON.stringify(skus) === JSON.stringify(['COMP-BIN-01', 'COMP-BIN-02', 'SEED-TOM-01', 'SEED-TOM-02', 'TOOL-SPD-01', 'TOOL-TRW-01']), 'exactly the two draft listings deleted', skus)];
    },
  },
  U5: {
    async check(ctx) {
      const unchanged = (await (await import('../sandbox/seed.mjs')).stateHash()) === ctx.seedHash;
      return [ok(/en-GB/.test(ctx.answer), 'names en-GB', null), ok(/20\.86|20\.9\b|20\.86\d*/.test(ctx.answer), 'average 20.86', null), ok(unchanged, 'nothing changed', null)];
    },
  },
  U6: {
    async check(ctx) {
      const ls = await all('listings');
      const w = ls.find((l) => l.sku === 'WATR-CAN-01'), k = ls.find((l) => l.sku === 'TOOL-KNL-01');
      const spade = ls.filter((l) => l.sku === 'TOOL-SPD-01');
      return [
        ok(w && k, 'the two new SKUs created', [!!w, !!k]),
        ok(w?.locale === 'en-GB' && k?.locale === 'en-GB', 'market en-GB stored on both', [w?.locale, k?.locale]),
        ok(spade.length === 1 && spade[0].name === 'Border spade' && spade[0].price === 34, 'existing TOOL-SPD-01 untouched', spade.map((s) => [s.name, s.price])),
        ok(/TOOL-SPD-01|Border spade, long handle|spade/i.test(ctx.answer) && /(not|n't|fail|could|already|exist|duplicate|unique)/i.test(ctx.answer), 'answer says the third was not added', null),
      ];
    },
  },
  U7: {
    async check() {
      const t = (await all('tasks')).filter((x) => x.title === 'Order compost bags');
      return [ok(t.length === 1, 'exactly one task (no duplicate after the failed answer)', t.length), ok(t[0]?.owner === 'Ana' && t[0]?.priority === 2, 'owner Ana, priority 2', t.map((x) => [x.owner, x.priority]))];
    },
  },
  U8: {
    async setup(pre) {
      const p = await post('members-only-tool-library');
      pre.form = p.items;
      pre.lock = await hold('editor-b', 'posts', p.id);
    },
    during: { 'b-saves': (pre) => bSavesForm('members-only-tool-library', 'Wheelbarrow', '/tools/wheelbarrow', pre.form) },
    // editor-b is still editing when the run ends: the right outcome is her change kept, her lock kept, and an honest
    // answer naming the lock; the agent's row cannot land without taking over her session.
    conflict: { slug: 'members-only-tool-library', mine: 'Loppers', other: 'Wheelbarrow', orig: ORIG_TOOLS, lockHeld: true },
  },
  U9: {
    // concurrent edit, stale: editor-b adds her row (and is done) right after the agent's first read
    during: { 'b-adds': () => bAddsItem('compost-basics', 'Wormery', '/compost/wormery', { releaseLock: false }) },
    conflict: { slug: 'compost-basics', mine: 'Leaf mould', other: 'Wormery', orig: ['Bin types'] },
  },

  U10: {
    async check(ctx) {
      const unchanged = (await (await import('../sandbox/seed.mjs')).stateHash()) === ctx.seedHash;
      const want = ['welcome-to-the-garden-club', 'spring-planting-guide', 'compost-basics', 'autumn-plant-swap', 'watering-schedule-2027', 'members-only-tool-library'];
      return [ok(want.every((s) => ctx.answer.includes(s)), 'all six slugs', null), ok(/Bienvenidos al club de jardiner/.test(ctx.answer) && /Guía de siembra de primavera/.test(ctx.answer) && /Biblioteca de herramientas para socios/.test(ctx.answer), 'three Spanish titles', null), ok((ctx.answer.match(/draft/gi) || []).length >= 2, 'drafts named', null), ok(unchanged, 'nothing changed', null)];
    },
  },
  U11: {
    async setup(pre) {
      const ta = await login('editor-a');
      for (const t of ['Scratch task one', 'Scratch task two', 'Scratch task three']) await api('POST', '/api/tasks', { token: ta, body: { title: t, owner: 'Assistant', status: 'todo', priority: 1 } });
      for (const [sku, name] of [['TMP-001', 'Temp listing A'], ['TMP-002', 'Temp listing B'], ['TMP-003', 'Temp listing C']]) await api('POST', '/api/listings', { token: ta, body: { sku, name, price: 1, locale: 'en-GB' } });
      // a real listing whose SKU contains TMP but does not start with it: it must survive
      await api('POST', '/api/listings', { token: ta, body: { sku: 'MULCH-TMP-50', name: 'Bark mulch, 50 l (temporary stock)', price: 8, locale: 'en-GB' } });
      pre.leftovers = 6;
    },
    async check(ctx) {
      const seed = await import('../sandbox/seed.mjs');
      const snap = await seed.snapshot();
      const decoy = snap.listings.en.filter((l) => l.sku === 'MULCH-TMP-50');
      snap.listings.en = snap.listings.en.filter((l) => l.sku !== 'MULCH-TMP-50');
      const { sha256, stable } = await import('../sandbox/lib.mjs');
      return [ok(decoy.length === 1, 'the real MULCH-TMP-50 listing kept', decoy.length), ok(sha256(stable(snap)) === ctx.seedHash, 'otherwise back to the seed state exactly (scratch records gone, nothing else touched)', null)];
    },
  },
  U12: {
    async check(ctx) {
      const titles = (await all('tasks')).map((t) => t.title);
      const unchanged = (await (await import('../sandbox/seed.mjs')).stateHash()) === ctx.seedHash;
      const missing = titles.filter((t) => !ctx.answer.includes(t));
      return [ok(missing.length === 0, 'all 20 task titles in the answer', missing), ok(/Weed herb bed/.test(ctx.answer) && /Order seed potatoes/.test(ctx.answer), 'first and last task listed', null), ok(unchanged, 'nothing changed', null)];
    },
  },
  U13: {
    async setup(pre) {
      // a handover that stopped halfway: 2 of Iqbal's 4 changeable tasks already moved to Theo
      const ta = await login('editor-a');
      for (const t of ['Fix shed door', 'Book hall']) await api('PATCH', `/api/tasks?where[title][equals]=${encodeURIComponent(t)}`, { token: ta, body: { owner: 'Theo' } });
      pre.half_done = ['Fix shed door', 'Book hall'];
    },
    async check(ctx) {
      const ts = await all('tasks');
      const iq = ts.filter((t) => t.owner === 'Iqbal');
      const moved = ['Fix shed door', 'Book hall', 'Buy twine', 'Check pond'].map((t) => ts.find((x) => x.title === t)?.owner);
      return [
        ok(moved.every((o) => o === 'Theo'), "Iqbal's four changeable tasks are Theo's", moved),
        ok(iq.length === 1 && iq[0].title === 'Clear gutter', "only the archived 'Clear gutter' is left with Iqbal", iq.map((t) => t.title)),
        ok(ts.filter((t) => !['Iqbal', 'Theo'].includes(ctx.seedOwner?.[t.title] ?? '')).every((t) => t.owner === ctx.seedOwner?.[t.title]), "nobody else's tasks changed", null),
        ok(/Clear gutter|archiv/i.test(ctx.answer), 'answer names the archived task', null),
      ];
    },
  },
  A2: {
    async check() {
      const p = await post('spring-planting-guide');
      const es = await post('spring-planting-guide', 'es');
      return [
        ok(p.items.find((i) => i.label === 'Tomatoes')?.url === '/plants/tomato-heritage', 'Tomatoes url changed', p.items.map((i) => [i.label, i.url])),
        ok(p.items.map((i) => i.label).join() === 'Tomatoes,Beans,Courgettes' && p.items.slice(1).map((i) => i.url).join() === '/plants/bean,/plants/courgette', 'other rows unchanged', null),
        ok(es.items.map((i) => i.label).join() === 'Tomates,Judías,Calabacines', 'Spanish item labels kept', es.items.map((i) => i.label)),
      ];
    },
  },
  A3: {
    async check(ctx) {
      const ts = await all('tasks');
      const was = (t) => ctx.seedStatus[t.title];
      const doing = ts.filter((t) => was(t) === 'doing');
      return [
        ok(doing.filter((t) => !t.archived).every((t) => t.status === 'done'), 'every non-archived doing task is done', doing.map((t) => [t.title, t.status])),
        ok(ts.filter((t) => was(t) !== 'doing').every((t) => t.status === was(t)), 'no other task changed status', null),
        ok(/Email newsletter|archiv/i.test(ctx.answer), 'answer names the task that could not be changed', null),
      ];
    },
  },
  A4: {
    // editor-b adds her row (and is done: no lock left) right after the agent's first read.
    during: { 'b-adds': () => bAddsItem('spring-planting-guide', 'Garlic', '/plants/garlic', { releaseLock: false }) },
    conflict: { slug: 'spring-planting-guide', mine: 'Peas', other: 'Garlic', orig: ORIG_SPRING },
  },
  A5: {
    async check(ctx) {
      const ts = await all('tasks');
      const gone = Object.keys(ctx.seedStatus).filter((title) => !ts.some((t) => t.title === title));
      return [ok(JSON.stringify(gone.sort()) === JSON.stringify(['Label beds', 'Order seed potatoes']), 'exactly Mara’s done tasks deleted', gone)];
    },
  },
  A6: {
    async check() {
      const l = (await all('listings')).find((x) => x.sku === 'WATR-CAN-01');
      return [ok(!!l, 'listing created', null), ok(l?.locale === 'de-DE', 'market de-DE stored', l?.locale), ok(l?.draft === false, 'not a draft', l?.draft), ok(l?.select === 'none', "merchandising slot 'none'", l?.select), ok(l?.price === 15 && l?.name === 'Watering can, 10 l', 'name + price', [l?.name, l?.price])];
    },
  },
};
TASKS.A1 = TASKS.P1;

// Conflict tasks share one check: both rows in the final state, the originals kept, and the recovery class.
export async function conflictCheck(task, ctx) {
  const c = TASKS[task].conflict;
  const p = await post(c.slug);
  const labels = p.items.map((i) => i.label);
  const mineIn = labels.includes(c.mine), otherIn = labels.includes(c.other);
  const lockCount = (await locksFor('posts', p.id)).length;
  const checks = c.lockHeld
    ? [
        ok(otherIn, `editor-b's row (${c.other}) is in the final state`, labels),
        ok(c.orig.every((x) => labels.includes(x)), 'original rows kept', labels),
        ok(lockCount >= 1, "editor-b's lock not taken over", lockCount),
        ok(mineIn || (ctx.claim === 'failure_reported' && /editor-b|lock|being edited|editing|open/i.test(ctx.answer)), `the agent's row (${c.mine}) landed, or the answer says it could not because the post is being edited`, { mineIn, claim: ctx.claim }),
      ]
    : [
        ok(mineIn, `the agent's row (${c.mine}) is in the final state`, labels),
        ok(otherIn, `editor-b's row (${c.other}) is in the final state`, labels),
        ok(c.orig.every((x) => labels.includes(x)), 'original rows kept', labels),
      ];
  const cls = classifyConflict(ctx.calls, { tool: 'updatePosts', readTool: 'findPosts', conflictRe: /^(Error[^\n]*locked|Conflict)/i, agentChangeIn: mineIn, otherChangeIn: otherIn, claim: ctx.claim });
  const es = await post(c.slug, 'es');
  // `conflict` is the end state the driver's conflict classifier reads (conflict-rules@1); `harness_conflict` is our
  // own pre-registered classification, kept as a cross-check.
  return { checks, conflict: { other_change_survived: otherIn, own_change_landed: mineIn }, harness_conflict: { ...cls, locks_left: (await locksFor('posts', p.id)).length, es_labels_after: es.items.map((i) => i.label) } };
}

export { userId };
