/* ============================================================================
 * Captain Adel — Flight Computer & Navigation Tools.
 * Interactive calculations with GACAR standard formulas:
 *  - Wind & Crosswind components + WCA + Groundspeed
 *  - Fuel planning + GACAR §91.151 legal reserves
 *  - Density Altitude, Pressure Altitude & ISA Deviation
 *  - Weight & Balance (CG envelope & limits)
 *  - Pilot recency & currency tracker (§61.57)
 * ==========================================================================*/

(() => {
  'use strict';

  const isAr = () => document.documentElement.lang === 'ar';
  const deg2rad = (d) => (d * Math.PI) / 180;
  const rad2deg = (r) => (r * 180) / Math.PI;

  /* ---- Tab switching ------------------------------------------------------ */
  const tabs = document.querySelectorAll('.tool-tab');
  const cards = document.querySelectorAll('.tool-card');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      cards.forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = document.getElementById(`pane-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });

  /* ---- Tool 1: Wind & Crosswind ------------------------------------------- */
  const rwyInput = document.getElementById('w-rwy');
  const wdirInput = document.getElementById('w-dir');
  const wspdInput = document.getElementById('w-spd');
  const wtasInput = document.getElementById('w-tas');

  const valRwy = document.getElementById('val-rwy');
  const valWdir = document.getElementById('val-wdir');
  const resXw = document.getElementById('res-xw');
  const resXwDir = document.getElementById('res-xw-dir');
  const resHw = document.getElementById('res-hw');
  const resHwSub = document.getElementById('res-hw-sub');
  const resWca = document.getElementById('res-wca');
  const resHdg = document.getElementById('res-hdg');
  const resGs = document.getElementById('res-gs');
  const rwyNeedle = document.getElementById('runway-needle');
  const windNeedle = document.getElementById('wind-needle');
  const askWind = document.getElementById('ask-wind');

  function calcWind() {
    if (!rwyInput || !wdirInput) return;
    const rwyHdg = parseFloat(rwyInput.value) || 0;
    const windDir = parseFloat(wdirInput.value) || 0;
    const windSpd = parseFloat(wspdInput.value) || 0;
    const tas = parseFloat(wtasInput.value) || 100;

    const rwyNum = Math.round(rwyHdg / 10);
    const rwyStr = String(rwyNum).padStart(2, '0');
    valRwy.textContent = `${rwyHdg}° (RWY ${rwyStr})`;
    valWdir.textContent = `${windDir}°`;

    // Angle diff normalized -180 to 180
    let diff = (windDir - rwyHdg) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    const rad = deg2rad(diff);
    const xw = Math.abs(windSpd * Math.sin(rad));
    const hw = windSpd * Math.cos(rad);

    resXw.textContent = `${xw.toFixed(1)} kt`;
    if (diff > 0) {
      resXwDir.textContent = isAr() ? 'رياح من اليمين' : 'Right crosswind';
    } else if (diff < 0) {
      resXwDir.textContent = isAr() ? 'رياح من اليسار' : 'Left crosswind';
    } else {
      resXwDir.textContent = isAr() ? 'رياح محاذية مباشرة' : 'Direct aligned';
    }

    if (hw >= 0) {
      resHw.textContent = `${hw.toFixed(1)} kt`;
      resHwSub.textContent = isAr() ? 'مركبة رياح مقابلة' : 'Headwind component';
      resHw.className = 'tele-val highlight-mint';
    } else {
      resHw.textContent = `${Math.abs(hw).toFixed(1)} kt`;
      resHwSub.textContent = isAr() ? '⚠️ رياح خلفية (Tailwind)' : '⚠️ Tailwind component';
      resHw.className = 'tele-val highlight-gold';
    }

    // WCA
    let wca = 0;
    if (tas > 0 && xw <= tas) {
      const sinWca = xw / tas;
      wca = rad2deg(Math.asin(sinWca));
      if (diff < 0) wca = -wca; // Left wind -> crab left (minus)
    }

    const compassHdg = Math.round((rwyHdg + wca + 360) % 360);
    resWca.textContent = `${wca >= 0 ? '+' : ''}${wca.toFixed(1)}°`;
    resHdg.textContent = isAr() ? `الاتجاه المطلوب: ${compassHdg}°` : `Heading to fly: ${compassHdg}°`;

    // Estimated ground speed
    const gs = Math.max(0, Math.round(tas - hw));
    resGs.textContent = `${gs} kt`;

    // Rotate Visual Dial
    if (rwyNeedle) rwyNeedle.style.transform = `translate(-50%, -50%) rotate(${rwyHdg}deg)`;
    if (windNeedle) windNeedle.style.transform = `translate(-50%, -50%) rotate(${windDir}deg)`;

    if (askWind) {
      const query = `Calculate crosswind: Runway ${rwyStr} (${rwyHdg} deg), wind ${windDir} at ${windSpd} kt, TAS ${tas} kt`;
      askWind.href = `chat.html?q=${encodeURIComponent(query)}`;
    }
  }

  if (rwyInput) {
    [rwyInput, wdirInput, wspdInput, wtasInput].forEach((el) => {
      if (el) el.addEventListener('input', calcWind);
    });
  }

  /* ---- Tool 2: Fuel Planning ---------------------------------------------- */
  const fBurn = document.getElementById('f-burn');
  const fOnboard = document.getElementById('f-onboard');
  const fTime = document.getElementById('f-time');
  const fRule = document.getElementById('f-rule');

  const resFTrip = document.getElementById('res-f-trip');
  const resFTripTime = document.getElementById('res-f-triptime');
  const resFRes = document.getElementById('res-f-res');
  const resFResLabel = document.getElementById('res-f-reslabel');
  const resFMin = document.getElementById('res-f-min');
  const resFStatus = document.getElementById('res-f-status');
  const resFEndurance = document.getElementById('res-f-endurance');

  const barTrip = document.getElementById('bar-trip');
  const barReserve = document.getElementById('bar-reserve');
  const barMargin = document.getElementById('bar-margin');
  const askFuel = document.getElementById('ask-fuel');

  function calcFuel() {
    if (!fBurn || !fOnboard) return;
    const burn = parseFloat(fBurn.value) || 1;
    const onboard = parseFloat(fOnboard.value) || 0;
    const timeMin = parseFloat(fTime.value) || 0;
    const reserveMin = parseFloat(fRule.value) || 30;

    const tripFuel = (timeMin / 60) * burn;
    const reserveFuel = (reserveMin / 60) * burn;
    const totalRequired = tripFuel + reserveFuel;

    const hrs = Math.floor(timeMin / 60);
    const mins = Math.round(timeMin % 60);
    resFTrip.textContent = `${tripFuel.toFixed(1)} L`;
    resFTripTime.textContent = isAr() ? `زمن: ${hrs} س ${mins} د` : `Time: ${hrs}h ${mins}m`;

    resFRes.textContent = `${reserveFuel.toFixed(1)} L`;
    resFResLabel.textContent = isAr() ? `احتياطي ${reserveMin} دقيقة` : `${reserveMin} min reserve`;

    resFMin.textContent = `${totalRequired.toFixed(1)} L`;

    const totalEnduranceHrs = onboard / burn;
    const endH = Math.floor(totalEnduranceHrs);
    const endM = Math.round((totalEnduranceHrs - endH) * 60);
    resFEndurance.textContent = isAr()
      ? `مدة الطيران الكلية: ${endH} س ${endM} د`
      : `Total endurance: ${endH}h ${endM}m`;

    if (onboard >= totalRequired) {
      const margin = onboard - totalRequired;
      resFStatus.textContent = isAr() ? 'نظامي ومطابق ✓' : 'LEGAL ✓';
      resFStatus.className = 'tele-val highlight-mint';

      if (barTrip && barReserve && barMargin) {
        const pTrip = Math.min(100, (tripFuel / onboard) * 100);
        const pRes = Math.min(100 - pTrip, (reserveFuel / onboard) * 100);
        const pMar = Math.max(0, 100 - pTrip - pRes);
        barTrip.style.width = `${pTrip}%`;
        barReserve.style.width = `${pRes}%`;
        barMargin.style.width = `${pMar}%`;
      }
    } else {
      resFStatus.textContent = isAr() ? '⚠️ وقود غير كافٍ' : '⚠️ INSUFFICIENT';
      resFStatus.className = 'tele-val highlight-gold';
      if (barTrip && barReserve && barMargin) {
        barTrip.style.width = '70%';
        barReserve.style.width = '30%';
        barMargin.style.width = '0%';
      }
    }

    if (askFuel) {
      const q = `Fuel check for ${timeMin} min flight with ${burn} L/h burn and ${onboard} L onboard under GACAR §91.151`;
      askFuel.href = `chat.html?q=${encodeURIComponent(q)}`;
    }
  }

  if (fBurn) {
    [fBurn, fOnboard, fTime, fRule].forEach((el) => {
      if (el) el.addEventListener('input', calcFuel);
    });
  }

  /* ---- Tool 3: Density Altitude ------------------------------------------- */
  const dElev = document.getElementById('d-elev');
  const dOat = document.getElementById('d-oat');
  const dQnh = document.getElementById('d-qnh');

  const valDelev = document.getElementById('val-delev');
  const valDoat = document.getElementById('val-doat');
  const valDqnh = document.getElementById('val-dqnh');

  const resDa = document.getElementById('res-da');
  const resDaWarn = document.getElementById('res-da-warn');
  const resPa = document.getElementById('res-pa');
  const resIsa = document.getElementById('res-isa');
  const resDisa = document.getElementById('res-disa');
  const resSpread = document.getElementById('res-spread');
  const askDensity = document.getElementById('ask-density');

  function calcDensity() {
    if (!dElev || !dOat) return;
    const elev = parseFloat(dElev.value) || 0;
    const oat = parseFloat(dOat.value) || 0;
    const qnh = parseFloat(dQnh.value) || 1013.25;

    valDelev.textContent = `${elev.toLocaleString()} ft`;
    valDoat.textContent = `${oat}°C`;
    valDqnh.textContent = `${qnh} hPa`;

    // Pressure altitude PA = Elevation + (1013.25 - QNH) * 30 (approx 27-30 ft per hPa)
    const pa = Math.round(elev + (1013.25 - qnh) * 30);
    // Standard ISA temperature at PA
    const isa = 15 - 1.98 * (pa / 1000);
    const dIsa = oat - isa;
    // Density Altitude DA = PA + 118.8 * (OAT - ISA)
    const da = Math.round(pa + 118.8 * dIsa);

    resPa.textContent = `${pa.toLocaleString()} ft`;
    resIsa.textContent = `${isa.toFixed(1)}°C`;
    resDisa.textContent = `${dIsa >= 0 ? '+' : ''}${dIsa.toFixed(1)}°C`;

    const spread = da - elev;
    resSpread.textContent = `${spread >= 0 ? '+' : ''}${spread.toLocaleString()} ft`;
    resDa.textContent = `${da.toLocaleString()} ft`;

    if (dIsa > 15 || da > elev + 1500) {
      resDa.className = 'da-big-num highlight-gold';
      resDaWarn.textContent = isAr()
        ? `⚠️ أداء منخفض: مسافة الإقلاع تزداد بنسبة تقارب ${Math.round(dIsa * 1.3)}%`
        : `⚠️ Degraded performance: Takeoff roll increased by ≈ ${Math.round(dIsa * 1.3)}%`;
      resDaWarn.style.color = 'var(--gold-soft)';
    } else {
      resDa.className = 'da-big-num highlight-cyan';
      resDaWarn.textContent = isAr() ? '✓ أداء الطائرة ضمن النطاق الطبيعي' : '✓ Normal atmospheric performance range';
      resDaWarn.style.color = 'var(--sage)';
    }

    if (askDensity) {
      const q = `Calculate density altitude and takeoff performance impact for field elevation ${elev} ft, OAT ${oat} C, QNH ${qnh} hPa`;
      askDensity.href = `chat.html?q=${encodeURIComponent(q)}`;
    }
  }

  if (dElev) {
    [dElev, dOat, dQnh].forEach((el) => {
      if (el) el.addEventListener('input', calcDensity);
    });
  }

  /* ---- Tool 4: Weight & Balance ------------------------------------------- */
  const wbEmptyWt = document.getElementById('wb-empty-wt');
  const wbEmptyArm = document.getElementById('wb-empty-arm');
  const wbPaxWt = document.getElementById('wb-pax-wt');
  const wbPaxArm = document.getElementById('wb-pax-arm');
  const wbFuelWt = document.getElementById('wb-fuel-wt');
  const wbFuelArm = document.getElementById('wb-fuel-arm');
  const wbBagWt = document.getElementById('wb-bag-wt');
  const wbBagArm = document.getElementById('wb-bag-arm');

  const resWbTotal = document.getElementById('res-wb-total');
  const resWbCg = document.getElementById('res-wb-cg');
  const resWbMoment = document.getElementById('res-wb-moment');
  const resWbStatus = document.getElementById('res-wb-status');
  const cgMarker = document.getElementById('cg-marker');
  const askWb = document.getElementById('ask-wb');

  function calcWb() {
    if (!wbEmptyWt) return;
    const eW = parseFloat(wbEmptyWt.value) || 0;
    const eA = parseFloat(wbEmptyArm.value) || 0;

    const pW = parseFloat(wbPaxWt.value) || 0;
    const pA = parseFloat(wbPaxArm.value) || 0;

    const fW = parseFloat(wbFuelWt.value) || 0;
    const fA = parseFloat(wbFuelArm.value) || 0;

    const bW = parseFloat(wbBagWt.value) || 0;
    const bA = parseFloat(wbBagArm.value) || 0;

    const totalWeight = eW + pW + fW + bW;
    const totalMoment = (eW * eA) + (pW * pA) + (fW * fA) + (bW * bA);
    const cg = totalWeight > 0 ? totalMoment / totalWeight : 0;

    resWbTotal.textContent = `${totalWeight.toLocaleString()} kg`;
    resWbMoment.textContent = Math.round(totalMoment).toLocaleString();
    resWbCg.textContent = `${cg.toFixed(1)} cm`;

    // Standard aircraft limits for reference envelope: 82 to 95 cm, max 1050 kg
    const forwardLimit = 82;
    const aftLimit = 95;
    const maxWeight = 1050;

    const withinCg = cg >= forwardLimit && cg <= aftLimit;
    const withinWeight = totalWeight <= maxWeight;

    if (withinCg && withinWeight) {
      resWbStatus.textContent = isAr() ? 'ضمن الحدود الآمنة ✓' : 'IN LIMITS ✓';
      resWbStatus.className = 'tele-val highlight-mint';
    } else if (!withinWeight) {
      resWbStatus.textContent = isAr() ? '⚠️ تجاوز الوزن الأقصى' : '⚠️ OVERWEIGHT';
      resWbStatus.className = 'tele-val highlight-gold';
    } else {
      resWbStatus.textContent = isAr() ? '⚠️ خارج نطاق الاتزان' : '⚠️ OUT OF CG';
      resWbStatus.className = 'tele-val highlight-gold';
    }

    // Move CG Marker inside visual box
    if (cgMarker) {
      // Map 75..100 cm to 0%..100% horizontally, and 500..1200 kg to 100%..0% vertically
      const leftPct = Math.max(5, Math.min(95, ((cg - 78) / (100 - 78)) * 100));
      const topPct = Math.max(5, Math.min(95, 100 - ((totalWeight - 500) / (1150 - 500)) * 100));
      cgMarker.style.left = `${leftPct}%`;
      cgMarker.style.top = `${topPct}%`;
      cgMarker.style.background = withinCg && withinWeight ? 'var(--mint)' : 'var(--flag)';
    }

    if (askWb) {
      const q = `Check weight and balance: total weight ${totalWeight} kg, CG ${cg.toFixed(1)} cm, moment ${Math.round(totalMoment)}`;
      askWb.href = `chat.html?q=${encodeURIComponent(q)}`;
    }
  }

  if (wbEmptyWt) {
    [wbEmptyWt, wbEmptyArm, wbPaxWt, wbPaxArm, wbFuelWt, wbFuelArm, wbBagWt, wbBagArm].forEach((el) => {
      if (el) el.addEventListener('input', calcWb);
    });
  }

  /* ---- Tool 5: Pilot Recency §61.57 --------------------------------------- */
  const recDay = document.getElementById('rec-day-landings');
  const recNight = document.getElementById('rec-night-landings');
  const recDate = document.getElementById('rec-last-date');

  const cardDayStatus = document.getElementById('card-day-status');
  const cardNightStatus = document.getElementById('card-night-status');
  const resDayCur = document.getElementById('res-day-cur');
  const resNightCur = document.getElementById('res-night-cur');
  const resExpDate = document.getElementById('res-exp-date');
  const resDaysLeft = document.getElementById('res-days-left');

  function calcRecency() {
    if (!recDay || !recNight || !recDate) return;
    const dayL = parseInt(recDay.value, 10) || 0;
    const nightL = parseInt(recNight.value, 10) || 0;

    let baseDate = recDate.value ? new Date(recDate.value) : new Date();
    if (isNaN(baseDate.getTime())) baseDate = new Date();

    const expDate = new Date(baseDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const msLeft = expDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    const dayPass = dayL >= 3;
    const nightPass = nightL >= 3;

    if (dayPass) {
      resDayCur.textContent = isAr() ? 'سارية المفعول (٣+ هبوطات) ✓' : 'CURRENT (3+ Landings) ✓';
      cardDayStatus.className = 'currency-card current';
    } else {
      const shortfall = 3 - dayL;
      resDayCur.textContent = isAr() ? `غير سارية (ينقص ${shortfall} هبوط)` : `NOT CURRENT (${shortfall} needed)`;
      cardDayStatus.className = 'currency-card expired';
    }

    if (nightPass) {
      resNightCur.textContent = isAr() ? 'سارية المفعول (توقف كامل) ✓' : 'CURRENT (Full Stop) ✓';
      cardNightStatus.className = 'currency-card current';
    } else {
      const shortfall = 3 - nightL;
      resNightCur.textContent = isAr() ? `غير سارية ليلاً (ينقص ${shortfall})` : `NOT CURRENT (${shortfall} needed)`;
      cardNightStatus.className = 'currency-card expired';
    }

    resExpDate.textContent = expDate.toISOString().split('T')[0];
    if (daysLeft > 0) {
      resDaysLeft.textContent = isAr() ? `${daysLeft} يوماً` : `${daysLeft} days`;
      resDaysLeft.className = 'tele-val highlight-cyan';
    } else {
      resDaysLeft.textContent = isAr() ? 'منتهية ⚠️' : 'EXPIRED ⚠️';
      resDaysLeft.className = 'tele-val highlight-gold';
    }
  }

  if (recDay && recDate) {
    // Default to today
    recDate.value = new Date().toISOString().split('T')[0];
    [recDay, recNight, recDate].forEach((el) => {
      if (el) el.addEventListener('input', calcRecency);
    });
  }

  /* ---- Kneeboard Export & Print Functionality ------------------------------ */
  const btnExportKneeboard = document.getElementById('btn-export-kneeboard');
  const kbSheet = document.getElementById('kneeboard-sheet');

  function updateKneeboard() {
    if (!kbSheet) return;
    const now = new Date();
    const utcStr = now.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

    const kbDt = document.getElementById('kb-dt');
    if (kbDt) kbDt.textContent = utcStr;

    // Wind
    const rwyVal = valRwy ? valRwy.textContent : 'RWY 24';
    const wdirVal = valWdir ? valWdir.textContent : '270°';
    const wspdVal = wspdInput ? wspdInput.value + ' kt' : '20 kt';
    const tasVal = wtasInput ? wtasInput.value + ' kt' : '110 kt';
    const xwVal = resXw ? resXw.textContent : '';
    const xwDirVal = resXwDir ? resXwDir.textContent : '';
    const hwVal = resHw ? resHw.textContent : '';
    const hwSubVal = resHwSub ? resHwSub.textContent : '';
    const wcaVal = resWca ? resWca.textContent : '';
    const hdgVal = resHdg ? resHdg.textContent : '';
    const gsVal = resGs ? resGs.textContent : '';

    const kbRwy = document.getElementById('kb-rwy');
    const kbWind = document.getElementById('kb-wind');
    const kbXw = document.getElementById('kb-xw');
    const kbHw = document.getElementById('kb-hw');
    const kbWca = document.getElementById('kb-wca');
    const kbGs = document.getElementById('kb-gs');

    if (kbRwy) kbRwy.textContent = `${rwyVal}`;
    if (kbWind) kbWind.textContent = `${wdirVal} @ ${wspdVal} (TAS: ${tasVal})`;
    if (kbXw) kbXw.textContent = `${xwVal} (${xwDirVal})`;
    if (kbHw) kbHw.textContent = `${hwVal} (${hwSubVal})`;
    if (kbWca) kbWca.textContent = `${wcaVal} (${hdgVal})`;
    if (kbGs) kbGs.textContent = `${gsVal}`;

    // Fuel
    const kbFOnboard = document.getElementById('kb-f-onboard');
    const kbFBurn = document.getElementById('kb-f-burn');
    const kbFTrip = document.getElementById('kb-f-trip');
    const kbFRes = document.getElementById('kb-f-res');
    const kbFMin = document.getElementById('kb-f-min');
    const kbFEnd = document.getElementById('kb-f-end');

    if (kbFOnboard) kbFOnboard.textContent = `${fOnboard ? fOnboard.value : '140'} L`;
    if (kbFBurn) kbFBurn.textContent = `${fBurn ? fBurn.value : '35'} L/h`;
    if (kbFTrip) kbFTrip.textContent = `${resFTrip ? resFTrip.textContent : ''} (${resFTripTime ? resFTripTime.textContent : ''})`;
    if (kbFRes) kbFRes.textContent = `${resFRes ? resFRes.textContent : ''} (${resFResLabel ? resFResLabel.textContent : ''})`;
    if (kbFMin) kbFMin.textContent = `${resFMin ? resFMin.textContent : ''}`;
    if (kbFEnd) kbFEnd.textContent = `${resFEndurance ? resFEndurance.textContent : ''} (${resFStatus ? resFStatus.textContent : ''})`;

    // Density
    const kbElev = document.getElementById('kb-elev');
    const kbQnh = document.getElementById('kb-qnh');
    const kbOat = document.getElementById('kb-oat');
    const kbPa = document.getElementById('kb-pa');
    const kbDa = document.getElementById('kb-da');
    const kbDisa = document.getElementById('kb-disa');

    if (kbElev) kbElev.textContent = `${valDelev ? valDelev.textContent : ''}`;
    if (kbQnh) kbQnh.textContent = `${valDqnh ? valDqnh.textContent : ''}`;
    if (kbOat) kbOat.textContent = `${valDoat ? valDoat.textContent : ''}`;
    if (kbPa) kbPa.textContent = `${resPa ? resPa.textContent : ''}`;
    if (kbDa) kbDa.textContent = `${resDa ? resDa.textContent : ''} (${resSpread ? resSpread.textContent : ''})`;
    if (kbDisa) kbDisa.textContent = `${resDisa ? resDisa.textContent : ''}`;

    // W&B
    const kbWbWt = document.getElementById('kb-wb-wt');
    const kbWbCg = document.getElementById('kb-wb-cg');
    const kbWbMom = document.getElementById('kb-wb-mom');
    const kbWbStatus = document.getElementById('kb-wb-status');

    if (kbWbWt) kbWbWt.textContent = `${resWbTotal ? resWbTotal.textContent : ''}`;
    if (kbWbCg) kbWbCg.textContent = `${resWbCg ? resWbCg.textContent : ''}`;
    if (kbWbMom) kbWbMom.textContent = `${resWbMoment ? resWbMoment.textContent : ''} kg·cm`;
    if (kbWbStatus) kbWbStatus.textContent = `${resWbStatus ? resWbStatus.textContent : ''}`;

    // Recency
    const kbRecDay = document.getElementById('kb-rec-day');
    const kbRecNight = document.getElementById('kb-rec-night');
    const kbRecExp = document.getElementById('kb-rec-exp');

    if (kbRecDay) kbRecDay.textContent = `${resDayCur ? resDayCur.textContent : ''}`;
    if (kbRecNight) kbRecNight.textContent = `${resNightCur ? resNightCur.textContent : ''}`;
    if (kbRecExp) kbRecExp.textContent = `${resExpDate ? resExpDate.textContent : ''} (${resDaysLeft ? resDaysLeft.textContent : ''})`;
  }

  if (btnExportKneeboard) {
    btnExportKneeboard.addEventListener('click', () => {
      updateKneeboard();
      if (kbSheet) kbSheet.hidden = false;
      window.print();
    });
  }

  // Initial runs
  calcWind();
  calcFuel();
  calcDensity();
  calcWb();
  calcRecency();
  updateKneeboard();
})();
