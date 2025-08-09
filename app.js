// ===========================
// Config / Constants
// ===========================
const DATA_URL = 'pokemon_data.json'; // 同リポジトリ直置き想定
const LS_KEY = 'psleep-check-v2';

const FIELDS = [
  'ワカクサ本島','シアンの砂浜','トープ洞窟','ウノハナ雪原','ラピスラズリ湖畔','ゴールド旧発電所','ワカクサ本島EX'
];
const FIELD_SHORT = {
  'ワカクサ本島':'ワカクサ',
  'シアンの砂浜':'シアン',
  'トープ洞窟':'トープ',
  'ウノハナ雪原':'ウノハナ',
  'ラピスラズリ湖畔':'ラピス',
  'ゴールド旧発電所':'ゴールド',
  'ワカクサ本島EX':'ワカクサEX'
};
const STYLES = ['うとうと','すやすや','ぐっすり'];

const STYLE_ICON = {
  'うとうと': 'assets/icons/01-uto.png',
  'すやすや': 'assets/icons/02-suya.png',
  'ぐっすり': 'assets/icons/03-gu.png',
};

// ランク文字列 → 数値（1..35）
const RANK_MAP = (() => {
  const map = {};
  const add = (prefix, start, count, base) => {
    for (let i=1;i<=count;i++){
      map[`${prefix}${i}`] = base + (i-1);
    }
  };
  add('ノーマル',5,5,1);   // 1..5
  add('スーパー',5,5,6);   // 6..10
  add('ハイパー',5,5,11);  // 11..15
  // マスター1..20 → 16..35
  for (let i=1;i<=20;i++) map[`マスター${i}`] = 15 + i;
  return map;
})();

// ===========================
// State (localStorage v2)
// ===========================
const state = {
  schemaVersion: 2,
  checked: {},        // { ID: { "☆1":true, ... } }
  firstCheckedAt: {}, // { ID: { "☆1":"ISO", ... } }  // 初取得（固定）
  lastCheckedAt: {},  // { ID: { "☆1":"ISO", ... } }  // 直近ON/OFF
  settings: { highlight: true }
};

let rows = []; // データ（成形後）
let filteredRows = []; // 全寝顔フィルタ結果
let currentField = 'ワカクサ本島';

// ===========================
// Utilities
// ===========================
const padNo = (n) => (n>=1000 ? String(n) : String(n).padStart(4,'0'));
function kanaToHira(s){
  // 半角→全角、長音・濁点など標準正規化
  s = s.normalize('NFKC');
  return s.replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function nameMatch(q, name){
  if (!q) return true;
  const a = kanaToHira(q);
  const b = kanaToHira(name);
  return b.includes(a);
}
function loadLS(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.schemaVersion === 2){
      Object.assign(state, saved);
    }else{
      // v1 → v2 マイグレーション（checkedのみ引き継ぐ。firstCheckedAtは未設定）
      state.checked = saved.checked || {};
      saveLS();
    }
  }catch(e){ console.warn(e); }
}
function saveLS(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function getChecked(id, star){ return !!state.checked?.[id]?.[star]; }

function setCheck(id, star, value){
  const now = new Date().toISOString();
  state.checked[id] ??= {};
  state.checked[id][star] = value;

  state.lastCheckedAt[id] ??= {};
  state.lastCheckedAt[id][star] = now;

  if (value){
    state.firstCheckedAt[id] ??= {};
    if (!state.firstCheckedAt[id][star]) state.firstCheckedAt[id][star] = now; // 初回だけ固定
  }
  saveLS();
  renderSummary();
}

function countAddedLast7Days(filterFn){
  if (!state.settings.highlight) return 0;
  const since = Date.now() - 7*24*60*60*1000;
  let n=0;
  for (const r of rows){
    for (const s of ['☆1','☆2','☆3','☆4']){
      const ts = state.firstCheckedAt?.[r.ID]?.[s];
      if (!ts) continue;
      if (!state.checked?.[r.ID]?.[s]) continue;              // 現在ONのみ
      if (new Date(ts).getTime() < since) continue;
      if (filterFn(r,s)) n++;
    }
  }
  return n;
}

// ===========================
// Fetch & normalize
// ===========================
async function loadData(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  const json = await res.json();
  const arr = json['DB->JSON'] || [];

  // 正規化：「"null"」→ 空文字 / EX列がなければ追加
  rows = arr.map(x => {
    const o = { ...x };
    for (const f of FIELDS){
      if (!(f in o)) o[f] = "";                 // EX列が無ければ追加
      if (o[f] === "null") o[f] = "";           // 文字列"null"を非出現扱いへ
    }
    // レア度表示を ☆1..5 に寄せる（★→☆）
    if (o.DisplayRarity) o.DisplayRarity = o.DisplayRarity.replace(/★/g,'☆');
    return o;
  });
}

// ===========================
// Render: Summary (+n, crown)
// ===========================
function renderSummary(){
  const tbody = document.getElementById('summaryBody');
  const lines = [];

  const renderRow = (style, isTotal=false) => {
    const tds = [];
    for (const field of FIELDS){
      // 分母：その睡眠タイプ×フィールドで出現する寝顔数
      const appear = rows.filter(r => r.Style===style || isTotal && true)
        .filter(r => FIELDS.some(f => !!r[f]))    // 何かしらのフィールドに出る
        .filter(r => r[field])                    // 当該フィールドで出る
        .length;

      // 分子：チェック済み
      const got = rows.filter(r => (isTotal || r.Style===style) && r[field]).reduce((acc,r)=>{
        let c=0;
        for (const s of ['☆1','☆2','☆3','☆4']) if (state.checked?.[r.ID]?.[s]) c++;
        return acc + c;
      },0);

      const pct = appear ? Math.round((got/appear)*100) : 0;
      const crown = state.settings.highlight && appear>0 && got>=appear;
      const added = countAddedLast7Days((r,s)=> (isTotal || r.Style===style) && !!r[field] );

      tds.push(`
        <td>
          <div class="cell-wrap">
            <div class="cell-top-line">
              <div class="fw-semibold">${got} / ${appear} (${pct}%)</div>
              <div>
                ${crown ? `<img class="crown" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23f0b400' d='M5 19h14l-1-8-4 3-3-6-3 6-4-3z'/%3E%3C/svg%3E">` : ''}
                ${(state.settings.highlight && added>0) ? `<span class="badge rounded-pill text-bg-primary badge-add">+${added}</span>` : ''}
              </div>
            </div>
            <div class="progress mt-1"><div class="progress-bar" style="width:${pct}%"></div></div>
          </div>
        </td>
      `);
    }
    const head = isTotal
      ? `<th class="fw-bold">合計</th>`
      : `<th><img src="${STYLE_ICON[style]}" alt="${style}" class="summary-icon" loading="lazy"></th>`;
    return `<tr>${head}${tds.join('')}</tr>`;
  };

  for (const st of STYLES) lines.push(renderRow(st,false));
  lines.push(renderRow('',true)); // 合計行
  tbody.innerHTML = lines.join('');
}

// ===========================
// Render: All table
// ===========================
function renderAll(){
  const nameQ = document.getElementById('filterName').value.trim();
  const styleQ = document.getElementById('filterStyle').value;

  filteredRows = rows
    .filter(r => (!styleQ || r.Style===styleQ))
    .filter(r => nameMatch(nameQ, r.Name))
    // 同じNo＆Nameの4行（☆1..4）が来るので、☆4行だけ残すなどせず全件表示（各行＝1寝顔レアの行）
    .sort(sorter());

  const tb = document.getElementById('allBody');
  tb.innerHTML = filteredRows.map(r => {
    const cells = ['☆1','☆2','☆3','☆4'].map((s,idx)=>{
      const show = true; // “存在しない寝顔は非表示”はフィールド別で考慮。全寝顔は常時表示OK
      if (!show) return `<td class="star-col"></td>`;
      const disabled = false;
      const checked = getChecked(r.ID, s);
      return `<td class="star-col">
        <input type="checkbox" class="form-check-input" data-id="${r.ID}" data-star="${s}" ${checked?'checked':''} ${disabled?'disabled':''}>
      </td>`;
    }).join('');

    const anyChecked = ['☆1','☆2','☆3','☆4'].some(s => getChecked(r.ID,s));

    return `<tr>
      <td class="no-col">${padNo(r.No)}</td>
      <td class="name-col">${r.Name}</td>
      ${cells}
      <td class="row-actions text-center">
        <button class="btn btn-sm btn-outline-primary me-1" data-rowon="${r.ID}">一括ON</button>
        <button class="btn btn-sm btn-outline-secondary" data-rowoff="${r.ID}">一括OFF</button>
      </td>
    </tr>`;
  }).join('');
}

// フィールド別（非出現セルは「チェックボックスを出さない」）
function renderField(){
  const field = currentField;
  const tb = document.getElementById('fieldBody');

  const list = rows.filter(r => !!r[field]).sort(sorter());

  tb.innerHTML = list.map(r=>{
    const starCells = ['☆1','☆2','☆3','☆4'].map(s=>{
      // その寝顔（☆）が存在しないケース → チェックボックス非表示
      const exists = true; // JSONで寝顔☆単位の非存在は基本行自体に現れる想定。必要ならここで条件化
      if (!exists) return `<td class="star-col"></td>`;
      const checked = getChecked(r.ID, s);
      return `<td class="star-col">
        <input type="checkbox" class="form-check-input" data-id="${r.ID}" data-star="${s}" ${checked?'checked':''}>
      </td>`;
    }).join('');

    return `<tr>
      <td class="no-col">${padNo(r.No)}</td>
      <td class="name-col">${r.Name}</td>
      ${starCells}
      <td class="row-actions text-center">
        <button class="btn btn-sm btn-outline-primary me-1" data-rowon="${r.ID}">一括ON</button>
        <button class="btn btn-sm btn-outline-secondary" data-rowoff="${r.ID}">一括OFF</button>
      </td>
    </tr>`;
  }).join('');
}

// 並び替え
function sorter(){
  const v = document.getElementById('sortSelect')?.value || 'no-asc';
  return (a,b)=>{
    if (v==='no-asc')  return a.No - b.No;
    if (v==='no-desc') return b.No - a.No;
    if (v==='name-asc')  return a.Name.localeCompare(b.Name,'ja');
    if (v==='name-desc') return b.Name.localeCompare(a.Name,'ja');
    return 0;
  };
}

// ===========================
// Find tab（閲覧のみ）
// ===========================
function renderFind(){
  const field = document.getElementById('findField').value;
  const rank = Number(document.getElementById('findRank').value);
  const list = rows.filter(r => !!r[field]).filter(r=>{
    const need = r[field]; // 例 "ハイパー3"
    const val = RANK_MAP[need] || 999;
    return val<=rank;
  }).filter(r=>{
    // 未入手のみ
    return !['☆1','☆2','☆3','☆4'].some(s => getChecked(r.ID,s));
  }).sort(sorter());

  const el = document.getElementById('findList');
  el.innerHTML = list.map(r=>`
    <div class="d-flex justify-content-between border rounded-3 p-2 mb-2 bg-white">
      <div><span class="text-muted me-2">${padNo(r.No)}</span>${r.Name}</div>
      <div class="text-muted small">${FIELD_SHORT[field]} / ${r[field]}</div>
    </div>
  `).join('') || `<div class="text-muted">該当なし</div>`;
}

// ===========================
// Events
// ===========================
function wireEvents(){
  document.getElementById('toggleHighlight').checked = !!state.settings.highlight;
  document.getElementById('toggleHighlight').addEventListener('change', e=>{
    state.settings.highlight = e.target.checked; saveLS(); renderSummary();
  });

  document.getElementById('filterName').addEventListener('input', ()=> renderAll());
  document.getElementById('filterStyle').addEventListener('change', ()=> renderAll());
  document.getElementById('sortSelect').addEventListener('change', ()=> { renderAll(); renderField(); renderFind(); });

  document.getElementById('fieldSelect').addEventListener('change', e=>{
    currentField = e.target.value; renderField();
  });

  document.getElementById('findField').addEventListener('change', renderFind);
  document.getElementById('findRank').addEventListener('input', renderFind);

  // デリゲーション：チェックON/OFF
  document.addEventListener('change', (e)=>{
    const input = e.target;
    if (input.matches('input[type="checkbox"][data-id]')){
      const id = input.dataset.id;
      const star = input.dataset.star;
      setCheck(id, star, input.checked);
      // テーブル間の同期
      renderAll(); renderField(); renderSummary(); renderFind();
    }
  });

  // 行まとめ
  document.addEventListener('click', (e)=>{
    const onBtn = e.target.closest('[data-rowon]');
    const offBtn = e.target.closest('[data-rowoff]');
    if (onBtn){
      const id = onBtn.getAttribute('data-rowon');
      for (const s of ['☆1','☆2','☆3','☆4']) setCheck(id, s, true);
      renderAll(); renderField(); renderSummary(); return;
    }
    if (offBtn){
      const id = offBtn.getAttribute('data-rowoff');
      for (const s of ['☆1','☆2','☆3','☆4']) setCheck(id, s, false);
      renderAll(); renderField(); renderSummary(); return;
    }
  });

  // 全体一括
  document.getElementById('btnAllOn').addEventListener('click', ()=>{
    for (const r of filteredRows) for (const s of ['☆1','☆2','☆3','☆4']) setCheck(r.ID, s, true);
    renderAll(); renderField(); renderSummary();
  });
  document.getElementById('btnAllOff').addEventListener('click', ()=>{
    for (const r of filteredRows) for (const s of ['☆1','☆2','☆3','☆4']) setCheck(r.ID, s, false);
    renderAll(); renderField(); renderSummary();
  });

  // Export / Import
  document.getElementById('btnExport').addEventListener('click', ()=>{
    const includeDates = document.getElementById('includeDates').checked;
    const payload = {
      schemaVersion: 2,
      checked: state.checked,
      firstCheckedAt: includeDates ? state.firstCheckedAt : undefined,
      lastCheckedAt: includeDates ? state.lastCheckedAt : undefined,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sleep-checker-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  });

  document.getElementById('fileImport').addEventListener('change', async (e)=>{
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try{
      const data = JSON.parse(text);
      if (data.checked) state.checked = data.checked;
      if (data.firstCheckedAt) state.firstCheckedAt = data.firstCheckedAt;
      if (data.lastCheckedAt) state.lastCheckedAt = data.lastCheckedAt;
      if (data.settings) state.settings = data.settings;
      saveLS();
      renderAll(); renderField(); renderSummary(); renderFind();
      alert('インポートを完了しました。');
    }catch(err){
      alert('JSONの読み込みに失敗しました。'); console.error(err);
    }
    e.target.value = '';
  });
}

// ===========================
// Boot
// ===========================
(async function(){
  loadLS();
  try{
    await loadData();
  }catch(err){
    console.error(err);
    document.getElementById('summaryBody').innerHTML = `<tr><td>データの読み込みに失敗しました</td></tr>`;
    return;
  }
  wireEvents();
  renderSummary();
  renderAll();
  renderField();
  renderFind();
})();
