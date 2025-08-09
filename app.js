// ===================== 設定 =====================
const DATA_URL = './pokemon_data_cleaned.json';
const STORAGE_KEY = 'psleep-check-v1';

const FIELD_KEYS = [
  'ワカクサ本島', 'シアンの砂浜', 'トープ洞窟', 'ウノハナ雪原',
  'ラピスラズリ湖畔', 'ゴールド旧発電所', 'ワカクサ本島EX'
];
// サマリー表示名（短縮）
const FIELD_SHORT = {
  'ワカクサ本島': 'ワカクサ',
  'シアンの砂浜': 'シアン',
  'トープ洞窟': 'トープ',
  'ウノハナ雪原': 'ウノハナ',
  'ラピスラズリ湖畔': 'ラピス',
  'ゴールド旧発電所': 'ゴールド',
  'ワカクサ本島EX': 'ワカクサEX'
};

const SLEEP_TYPES = ['うとうと', 'すやすや', 'ぐっすり'];
const RARITIES = ['☆1', '☆2', '☆3', '☆4', '☆5']; // 表示用
const CHECKABLE_STARS = ['☆1','☆2','☆3','☆4'];   // チェック対象

// リポジトリ内相対パス
const STYLE_ICON = {
  'うとうと': 'assets/icons/01-uto.png',
  'すやすや': 'assets/icons/02-suya.png',
  'ぐっすり': 'assets/icons/03-gu.png',
};

// ランクの内部マッピング（1..35）
function mapRankToNumber(s) {
  if (!s) return null;
  const m = String(s).trim().match(/(ノーマル|スーパー|ハイパー|マスター)\s*([0-9１-９]+)$/);
  if (!m) return null;
  const stage = m[1];
  const idx = parseInt(m[2].replace(/[^\d]/g,''), 10);
  if (stage === 'ノーマル') return (idx>=1&&idx<=5) ? idx : null;
  if (stage === 'スーパー') return (idx>=1&&idx<=5) ? 5+idx : null;  // 6..10
  if (stage === 'ハイパー') return (idx>=1&&idx<=5) ? 10+idx : null; // 11..15
  if (stage === 'マスター') return (idx>=1&&idx<=20)? 15+idx : null; // 16..35
  return null;
}

// 検索用正規化（ひら→カナ同一視・長音/空白除去）
function normalizeJP(s) {
  if (!s) return '';
  let out = s.normalize('NFKC').toLowerCase();
  out = out.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  out = out.replace(/[ーｰ‐\-・\s]/g, '');
  return out;
}

// ===================== 状態保存 =====================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { checked: {} };
  } catch {
    return { checked: {} };
  }
}
function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setChecked(state, no, star, val) {
  if (!state.checked[no]) state.checked[no] = {};
  state.checked[no][star] = !!val;
  saveState(state);
}
function getChecked(state, no, star) { return !!(state.checked?.[no]?.[star]); }
function setRowAll(state, no, val) { CHECKABLE_STARS.forEach(star => setChecked(state, no, star, val)); }

// ===================== データロード & 整形 =====================
let RAW_ROWS = [];
let SPECIES_MAP = new Map();  // key: `${No}__${Name}` → { no, name, styles:Set, rarities:Set, rows:[] }
let LAST_RENDER_ENTRIES = []; // 全寝顔の現在表示

async function loadData() {
  const res = await fetch(DATA_URL);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json['すべての寝顔一覧'] || []);
  RAW_ROWS = rows.map(r => ({
    ID: r.ID,
    No: normalizeNo(r.No),
    Name: r.Name,
    Style: r.Style,
    DisplayRarity: r.DisplayRarity,
    fields: Object.fromEntries(FIELD_KEYS.map(k => [k, (r[k] ?? '').trim()])),
  }));
  buildSpeciesIndex();
}
function normalizeNo(noRaw) {
  const s = String(noRaw ?? '').trim();
  const num = parseInt(s.replace(/^0+/, '') || '0', 10);
  if (Number.isNaN(num)) return s;
  return (num >= 1000) ? String(num) : String(num).padStart(4, '0');
}
function buildSpeciesIndex() {
  SPECIES_MAP.clear();
  for (const row of RAW_ROWS) {
    const key = `${row.No}__${row.Name}`;
    if (!SPECIES_MAP.has(key)) {
      SPECIES_MAP.set(key, { no: row.No, name: row.Name, styles: new Set(), rarities: new Set(), rows: [] });
    }
    const ent = SPECIES_MAP.get(key);
    if (row.Style) ent.styles.add(row.Style);
    if (row.DisplayRarity) ent.rarities.add(row.DisplayRarity);
    ent.rows.push(row);
  }
}
function speciesHasStar(entry, star) { return entry.rows.some(r => r.DisplayRarity === star); }
function getFieldRankNum(row, fieldKey) {
  const raw = row.fields[fieldKey] || '';
  return mapRankToNumber(raw);
}

// ===================== サマリー =====================
function renderSummary(state) {
  const root = document.getElementById('summaryGrid');

  // 集計関数
  const calcFor = (style, field) => {
    let denom = 0, num = 0;
    for (const row of RAW_ROWS) {
      if (style && row.Style !== style) continue; // styleがnullなら全タイプ集計
      const rankNum = getFieldRankNum(row, field);
      if (rankNum) {
        denom++;
        if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, row.No, row.DisplayRarity)) num++;
      }
    }
    const rate = denom ? Math.round((num / denom) * 100) : 0;
    return { num, denom, rate };
  };

  const header = `
    <table class="table table-sm align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th style="min-width:140px;"></th>
          ${FIELD_KEYS.map(f => `<th class="text-center">${FIELD_SHORT[f]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${SLEEP_TYPES.map(style => {
          const tds = FIELD_KEYS.map(field => {
            const {num, denom, rate} = calcFor(style, field);
            return `<td class="text-center">${num} / ${denom} (${rate}%)</td>`;
          }).join('');
          return `<tr>
  <th class="text-start align-middle">
    <img src="${STYLE_ICON[style]}" alt="${style}" class="summary-icon" loading="lazy">
  </th>
  ${tds}
</tr>`;
        }).join('')}
        ${(() => { // 合計行
          const tds = FIELD_KEYS.map(field => {
            const {num, denom, rate} = calcFor(null, field); // 全タイプ合算
            return `<td class="text-center fw-semibold">${num} / ${denom} (${rate}%)</td>`;
          }).join('');
          return `<tr class="table-light"><th class="fw-semibold">合計</th>${tds}</tr>`;
        })()}
      </tbody>
    </table>`;
  root.innerHTML = header;
}

// ===================== 全寝顔チェックシート =====================
function renderAllFaces(state) {
  const tbody = document.querySelector('#allFacesTable tbody');
  const searchName = document.getElementById('searchName').value.trim();
  const filterStyle = document.getElementById('filterStyle').value;
  const sortBy = document.getElementById('sortBy').value;

  const normQuery = normalizeJP(searchName);

  let entries = Array.from(SPECIES_MAP.values());

  if (normQuery) entries = entries.filter(ent => normalizeJP(ent.name).includes(normQuery));
  if (filterStyle) entries = entries.filter(ent => ent.rows.some(r => r.Style === filterStyle));

  entries.sort((a,b)=>{
    if (sortBy === 'name-asc')  return a.name.localeCompare(b.name, 'ja');
    if (sortBy === 'name-desc') return b.name.localeCompare(a.name, 'ja');
    if (sortBy === 'no-desc')   return b.no.localeCompare(a.no, 'ja');
    return a.no.localeCompare(b.no, 'ja'); // no-asc
  });

  LAST_RENDER_ENTRIES = entries;

  tbody.innerHTML = entries.map(ent => {
    const no = ent.no, name = ent.name;

    const cells = CHECKABLE_STARS.map(star => {
      const exists = speciesHasStar(ent, star);
      if (!exists) {
        // ★ 存在しない寝顔：チェックボックスを出さない（ダッシュ表示）
        return `<td class="text-center cell-absent">—</td>`;
      }
      const checked = getChecked(state, no, star);
      return `
        <td class="text-center ${checked ? 'cell-checked' : ''}">
          <input type="checkbox" class="form-check-input"
            data-no="${no}" data-star="${star}"
            ${checked ? 'checked' : ''}>
        </td>`;
    }).join('');

    const bulkBtn = `
      <div class="btn-group btn-group-sm" role="group">
        <button type="button" class="btn btn-outline-primary" data-bulk="on" data-no="${no}">一括ON</button>
        <button type="button" class="btn btn-outline-secondary" data-bulk="off" data-no="${no}">一括OFF</button>
      </div>`;

    return `
      <tr>
        <td>${no}</td>
        <td>${escapeHtml(name)}</td>
        ${cells}
        <td class="text-center">${bulkBtn}</td>
      </tr>`;
  }).join('');

  // チェックイベント
  tbody.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e)=>{
      const no = e.target.dataset.no;
      const star = e.target.dataset.star;
      setChecked(state, no, star, e.target.checked);
      e.target.closest('td').classList.toggle('cell-checked', e.target.checked);
      renderSummary(state);
      renderRankSearch(state);
    });
  });

  // 行まとめ（一括ON/OFF）※ 確認ダイアログは出さない
  tbody.querySelectorAll('button[data-bulk]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const no = e.currentTarget.dataset.no;
      const mode = e.currentTarget.dataset.bulk; // on/off
      setRowAll(state, no, mode === 'on');
      CHECKABLE_STARS.forEach(star=>{
        const input = tbody.querySelector(`input[data-no="${no}"][data-star="${star}"]`);
        if (input) {
          input.checked = (mode === 'on');
          input.closest('td').classList.toggle('cell-checked', input.checked);
        }
      });
      renderSummary(state);
      renderRankSearch(state);
    });
  });
}

// 補助
function firstStyleKey(ent){
  const arr = Array.from(ent.styles);
  const order = {'うとうと':1,'すやすや':2,'ぐっすり':3};
  arr.sort((a,b)=>(order[a]||9)-(order[b]||9));
  return arr[0] || '';
}
function escapeHtml(s){ return s?.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) || ''; }

// ===================== フィールド別 =====================
function setupFieldTabs() {
  const tabsUl = document.getElementById('fieldTabs');
  const content = document.getElementById('fieldTabsContent');
  tabsUl.innerHTML = FIELD_KEYS.map((f,i)=>`
    <li class="nav-item" role="presentation">
      <button class="nav-link ${i===0?'active':''}" data-bs-toggle="tab" data-bs-target="#pane-field-${i}" type="button" role="tab">${FIELD_SHORT[f]}</button>
    </li>`).join('');
  content.innerHTML = FIELD_KEYS.map((f,i)=>`
    <div class="tab-pane fade ${i===0?'show active':''}" id="pane-field-${i}" role="tabpanel">
      <div class="table-responsive">
        <table class="table table-sm align-middle table-hover mb-0">
          <thead class="table-light sticky-header">
            <tr>
              <th>No</th>
              <th>ポケモン名</th>
              <th>睡眠タイプ</th>
              <th>レア度</th>
              <th class="text-center">☆1</th>
              <th class="text-center">☆2</th>
              <th class="text-center">☆3</th>
              <th class="text-center">☆4</th>
            </tr>
          </thead>
          <tbody data-field="${f}"></tbody>
        </table>
      </div>
    </div>`).join('');
}

function renderFieldTables(state) {
  FIELD_KEYS.forEach(field=>{
    const tbody = document.querySelector(`#fieldTabsContent tbody[data-field="${field}"]`);
    const rows = [];
    for (const ent of SPECIES_MAP.values()) {
      const appearAny = ent.rows.some(r => getFieldRankNum(r, field));
      if (!appearAny) continue;

      const cells = CHECKABLE_STARS.map(star=>{
        const hasRow = ent.rows.find(r => r.DisplayRarity === star);
        if (!hasRow) {
          // そもそも存在しない寝顔
          return `<td class="text-center cell-absent">—</td>`;
        }
        const rankNum = getFieldRankNum(hasRow, field);
        if (!rankNum) {
          // フィールド上「出現しない」
          return `<td class="text-center cell-disabled">出現しない</td>`;
        }
        const checked = getChecked(state, ent.no, star);
        return `<td class="text-center ${checked ? 'cell-checked' : ''}">
          <input type="checkbox" class="form-check-input"
            data-no="${ent.no}" data-star="${star}"
            ${checked ? 'checked' : ''}>
        </td>`;
      }).join('');

      rows.push(`
        <tr>
          <td>${ent.no}</td>
          <td>${escapeHtml(ent.name)}</td>
          <td>${firstStyleKey(ent) || '-'}</td>
          <td>${(() => {
            // 表示用最小レア度
            const rs = ent.rows.map(r=>r.DisplayRarity).filter(Boolean);
            const order = r => RARITIES.indexOf(r);
            rs.sort((a,b)=>order(a)-order(b));
            return rs[0] || '-';
          })()}</td>
          ${cells}
        </tr>
      `);
    }
    tbody.innerHTML = rows.join('');

    tbody.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
      chk.addEventListener('change', (e)=>{
        const no = e.target.dataset.no;
        const star = e.target.dataset.star;
        setChecked(state, no, star, e.target.checked);
        e.target.closest('td').classList.toggle('cell-checked', e.target.checked);
        renderAllFaces(state);
        renderSummary(state);
        renderRankSearch(state);
      });
    });
  });
}

// ===================== ランク検索（未入手のみ） =====================
function setupRankSearchControls() {
  const sel = document.getElementById('searchField');
  sel.innerHTML = FIELD_KEYS.map(f=>`<option value="${f}">${FIELD_SHORT[f]}</option>`).join('');
  document.getElementById('searchField').addEventListener('change', ()=>renderRankSearch(loadState()));
  document.getElementById('searchRank').addEventListener('input', ()=>renderRankSearch(loadState()));
}
function renderRankSearch(state) {
  const field = document.getElementById('searchField').value || FIELD_KEYS[0];
  const rank = Math.max(1, Math.min(35, parseInt(document.getElementById('searchRank').value||'1',10)));
  const tbody = document.querySelector('#rankSearchTable tbody');

  const items = [];
  for (const row of RAW_ROWS) {
    const rNum = getFieldRankNum(row, field);
    if (!rNum || rNum > rank) continue;
    if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, row.No, row.DisplayRarity)) continue;
    items.push(row);
  }
  items.sort((a,b)=>{
    const c1 = a.No.localeCompare(b.No,'ja'); if (c1) return c1;
    const iA = RARITIES.indexOf(a.DisplayRarity), iB = RARITIES.indexOf(b.DisplayRarity);
    const c2 = (iA-iB); if (c2) return c2;
    return a.Style.localeCompare(b.Style,'ja');
  });

  tbody.innerHTML = items.map(r=>`
    <tr>
      <td>${r.No}</td>
      <td>${escapeHtml(r.Name)}</td>
      <td>${r.Style || '-'}</td>
      <td>${r.DisplayRarity || '-'}</td>
      <td>${getFieldRankNum(r, field) ?? '-'}</td>
    </tr>
  `).join('');
}

// ===================== バックアップ/復旧 =====================
function downloadText(filename, text) {
  const blob = new Blob([text], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function setupBackupUI() {
  const btnExport = document.getElementById('btnExport');
  const fileImportReplace = document.getElementById('fileImportReplace');
  const fileImportMerge = document.getElementById('fileImportMerge');
  const btnReset = document.getElementById('btnReset');

  btnExport.addEventListener('click', ()=>{
    const state = loadState();
    downloadText('psleep-check-export.json', JSON.stringify(state, null, 2));
  });

  fileImportReplace.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      alert('インポート（置換）しました。');
      const state = loadState();
      renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
    } catch { alert('JSONの読み込みに失敗しました。'); }
    finally { e.target.value = ''; }
  });

  fileImportMerge.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try {
      const incoming = JSON.parse(text);
      const state = loadState();
      if (incoming?.checked && typeof incoming.checked === 'object') {
        for (const no of Object.keys(incoming.checked)) {
          for (const star of Object.keys(incoming.checked[no])) {
            setChecked(state, no, star, !!incoming.checked[no][star]);
          }
        }
      }
      alert('インポート（マージ）しました。');
      renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
    } catch { alert('JSONの読み込みに失敗しました。'); }
    finally { e.target.value = ''; }
  });

  btnReset.addEventListener('click', ()=>{
    if (!confirm('保存データをすべて消去します。よろしいですか？')) return;
    localStorage.removeItem(STORAGE_KEY);
    const state = loadState();
    renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
  });
}

// ===================== 初期化 =====================
async function main() {
  await loadData();

  setupFieldTabs();
  setupRankSearchControls();
  setupBackupUI();

  const state = loadState();
  renderSummary(state);
  renderAllFaces(state);
  renderFieldTables(state);
  renderRankSearch(state);

  document.getElementById('searchName').addEventListener('input', ()=>renderAllFaces(loadState()));
  document.getElementById('filterStyle').addEventListener('change', ()=>renderAllFaces(loadState()));
  document.getElementById('sortBy').addEventListener('change', ()=>renderAllFaces(loadState()));

  // 全体一括ON/OFF（こちらは誤爆防止のため確認ダイアログを維持）
  document.getElementById('btnAllOn').addEventListener('click', ()=>{
    if (!confirm('すべての寝顔をチェックします。よろしいですか？')) return;
    const state = loadState();
    for (const ent of LAST_RENDER_ENTRIES) {
      CHECKABLE_STARS.forEach(star=>{ if (speciesHasStar(ent, star)) setChecked(state, ent.no, star, true); });
    }
    renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
  });
  document.getElementById('btnAllOff').addEventListener('click', ()=>{
    if (!confirm('すべての寝顔のチェックを解除します。よろしいですか？')) return;
    const state = loadState();
    for (const ent of LAST_RENDER_ENTRIES) {
      CHECKABLE_STARS.forEach(star=>{ if (speciesHasStar(ent, star)) setChecked(state, ent.no, star, false); });
    }
    renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
  });
}

document.addEventListener('DOMContentLoaded', main);
