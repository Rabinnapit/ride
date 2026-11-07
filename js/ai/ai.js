// RideHQ — AI coach layer: Gemini or Claude called directly from the browser with the rider's own API key.
// The deterministic engine computes everything; the model explains, prioritises and proposes adjustments within rules.
import { db } from '../db.js';
import { getSettings, fmtDuration, rideLocalDate } from '../settings.js';
import { MMP_DURATIONS } from '../metrics/compute.js';

export const CLAUDE_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fast, cheapest)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recommended)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
];

const COACH_SYSTEM = `You are RideHQ's cycling coach: evidence-based, plain-spoken, specific. You coach one recreational road cyclist.
Rules you never break: at most 2 intensity days per week unless the data says readiness is green and TSB > -10 (then 3); no heavy leg strength within 24 h before the long ride; keep CTL ramp ≤ 7 per week; honour recovery weeks; endurance rides stay ≤ 75% FTP; cite the metric that drives each statement; say "insufficient data" instead of guessing.
All computed numbers in the payload are authoritative — do not recompute TSS, NP or zones. Weight is given in kg; the rider reads lb, so include both when you mention weight. Temperatures in °F.
Write for a smart adult with no coaching jargon; one or two sentences per point.`;

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence verdict on the ride or period.' },
    keyInsights: { type: 'array', items: { type: 'string' }, description: '3–5 observations, each citing a metric.' },
    concerns: { type: 'array', items: { type: 'string' } },
    focusNext14Days: { type: 'string' },
    planAdjustments: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, change: { type: 'string' }, reason: { type: 'string' } }, required: ['date', 'change', 'reason'] } },
    fuellingNote: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['headline', 'keyInsights', 'concerns', 'focusNext14Days', 'planAdjustments', 'fuellingNote', 'confidence'],
};

export async function listGeminiModels(key) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new Error(`Gemini: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
    .map(m => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
}

async function callGemini({ key, model, system, user, schema, temperature = 0.3 }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature, maxOutputTokens: 4096, ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  const usage = j.usageMetadata ? { input: j.usageMetadata.promptTokenCount, output: j.usageMetadata.candidatesTokenCount } : null;
  return { text, usage, raw: j };
}

async function callClaude({ key, model, system, user, schema, temperature = 0.3 }) {
  const body = { model, max_tokens: 4096, temperature, system, messages: [{ role: 'user', content: user }] };
  if (schema) {
    body.tools = [{ name: 'coach_output', description: 'Return the coaching analysis in this exact structure.', input_schema: schema }];
    body.tool_choice = { type: 'tool', name: 'coach_output' };
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  let text = '';
  for (const c of j.content || []) { if (c.type === 'tool_use') text = JSON.stringify(c.input); else if (c.type === 'text') text += c.text; }
  const usage = j.usage ? { input: j.usage.input_tokens, output: j.usage.output_tokens } : null;
  return { text, usage, raw: j };
}

export function aiConfigured(s = getSettings()) {
  const a = s.ai;
  return a.provider === 'claude' ? !!(a.claudeKey && a.claudeModel) : !!(a.geminiKey && a.geminiModel);
}

export async function askCoach({ kind, user, schema = ANALYSIS_SCHEMA, system = COACH_SYSTEM, meta = {} }) {
  const s = getSettings();
  const a = s.ai;
  if (!aiConfigured(s)) throw new Error('Add an API key and pick a model in Settings → AI coach first.');
  const args = { system, user, schema, temperature: a.temperature ?? 0.3 };
  const t0 = Date.now();
  const r = a.provider === 'claude' ? await callClaude({ key: a.claudeKey, model: a.claudeModel, ...args }) : await callGemini({ key: a.geminiKey, model: a.geminiModel, ...args });
  let parsed = null;
  if (schema) { try { parsed = JSON.parse(r.text); } catch { const m = r.text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } } } }
  const rec = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: new Date().toISOString(), kind, provider: a.provider, model: a.provider === 'claude' ? a.claudeModel : a.geminiModel, input: user, output: r.text, parsed, usage: r.usage, ms: Date.now() - t0, ...meta };
  await db.put('ai', rec);
  return rec;
}

// ---------- payload builders ----------
function compactRide(r) {
  const mmpAt = d => r.mmp ? r.mmp[MMP_DURATIONS.indexOf(d)] : null;
  return {
    date: rideLocalDate(r), name: r.name || null, indoor: r.indoor, durationMin: Math.round(r.timerSec / 60), distanceKm: +(r.distanceM / 1000).toFixed(1), ascentM: r.ascentM,
    avgPower: r.avgPower, np: r.np, if: r.if, tss: r.tss, vi: r.vi, ef: r.ef, decouplingPct: r.decoupling, workKj: r.workKj, coastingPct: r.coastingPct,
    avgHr: r.avgHr, maxHr: r.maxHr, hrTss: r.hrTss, avgCadence: r.avgCad, loadUsed: r.load, loadSource: r.loadSource,
    powerZonesSec: r.tizPower, hrZonesSec: r.tizHr, threeZoneSec: r.tiz3, polarizationIndex: r.polarizationIndex, distribution: r.distributionClass,
    mmpW: r.mmp ? { '5s': mmpAt(5), '1m': mmpAt(60), '5m': mmpAt(300), '20m': mmpAt(1200), '60m': mmpAt(3600) } : null,
    balanceLR: Number.isFinite(r.balanceLeft) ? `${r.balanceLeft.toFixed(0)}/${r.balanceRight.toFixed(0)}` : null, torqueEff: r.teLeft, pedalSmooth: r.psLeft, standingSec: r.standingSec,
    climbs: (r.climbs || []).map(c => ({ lengthM: Math.round(c.lengthM), gainM: Math.round(c.gainM), avgGrade: +c.avgGrade.toFixed(1), vam: Math.round(c.vam), avgPower: c.avgPower ? Math.round(c.avgPower) : null })),
    powerSuspect: r.powerSuspect || false, ftpUsed: r.paramsUsed?.ftp, tempF: Number.isFinite(r.avgTemp) ? Math.round(r.avgTemp * 9 / 5 + 32) : null, rpe: r.rpe || null, notes: r.notes || null,
  };
}

export function riderContext(settings, { focus, pmcToday, readiness, plan }) {
  const p = settings.profile, g = settings.goals;
  const ftp = p.ftpHistory?.length ? [...p.ftpHistory].sort((a, b) => a.date.localeCompare(b.date)).at(-1).ftp : null;
  return {
    rider: { age: p.dob ? Math.floor((Date.now() - new Date(p.dob)) / (365.25 * 86400000)) : null, weightKg: p.weightKg, heightCm: p.heightCm, ftp, lthr: p.lthr, hrmax: p.hrmax, hrrest: p.hrrest, experience: 'new to road cycling (first rides Oct 2026), strong work ethic' },
    goals: g, schedule: settings.schedule,
    todayForm: pmcToday ? { ctl: +pmcToday.ctl.toFixed(1), atl: +pmcToday.atl.toFixed(1), tsb: +pmcToday.tsb.toFixed(1) } : null,
    readiness: readiness ? { score: readiness.score, band: readiness.band } : null,
    phase: focus?.phase?.label, powerProfile: focus?.profile ? focus.profile.cols.map(c => ({ d: c.key, w: c.w, wkg: c.wkg && +c.wkg.toFixed(2), category: c.cat })) : null,
    estimatedFtp: focus?.eftp, loadMetrics: focus?.loadMetrics,
    ruleBasedFocus: focus?.cards?.slice(0, 5).map(c => ({ title: c.title, metric: c.metric, evidence: c.evidence })),
    plannedNext14Days: plan ? plan.days.map(d => ({ date: d.date, sessions: d.sessions.map(s => `${s.kind}: ${s.title}${s.plannedTss ? ` (TSS ${s.plannedTss})` : ''}${s.done ? ' ✓' : ''}`) })) : null,
  };
}

export function rideAnalysisPrompt(ride, recentRides, ctx) {
  return `Analyse this ride for the rider below and return the JSON structure.\n\nRIDER_CONTEXT:\n${JSON.stringify(ctx)}\n\nTHIS_RIDE:\n${JSON.stringify(compactRide(ride))}\n\nRECENT_RIDES (last 30 days, newest last):\n${JSON.stringify(recentRides.map(compactRide))}\n\nFocus on: what this ride trained, how it compares with recent rides, pacing/cadence/dynamics observations, recovery needs, and the single most useful change for the next 14 days. Keep planAdjustments to concrete dated changes only if warranted.`;
}
export function weeklyReviewPrompt(rides30, agg7, agg30, ctx, wellness) {
  return `Write the weekly review and return the JSON structure.\n\nRIDER_CONTEXT:\n${JSON.stringify(ctx)}\n\nLAST_7_DAYS_AGGREGATE:\n${JSON.stringify(agg7)}\n\nLAST_30_DAYS_AGGREGATE:\n${JSON.stringify(agg30)}\n\nRIDES_LAST_30_DAYS:\n${JSON.stringify(rides30.map(compactRide))}\n\nWELLNESS_LAST_14_DAYS:\n${JSON.stringify(wellness)}\n\nAssess progress toward the goal, intensity distribution, consistency, fatigue, and propose adjustments to the next 14 days within the rules.`;
}
export function freeChatPrompt(question, ctx, extra) {
  return `RIDER_CONTEXT:\n${JSON.stringify(ctx)}\n\nEXTRA_DATA:\n${JSON.stringify(extra || {})}\n\nQUESTION FROM THE RIDER:\n${question}\n\nAnswer directly in plain prose (markdown allowed, short paragraphs or bullets). Cite the numbers you rely on.`;
}

/** Validate model-proposed plan adjustments against hard rules; returns {ok:[], rejected:[]}. */
export function validateAdjustments(adjustments, plan) {
  const ok = [], rejected = [];
  for (const a of adjustments || []) {
    const text = `${a.change} ${a.reason}`.toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) { rejected.push({ ...a, why: 'no valid date' }); continue; }
    if (plan && !plan.days.some(d => d.date === a.date)) { rejected.push({ ...a, why: 'outside the current 14-day plan' }); continue; }
    if (/heavy (legs|squat|deadlift)/.test(text) && plan) {
      const d = plan.days.find(x => x.date === a.date); const next = plan.days.find(x => x.date > a.date);
      if (next?.sessions.some(s => s.kind === 'bike' && s.durationMin >= 150)) { rejected.push({ ...a, why: 'heavy legs the day before a long ride' }); continue; }
      void d;
    }
    ok.push(a);
  }
  return { ok, rejected };
}
export { ANALYSIS_SCHEMA, COACH_SYSTEM };
