// PREPARED ONLY. Paste into the Console of the ORIGINAL Production tab, OFFLINE.
// Reads app-cache strings and script/worker metadata only. No network, downloads,
// auth/session reads, input reads, storage writes, worker updates or app imports.
// This report is NOT a backup: also run export-sync-recovery.js and preserve drafts.
(async () => {
  if (location.origin !== 'https://sema-calendar.vercel.app') {
    console.error('SeMa inspection stopped: use the existing Production tab; do not navigate or reload.');
    return null;
  }
  if (navigator.onLine !== false) {
    console.error('SeMa inspection stopped: disconnect Wi-Fi and mobile data first. Keep the original tab open.');
    return null;
  }
  const expectedRoot = 'semacalendar-v2:3de918c1-fccc-454d-8618-8dce607ea4d8:sema';
  const fields = ['events', 'todos', 'moods', 'loveNotes', 'wishlistItems', 'countdowns', 'memories',
    'goals', 'partnerNotes', 'shoppingLists', 'monthlyIncome', 'budgetItems', 'savingsGoals',
    'financeMonths', 'savingsTransactions', 'focusActivities', 'focusCarryOver', 'boomBoomCount'];
  const targets = ['events', 'todos', 'loveNotes', 'partnerNotes', 'goals', 'shoppingLists'];
  const allowed = key => key === 'semacalendar-v1' || key === 'sema-legacy-cache-owner' || key.startsWith('semacalendar-v2:');
  const names = () => Object.keys(localStorage).filter(allowed).sort();
  const capturedNames = names();
  const captured = new Map(capturedNames.map(key => [key, localStorage.getItem(key)]));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const parse = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : null; } catch { return null; } };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const valueHash = value => hash(JSON.stringify(canonical(value)) ?? 'undefined');
  const pendingSummary = value => ({
    valid: Array.isArray(value) && value.every(key => fields.includes(key)) && new Set(value).size === value.length,
    keys: Array.isArray(value) ? fields.filter(key => value.includes(key)) : null,
  });
  const checksum = value => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  async function summarize(state, base, pending) {
    const local = object(state) ? state : {}, baseline = object(base) ? base : {};
    const shared = Object.fromEntries(fields.filter(key => Object.hasOwn(local, key)).map(key => [key, local[key]]));
    const differentFromBase = [];
    for (const key of Object.keys(shared)) {
      if (await valueHash(local[key]) !== await valueHash(baseline[key])) differentFromBase.push(key);
    }
    const collections = {};
    for (const field of targets) {
      const items = Array.isArray(local[field]) ? local[field] : null;
      let structuredChecklistItems = 0, completedChecklistItems = 0, legacyChecklistLines = 0;
      for (const item of items ?? []) {
        if (!object(item)) continue;
        for (const key of ['todos', 'checklistItems', 'items']) {
          if (!Array.isArray(item[key])) continue;
          structuredChecklistItems += item[key].length;
          completedChecklistItems += item[key].filter(entry => object(entry) &&
            (entry.isCompleted === true || entry.isChecked === true)).length;
        }
        if (Array.isArray(item.checklist)) legacyChecklistLines += item.checklist.length;
      }
      const ids = (items ?? []).map(item => object(item) ? item.id : undefined);
      collections[field] = {
        present: Object.hasOwn(local, field), array: items !== null, count: items?.length ?? null,
        sha256: await valueHash(local[field]), basePresent: Object.hasOwn(baseline, field),
        baseCount: Array.isArray(baseline[field]) ? baseline[field].length : null,
        baseSha256: await valueHash(baseline[field]),
        invalidOrDuplicateIds: items ? ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length : null,
        newestCreatedAt: (items ?? []).map(item => item?.createdAt).filter(value => typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(value) && Number.isFinite(Date.parse(value))).sort().at(-1) ?? null,
        structuredChecklistItems, completedChecklistItems, legacyChecklistLines,
      };
    }
    const pendingInfo = pendingSummary(pending);
    return { stateObject: object(state), baseObject: object(base), sharedSha256: await valueHash(shared),
      pending: pendingInfo, differentFromBase,
      differingWithoutPendingMarker: differentFromBase.filter(key => !pendingInfo.keys?.includes(key)),
      pendingWithoutBase: pendingInfo.keys?.filter(key => !Object.hasOwn(baseline, key)) ?? null, collections };
  }
  const roots = [...new Set(capturedNames.flatMap(key => {
    const match = /^semacalendar-v2:[^:]+:[^:]+/.exec(key);
    return match ? [match[0]] : [];
  }))];
  const caches = [];
  if (captured.has('semacalendar-v1')) {
    const parsed = parse(captured.get('semacalendar-v1'));
    caches.push({ kind: 'legacy-v1', parseSucceeded: object(parsed),
      summary: await summarize(parsed?.state, null, null) });
  }
  for (const root of roots) {
    const raw = captured.get(root), parsed = parse(raw);
    const mirrorPending = parse(captured.get(root + ':pending'));
    const checkpoints = [];
    for (const slot of [0, 1]) {
      const slotRaw = captured.get(root + ':checkpoint:' + slot);
      if (slotRaw === undefined) continue;
      const envelope = parse(slotRaw), payload = parse(envelope?.payload);
      let checksumMatches = false;
      if (object(envelope)) {
        const { checksum: savedChecksum, ...body } = envelope;
        checksumMatches = savedChecksum === checksum(JSON.stringify(body));
      }
      checkpoints.push({ slot, parseSucceeded: object(envelope), supportedVersion: envelope?.version === 1,
        generation: Number.isSafeInteger(envelope?.generation) ? envelope.generation : null,
        checksumMatches, scopeMatches: payload?.scope === root,
        summary: await summarize(payload?.data?.state, payload?.data?.base, payload?.data?.pending),
        archiveCount: Array.isArray(payload?.data?.archives) ? payload.data.archives.length : null });
    }
    const head = parse(captured.get(root + ':checkpoint:head'));
    caches.push({ kind: 'scoped-v2', scopeSha256: await hash(root), expectedHousehold: root === expectedRoot,
      mirrorPresent: raw !== undefined, mirrorParseSucceeded: object(parsed), pendingMarkerPresent: captured.has(root + ':pending'),
      mirror: await summarize(parsed?.state, parse(captured.get(root + ':base')), mirrorPending), checkpoints,
      checkpointHeadPresent: captured.has(root + ':checkpoint:head'),
      // Report each slot independently; do not select, repair or hydrate a checkpoint.
      checkpointHeadPending: pendingSummary(head?.pending),
      quarantineEntries: capturedNames.filter(key => key.startsWith(root + ':') && key.includes('quarantine')).length });
  }
  let workers = { status: 'unsupported', controllerPath: null, registrations: [] };
  if (navigator.serviceWorker) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const worker = entry => entry ? { path: new URL(entry.scriptURL).pathname, state: entry.state } : null;
      workers = { status: 'read', controllerPath: worker(navigator.serviceWorker.controller)?.path ?? null,
        registrations: registrations.map(entry => ({ scopePath: new URL(entry.scope).pathname,
          active: worker(entry.active), waiting: worker(entry.waiting), installing: worker(entry.installing) })) };
    } catch { workers.status = 'unavailable'; }
  }
  const scriptPaths = [...new Set([
    ...[...document.querySelectorAll('script[src]')].map(entry => entry.src),
    ...performance.getEntriesByType('resource').map(entry => entry.name),
  ].flatMap(value => {
    try { const url = new URL(value, location.origin); return url.origin === location.origin &&
      url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js') ? [url.pathname] : []; } catch { return []; }
  }))];
  const inventory = await Promise.all([...captured].map(async ([key, raw]) => ({
    keySha256: await hash(key), characters: raw?.length ?? 0, rawSha256: await hash(raw ?? ''),
  })));
  if (navigator.onLine !== false || JSON.stringify(capturedNames) !== JSON.stringify(names()) ||
    [...captured].some(([key, raw]) => localStorage.getItem(key) !== raw)) {
    console.error('SeMa inspection stopped: connection or cache changed during inspection. Preserve drafts and retry offline without reloading.');
    return null;
  }
  const owner = captured.get('sema-legacy-cache-owner');
  const report = { format: 'sema-original-device-inspection', version: 1, at: new Date().toISOString(),
    origin: location.origin, path: location.pathname, offline: true, visibility: document.visibilityState,
    consistentRead: true, noAppCacheFound: !caches.some(cache => cache.kind === 'legacy-v1'
      ? cache.summary.stateObject : cache.mirror.stateObject || cache.checkpoints.some(slot => slot.summary.stateObject)),
    legacyOwnerMatchesExpected: owner === undefined ? null : owner === '3de918c1-fccc-454d-8618-8dce607ea4d8',
    caches, inventory, scriptPaths, workers,
    limitations: 'Metadata only; no authentication, in-memory store, open drafts, server state, live subscriptions or disk durability verified. Checkpoint summaries do not certify recovery validity. Also export raw caches.' };
  console.log(JSON.stringify(report, null, 2));
  return report;
})().catch(() => {
  console.error('SeMa inspection failed. Keep the original tab and drafts open. Preserve the profile; do not reload or clear storage.');
  return null;
});
