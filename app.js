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
  tempHQ:       '3-1.csv',  // 섹션3-1 — 본사 대표(서울 1층) 실내온도
  tempRegional: '3-2.csv',  // 섹션3-2 — 지역센터 대표(부천) 실내온도
  tempGachi:    '3-3.csv',  // 섹션3-3 — 가치만드소 대표(광주) 실내온도
  operHQ:       '4-1.csv',  // 섹션4-1 — 서울 본사 구역별 가동시간
  operNorth:    '4-2.csv',  // 섹션4-2 — 지역센터 북부 가동시간
  operMiddle:   '4-3.csv',  // 섹션4-3 — 지역센터 중부 가동시간
  operSouth:    '4-4.csv',  // 섹션4-4 — 지역센터 남부 가동시간
  operGachi:    '4-5.csv',  // 섹션4-5 — 가치만드소 가동시간
  incWork:      '5-1.csv',  // 섹션5-1 — 사용량 TOP5(근무시간)
  incOff:       '5-2.csv'   // 섹션5-2 — 사용량 TOP5(근무외)
};

/* ✏️ 공휴일 날짜 — 주말(토·일)은 자동 계산되고, 여기엔 공휴일만 적으면 됩니다.
   해당 날짜의 x축 라벨이 빨간색으로 표시됩니다. (매달 이 줄만 갱신) */
const PUBLIC_HOLIDAYS = []; // 2026년 4월 평일 공휴일 없음

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
  const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n;
}

function normKey(v){
  return String(v ?? '').replace(/\s+/g, '').replace(/[()_\-·:]/g, '').toLowerCase();
}

function findCol(header, candidates, fallback=0){
  const normalized = header.map(normKey);
  for(const c of candidates){
    const idx = normalized.indexOf(normKey(c));
    if(idx >= 0) return idx;
  }
  for(const c of candidates){
    const key = normKey(c);
    const idx = normalized.findIndex(h => h.includes(key) || key.includes(h));
    if(idx >= 0) return idx;
  }
  return fallback;
}

function pickValue(row, aliases){
  for(const alias of aliases){
    if(Object.prototype.hasOwnProperty.call(row, alias) && row[alias] !== '') return row[alias];
  }
  const keys = Object.keys(row);
  for(const alias of aliases){
    const target = normKey(alias);
    const key = keys.find(k => normKey(k) === target || normKey(k).includes(target) || target.includes(normKey(k)));
    if(key && row[key] !== '') return row[key];
  }
  return undefined;
}

function toSeriesMap(rows){
  const header = rows[0];
  const dateIdx = findCol(header, ['일자', '날짜', 'date'], 0);
  const names = header.filter((_, i) => i !== dateIdx);
  const map = {}; names.forEach(n => map[n] = []);
  const labels = [];
  for(let r=1;r<rows.length;r++){
    const d = rows[r][dateIdx] ?? '';
    const m = d.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(!m) continue;
    labels.push(m ? String(Number(m[3])) : d);
    names.forEach(n=> map[n].push(num(rows[r][header.indexOf(n)])));
  }
  return { names, map, labels };
}

function toTempSeriesMap(rows){
  const header = rows[0];
  const dateIdx = findCol(header, ['날짜', '일자', 'date'], 0);
  const outdoorIdx = findCol(header, [OUTDOOR_KEY, '실외최고기온', '최고기온', '최고기온℃', 'outdoor'], 1);
  const innerNames = header.filter((_,i) => i !== dateIdx && i !== outdoorIdx);
  const names = [...innerNames, OUTDOOR_KEY];
  const map = {}; names.forEach(n => map[n] = []);
  const labels = [];
  for(let r=1;r<rows.length;r++){
    const d = rows[r][dateIdx] ?? '';
    const m = d.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(!m) continue;
    labels.push(m ? String(Number(m[3])) : d);
    innerNames.forEach(n => map[n].push(num(rows[r][header.indexOf(n)])));
    map[OUTDOOR_KEY].push(num(rows[r][outdoorIdx]));
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

/* x축: 4월 1~30일 전체 표시 */
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
    .replace(/^(본사|지역센터|가치만드소|지역)_/, '')
    .replace(/_/g, ' ')
    .replace(/서울(?=\d)/g, '서울 ')
    .trim();
}

/* ── 4월 사용량 TOP5 표 ─────────────────────────────────────
   장비당 일평균 가동시간 기준 내림차순 · 상위 5개 */
function fillIncreaseTable(tbodyId, rows){
  const tb = document.getElementById(tbodyId);
  if(!tb) return;
  const data = rows.map(r=>{
    const ctrl    = num(pickValue(r, ['제어기_장치수', '제어기수', '제어기수량', '장치수'])) ?? 0;
    const curTot  = num(pickValue(r, ['4월_총가동시간', '4월_총가동시간_시간', '총가동시간_시간_4월', '당월_총가동시간', '당월 총가동(h)'])) ?? 0;
    const curAvg  = num(pickValue(r, ['4월_장비당_일평균가동시간', '장비당_일평균가동시간_시간_4월', '당월_장비당_일평균가동시간', '당월 장비당 일평균(h)'])) ?? 0;
    return {
      gubun:  pickValue(r, ['구분', '분류']) || '',
      region: pickValue(r, ['지역', '권역']) || '',
      hub:    fmtZoneName(pickValue(r, ['허브_위치', 'HUB_NICKNAME', '허브위치', '위치']) || ''),
      ctrl, curTot, curAvg
    };
  }).filter(r=>r.region).sort((a,b)=> b.curAvg - a.curAvg).slice(0,5);

  tb.innerHTML = data.map((r,i)=>{
    const rank = i===0 ? '<span class="rk1">1</span>' : `<span class="rkn">${i+1}</span>`;
    return `<tr>`+
      `<td>${rank}</td>`+
      `<td>${r.gubun}</td>`+
      `<td><strong>${r.region}</strong></td>`+
      `<td>${r.hub}</td>`+
      `<td>${r.ctrl}</td>`+
      `<td>${r.curTot.toFixed(2)}</td>`+
      `<td>${r.curAvg.toFixed(2)}</td>`+
    `</tr>`;
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
    tempHQ       = toTempSeriesMap(hqRows);
    tempRegional = toTempSeriesMap(parseCSV(txt.tempRegional));
    tempGachi    = toTempSeriesMap(parseCSV(txt.tempGachi));
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

  /* 5. 사용량 TOP5 */
  fillIncreaseTable('incWorkB', incWork);
  fillIncreaseTable('incOffB',  incOff);
}

window.addEventListener('DOMContentLoaded', main);

/* ── 인쇄: 리포트 전체를 세로로 긴 '한 페이지' PDF로 출력 ─────
   인쇄 직전에 문서 높이를 측정해 그 크기의 커스텀 용지를 적용한다.
   크롬 인쇄 대화상자에서 [대상: PDF로 저장] 그대로 출력하면 됨. */
let PRINT_MODE = 'one'; // 'one' = 한 장 PDF · 'a4' = A4 여러 장
function setPageRule(){
  let st = document.getElementById('one-page-print');
  if(!st){ st = document.createElement('style'); st.id = 'one-page-print'; document.head.appendChild(st); }
  if(PRINT_MODE === 'a4'){
    st.textContent = '@page { size: A4 portrait; margin: 10mm; }';
    document.body.classList.add('print-a4');
  } else {
    const PX2MM = 25.4 / 96;
    const page = document.querySelector('.page') || document.body;
    const wMm = Math.ceil(page.offsetWidth * PX2MM) + 20;
    const hMm = Math.ceil(document.documentElement.scrollHeight * PX2MM) + 12;
    st.textContent = `@page { size: ${wMm}mm ${hMm}mm; margin: 10mm; }`;
    document.body.classList.remove('print-a4');
  }
}
function printOnePage(){ PRINT_MODE = 'one'; setPageRule(); window.print(); }
function printA4(){ PRINT_MODE = 'a4'; setPageRule(); window.print(); }
window.addEventListener('load', () => setTimeout(setPageRule, 400));
window.addEventListener('beforeprint', setPageRule);
window.addEventListener('afterprint', () => { PRINT_MODE = 'one'; setPageRule(); });
