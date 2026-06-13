/* ============================================================================
 * Captain Adel — weight & balance compute tool (pure, zero-dep).
 *
 * Mirrors Fly GACA's tools-wb-init.js math: per-station moments, totals, CG.
 * Limits (max weight, CG envelope) are OPTIONAL inputs the model takes from
 * the aircraft's POH or the user — never constants here. When limits are
 * given the result says whether the load is inside them.
 * ==========================================================================*/

'use strict';

function round2(x) { return Math.round(x * 100) / 100; }

/**
 * compute({ items: [{ name, weight, arm }], max_weight?, forward_cg_limit?, aft_cg_limit?, unit? })
 *   items   — loading stations: weight (e.g. lb/kg) and arm (e.g. in/mm aft of datum)
 *   limits  — optional POH figures; checked only when present
 */
function compute(args = {}) {
  const items = Array.isArray(args.items) ? args.items : null;
  if (!items || items.length === 0) {
    return { error: 'items[] is required: [{ name, weight, arm }, ...]' };
  }
  if (items.length > 24) return { error: 'too many stations (max 24)' };

  const steps = [];
  let totalW = 0;
  let totalM = 0;
  const stations = [];
  for (const it of items) {
    const w = Number(it && it.weight);
    const a = Number(it && it.arm);
    const name = String((it && it.name) || 'station').slice(0, 48);
    if (!Number.isFinite(w) || w < 0 || !Number.isFinite(a)) {
      return { error: `station "${name}" needs a non-negative weight and a numeric arm` };
    }
    const m = w * a;
    totalW += w;
    totalM += m;
    stations.push({ name, weight: w, arm: a, moment: round2(m) });
    steps.push({ label: `${name} moment`, expr: `${w} × ${a}`, value: round2(m), unit: 'wt·arm' });
  }
  if (totalW <= 0) return { error: 'total weight must be positive' };

  steps.push({ label: 'total weight', expr: stations.map((s) => s.weight).join(' + '), value: round2(totalW), unit: 'wt' });
  steps.push({ label: 'total moment', expr: stations.map((s) => s.moment).join(' + '), value: round2(totalM), unit: 'wt·arm' });

  const cg = totalM / totalW;
  steps.push({ label: 'centre of gravity', expr: `${round2(totalM)} ÷ ${round2(totalW)}`, value: round2(cg), unit: 'arm' });

  const result = {
    stations,
    total_weight: round2(totalW),
    total_moment: round2(totalM),
    cg: round2(cg),
  };

  const maxW = args.max_weight === undefined ? null : Number(args.max_weight);
  const fwd = args.forward_cg_limit === undefined ? null : Number(args.forward_cg_limit);
  const aft = args.aft_cg_limit === undefined ? null : Number(args.aft_cg_limit);
  if (maxW !== null && Number.isFinite(maxW)) {
    result.within_max_weight = totalW <= maxW;
    result.weight_margin = round2(maxW - totalW);
  }
  if (fwd !== null && aft !== null && Number.isFinite(fwd) && Number.isFinite(aft)) {
    result.within_cg_limits = cg >= Math.min(fwd, aft) && cg <= Math.max(fwd, aft);
  }
  if (result.within_max_weight === false || result.within_cg_limits === false) {
    result.out_of_limits = true;
  }

  return { inputs: { items: stations.length, max_weight: maxW, forward_cg_limit: fwd, aft_cg_limit: aft }, steps, result };
}

module.exports = { compute };
