/* ============================================================================
 * Captain Adel — pressure / density altitude compute tool (pure, zero-dep).
 *
 * Mirrors Fly GACA's tools-e6b.js density-altitude math:
 *   PA  = elevation + (29.92 − QNH_inHg) × 1000   (or 1013.25 hPa × 27.3 ft)
 *   ISA = 15 − 1.98 × PA/1000;  DA = PA + 118.8 × (OAT − ISA)
 * ==========================================================================*/

'use strict';

/**
 * compute({ field_elevation_ft, qnh, qnh_unit?, oat_c })
 *   qnh_unit — 'hpa' (default) or 'inhg'
 */
function compute(args = {}) {
  const elev = Number(args.field_elevation_ft);
  const qnh = Number(args.qnh);
  const oat = Number(args.oat_c);
  const unit = String(args.qnh_unit || 'hpa').toLowerCase();

  if (![elev, qnh, oat].every(Number.isFinite)) {
    return { error: 'field_elevation_ft, qnh and oat_c are required numbers' };
  }
  if (unit !== 'hpa' && unit !== 'inhg') return { error: "qnh_unit must be 'hpa' or 'inhg'" };

  const pa = unit === 'inhg'
    ? elev + (29.92 - qnh) * 1000
    : elev + (1013.25 - qnh) * 27.3;
  const isaTemp = 15 - 1.98 * pa / 1000;
  const isaDev = oat - isaTemp;
  const da = pa + 118.8 * isaDev;

  const steps = [
    {
      label: 'pressure altitude',
      expr: unit === 'inhg'
        ? `${elev} + (29.92 − ${qnh}) × 1000`
        : `${elev} + (1013.25 − ${qnh}) × 27.3`,
      value: Math.round(pa), unit: 'ft',
    },
    { label: 'ISA temperature at PA', expr: `15 − 1.98 × ${Math.round(pa)}/1000`, value: Math.round(isaTemp * 10) / 10, unit: '°C' },
    { label: 'ISA deviation', expr: `${oat} − ${Math.round(isaTemp * 10) / 10}`, value: Math.round(isaDev * 10) / 10, unit: '°C' },
    { label: 'density altitude', expr: `${Math.round(pa)} + 118.8 × ${Math.round(isaDev * 10) / 10}`, value: Math.round(da), unit: 'ft' },
  ];

  return {
    inputs: { field_elevation_ft: elev, qnh, qnh_unit: unit, oat_c: oat },
    steps,
    result: {
      pressure_altitude_ft: Math.round(pa),
      density_altitude_ft: Math.round(da),
      isa_deviation_c: Math.round(isaDev * 10) / 10,
      performance_degraded: isaDev > 0,
    },
  };
}

module.exports = { compute };
