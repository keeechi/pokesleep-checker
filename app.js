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
  'うとうと': 'assets/icons/01-uto.png',
  'すやすや': 'assets/icons/02-suya.png',
  'ぐっすり': 'assets/icons/03-gu.png',
};
const POKEMON_ICONS_JS = './assets/icons/pokemon_icons/pokemon_icons.js';

// ★ 追加：アイコンの標準サイズ（ご要望に合わせて 45px）
const ICON_SIZE = 45;

// 冠アイコン
const BADGE_GOLD   = 'assets/icons/04-GoldBadge.png';
const BADGE_SILVER = 'assets/icons/05-SilverBadge.png';

// ★ フィールド別用の少し小さめアイコン
const ICON_SIZE_FIELD = 36;

// ★ 行まとめ縦並び＆列幅調整のためのスタイル調整
let _listLayoutStyleInjected = false;
function injectListLayoutCSS() {
  if (_listLayoutStyleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    /* ポケモン列を少し広めに確保 */
    td.name-cell { min-width: 180px; }

    /* 行まとめ列を細く／ボタンは縦積み */
    td.td-bulk { width: 72px; padding-left: 4px; padding-right: 4px; }
    .bulk-group-vert .btn { display: block; width: 100%; }
    .bulk-group-vert .btn + .btn { margin-top: 6px; } /* ボタン間に少し隙間 */
  `;
  document.head.appendChild(style);
  _listLayoutStyleInjected = true;
}

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

// ★ ランク番号(1..35) → 段(色)と段内インデックス(1..)
function splitStage(rankNum) {
  if (rankNum >= 1 && rankNum <= 5)  return { color: '#ff0000', idx: rankNum       }; // ノーマル
  if (rankNum <= 10)                 return { color: '#0000ff', idx: rankNum - 5   }; // スーパー
  if (rankNum <= 15)                 return { color: '#ffa500', idx: rankNum - 10  }; // ハイパー
  /* 16..35 */                       return { color: '#9400d3', idx: rankNum - 15  }; // マスター
}

// ★ 表示用の小さな「◓ + 数字」(色は段ごと)
function renderRankChip(rankNum) {
  if (!rankNum) return 'ー';
  const { color, idx } = splitStage(rankNum);
  return `<span class="rank-chip"><span class="rank-ball" style="color:${color}">◓</span><span class="rank-num">${idx}</span></span>`;
}

// 検索用正規化（ひら→カナ同一視・長音/空白除去）
function normalizeJP(s) {
  if (!s) return '';
  let out = s.normalize('NFKC').toLowerCase();
  out = out.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  out = out.replace(/[ーｰ‐\-・\s]/g, '');
  return out;
}

// ★ サマリー集計から除外するポケモン（ダークライ）
const EXCLUDED_SPECIES_FOR_SUMMARY = new Set(['0491']); // 4桁ゼロ埋めNoで管理

function isExcludedFromSummary(row) {
  // Noで除外（最も確実）。念のため名前マッチも保険で入れておく
  if (EXCLUDED_SPECIES_FOR_SUMMARY.has(row.No)) return true;
  return /ダークライ/i.test(row.Name || '');
}

  // フィールド別フィルターのイベント
  const _q = document.getElementById('byfieldSearchName');
  const _s = document.getElementById('byfieldFilterStyle');
  const _o = document.getElementById('byfieldSortBy');
  _q && _q.addEventListener('input', ()=>renderFieldTables(loadState()));
  _s && _s.addEventListener('change', ()=>renderFieldTables(loadState()));
  _o && _o.addEventListener('change', ()=>renderFieldTables(loadState()));

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
  No: normalizeNo(r.No),           // ← 表示用No（0849）
  IconNo: String(r.IconNo || ''),  // ← 追加：アイコン参照用（084901/084902）
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
    const key = `${row.No}__${row.Name}`; // ← 形態名まで分けたいならName込みでOK
    if (!SPECIES_MAP.has(key)) {
      SPECIES_MAP.set(key, { no: row.No, name: row.Name, styles: new Set(), rarities: new Set(), rows: [], iconNo: '' });
    }
    const ent = SPECIES_MAP.get(key);
    if (row.Style) ent.styles.add(row.Style);
    if (row.DisplayRarity) ent.rarities.add(row.DisplayRarity);
    if (!ent.iconNo && row.IconNo) ent.iconNo = row.IconNo; // ★ 追加：形態のアイコンNoを保存
    ent.rows.push(row);
  }
}

function speciesHasStar(entry, star) { return entry.rows.some(r => r.DisplayRarity === star); }

function getFieldRankNum(row, fieldKey) {
  const raw = row.fields[fieldKey] || '';
  return mapRankToNumber(raw);
}

// ===================== アイコン生成関連 =====================
// 4桁ゼロ埋め（1000以上はそのまま）
function toDex4(no) {
  const n = Number(no);
  if (!Number.isFinite(n)) return null;  // ← NaN対策
  return n >= 1000 ? String(n) : String(n).padStart(4, '0');
}

// アイコンキー生成（Noベース）
function getIconKeyFromNo(no) {
  if (no == null) return null;
  if (typeof no === 'string' && /^\d{4,}$/.test(no)) return no.slice(0, 4);
  const k = toDex4(no);
  return k || null;
}

// 期待されうるグローバル名を総当りで参照（pokemon_icons.js の実装差異に備える）
function getCompletedSVGFromGlobals(iconId) {
  const candidates = [
    window.pokemonIcons,       // { "0001": "<svg>...</svg>", ... }
    window.POKEMON_ICONS,      // 同上
    window.pokemon_icons,      // 同上
    window.POKEMON_SVG_MAP,    // 同上
  ];
  for (const obj of candidates) {
    if (obj && typeof obj === 'object' && obj[iconId]) return String(obj[iconId]);
  }
  return null;
}

// SVG文字列に width/height が無ければ付与
function ensureSvgSize(svgString, sizePx) {
  if (!svgString) return null;
  const hasSize = /<svg[^>]*(\bwidth=|\bheight=)/i.test(svgString);
  if (hasSize) return svgString;
  return svgString.replace(
    /<svg/i,
    `<svg width="${sizePx}" height="${sizePx}"`
  );
}

// pokemon_icons.js を動的読み込み（HTML側にscriptが無くてもOK）
let _iconsLoadingPromise = null;
function loadPokemonIconsScriptOnce() {
  if (getCompletedSVGFromGlobals('0001')) return Promise.resolve(); // 既に読込済
  if (_iconsLoadingPromise) return _iconsLoadingPromise;

  _iconsLoadingPromise = new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = POKEMON_ICONS_JS;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => resolve(); // 読み込み失敗でも先に進む（フォールバック有り）
    document.head.appendChild(tag);
  });
  return _iconsLoadingPromise;
}

// 旧：矩形データ（window.pokemonRectData）からインラインSVG生成
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

// 統合アイコンレンダ
function renderPokemonIconById(iconId, sizePx = ICON_SIZE) {
  // 1) 完成SVG（最優先）
  const completed = getCompletedSVGFromGlobals(iconId);
  if (completed) return ensureSvgSize(completed, sizePx);

  // 2) 矩形フォールバック
  const rectSvg = renderFromRects(iconId, sizePx);
  if (rectSvg) return rectSvg;

  // 3) プレースホルダー
  return `
    <svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}">
      <rect x="0" y="0" width="${sizePx}" height="${sizePx}" fill="#eee" stroke="#bbb"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${iconId ?? '----'}</text>
    </svg>`;
}

// ===================== サマリー =====================
function renderSummary(state) {
  // ★ 追加：セルの統一表示（分子／区切り／分母／(％)）
const fmtCell = ({num, denom, rate}, strong = false) => {
  let badgeSrc = null;
  if (rate >= 95)      badgeSrc = BADGE_GOLD;
  else if (rate >= 80) badgeSrc = BADGE_SILVER;

  // バッジがある時だけ横並び（inline-flex）で描画。
  // ない時は数字のみ（インライン要素）なので、セルの text-align:center で中央揃えになる。
  const topRowHtml = badgeSrc
    ? `<span class="sum-top-row"><span class="sum-num">${num}</span><img class="sum-badge" src="${badgeSrc}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="sum-num">${num}</span>`;

  return `
    <div class="summary-cell${strong ? ' fw-semibold' : ''}">
      <div class="sum-top">${topRowHtml}</div>
      <div class="sum-hr"></div>
      <div class="sum-mid">${denom}</div>
      <div class="sum-per">(${rate}%)</div>
    </div>
  `;
};
  
  const root = document.getElementById('summaryGrid');

  // フィールド別の集計（既存ロジック）
  const calcFor = (style, field) => {
    let denom = 0, num = 0;
    for (const row of RAW_ROWS) {
      if (isExcludedFromSummary(row)) continue; // ★ サマリーからは除外
      if (style && row.Style !== style) continue; // styleがnullなら全タイプ合算
      const rankNum = getFieldRankNum(row, field);
      if (rankNum) {
        denom++;
        if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, row.No, row.DisplayRarity)) num++;
      }
    }
    const rate = denom ? Math.round((num / denom) * 100) : 0;
    return { num, denom, rate };
  };

  // ★追加：全体（フィールド無視）の集計
  //   分母=指定タイプの「すべての寝顔数」
  //   分子=チェック済み（☆1〜☆4のみ）
  const calcForAll = (style) => {
    let denom = 0, num = 0;
    for (const row of RAW_ROWS) {
      if (style && row.Style !== style) continue; // nullなら全タイプ合算
      denom++; // フィールド条件なしで全件カウント
      if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, row.No, row.DisplayRarity)) num++;
    }
    const rate = denom ? Math.round((num / denom) * 100) : 0;
    return { num, denom, rate };
  };

const header = `
  <table class="table table-sm align-middle mb-0 summary-table">
    <thead class="table-light">
      <tr>
        <!-- 第一列（アイコン列） -->
        <th style="min-width:80px; width:80px;"></th>
        <!-- 全体列 -->
        <th class="text-center" style="width:80px;">全体</th>
        <!-- 各フィールド列 -->
        ${FIELD_KEYS.map(f => `<th class="text-center" style="width:80px;">${FIELD_SHORT[f]}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${SLEEP_TYPES.map(style => {
        // 「全体」セル（強調は不要なら false のまま）
        const totalCell = (() => {
          const d = calcForAll(style);
          return `<td class="text-center">${fmtCell(d)}</td>`;
        })();

        // 各フィールドセル
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
      ${(() => { // 合計行
        const allTotal = (() => {
          const d = calcForAll(null);
          return `<td class="text-center">${fmtCell(d, true)}</td>`; // ★ 合計は太字
        })();

        const tds = FIELD_KEYS.map(field => {
          const d = calcFor(null, field);
          return `<td class="text-center">${fmtCell(d, true)}</td>`; // ★ 合計は太字
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
  <div class="btn-group-vertical btn-group-sm bulk-group-vert" role="group" aria-label="行まとめ">
    <button type="button" class="btn btn-outline-primary" data-bulk="on" data-no="${no}">一括ON</button>
    <button type="button" class="btn btn-outline-secondary" data-bulk="off" data-no="${no}">一括OFF</button>
  </div>`;

// ★ ここを変更：アイコンを小さく（ICON_SIZE）＋下に No と名前（小さめ文字）
return `
<tr>
  <td class="name-cell text-center align-middle">
    <div style="width:${ICON_SIZE + 16}px; margin: 0 auto;">
      <!-- アイコン -->
      <div class="poke-icon mx-auto" style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;line-height:0;">
        ${renderPokemonIconById(ent.iconNo || getIconKeyFromNo(no), ICON_SIZE)}
      </div>
      <!-- Noと名前 -->
      <div class="mt-1" style="font-size:9px; line-height:1.2; word-break:break-word; white-space:normal;">
        <div class="text-muted">${no}</div>
        <div class="fw-semibold" style="max-width:${ICON_SIZE + 8}px; margin:0 auto;">
          ${escapeHtml(name)}
        </div>
      </div>
    </div>
  </td>
  ${cells}
  <td class="text-center td-bulk">${bulkBtn}</td>
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

  // ★ ここを差し替え（No／レア度を削除）
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

function renderFieldTables(state) {
    // ★ 追加：フィルター入力を取得（存在しない場合は空扱い）
  const qEl = document.getElementById('byfieldSearchName');
  const sEl = document.getElementById('byfieldFilterStyle');
  const oEl = document.getElementById('byfieldSortBy');

  const searchName = (qEl?.value || '').trim();
  const filterStyle = sEl?.value || '';
  const sortBy = oEl?.value || 'no-asc';

  const normQuery = normalizeJP(searchName);

  // ベースとなるエントリ一覧（全種）
  let baseEntries = Array.from(SPECIES_MAP.values());

  // 名前フィルター
  if (normQuery) baseEntries = baseEntries.filter(ent => normalizeJP(ent.name).includes(normQuery));

  // 睡眠タイプフィルター（少なくとも1つの寝顔が該当タイプ）
  if (filterStyle) baseEntries = baseEntries.filter(ent => ent.rows.some(r => r.Style === filterStyle));

  // 並び替え
  baseEntries.sort((a,b)=>{
    if (sortBy === 'name-asc')  return a.name.localeCompare(b.name, 'ja');
    if (sortBy === 'name-desc') return b.name.localeCompare(a.name, 'ja');
    if (sortBy === 'no-desc')   return b.no.localeCompare(a.no, 'ja');
    return a.no.localeCompare(b.no, 'ja'); // no-asc
  });
  FIELD_KEYS.forEach(field=>{
    const tbody = document.querySelector(`#fieldTabsContent tbody[data-field="${field}"]`);
    const rows = [];
    for (const ent of baseEntries) {
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
    // フィールド上「出現しない」= "ー"
    return `<td class="text-center cell-disabled">ー</td>`;
  }

  // ★ 出現する寝顔 → ランク表示 + セル全体がトグル
  const checked = getChecked(state, ent.no, star);
  return `
    <td class="text-center toggle-cell ${checked ? 'cell-checked' : ''}"
        data-no="${ent.no}" data-star="${star}">
      ${renderRankChip(rankNum)}
    </td>`;
}).join('');

rows.push(`
  <tr>
    <!-- ★ ポケモン列：アイコン + No + 名前（中央／折返し） -->
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

    <!-- ★ 睡眠タイプ列：中央揃え＆9pt -->
    <td class="type-cell text-center">${firstStyleKey(ent) || '-'}</td>

    ${cells}
  </tr>
`);

    }
    tbody.innerHTML = rows.join('');

// ★ セル全体クリックでON/OFF
tbody.querySelectorAll('td.toggle-cell').forEach(td=>{
  td.addEventListener('click', (e)=>{
    const no   = td.dataset.no;
    const star = td.dataset.star;
    const now  = getChecked(state, no, star);
    setChecked(state, no, star, !now);
    td.classList.toggle('cell-checked', !now);

    // サマリー・ランク検索は常に更新
    renderSummary(state);
    renderRankSearch(state);
  });
});
  });
}

// ===================== ランク検索（未入手のみ） =====================
// ★ ランク番号(1..35) → 段(色)と段内インデックス(1..)
function splitStage(rankNum) {
  if (rankNum >= 1 && rankNum <= 5)  return { stage: 'ノーマル', idx: rankNum,      color: '#ff0000' };
  if (rankNum <= 10)                 return { stage: 'スーパー', idx: rankNum - 5,  color: '#0000ff' };
  if (rankNum <= 15)                 return { stage: 'ハイパー', idx: rankNum - 10, color: '#ffff00' };
  return                                { stage: 'マスター', idx: rankNum - 15, color: '#9400d3' }; // 16..35
}
function labelForRank(n) {
  const { stage, idx } = splitStage(n);
  return `${stage}${idx}`;
}

// 省スペース表示：◓ + 数字（色は段ごと）
// 既に byfield 用に定義済みなら再利用してOK
function renderRankChip(rankNum) {
  if (!rankNum) return 'ー';
  const { color, idx } = splitStage(rankNum);
  return `<span class="rank-chip"><span class="rank-ball" style="color:${color}">◓</span><span class="rank-num">${idx}</span></span>`;
}

function setupRankSearchControls() {
  const sel = document.getElementById('searchField');
  sel.innerHTML = FIELD_KEYS.map(f=>`<option value="${f}">${FIELD_SHORT[f]}</option>`).join('');
    document.getElementById('searchField').addEventListener('change', ()=>renderRankSearch(loadState()));

// ★ ランクセレクトを 1..35（ラベルは ノーマル1..マスター20）で生成
    const rankSel = document.getElementById('searchRank');
    const opts = [];
    for (let n = 1; n <= 35; n++) {
      opts.push(`<option value="${n}">${labelForRank(n)}</option>`);
    }
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
    if (CHECKABLE_STARS.includes(row.DisplayRarity) && getChecked(state, row.No, row.DisplayRarity)) continue;
    items.push(row);
  }
  items.sort((a,b)=>{
    const c1 = a.No.localeCompare(b.No,'ja'); if (c1) return c1;
    const iA = RARITIES.indexOf(a.DisplayRarity), iB = RARITIES.indexOf(b.DisplayRarity);
    const c2 = (iA-iB); if (c2) return c2;
    return a.Style.localeCompare(b.Style,'ja');
  });

 // ★ 該当が0件なら「COMPLETED」行を表示（可愛いバッジ風）
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

  // ★ 「No」列を廃止し、ポケモン列に アイコン＋No＋名前（中央）
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
  /* サマリー表のレイアウト調整*/
  injectListLayoutCSS();
    let _summaryStyleInjected = false;
    function injectSummaryTableCSS() {
    if (_summaryStyleInjected) return;
    const style = document.createElement('style');
    style.textContent = `
  
  /* サマリー表全体のフォントを 2pt 小さく */
    .summary-table { font-size: calc(1rem - 2pt); }

  /* セル内のレイアウトを統一（分子／区切り／分母／％） */
    .summary-cell { text-align: center; line-height: 1.15; }
    .summary-cell .sum-top { font-weight: 600; }
    .summary-cell .sum-hr  { height: 1px; background: currentColor; opacity: .3; margin: 2px 12px; }
    .summary-cell .sum-mid { }
    .summary-cell .sum-per { opacity: .75; }
  `;
  document.head.appendChild(style);
  _summaryStyleInjected = true;
}
  
  injectSummaryTableCSS();
  
  // 1) 完成SVGの読み込み（すでにHTMLで読み込まれていれば即return）
  await loadPokemonIconsScriptOnce();

  // 2) データとUI構築
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
