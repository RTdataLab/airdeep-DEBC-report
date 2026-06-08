/* ============================================================
   장애인기업종합지원센터 전국 통합 월간 모니터링 리포트

   데이터 파일명은 아래 DATA_FILES 설정표에서 관리합니다.
   데이터팀이 보낸 CSV를 그 이름 그대로 data/ 폴더에 넣으면
   새로고침 시 리포트가 자동 갱신됩니다. (파일명이 바뀌면 설정표만 수정)
   ============================================================ */

const OUTDOOR_KEY = '최고기온(℃)';
const LC = ['#2D6BFF','#E5484D','#22C55E','#F59E0B','#7C3AED','#0F766E','#BE185D','#0EA5E9','#78716C','#DB2777'];
const GRID = '#EEF1F6';
const HOT_TEMP = 28;
let HOLIDAYS = new Set();

/* ✏️ 데이터 파일 설정표 — 데이터팀 파일명을 그대로 적으면 됩니다. (CSV만 지원) */
const DATA_FILES = {
  tempHQ:       '3-1.csv',  // 섹션3-1 — 본사 대표(서울 3층) 실내온도
  tempRegional: '3-2.csv',  // 섹션3-2 — 지역센터 대표(부천) 실내온도
  tempGachi:    '3-3.csv',  // 섹션3-3 — 가치만드소 대표(광주) 실내온도
  operHQ:       '4-1.csv',  // 섹션4-1 — 서울 본사 구역별 가동시간
  operNorth:    '4-2.csv',  // 섹션4-2 — 지역센터 북부 가동시간
  operMiddle:   '4-3.csv',  // 섹션4-3 — 지역센터 중부 가동시간
  operSouth:    '4-4.csv',  // 섹션4-4 — 지역센터 남부 가동시간
  operGachi:    '4-5.csv',  // 섹션4-5 — 가치만드소 가동시간
  incWork:      '5-1.csv',  // 섹션5-1 — 전월대비 증가 TOP5(근무시간)
  incOff:       '5-2.csv'   // 섹션5-2 — 전월대비 증가 TOP5(근무외)
};

/* ✏️ 공휴일 날짜 — 주말(토·일)은 자동 계산되고, 여기엔 공휴일만 적으면 됩니다.
   해당 날짜의 x축 라벨이 빨간색으로 표시됩니다. (매달 이 줄만 갱신) */
const PUBLIC_HOLIDAYS = ['2026-05-01', '2026-05-05', '2026-05-25']; // 근로자의날 · 어린이날 · 대체공휴일

function isHolidayDate(s){
  const m = String(s ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return false;
  const day = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getDay();
  return day === 0 || day === 6 || PUBLIC_HOLIDAYS.includes(m[0]);
}

function dataUrl(name){
  return `data/${name}?v=${Date.now()}`;
}

/* ── CSV 파서 ──────────────────────────────────────────────── */
function parseCSV(text){
  text = text.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  return lines.map(line => {
    const cells = []; let cur = '', inQ = false;
    for(let i=0;i<line.length;i++){
      const c = line[i];
      if(inQ){
        if(c === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else {
        if(c === '"') inQ = true;
        else if(c === ','){ cells.push(cur); cur = ''; }
        else cur += c;
      }
    }
    cells.push(cur);
    return cells.map(s => s.trim());
  });
}

function num(v){
  if(v === undefined || v === null || v === '') return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

function toSeriesMap(rows){
  const names = rows[0].slice(1);
  const map = {}; names.forEach(n => map[n] = []);
  const labels = [];
  for(let r=1;r<rows.length;r++){
    const d = rows[r][0] ?? '';
    const m = d.match(/(\d{4})-(\d{2})-(\d{2})/);
    labels.push(m ? String(Number(m[3])) : d);
    names.forEach((n,ci)=> map[n].push(num(rows[r][ci+1])));
  }
  return { names, map, labels };
}

function toObjects(rows){
  const header = rows[0];
  return rows.slice(1).map(row=>{
    const o = {}; header.forEach((h,i)=> o[h] = row[i] ?? ''); return o;
  });
}

/* ── 주말·공휴일 x축 빨간 라벨 ─────────────────────────────── */
function tickColor(){
  return ctx => HOLIDAYS.has(Number(ctx.tick.label)) ? '#E5484D' : '#5B6577';
}

/* ── 28℃ 이상 빨간 구역 플러그인 (온도 차트 전용) ──────────── */
const redZonePlugin = {
  id: 'redZone',
  beforeDraw(chart){
    if(!chart.options.plugins?.redZone?.enabled) return;
    const { ctx, chartArea, scales:{ y } } = chart;
    if(!chartArea || !y) return;
    const y28 = y.getPixelForValue(HOT_TEMP);
    if(y28 > chartArea.top){
      ctx.save();
      ctx.fillStyle = 'rgba(229,72,77,0.08)';
      ctx.fillRect(chartArea.left, chartArea.top, chartArea.right-chartArea.left, y28-chartArea.top);
      ctx.strokeStyle = 'rgba(229,72,77,0.35)';
      ctx.lineWidth = 1; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(chartArea.left,y28); ctx.lineTo(chartArea.right,y28); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
  }
};

/* x축: 5월 1~31일 전체 표시 */
const X_TICKS = { maxRotation:0, autoSkip:false, font:{size:8}, color:tickColor() };

/* ── 온도 라인 차트 (실외 점선 + 28℃ 빨간 구역) ───────────── */
function mkTempChart(canvasId, legendId, series){
  const el = document.getElementById(canvasId);
  if(!el) return;
  const innerNames = series.names.filter(n => n !== OUTDOOR_KEY);
  const datasets = innerNames.map((label,i)=>({
    label, data:series.map[label],
    borderColor:LC[i%LC.length], backgroundColor:'transparent',
    borderWidth:2, fill:false, spanGaps:true, tension:.35, pointRadius:0, pointHoverRadius:4
  }));
  if(series.map[OUTDOOR_KEY]){
    datasets.push({
      label:'실외 최고기온', data:series.map[OUTDOOR_KEY],
      borderColor:'#111827', backgroundColor:'transparent',
      borderWidth:1.8, borderDash:[5,4], fill:false, spanGaps:true, tension:.35, pointRadius:0, pointHoverRadius:4
    });
  }
  new Chart(el,{
    type:'line',
    data:{ labels:series.labels, datasets },
    plugins:[redZonePlugin],
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false}, redZone:{enabled:true},
        tooltip:{callbacks:{ title:items=>`${items[0].label}일`, label:c=>` ${c.dataset.label}: ${c.parsed.y}℃` }}
      },
      scales:{
        x:{ grid:{display:false}, ticks:X_TICKS },
        y:{ min:14, suggestedMax:34, ticks:{callback:v=>v+'℃',font:{size:9.5}}, grid:{color:GRID} }
      }
    }
  });
  if(legendId){
    const lg = document.getElementById(legendId);
    if(lg){
      lg.innerHTML = innerNames.map((n,i)=>`<span><i style="background:${LC[i%LC.length]}"></i>${n}</span>`).join('') +
        `<span><i style="background:#111827;height:0;border-top:2px dashed #111827;width:18px"></i>실외 최고기온</span>` +
        `<span><i style="background:rgba(229,72,77,0.15);border:1px dashed rgba(229,72,77,0.4);width:12px;height:12px;border-radius:2px"></i>28℃ 이상</span>`;
    }
  }
}

/* ── 가동시간 라인 차트 ─────────────────────────────────────── */
function mkOperLine(canvasId, legendId, series){
  const el = document.getElementById(canvasId);
  if(!el) return;
  new Chart(el,{
    type:'line',
    data:{ labels:series.labels, datasets:series.names.map((label,i)=>({
      label, data:series.map[label], borderColor:LC[i%LC.length], backgroundColor:'transparent',
      borderWidth:1.9, fill:false, spanGaps:true, tension:.35, pointRadius:0, pointHoverRadius:4
    })) },
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{ title:items=>`${items[0].label}일`, label:c=>` ${c.dataset.label}: ${c.parsed.y}h` }}
      },
      scales:{
        x:{ grid:{display:false}, ticks:X_TICKS },
        y:{ min:0, suggestedMax:6, ticks:{callback:v=>v+'h',font:{size:9.5}}, grid:{color:GRID} }
      }
    }
  });
  if(legendId){
    const lg = document.getElementById(legendId);
    if(lg) lg.innerHTML = series.names.map((n,i)=>`<span><i style="background:${LC[i%LC.length]}"></i>${n}</span>`).join('');
  }
}

function fmtNum(v, digits=1){
  const n = num(v) ?? 0;
  return n.toFixed(digits).replace(/\.?0+$/, '');
}
function fmtZoneName(v){
  return String(v || '')
    .replace(/^(본사|지역센터|가치만드소)_/, '')
    .replace(/_/g, ' ')
    .replace(/서울(?=\d)/g, '서울 ')
    .trim();
}

/* ── 전월 대비 증가 TOP5 표 ─────────────────────────────────── */
function fillIncreaseTable(tbodyId, rows){
  const tb = document.getElementById(tbodyId);
  if(!tb) return;
  const data = rows.map(r=>{
    const prevTot = num(r['총가동시간_시간_4월']) ?? 0;
    const curTot  = num(r['총가동시간_시간_5월']) ?? 0;
    const totDiff = num(r['총가동시간_증감']) ?? +(curTot-prevTot).toFixed(2);
    const pct = prevTot > 0 ? (totDiff / prevTot) * 100 : null;
    return {
      zone: fmtZoneName(r['HUB_NICKNAME'] || r['지역'] || ''),
      prevTot,
      curTot,
      totDiff,
      pct
    };
  }).filter(r=>r.zone).sort((a,b)=> b.totDiff - a.totDiff).slice(0,6);

  const diffCls = v => v>0 ? 'risk' : (v<0 ? 'ok-txt' : '');
  const sign = v => (v>0?'+':'') + fmtNum(v, 1);
  tb.innerHTML = data.map((r,i)=>{
    const rank = i===0 ? '<span class="rk1">1</span>' : `<span class="rkn">${i+1}</span>`;
    const pctTxt = r.pct == null ? '—' : `<span class="${diffCls(r.totDiff)}">${r.totDiff >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(r.pct), 1)}%</span>`;
    return `<tr>
      <td class="num">${rank}</td>
      <td class="inc-zone"><strong>${r.zone}</strong></td>
      <td class="num">${fmtNum(r.prevTot, 2)}</td>
      <td class="num">${fmtNum(r.curTot, 2)}</td>
      <td class="num ${diffCls(r.totDiff)}">${sign(r.totDiff)}</td>
      <td class="num inc-rate">${pctTxt}</td>
    </tr>`;
  }).join('');
}

/* ── 에러 표시 ─────────────────────────────────────────────── */
function showError(msg){
  const div = document.createElement('div');
  div.style.cssText = 'background:#FEECEC;border:1px solid #E5484D;color:#B91C1C;padding:14px 18px;border-radius:10px;margin:16px 0;font-size:13px;line-height:1.6';
  div.innerHTML = `<strong>데이터를 불러오지 못했습니다.</strong><br>${msg}<br><span style="color:#7A1F1F;font-size:12px">로컬 서버에서 열었는지, data 폴더의 CSV 파일명을 확인해 주세요.</span>`;
  document.body.prepend(div);
}

/* ── 메인 ──────────────────────────────────────────────────── */
async function main(){
  Chart.defaults.font.family = "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#5B6577';

  const keys = ['tempHQ','tempRegional','tempGachi','operHQ','operNorth','operMiddle','operSouth','operGachi','incWork','incOff'];
  let txt = {};
  try {
    const res = await Promise.all(keys.map(k=>fetch(dataUrl(DATA_FILES[k]))));
    res.forEach((r,i)=>{ if(!r.ok) throw new Error(`${DATA_FILES[keys[i]]} 응답 오류 (HTTP) — data 폴더의 파일명을 확인하세요`); });
    const texts = await Promise.all(res.map(r=>r.text()));
    keys.forEach((k,i)=> txt[k] = texts[i]);
  } catch(e){ showError(e.message); return; }

  let tempHQ, tempRegional, tempGachi, operHQ, operNorth, operMiddle, operSouth, operGachi, incWork, incOff;
  try {
    const hqRows = parseCSV(txt.tempHQ);
    // 주말·공휴일 자동 계산 (날짜 열 기준)
    HOLIDAYS = new Set();
    hqRows.slice(1).forEach(r=>{
      const m = String(r[0] ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(m && isHolidayDate(m[0])) HOLIDAYS.add(Number(m[3]));
    });
    tempHQ       = toSeriesMap(hqRows);
    tempRegional = toSeriesMap(parseCSV(txt.tempRegional));
    tempGachi    = toSeriesMap(parseCSV(txt.tempGachi));
    operHQ       = toSeriesMap(parseCSV(txt.operHQ));
    operNorth    = toSeriesMap(parseCSV(txt.operNorth));
    operMiddle   = toSeriesMap(parseCSV(txt.operMiddle));
    operSouth    = toSeriesMap(parseCSV(txt.operSouth));
    operGachi    = toSeriesMap(parseCSV(txt.operGachi));
    incWork      = toObjects(parseCSV(txt.incWork));
    incOff       = toObjects(parseCSV(txt.incOff));
  } catch(e){ showError('CSV 파싱 오류: ' + e.message); return; }

  /* 3. 온도 (대표 1개씩) */
  mkTempChart('c-temp-hq',       'lg-temp-hq',       tempHQ);
  mkTempChart('c-temp-regional', 'lg-temp-regional', tempRegional);
  mkTempChart('c-temp-gachi',    'lg-temp-gachi',    tempGachi);

  /* 4. 권역별 가동시간 */
  mkOperLine('c-oper-hq',     'lg-oper-hq',     operHQ);
  mkOperLine('c-oper-north',  'lg-oper-north',  operNorth);
  mkOperLine('c-oper-middle', 'lg-oper-middle', operMiddle);
  mkOperLine('c-oper-south',  'lg-oper-south',  operSouth);
  mkOperLine('c-oper-gachi',  'lg-oper-gachi',  operGachi);

  /* 5. 전월 대비 증가 TOP5 */
  fillIncreaseTable('incWorkB', incWork);
  fillIncreaseTable('incOffB',  incOff);
}

window.addEventListener('DOMContentLoaded', main);
