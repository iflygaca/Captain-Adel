/* ============================================================================
 * Captain Adel — compute-tool registry.
 *
 * Pure flight-computer tools the agentic provider (Gemini) can call so Adel
 * answers "what's my crosswind / fuel / CG / am I current?" with a worked,
 * step-by-step calculation instead of prose arithmetic. Every module returns
 *   { inputs, steps: [{ label, expr, value, unit }], result }  or  { error }.
 *
 * Grounding discipline: these tools do MATH ONLY. Regulatory figures (required
 * reserves, recency rules, POH limits) are inputs the model takes from
 * retrieval or the user — never constants here — so RAG stays the source of
 * truth for facts. The UI maps tool names to the matching Fly GACA calculator
 * page via meta.toolCalls.
 * ==========================================================================*/

'use strict';

const wind = require('./wind');
const fuel = require('./fuel');
const weightbalance = require('./weightbalance');
const recency = require('./recency');
const density = require('./density');

const TOOLS = {
  compute_wind: {
    run: wind.compute,
    declaration: {
      name: 'compute_wind',
      description:
        'Crosswind/headwind components for a runway, and (when tas_kt is ' +
        'given) the full wind triangle: wind-correction angle, heading to fly ' +
        'and ground speed. Use for any numeric wind problem; present the ' +
        'returned steps as the worked solution.',
      parameters: {
        type: 'OBJECT',
        properties: {
          course_deg: { type: 'NUMBER', description: 'Runway heading or true course, degrees.' },
          wind_dir_deg: { type: 'NUMBER', description: 'Direction the wind is FROM, degrees.' },
          wind_speed_kt: { type: 'NUMBER', description: 'Wind speed, knots.' },
          tas_kt: { type: 'NUMBER', description: 'Optional true airspeed (kt) — adds WCA, heading and ground speed.' },
        },
        required: ['course_deg', 'wind_dir_deg', 'wind_speed_kt'],
      },
    },
  },
  compute_fuel: {
    run: fuel.compute,
    declaration: {
      name: 'compute_fuel',
      description:
        'Fuel endurance and range: total endurance, fuel a reserve holds ' +
        'back, usable endurance, still-air range. Supply reserve_minutes from ' +
        'the regulation you retrieved for the flight (do not guess it).',
      parameters: {
        type: 'OBJECT',
        properties: {
          fuel_on_board: { type: 'NUMBER', description: 'Usable fuel on board.' },
          burn_rate_per_hour: { type: 'NUMBER', description: 'Cruise burn per hour, same unit.' },
          reserve_minutes: { type: 'NUMBER', description: 'Reserve to hold back, minutes (from the retrieved regulation).' },
          ground_speed_kt: { type: 'NUMBER', description: 'Optional ground speed (kt) — adds still-air range.' },
          unit: { type: 'STRING', description: "Fuel unit label, e.g. 'L', 'USG', 'kg'." },
        },
        required: ['fuel_on_board', 'burn_rate_per_hour'],
      },
    },
  },
  compute_weight_balance: {
    run: weightbalance.compute,
    declaration: {
      name: 'compute_weight_balance',
      description:
        'Weight & balance: per-station moments, total weight, total moment ' +
        'and centre of gravity. Optional POH limits (max_weight, ' +
        'forward/aft_cg_limit) add inside/outside-limits checks.',
      parameters: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            description: 'Loading stations.',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                weight: { type: 'NUMBER' },
                arm: { type: 'NUMBER' },
              },
              required: ['weight', 'arm'],
            },
          },
          max_weight: { type: 'NUMBER', description: 'Optional max gross weight (POH).' },
          forward_cg_limit: { type: 'NUMBER', description: 'Optional forward CG limit (POH).' },
          aft_cg_limit: { type: 'NUMBER', description: 'Optional aft CG limit (POH).' },
        },
        required: ['items'],
      },
    },
  },
  check_recency: {
    run: recency.compute,
    declaration: {
      name: 'check_recency',
      description:
        'Rolling-window recency date math (e.g. takeoffs/landings to carry ' +
        'passengers): events counted in the window, requirement met or not, ' +
        'and the lapse date. Supply required_count and window_days from the ' +
        'GACAR Part 61 rule you retrieved — this tool only does the calendar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          event_dates: {
            type: 'ARRAY',
            description: "ISO dates, one per qualifying event ('2026-05-14'). A flight with 3 landings contributes its date 3 times.",
            items: { type: 'STRING' },
          },
          required_count: { type: 'INTEGER', description: 'Events required in the window (from the retrieved rule).' },
          window_days: { type: 'INTEGER', description: 'Window length in days (from the retrieved rule).' },
          today: { type: 'STRING', description: "Optional evaluation date, ISO ('YYYY-MM-DD')." },
        },
        required: ['event_dates'],
      },
    },
  },
  compute_density_altitude: {
    run: density.compute,
    declaration: {
      name: 'compute_density_altitude',
      description:
        'Pressure altitude and density altitude from field elevation, QNH and ' +
        'OAT — the performance-planning numbers.',
      parameters: {
        type: 'OBJECT',
        properties: {
          field_elevation_ft: { type: 'NUMBER', description: 'Field elevation, feet.' },
          qnh: { type: 'NUMBER', description: 'QNH value.' },
          qnh_unit: { type: 'STRING', description: "'hpa' (default) or 'inhg'." },
          oat_c: { type: 'NUMBER', description: 'Outside air temperature, °C.' },
        },
        required: ['field_elevation_ft', 'qnh', 'oat_c'],
      },
    },
  },
};

const DECLARATIONS = Object.values(TOOLS).map((t) => t.declaration);

function has(name) { return Object.prototype.hasOwnProperty.call(TOOLS, name); }

function run(name, args) {
  if (!has(name)) return { error: `unknown compute tool: ${name}` };
  try {
    return TOOLS[name].run(args || {});
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

module.exports = { TOOLS, DECLARATIONS, has, run };
