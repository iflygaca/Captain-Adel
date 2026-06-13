/* ============================================================================
 * Captain Adel — wind triangle / crosswind compute tool (pure, zero-dep).
 *
 * One tool covers both classic problems:
 *   - runway components: crosswind / headwind for a runway heading
 *   - wind triangle (when TAS is given): wind-correction angle, heading, GS
 *
 * The math mirrors Fly GACA's client calculators (tools-crosswind.js /
 * tools-e6b.js) but is re-implemented here so captadel stays self-contained.
 * Returns { inputs, steps, result } — `steps` lets the model show its working.
 * Regulatory limits (e.g. a POH crosswind limit) are NOT encoded here; the
 * model cites those from retrieval.
 * ==========================================================================*/

'use strict';

const D2R = Math.PI / 180;

function norm360(d) { return ((d % 360) + 360) % 360; }
function round1(x) { return Math.round(x * 10) / 10; }

/* Smallest signed angle a-b in (-180, 180]. */
function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * compute({ course_deg, wind_dir_deg, wind_speed_kt, tas_kt? })
 *   course_deg    — runway heading (or true course when solving the triangle)
 *   wind_dir_deg  — direction the wind is FROM (deg)
 *   wind_speed_kt — wind speed (kt)
 *   tas_kt        — optional true airspeed; adds WCA / heading / ground speed
 */
function compute(args = {}) {
  const course = Number(args.course_deg);
  const wdir = Number(args.wind_dir_deg);
  const wspd = Number(args.wind_speed_kt);
  const tas = args.tas_kt === undefined || args.tas_kt === null ? null : Number(args.tas_kt);

  if (![course, wdir, wspd].every(Number.isFinite) || wspd < 0) {
    return { error: 'course_deg, wind_dir_deg and wind_speed_kt are required numbers' };
  }
  if (tas !== null && (!Number.isFinite(tas) || tas <= 0)) {
    return { error: 'tas_kt must be a positive number when given' };
  }

  const inputs = { course_deg: norm360(course), wind_dir_deg: norm360(wdir), wind_speed_kt: wspd };
  const steps = [];

  const ang = angleDiff(wdir, course);               // + = wind from the right
  steps.push({
    label: 'wind angle off the nose', expr: `${norm360(wdir)}° − ${norm360(course)}°`,
    value: round1(ang), unit: '°',
  });

  const xw = wspd * Math.sin(ang * D2R);
  const hw = wspd * Math.cos(ang * D2R);
  steps.push({
    label: 'crosswind component', expr: `${wspd} × sin(${round1(ang)}°)`,
    value: round1(Math.abs(xw)), unit: `kt from the ${xw >= 0 ? 'right' : 'left'}`,
  });
  steps.push({
    label: hw >= 0 ? 'headwind component' : 'tailwind component',
    expr: `${wspd} × cos(${round1(ang)}°)`,
    value: round1(Math.abs(hw)), unit: 'kt',
  });

  const result = {
    crosswind_kt: round1(Math.abs(xw)),
    crosswind_from: xw >= 0 ? 'right' : 'left',
    headwind_kt: hw >= 0 ? round1(hw) : 0,
    tailwind_kt: hw < 0 ? round1(-hw) : 0,
  };

  if (tas !== null) {
    inputs.tas_kt = tas;
    let sinWca = wspd * Math.sin(ang * D2R) / tas;
    sinWca = Math.max(-1, Math.min(1, sinWca));
    const wca = Math.asin(sinWca) / D2R;
    const hdg = norm360(course + wca);
    const gs = tas * Math.cos(wca * D2R) - wspd * Math.cos(ang * D2R);
    steps.push({
      label: 'wind-correction angle', expr: `asin(${wspd} × sin(${round1(ang)}°) / ${tas})`,
      value: round1(Math.abs(wca)), unit: `° ${wca >= 0 ? 'right' : 'left'}`,
    });
    steps.push({
      label: 'heading to fly', expr: `${norm360(course)}° ${wca >= 0 ? '+' : '−'} ${round1(Math.abs(wca))}°`,
      value: Math.round(hdg), unit: '°',
    });
    steps.push({
      label: 'ground speed', expr: `${tas} × cos(WCA) − ${wspd} × cos(${round1(ang)}°)`,
      value: Math.round(gs), unit: 'kt',
    });
    result.wind_correction_angle_deg = round1(wca);
    result.heading_deg = Math.round(hdg);
    result.ground_speed_kt = Math.round(gs);
  }

  return { inputs, steps, result };
}

module.exports = { compute, angleDiff, norm360 };
