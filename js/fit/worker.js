// RideHQ — FIT import worker (module worker). Decodes, normalises and computes metrics off the main thread.
import { decodeFit, normalizeActivity, sha256Hex } from './parse.js';
import { computeRide } from '../metrics/compute.js';

function transferables(streams) {
  const list = [];
  for (const v of Object.values(streams)) if (v && v.buffer instanceof ArrayBuffer) list.push(v.buffer);
  return list;
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'import') {
      const hash = await sha256Hex(msg.buffer);
      const { messages, errors, integrity } = decodeFit(msg.buffer);
      const act = normalizeActivity(messages, { fileName: msg.fileName, hash });
      const params = msg.paramsFor ? msg.paramsFor : msg.params;
      const summary = computeRide(act, params);
      const out = { type: 'imported', id: msg.id, hash, meta: act.meta, laps: act.laps, events: act.events, deviceClimbs: act.deviceClimbs, summary, streams: act.streams, decodeErrors: errors.length, integrity };
      self.postMessage(out, transferables(act.streams));
    } else if (msg.type === 'recompute') {
      const act = { meta: msg.meta, streams: msg.streams, laps: msg.laps || [] };
      const summary = computeRide(act, msg.params);
      self.postMessage({ type: 'recomputed', id: msg.id, summary, streams: msg.streams }, transferables(msg.streams));
    } else if (msg.type === 'hash') {
      const hash = await sha256Hex(msg.buffer);
      self.postMessage({ type: 'hashed', id: msg.id, hash });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: err?.message || String(err) });
  }
};
