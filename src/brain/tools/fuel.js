/* ============================================================================
 * Captain Adel — fuel endurance / range compute tool (pure, zero-dep).
 *
 * Mirrors Fly GACA's tools-fuel.js math: total endurance, the fuel a reserve
 * holds back, usable endurance and still-air range. The REQUIRED reserve is an
 * input, not a constant — what GACAR Part 91 demands for the flight (day VFR /
 * night / IFR) is a regulation fact the model must cite from retrieval, never
 * from this tool.
 * ==========================================================================*/

'use strict';

function round1(x) { return Math.round(x * 10) / 10; }

/**
 * compute({ fuel_on_board, burn_rate_per_hour, reserve_minutes?, ground_speed_kt?, unit? })
 *   fuel_on_board       — total usable fuel on board (in `unit`)
 *   burn_rate_per_hour  — planned cruise burn (same unit per hour)
 *   reserve_minutes     — reserve to hold back (default 30; the model supplies
 *                         the regulatory figure it retrieved for the flight)
 *   ground_speed_kt     — optional, adds still-air range
 *   unit                — display label, e.g. 'L', 'USG', 'kg' (default 'units')
 */
function compute(args = {}) {
  const fob = Number(args.fuel_on_board);
  const burn = Number(args.burn_rate_per_hour);
  const reserveMin = args.reserve_minutes === undefined ? 30 : Number(args.reserve_minutes);
  const gs = args.ground_speed_kt === undefined || args.ground_speed_kt === null
    ? null : Number(args.ground_speed_kt);
  const unit = String(args.unit || 'units').slice(0, 8);

  if (!Number.isFinite(fob) || fob < 0 || !Number.isFinite(burn) || burn <= 0) {
    return { error: 'fuel_on_board (>=0) and burn_rate_per_hour (>0) are required' };
  }
  if (!Number.isFinite(reserveMin) || reserveMin < 0) {
    return { error: 'reserve_minutes must be a non-negative number' };
  }
  if (gs !== null && (!Number.isFinite(gs) || gs < 0)) {
    return { error: 'ground_speed_kt must be a non-negative number when given' };
  }

  const inputs = { fuel_on_board: fob, burn_rate_per_hour: burn, reserve_minutes: reserveMin, unit };
  if (gs !== null) inputs.ground_speed_kt = gs;

  const steps = [];
  const totalH = fob / burn;
  steps.push({
    label: 'total endurance', expr: `${fob} ÷ ${burn}`,
    value: round1(totalH), unit: 'h',
  });
  const reserveFuel = burn * (reserveMin / 60);
  steps.push({
    label: 'reserve fuel held back', expr: `${burn} × (${reserveMin} ÷ 60)`,
    value: round1(reserveFuel), unit,
  });
  const usable = Math.max(0, fob - reserveFuel);
  steps.push({
    label: 'fuel usable for the trip', expr: `${fob} − ${round1(reserveFuel)}`,
    value: round1(usable), unit,
  });
  const usableH = usable / burn;
  steps.push({
    label: 'usable endurance', expr: `${round1(usable)} ÷ ${burn}`,
    value: round1(usableH), unit: 'h',
  });

  const result = {
    total_endurance_h: round1(totalH),
    reserve_fuel: round1(reserveFuel),
    usable_fuel: round1(usable),
    usable_endurance_h: round1(usableH),
    reserve_exhausts_fuel: usable <= 0,
    unit,
  };

  if (gs !== null) {
    const range = gs * usableH;
    steps.push({
      label: 'still-air range', expr: `${gs} × ${round1(usableH)}`,
      value: Math.round(range), unit: 'NM',
    });
    result.still_air_range_nm = Math.round(range);
  }

  return { inputs, steps, result };
}

module.exports = { compute };
