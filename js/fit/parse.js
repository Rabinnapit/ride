// RideHQ — FIT decoding and normalisation.
// Uses Garmin's official FIT SDK (vendor/fitsdk.js). Works in a Worker and in Node (tests).

import { Decoder, Stream } from '../../vendor/fitsdk.js';

const SEMI = 180 / 2 ** 31;

/** Decode a FIT ArrayBuffer into the SDK's message map. Throws on non-FIT data. */
export function decodeFit(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream)) throw new Error('Not a FIT file');
  const decoder = new Decoder(stream);
  const integrity = decoder.checkIntegrity();
  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    includeUnknownData: false,
    mergeHeartRates: true,
  });
  return { messages, errors, integrity };
}

function num(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : NaN; }

/** Decode FIT left_right_balance: bit 7 set → low 7 bits are the RIGHT %; 'right' string = flag with 0%. */
function rightPct(v) {
  if (v == null) return NaN;
  if (typeof v === 'string') return v === 'right' ? 0 : NaN;
  if (typeof v !== 'number') return NaN;
  if (v & 0x80) return v & 0x7f;
  return NaN; // unflagged values are not defined by the spec; ignore
}

/**
 * Normalise decoded messages into RideHQ's activity shape.
 * @returns {{meta:object, streams:object, laps:object[], events:object[], deviceClimbs:object[]}}
 */
export function normalizeActivity(messages, { fileName = '', hash = '' } = {}) {
  const fileId = messages.fileIdMesgs?.[0] || {};
  const session = messages.sessionMesgs?.[0] || {};
  const sport = messages.sportMesgs?.[0] || {};
  const activity = messages.activityMesgs?.[0] || {};
  const profile = messages.userProfileMesgs?.[0] || {};
  const bike = messages.bikeProfileMesgs?.[0] || {};
  const records = messages.recordMesgs || [];
  const laps = messages.lapMesgs || [];
  const events = messages.eventMesgs || [];
  const climbPro = messages.climbProMesgs || [];
  const devices = messages.deviceInfoMesgs || [];

  if (!records.length) throw new Error('FIT file has no record messages (not an activity?)');
  const sportName = String(session.sport || sport.sport || 'cycling');
  if (sportName !== 'cycling') throw new Error(`Not a cycling activity (sport = ${sportName})`);

  const start = session.startTime instanceof Date ? session.startTime : records[0].timestamp;
  const end = session.timestamp instanceof Date ? session.timestamp : records[records.length - 1].timestamp;

  // Local time offset: activity.localTimestamp is "seconds since FIT epoch in local time".
  let tzOffsetMin = null;
  if (typeof activity.localTimestamp === 'number' && activity.timestamp instanceof Date) {
    const utcFit = activity.timestamp.getTime() / 1000 - 631065600;
    tzOffsetMin = Math.round((activity.localTimestamp - utcFit) / 60);
  }

  // ---- streams (one entry per record; short sensor gaps ≤ 10 s are zero-filled like OnelapFit/GoldenCheetah) ----
  const startMs = start.getTime();
  const rows = []; // {r: record | null (filler)}
  let prevMs = null;
  for (const r of records) {
    if (!(r.timestamp instanceof Date)) continue;
    const ms = r.timestamp.getTime();
    if (prevMs != null) {
      const dt = Math.round((ms - prevMs) / 1000);
      if (dt > 1 && dt <= 10) for (let k = 1; k < dt; k++) rows.push({ r: null, ms: prevMs + k * 1000 });
    }
    rows.push({ r, ms }); prevMs = ms;
  }
  const n = rows.length;
  const F = () => new Float32Array(n).fill(NaN);
  const S = {
    t: new Float64Array(n),       // elapsed seconds since start
    filler: new Uint8Array(n),    // 1 = synthetic zero-power sample inserted into a short gap
    lat: F(), lon: F(), alt: F(), dist: F(), speed: F(), power: F(), hr: F(), cad: F(), temp: F(), grade: F(),
    balR: F(), teL: F(), teR: F(), psL: F(), psR: F(),
    ppL0: F(), ppL1: F(), ppR0: F(), ppR1: F(), ppkL0: F(), ppkL1: F(), ppkR0: F(), ppkR1: F(),
  };
  let hasGps = 0, hasPower = 0, hasHr = 0, hasCad = 0, hasAlt = 0, hasBal = 0, hasTemp = 0, hasDist = 0, hasSpeed = 0;
  let anyPower = records.some(r => typeof r.power === 'number');
  for (let i = 0; i < n; i++) {
    const { r, ms } = rows[i];
    S.t[i] = (ms - startMs) / 1000;
    if (!r) { S.filler[i] = 1; if (anyPower) S.power[i] = 0; continue; }
    const lat = num(r.positionLat), lon = num(r.positionLong);
    if (Number.isFinite(lat) && Number.isFinite(lon)) { S.lat[i] = lat * SEMI; S.lon[i] = lon * SEMI; hasGps++; }
    const alt = num(r.enhancedAltitude ?? r.altitude); if (Number.isFinite(alt)) { S.alt[i] = alt; hasAlt++; }
    const d = num(r.distance); if (Number.isFinite(d)) { S.dist[i] = d; hasDist++; }
    const sp = num(r.enhancedSpeed ?? r.speed); if (Number.isFinite(sp)) { S.speed[i] = sp; hasSpeed++; }
    const p = num(r.power); if (Number.isFinite(p)) { S.power[i] = p; hasPower++; }
    const h = num(r.heartRate); if (Number.isFinite(h) && h > 0) { S.hr[i] = h; hasHr++; }
    const c = num(r.cadence); if (Number.isFinite(c)) { S.cad[i] = c; hasCad++; }
    const tp = num(r.temperature); if (Number.isFinite(tp)) { S.temp[i] = tp; hasTemp++; }
    const g = num(r.grade); if (Number.isFinite(g)) S.grade[i] = g;
    const br = rightPct(r.leftRightBalance); if (Number.isFinite(br)) { S.balR[i] = br; hasBal++; }
    S.teL[i] = num(r.leftTorqueEffectiveness); S.teR[i] = num(r.rightTorqueEffectiveness);
    S.psL[i] = num(r.leftPedalSmoothness); S.psR[i] = num(r.rightPedalSmoothness);
    if (Array.isArray(r.leftPowerPhase)) { S.ppL0[i] = num(r.leftPowerPhase[0]); S.ppL1[i] = num(r.leftPowerPhase[1]); }
    if (Array.isArray(r.rightPowerPhase)) { S.ppR0[i] = num(r.rightPowerPhase[0]); S.ppR1[i] = num(r.rightPowerPhase[1]); }
    if (Array.isArray(r.leftPowerPhasePeak)) { S.ppkL0[i] = num(r.leftPowerPhasePeak[0]); S.ppkL1[i] = num(r.leftPowerPhasePeak[1]); }
    if (Array.isArray(r.rightPowerPhasePeak)) { S.ppkR0[i] = num(r.rightPowerPhasePeak[0]); S.ppkR1[i] = num(r.rightPowerPhasePeak[1]); }
  }

  // Fill distance gaps by carrying forward (devices omit distance on the first records)
  let last = 0; for (let i = 0; i < n; i++) { if (Number.isFinite(S.dist[i])) last = S.dist[i]; else S.dist[i] = last; }

  // Standing / seated from rider position events
  const standing = new Uint8Array(n);
  const posEvents = events.filter(e => e.event === 'riderPositionChange' && e.timestamp instanceof Date)
    .map(e => ({ t: (e.timestamp.getTime() - startMs) / 1000, standing: e.riderPosition === 'standing' }))
    .sort((a, b) => a.t - b.t);
  if (posEvents.length) {
    let k = 0, cur = false;
    for (let i = 0; i < n; i++) {
      while (k < posEvents.length && posEvents[k].t <= S.t[i]) { cur = posEvents[k].standing; k++; }
      standing[i] = cur ? 1 : 0;
    }
  }
  S.standing = standing;

  // Drop unused channels to save space
  for (const k of ['ppL0', 'ppL1', 'ppR0', 'ppR1', 'ppkL0', 'ppkL1', 'ppkR0', 'ppkR1', 'teL', 'teR', 'psL', 'psR']) {
    if (!hasBal && !hasPower) delete S[k];
  }
  if (!hasGps) { delete S.lat; delete S.lon; }
  if (!hasAlt) delete S.alt;
  if (!hasPower) delete S.power;
  if (!hasHr) delete S.hr;
  if (!hasCad) delete S.cad;
  if (!hasTemp) delete S.temp;
  if (!hasBal) delete S.balR;

  const sensors = devices.map(d => ({
    type: d.antplusDeviceType || (d.bleDeviceType != null ? `ble:${d.bleDeviceType}` : null) || (d.deviceType != null ? `type:${d.deviceType}` : 'unknown'),
    name: d.productName || null,
    manufacturer: typeof d.manufacturer === 'string' ? d.manufacturer : null,
    product: d.product ?? null,
    battery: d.batteryStatus || null,
    source: d.sourceType || null,
  })).filter(s => s.type !== 'unknown' || s.name);

  const manufacturer = typeof fileId.manufacturer === 'string' ? fileId.manufacturer : String(fileId.manufacturer ?? '');
  const subSport = String(session.subSport ?? sport.subSport ?? '');
  const indoor = !hasGps || /virtual|indoor|trainer/i.test(subSport) || /zwift|wahoo fitness|tacx/i.test(manufacturer) && !hasGps;

  const meta = {
    fileName, hash,
    source: manufacturer || 'unknown',
    device: fileId.productName || (typeof fileId.product === 'string' ? fileId.product : null) || manufacturer,
    serial: fileId.serialNumber ?? null,
    profileName: sport.name || null,
    sport: sportName, subSport,
    indoor,
    virtual: /virtual/i.test(subSport) || /zwift/i.test(manufacturer),
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    tzOffsetMin,
    sensors,
    riderWeightKg: num(profile.weight) || null,
    riderHeightM: num(profile.height) || null,
    bikeName: bike.name || null,
    bikeWeightKg: num(bike.bikeWeight) || null,
    channels: { gps: !!hasGps, power: !!hasPower, hr: !!hasHr, cadence: !!hasCad, altitude: !!hasAlt, balance: !!hasBal, temperature: !!hasTemp },
    device: {
      elapsed: num(session.totalElapsedTime), timer: num(session.totalTimerTime), moving: num(session.totalMovingTime),
      distance: num(session.totalDistance), ascent: num(session.totalAscent), descent: num(session.totalDescent),
      avgSpeed: num(session.enhancedAvgSpeed ?? session.avgSpeed), maxSpeed: num(session.enhancedMaxSpeed ?? session.maxSpeed),
      avgHr: num(session.avgHeartRate), maxHr: num(session.maxHeartRate), avgCad: num(session.avgCadence), maxCad: num(session.maxCadence),
      avgPower: num(session.avgPower), maxPower: num(session.maxPower), np: num(session.normalizedPower), tss: num(session.trainingStressScore),
      if: num(session.intensityFactor), ftp: num(session.thresholdPower), work: num(session.totalWork), calories: num(session.totalCalories),
      timeStanding: num(session.timeStanding), standCount: num(session.standCount),
      avgPowerSeated: Array.isArray(session.avgPowerPosition) ? num(session.avgPowerPosition[0]) : NaN,
      avgPowerStanding: Array.isArray(session.avgPowerPosition) ? num(session.avgPowerPosition[1]) : NaN,
      avgCadSeated: Array.isArray(session.avgCadencePosition) ? num(session.avgCadencePosition[0]) : NaN,
      avgCadStanding: Array.isArray(session.avgCadencePosition) ? num(session.avgCadencePosition[1]) : NaN,
      balanceRightPct: rightPct(session.leftRightBalance),
      avgTemp: num(session.avgTemperature), maxTemp: num(session.maxTemperature),
    },
  };
  // Keep the product name separately from the device-summary object
  meta.deviceName = fileId.productName || manufacturer;

  const lapOut = laps.map((l, i) => ({
    index: i + 1,
    start: (l.startTime?.getTime?.() ?? startMs) - startMs,
    elapsed: num(l.totalElapsedTime), timer: num(l.totalTimerTime), distance: num(l.totalDistance),
    avgSpeed: num(l.enhancedAvgSpeed ?? l.avgSpeed), maxSpeed: num(l.enhancedMaxSpeed ?? l.maxSpeed),
    avgHr: num(l.avgHeartRate), maxHr: num(l.maxHeartRate), avgCad: num(l.avgCadence),
    avgPower: num(l.avgPower), maxPower: num(l.maxPower), np: num(l.normalizedPower),
    ascent: num(l.totalAscent), descent: num(l.totalDescent), work: num(l.totalWork),
  }));

  const deviceClimbs = [];
  const open = new Map();
  for (const c of climbPro) {
    if (!(c.timestamp instanceof Date)) continue;
    const t = (c.timestamp.getTime() - startMs) / 1000;
    if (c.climbProEvent === 'start') open.set(c.climbNumber, { t0: t, d0: num(c.currentDist), category: c.climbCategory });
    else if (c.climbProEvent === 'complete' && open.has(c.climbNumber)) {
      const o = open.get(c.climbNumber);
      deviceClimbs.push({ number: c.climbNumber, t0: o.t0, t1: t, d0: o.d0, d1: num(c.currentDist), category: o.category });
      open.delete(c.climbNumber);
    }
  }

  const eventOut = events.filter(e => e.timestamp instanceof Date && e.event !== 'riderPositionChange' && e.event !== 'batteryLow')
    .map(e => ({ t: (e.timestamp.getTime() - startMs) / 1000, event: e.event, type: e.eventType }));

  return { meta, streams: S, laps: lapOut, events: eventOut, deviceClimbs };
}

/** SHA-256 hex of an ArrayBuffer (browser crypto.subtle or Node). */
export async function sha256Hex(arrayBuffer) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const h = await subtle.digest('SHA-256', arrayBuffer);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(new Uint8Array(arrayBuffer)).digest('hex');
}
