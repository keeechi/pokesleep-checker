// ===================== 設定 =====================
const DATA_URL = './pokemon_data_cleaned.json';
const STORAGE_KEY = 'psleep-check-v1';
const FIELD_KEYS = [
  'ワカクサ本島', 'シアンの砂浜', 'トープ洞窟', 'ウノハナ雪原',
  'ラピスラズリ湖畔', 'ゴールド旧発電所', 'ワカクサ本島EX'
];
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
const STYLE_ICON = {
  'うとうと': 'assets/icons/01-uto-v2.png',
  'すやすや': 'assets/icons/02-suya-v2.png',
  'ぐっすり': 'assets/icons/03-gu-v2.png',
};
const POKEMON_ICONS_JS = './assets/icons/pokemon_icons/pokemon_icons.js';

// アイコンサイズ
const ICON_SIZE = 45;         // 全寝顔
const ICON_SIZE_FIELD = 36;   // フィールド別

// 王冠アイコン
const BADGE_GOLD   = 'assets/icons/04-GoldBadge.png';
const BADGE_SILVER = 'assets/icons/05-SilverBadge.png';

// サマリーから除外（ダークライ）
const EXCLUDED_SPECIES_FOR_SUMMARY = new Set(['0491']); // 4桁ゼロ埋め No

// ===================== 小ユーティリティ =====================
// 4桁ゼロ埋め（1000以上はそのまま）
function normalizeNo(noRaw) {
  const s = String(noRaw ?? '').trim();
  const num = parseInt(s.replace(/^0+/, '') || '0', 10);
  if (Number.isNaN(num)) return s;
  return (num >= 1000) ? String(num) : String(num).padStart(4, '0');
}
function toDex4(no) {
  const n = Number(no);
  if (!Number.isFinite(n)) return null;
  return n >= 1000 ? String(n) : String(n).padStart(4, '0');
}
function normalizeJP(s) {
  if (!s) return '';
  let out = s.normalize('NFKC').toLowerCase();
  out = out.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  out = out.replace(/[ーｰ‐\-・\s]/g, '');
  return out;
}
function escapeHtml(s){ return s?.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) || ''; }

// ★ ランク表記を省スペース表示にする：段（色）・段内番号
function splitStage(rankNum) {
  if (rankNum >= 1 && rankNum <= 5)  return { stage:'ノーマル', color:'#ff0000', idx: rankNum };
  if (rankNum <= 10)                 return { stage:'スーパー', color:'#0000ff', idx: rankNum - 5 };
  if (rankNum <= 15)                 return { stage:'ハイパー', color:'#ff8c00', idx: rankNum - 10 };
  return                                { stage:'マスター', color:'#9400d3', idx: rankNum - 15 }; // 16..35
}
function renderRankChip(rankNum) {
  if (!rankNum) return 'ー';
  const { color, idx } = splitStage(rankNum);
  return `<span class="rank-chip"><span class="rank-ball" style="color:${color}">◓</span><span class="rank-num">${idx}</span></span>`;
}
function labelForRank(n) {
  const { stage, idx } = splitStage(n);
  return `${stage}${idx}`;
}

// ダークライ除外判定
function isExcludedFromSummary(row) {
  if (EXCLUDED_SPECIES_FOR_SUMMARY.has(row.No)) return true;
  return /ダークライ/i.test(row.Name || '');
}

// ===================== 状態保存（★キーは IconNo 優先） =====================
function rowKey(row){ return String(row.IconNo || row.No); }                 // 行用キー
function entKey(ent){ return String(ent.iconNo || ent.no); }                 // まとめ用キー（形態ごと）

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { checked: {} };
  } catch {
    return { checked: {} };
  }
}
function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setChecked(state, key, star, val) {
  if (!state.checked[key]) state.checked[key] = {};
  state.checked[key][star] = !!val;
  saveState(state);
}
function getChecked(state, key, star) { return !!(state.checked?.[key]?.[star]); }
function setRowAll(state, key, val) { CHECKABLE_STARS.forEach(star => setChecked(state, key, star, val)); }

// ===================== データロード & 整形 =====================
let RAW_ROWS = [];
let SPECIES_MAP = new Map();  // key: `${No}__${Name}` → 形態ごと

async function loadData() {
  const res = await fetch(DATA_URL);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json['すべての寝顔一覧'] || []);
  RAW_ROWS = rows.map(r => ({
    ID: r.ID,
    No: normalizeNo(r.No),          // 表示用（0849）
    IconNo: String(r.IconNo || ''), // 形態区別（084901/084902）
    Name: r.Name,
    Style: r.Style,
    DisplayRarity: r.DisplayRarity,
    fields: Object.fromEntries(FIELD_KEYS.map(k => [k, (r[k] ?? '').trim()])),
  }));
  buildSpeciesIndex();
}

function buildSpeciesIndex() {
  SPECIES_MAP.clear();
  for (const row of RAW_ROWS) {
    const key = `${row.No}__${row.Name}`; // 形態名も含めて分ける
    if (!SPECIES_MAP.has(key)) {
      SPECIES_MAP.set(key, { no: row.No, name: row.Name, styles: new Set(), rarities: new Set(), rows: [], iconNo: '' });
    }
    const ent = SPECIES_MAP.get(key);
    if (row.Style) ent.styles.add(row.Style);
    if (row.DisplayRarity) ent.rarities.add(row.DisplayRarity);
    if (!ent.iconNo && row.IconNo) ent.iconNo = row.IconNo; // 形態のアイコンNo
    ent.rows.push(row);
  }
}

function getFieldRankNum(row, fieldKey) {
  const raw = row.fields[fieldKey] || '';
  // 1..35 へ正規化
  if (!raw) return null;
  const m = String(raw).trim().match(/(ノーマル|スーパー|ハイパー|マスター)\s*([0-9１-９]+)$/);
  if (!m) return null;
  const stage = m[1];
  const idx = parseInt(m[2].replace(/[^\d]/g,''), 10);
  if (stage === 'ノーマル') return (idx>=1&&idx<=5) ? idx : null;
  if (stage === 'スーパー') return (idx>=1&&idx<=5) ? 5+idx : null;
  if (stage === 'ハイパー') return (idx>=1&&idx<=5) ? 10+idx : null;
  if (stage === 'マスター') return (idx>=1&&idx<=20)? 15+idx : null;
  return null;
}
function speciesHasStar(entry, star) { return entry.rows.some(r => r.DisplayRarity === star); }

// ===================== アイコン生成関連 =====================
function getIconKeyFromNo(no) {
  if (no == null) return null;
  if (typeof no === 'string' && /^\d{4,}$/.test(no)) return no.slice(0, 4);
  const k = toDex4(no);
  return k || null;
}
function getCompletedSVGFromGlobals(iconId) {
  const candidates = [window.pokemonIcons, window.POKEMON_ICONS, window.pokemon_icons, window.POKEMON_SVG_MAP];
  for (const obj of candidates) {
    if (obj && typeof obj === 'object' && obj[iconId]) return String(obj[iconId]);
  }
  return null;
}
function ensureSvgSize(svgString, sizePx) {
  if (!svgString) return null;
  const hasSize = /<svg[^>]*(\bwidth=|\bheight=)/i.test(svgString);
  if (hasSize) return svgString;
  return svgString.replace(/<svg/i, `<svg width="${sizePx}" height="${sizePx}"`);
}
let _iconsLoadingPromise = null;
function loadPokemonIconsScriptOnce() {
  if (getCompletedSVGFromGlobals('0001')) return Promise.resolve();
  if (_iconsLoadingPromise) return _iconsLoadingPromise;
  _iconsLoadingPromise = new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = POKEMON_ICONS_JS;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => resolve();
    document.head.appendChild(tag);
  });
  return _iconsLoadingPromise;
}
function renderFromRects(iconId, sizePx = ICON_SIZE) {
  const table = (window.pokemonRectData || {});
  const data = iconId ? table[iconId] : null;
  if (!data) return null;
  let rects = '';
  for (const r of data) {
    const x = (r.x * sizePx).toFixed(1);
    const y = (r.y * sizePx).toFixed(1);
    const w = (r.w * sizePx).toFixed(1);
    const h = (r.h * sizePx).toFixed(1);
    const rx = r.r != null ? (r.r * sizePx).toFixed(1) : null;
    rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${r.color}"${rx ? ` rx="${rx}" ry="${rx}"` : ''}/>`;
  }
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}">${rects}</svg>`;
}
function renderPokemonIconById(iconId, sizePx = ICON_SIZE) {
  const completed = getCompletedSVGFromGlobals(iconId);
  if (completed) return ensureSvgSize(completed, sizePx);
  const rectSvg = renderFromRects(iconId, sizePx);
  if (rectSvg) return rectSvg;
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}">
    <rect x="0" y="0" width="${sizePx}" height="${sizePx}" fill="#eee" stroke="#bbb"/>
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${iconId ?? '----'}</text>
  </svg>`;
}

// ===================== サマリー =====================
function renderSummary(state) {
  const fmtCell = ({num, denom, rate}, strong = false) => {
    let badgeSrc = null;
    if (rate >= 95)      badgeSrc = BADGE_GOLD;
    else if (rate >= 80) badgeSrc = BADGE_SILVER;
    const topRowHtml = badgeSrc
      ? `<span class="sum-top-row"><span class="sum-num">${num}</span><img class="sum-badge" src="${badgeSrc}" alt="" loading="lazy" decoding="async"></span>`
      : `<span class="sum-num">${num}</span>`;
    return `
      <div class="summary-cell${strong ? ' fw-semibold' : ''}">
        <div class="sum-top">${topRowHtml}</div>
        <div class="sum-hr"></div>
        <div class="sum-mid">${denom}</div>
        <div class="sum-per">(${rate}%)</div>
      </div>`;
  };

  const root = document.getElementById('summaryGrid');

  // フィールド別
  const calcFor = (style, field) => {
    let denom = 0, num = 0;
    for (const row of RAW_ROWS) {
      if (isExcludedFromSummary(row)) continue;
      if (style && row.Style !== style) continue;
      const rankNum = getFieldRankNum(row, field);
      if (rankNum) {
        denom++;
        if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, rowKey(row), row.DisplayRarity)) num++;
      }
    }
    const rate = denom ? Math.round((num / denom) * 100) : 0;
    return { num, denom, rate };
  };

  // 全体
  const calcForAll = (style) => {
    let denom = 0, num = 0;
    for (const row of RAW_ROWS) {
      if (isExcludedFromSummary(row)) continue;
      if (style && row.Style !== style) continue;
      denom++;
      if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, rowKey(row), row.DisplayRarity)) num++;
    }
    const rate = denom ? Math.round((num / denom) * 100) : 0;
    return { num, denom, rate };
  };

  const header = `
    <table class="table table-sm align-middle mb-0 summary-table">
      <thead class="table-light">
        <tr>
          <th style="min-width:80px; width:80px;"></th>
          <th class="text-center" style="width:80px;">全体</th>
          ${FIELD_KEYS.map(f => `<th class="text-center" style="width:80px;">${FIELD_SHORT[f]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${SLEEP_TYPES.map(style => {
          const totalCell = (() => {
            const d = calcForAll(style);
            return `<td class="text-center">${fmtCell(d)}</td>`;
          })();
          const fieldCells = FIELD_KEYS.map(field => {
            const d = calcFor(style, field);
            return `<td class="text-center">${fmtCell(d)}</td>`;
          }).join('');
          return `<tr>
            <th class="text-start align-middle">
              <img src="${STYLE_ICON[style]}" alt="${style}" class="summary-icon" loading="lazy">
            </th>
            ${totalCell}
            ${fieldCells}
          </tr>`;
        }).join('')}
        ${(() => {
          const allTotal = (() => {
            const d = calcForAll(null);
            return `<td class="text-center">${fmtCell(d, true)}</td>`;
          })();
          const tds = FIELD_KEYS.map(field => {
            const d = calcFor(null, field);
            return `<td class="text-center">${fmtCell(d, true)}</td>`;
          }).join('');
          return `<tr class="table-light">
            <th class="fw-semibold">合計</th>
            ${allTotal}
            ${tds}
          </tr>`;
        })()}
      </tbody>
    </table>`;
  root.innerHTML = header;
}

// ===================== 全寝顔チェックシート =====================
let LAST_RENDER_ENTRIES = [];
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
    return a.no.localeCompare(b.no, 'ja');
  });

  LAST_RENDER_ENTRIES = entries;

  tbody.innerHTML = entries.map(ent => {
    const key = entKey(ent);               // ★ 形態ごとのキー
    const no = ent.no, name = ent.name;

    const cells = CHECKABLE_STARS.map(star => {
      const exists = speciesHasStar(ent, star);
      if (!exists) return `<td class="text-center cell-absent">—</td>`;
      const checked = getChecked(state, key, star); // ★ key で判定
      return `
        <td class="text-center ${checked ? 'cell-checked' : ''}">
          <input type="checkbox" class="form-check-input"
            data-key="${key}" data-star="${star}"
            ${checked ? 'checked' : ''}>
        </td>`;
    }).join('');

    const bulkBtn = `
      <div class="btn-group-vertical btn-group-sm bulk-group-vert" role="group" aria-label="行まとめ">
        <button type="button" class="btn btn-outline-primary" data-bulk="on"  data-key="${key}">一括ON</button>
        <button type="button" class="btn btn-outline-secondary" data-bulk="off" data-key="${key}">一括OFF</button>
      </div>`;

    return `
      <tr>
        <td class="name-cell text-center align-middle">
          <div style="width:${ICON_SIZE + 16}px; margin: 0 auto;">
            <div class="poke-icon mx-auto" style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;line-height:0;">
              ${renderPokemonIconById(ent.iconNo || getIconKeyFromNo(no), ICON_SIZE)}
            </div>
            <div class="mt-1" style="font-size:9px; line-height:1.2; word-break:break-word; white-space:normal;">
              <div class="text-muted">${no}</div>
              <div class="fw-semibold" style="max-width:${ICON_SIZE + 8}px; margin:0 auto;">${escapeHtml(name)}</div>
            </div>
          </div>
        </td>
        ${cells}
        <td class="text-center td-bulk">${bulkBtn}</td>
      </tr>`;
  }).join('');

  // チェック（★ data-key を使う）
  tbody.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e)=>{
      const key  = e.target.dataset.key;
      const star = e.target.dataset.star;
      setChecked(state, key, star, e.target.checked);
      e.target.closest('td').classList.toggle('cell-checked', e.target.checked);
      renderSummary(state);
      renderRankSearch(state);
    });
  });

  // 行まとめ（★ data-key を使う）
  tbody.querySelectorAll('button[data-bulk]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const key  = e.currentTarget.dataset.key;
      const mode = e.currentTarget.dataset.bulk; // on/off
      setRowAll(state, key, mode === 'on');
      CHECKABLE_STARS.forEach(star=>{
        const input = tbody.querySelector(`input[data-key="${key}"][data-star="${star}"]`);
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

// ===================== フィールド別 =====================
function firstStyleKey(ent){
  const arr = Array.from(ent.styles);
  const order = {'うとうと':1,'すやすや':2,'ぐっすり':3};
  arr.sort((a,b)=>(order[a]||9)-(order[b]||9));
  return arr[0] || '';
}

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
              <th class="text-center">ポケモン</th>
              <th class="text-center">タイプ</th>
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

// フィールド別のフィルター UI（存在すれば）
const _q = document.getElementById('byfieldSearchName');
const _s = document.getElementById('byfieldFilterStyle');
const _o = document.getElementById('byfieldSortBy');
_q && _q.addEventListener('input', ()=>renderFieldTables(loadState()));
_s && _s.addEventListener('change', ()=>renderFieldTables(loadState()));
_o && _o.addEventListener('change', ()=>renderFieldTables(loadState()));

function renderFieldTables(state) {
  const qEl = document.getElementById('byfieldSearchName');
  const sEl = document.getElementById('byfieldFilterStyle');
  const oEl = document.getElementById('byfieldSortBy');

  const searchName = (qEl?.value || '').trim();
  const filterStyle = sEl?.value || '';
  const sortBy = oEl?.value || 'no-asc';

  const normQuery = normalizeJP(searchName);

  let baseEntries = Array.from(SPECIES_MAP.values());
  if (normQuery) baseEntries = baseEntries.filter(ent => normalizeJP(ent.name).includes(normQuery));
  if (filterStyle) baseEntries = baseEntries.filter(ent => ent.rows.some(r => r.Style === filterStyle));

  baseEntries.sort((a,b)=>{
    if (sortBy === 'name-asc')  return a.name.localeCompare(b.name, 'ja');
    if (sortBy === 'name-desc') return b.name.localeCompare(a.name, 'ja');
    if (sortBy === 'no-desc')   return b.no.localeCompare(a.no, 'ja');
    return a.no.localeCompare(b.no, 'ja');
  });

  FIELD_KEYS.forEach(field=>{
    const tbody = document.querySelector(`#fieldTabsContent tbody[data-field="${field}"]`);
    const rows = [];
    for (const ent of baseEntries) {
      const appearAny = ent.rows.some(r => getFieldRankNum(r, field));
      if (!appearAny) continue;

      const key = entKey(ent); // ★ 形態ごとのキー

      const cells = CHECKABLE_STARS.map(star=>{
        const hasRow = ent.rows.find(r => r.DisplayRarity === star);
        if (!hasRow) return `<td class="text-center cell-absent">—</td>`;
        const rankNum = getFieldRankNum(hasRow, field);
        if (!rankNum) return `<td class="text-center cell-disabled">ー</td>`;

        const checked = getChecked(state, key, star); // ★ key で判定
        return `
          <td class="text-center toggle-cell ${checked ? 'cell-checked' : ''}"
              data-key="${key}" data-star="${star}">
            ${renderRankChip(rankNum)}
          </td>`;
      }).join('');

      rows.push(`
        <tr>
          <td class="byfield-name-cell text-center align-middle">
            <div class="pf-wrap">
              <div class="byfield-icon">
                ${renderPokemonIconById(ent.iconNo || getIconKeyFromNo(ent.no), ICON_SIZE_FIELD)}
              </div>
              <div class="pf-text">
                <div class="pf-no text-muted">${ent.no}</div>
                <div class="pf-name">${escapeHtml(ent.name)}</div>
              </div>
            </div>
          </td>
          <td class="type-cell text-center">${firstStyleKey(ent) || '-'}</td>
          ${cells}
        </tr>`);
    }
    tbody.innerHTML = rows.join('');

    // ★ セル全体クリックで ON/OFF（data-key を使用）
    tbody.querySelectorAll('td.toggle-cell').forEach(td=>{
      td.addEventListener('click', ()=>{
        const key  = td.dataset.key;
        const star = td.dataset.star;
        const now  = getChecked(state, key, star);
        setChecked(state, key, star, !now);
        td.classList.toggle('cell-checked', !now);
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

  const rankSel = document.getElementById('searchRank');
  const opts = [];
  for (let n = 1; n <= 35; n++) opts.push(`<option value="${n}">${labelForRank(n)}</option>`);
  rankSel.innerHTML = opts.join('');
  rankSel.value = '1';
  rankSel.addEventListener('change', ()=>renderRankSearch(loadState()));
}

function renderRankSearch(state) {
  const field = document.getElementById('searchField').value || FIELD_KEYS[0];
  const rank = Math.max(1, Math.min(35, parseInt(document.getElementById('searchRank').value||'1',10)));
  const tbody = document.querySelector('#rankSearchTable tbody');

  const items = [];
  for (const row of RAW_ROWS) {
    const rNum = getFieldRankNum(row, field);
    if (!rNum || rNum > rank) continue;
    if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, rowKey(row), row.DisplayRarity)) continue; // ★ rowKey
    items.push(row);
  }
  items.sort((a,b)=>{
    const c1 = a.No.localeCompare(b.No,'ja'); if (c1) return c1;
    const iA = RARITIES.indexOf(a.DisplayRarity), iB = RARITIES.indexOf(b.DisplayRarity);
    const c2 = (iA-iB); if (c2) return c2;
    return a.Style.localeCompare(b.Style,'ja');
  });

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center">
          <div class="completed-msg">COMPLETED</div>
          <div class="text-muted small mt-1">この条件で出現する寝顔はすべて入手済みです</div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = items.map(r=>{
    const needRank = getFieldRankNum(r, field);
    const iconSvg = renderPokemonIconById(r.IconNo || getIconKeyFromNo(r.No), ICON_SIZE_FIELD);
    return `
      <tr>
        <td class="byfield-name-cell text-center align-middle">
          <div class="pf-wrap">
            <div class="byfield-icon">${iconSvg}</div>
            <div class="pf-text">
              <div class="pf-no text-muted">${r.No}</div>
              <div class="pf-name">${escapeHtml(r.Name)}</div>
            </div>
          </div>
        </td>
        <td class="text-center">${r.Style || '-'}</td>
        <td class="text-center">${r.DisplayRarity || '-'}</td>
        <td class="text-center">${renderRankChip(needRank)}</td>
      </tr>`;
  }).join('');
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
        for (const key of Object.keys(incoming.checked)) {
          for (const star of Object.keys(incoming.checked[key])) {
            setChecked(state, key, star, !!incoming.checked[key][star]);
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

// ===================== レイアウト用の軽い注入CSS =====================
let _listLayoutStyleInjected = false;
function injectListLayoutCSS() {
  if (_listLayoutStyleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    td.name-cell { min-width: 180px; }
    td.td-bulk { width: 72px; padding-left: 4px; padding-right: 4px; }
    .bulk-group-vert .btn { display: block; width: 100%; }
    .bulk-group-vert .btn + .btn { margin-top: 6px; }
  `;
  document.head.appendChild(style);
  _listLayoutStyleInjected = true;
}

// ===================== 初期化 =====================
async function main() {
  injectListLayoutCSS();

  // サマリー用の軽いスタイル
  let _summaryStyleInjected = false;
  (function injectSummaryTableCSS(){
    if (_summaryStyleInjected) return;
    const style = document.createElement('style');
    style.textContent = `
      .summary-table { font-size: calc(1rem - 2pt); }
      .summary-cell { text-align: center; line-height: 1.15; }
      .summary-cell .sum-top { font-weight: 600; }
      .summary-cell .sum-hr  { height: 1px; background: currentColor; opacity: .3; margin: 2px 12px; }
      .summary-cell .sum-per { opacity: .75; }
    `;
    document.head.appendChild(style);
    _summaryStyleInjected = true;
  })();

  await loadPokemonIconsScriptOnce();
  await loadData();

  setupFieldTabs();
  setupRankSearchControls();
  setupBackupUI();

  const state = loadState();
  renderSummary(state);
  renderAllFaces(state);
  renderFieldTables(state);
  renderRankSearch(state);

  // 全寝顔の検索・フィルタ
  document.getElementById('searchName').addEventListener('input', ()=>renderAllFaces(loadState()));
  document.getElementById('filterStyle').addEventListener('change', ()=>renderAllFaces(loadState()));
  document.getElementById('sortBy').addEventListener('change', ()=>renderAllFaces(loadState()));

  // 全体一括ON/OFF（形態ごとに key で処理）
  document.getElementById('btnAllOn').addEventListener('click', ()=>{
    if (!confirm('すべての寝顔をチェックします。よろしいですか？')) return;
    const state = loadState();
    for (const ent of LAST_RENDER_ENTRIES) {
      const key = entKey(ent);
      CHECKABLE_STARS.forEach(star=>{ if (speciesHasStar(ent, star)) setChecked(state, key, star, true); });
    }
    renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
  });
  document.getElementById('btnAllOff').addEventListener('click', ()=>{
    if (!confirm('すべての寝顔のチェックを解除します。よろしいですか？')) return;
    const state = loadState();
    for (const ent of LAST_RENDER_ENTRIES) {
      const key = entKey(ent);
      CHECKABLE_STARS.forEach(star=>{ if (speciesHasStar(ent, star)) setChecked(state, key, star, false); });
    }
    renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
  });
}

document.addEventListener('DOMContentLoaded', main);
