/* Unit tests — captadel/src/brain/tools (pure flight-computer math).
 * Known-value tables per tool; no network, no API key. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../src/brain/tools');
const wind = require('../src/brain/tools/wind');
const fuel = require('../src/brain/tools/fuel');
const wb = require('../src/brain/tools/weightbalance');
const recency = require('../src/brain/tools/recency');
const density = require('../src/brain/tools/density');

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} !~ ${expected}`);
}

/* ---- wind --------------------------------------------------------------- */

test('wind: RWY 24, wind 270/20 (30° off) -> XW 10 kt right, HW ~17.3 kt', () => {
  const out = wind.compute({ course_deg: 240, wind_dir_deg: 270, wind_speed_kt: 20 });
  near(out.result.crosswind_kt, 10, 0.1, 'crosswind');         // 20 × sin(30°)
  assert.equal(out.result.crosswind_from, 'right');
  near(out.result.headwind_kt, 17.3, 0.1, 'headwind');         // 20 × cos(30°)
  assert.equal(out.result.tailwind_kt, 0);
  assert.ok(Array.isArray(out.steps) && out.steps.length >= 3, 'has worked steps');
});

test('wind: 90° off the nose is all crosswind', () => {
  const out = wind.compute({ course_deg: 240, wind_dir_deg: 330, wind_speed_kt: 20 });
  near(out.result.crosswind_kt, 20, 0.1, 'crosswind');
  near(out.result.headwind_kt, 0, 0.1, 'headwind');
});

test('wind: direct tailwind reads as tailwind, calm wind is all zeros', () => {
  const tail = wind.compute({ course_deg: 360, wind_dir_deg: 180, wind_speed_kt: 15 });
  assert.equal(tail.result.headwind_kt, 0);
  near(tail.result.tailwind_kt, 15, 0.1, 'tailwind');
  const calm = wind.compute({ course_deg: 90, wind_dir_deg: 270, wind_speed_kt: 0 });
  assert.equal(calm.result.crosswind_kt, 0);
});

test('wind: triangle with TAS -> WCA, heading, ground speed', () => {
  // TC 360, wind 270/20, TAS 100: sin(WCA) = 20*sin(-90°)/100 -> WCA ~ -11.5° (left)
  const out = wind.compute({ course_deg: 360, wind_dir_deg: 270, wind_speed_kt: 20, tas_kt: 100 });
  near(out.result.wind_correction_angle_deg, -11.5, 0.3, 'WCA');
  near(out.result.heading_deg, 348, 1.5, 'heading');
  near(out.result.ground_speed_kt, 98, 1.5, 'ground speed');  // tas*cos(wca) - 20*cos(90°)= ~98
});

test('wind: missing inputs -> error, not a throw', () => {
  assert.ok(wind.compute({}).error);
  assert.ok(wind.compute({ course_deg: 240, wind_dir_deg: 270, wind_speed_kt: -5 }).error);
});

/* ---- fuel --------------------------------------------------------------- */

test('fuel: 140 L at 35 L/h with 45-min reserve and 110 kt GS', () => {
  const out = fuel.compute({
    fuel_on_board: 140, burn_rate_per_hour: 35, reserve_minutes: 45,
    ground_speed_kt: 110, unit: 'L',
  });
  near(out.result.total_endurance_h, 4.0, 0.01, 'total endurance');
  near(out.result.reserve_fuel, 26.3, 0.1, 'reserve fuel');     // 35*0.75
  near(out.result.usable_fuel, 113.8, 0.1, 'usable');           // 140-26.25
  near(out.result.usable_endurance_h, 3.3, 0.05, 'usable endurance');
  near(out.result.still_air_range_nm, 358, 2, 'range');         // 110*3.25
  assert.equal(out.result.reserve_exhausts_fuel, false);
});

test('fuel: a reserve larger than the fuel on board flags exhaustion', () => {
  const out = fuel.compute({ fuel_on_board: 10, burn_rate_per_hour: 40, reserve_minutes: 30 });
  assert.equal(out.result.usable_fuel, 0);
  assert.equal(out.result.reserve_exhausts_fuel, true);
});

test('fuel: zero burn -> error', () => {
  assert.ok(fuel.compute({ fuel_on_board: 100, burn_rate_per_hour: 0 }).error);
});

/* ---- weight & balance ---------------------------------------------------- */

test('w&b: totals, CG and limit checks', () => {
  const out = wb.compute({
    items: [
      { name: 'empty', weight: 1500, arm: 39.0 },
      { name: 'pilot+pax', weight: 340, arm: 37.0 },
      { name: 'fuel', weight: 240, arm: 48.0 },
      { name: 'baggage', weight: 60, arm: 95.0 },
    ],
    max_weight: 2300, forward_cg_limit: 35.0, aft_cg_limit: 47.3,
  });
  near(out.result.total_weight, 2140, 0.1, 'total weight');
  // CG = (1500×39 + 340×37 + 240×48 + 60×95) / 2140 = 88300/2140 ≈ 41.26
  near(out.result.cg, 41.26, 0.05, 'CG');
  assert.equal(out.result.within_max_weight, true);
  assert.equal(out.result.within_cg_limits, true);
  assert.notEqual(out.result.out_of_limits, true);
});

test('w&b: overweight load is flagged out of limits', () => {
  const out = wb.compute({
    items: [{ name: 'empty', weight: 1500, arm: 39 }, { name: 'load', weight: 1000, arm: 40 }],
    max_weight: 2300,
  });
  assert.equal(out.result.within_max_weight, false);
  assert.equal(out.result.out_of_limits, true);
});

test('w&b: empty items -> error', () => {
  assert.ok(wb.compute({ items: [] }).error);
  assert.ok(wb.compute({}).error);
});

/* ---- recency -------------------------------------------------------------- */

test('recency: 3 landings inside 90 days -> current, with the right lapse date', () => {
  const out = recency.compute({
    event_dates: ['2026-05-20', '2026-04-10', '2026-03-25', '2025-12-01'],
    required_count: 3, window_days: 90, today: '2026-06-11',
  });
  assert.equal(out.result.current, true);
  assert.equal(out.result.count_in_window, 3);              // 2025-12-01 aged out
  assert.equal(out.result.limiting_event, '2026-03-25');
  assert.equal(out.result.lapse_date, '2026-06-23');        // +90 days
  assert.equal(out.result.days_left, 12);
});

test('recency: too few events -> not current, with the shortfall', () => {
  const out = recency.compute({
    event_dates: ['2026-06-01'], required_count: 3, window_days: 90, today: '2026-06-11',
  });
  assert.equal(out.result.current, false);
  assert.equal(out.result.shortfall, 2);
});

test('recency: future-dated typos never count', () => {
  const out = recency.compute({
    event_dates: ['2027-01-01', '2027-01-01', '2027-01-01'],
    required_count: 3, window_days: 90, today: '2026-06-11',
  });
  assert.equal(out.result.current, false);
});

test('recency: bad dates -> error', () => {
  assert.ok(recency.compute({ event_dates: ['junk'] }).error);
  assert.ok(recency.compute({}).error);
});

/* ---- density altitude ----------------------------------------------------- */

test('density: ISA sea level -> PA ~0, DA ~0', () => {
  const out = density.compute({ field_elevation_ft: 0, qnh: 1013.25, oat_c: 15 });
  near(out.result.pressure_altitude_ft, 0, 1, 'PA');
  near(out.result.density_altitude_ft, 0, 5, 'DA');
});

test('density: hot day raises DA well above field elevation', () => {
  // OERK-ish: 2000 ft, QNH 1010, OAT 40 °C
  const out = density.compute({ field_elevation_ft: 2000, qnh: 1010, oat_c: 40 });
  assert.ok(out.result.density_altitude_ft > out.result.pressure_altitude_ft + 2000,
    `DA ${out.result.density_altitude_ft} should be far above PA ${out.result.pressure_altitude_ft}`);
  assert.equal(out.result.performance_degraded, true);
});

test('density: inHg unit path', () => {
  const out = density.compute({ field_elevation_ft: 1000, qnh: 29.92, qnh_unit: 'inhg', oat_c: 13 });
  near(out.result.pressure_altitude_ft, 1000, 1, 'PA at standard pressure');
});

/* ---- registry -------------------------------------------------------------- */

test('registry: declarations and dispatch line up', () => {
  const names = tools.DECLARATIONS.map((d) => d.name).sort();
  assert.deepEqual(names, [
    'check_recency', 'compute_density_altitude', 'compute_fuel',
    'compute_weight_balance', 'compute_wind',
  ]);
  for (const n of names) assert.ok(tools.has(n));
  assert.ok(!tools.has('search_library'), 'retrieval tools are not compute tools');
  assert.ok(tools.run('compute_wind', { course_deg: 240, wind_dir_deg: 270, wind_speed_kt: 20 }).result);
  assert.ok(tools.run('nope', {}).error);
});

test('registry: every tool returns steps with label/value (the worked solution)', () => {
  const calls = [
    ['compute_wind', { course_deg: 240, wind_dir_deg: 270, wind_speed_kt: 20 }],
    ['compute_fuel', { fuel_on_board: 100, burn_rate_per_hour: 30 }],
    ['compute_weight_balance', { items: [{ weight: 100, arm: 10 }] }],
    ['check_recency', { event_dates: ['2026-06-01'], today: '2026-06-11' }],
    ['compute_density_altitude', { field_elevation_ft: 0, qnh: 1013.25, oat_c: 15 }],
  ];
  for (const [name, args] of calls) {
    const out = tools.run(name, args);
    assert.ok(Array.isArray(out.steps) && out.steps.length > 0, name + ' has steps');
    for (const s of out.steps) {
      assert.equal(typeof s.label, 'string');
      assert.ok('value' in s);
    }
  }
});
