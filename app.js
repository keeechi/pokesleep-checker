// ===================== 設定 =====================
const DATA_URL = './pokemon_data_cleaned.json';

const STORAGE_KEY = 'psleep-check-v1';

const FIELD_KEYS = [
  'ワカクサ本島', 'シアンの砂浜', 'トープ洞窟', 'ウノハナ雪原',
  'ラピスラズリ湖畔', 'ゴールド旧発電所', 'ワカクサ本島EX'
];

// === Amber渓谷（特設ポップアップ） ===
const AMBER_GOAL = 450; // 目標寝顔数

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

const FIELD_HEAD_ICON = {
  'ワカクサ本島':   'assets/icons/001-wakakusa.png',
  'シアンの砂浜':   'assets/icons/002-cyan.png',
  'トープ洞窟':     'assets/icons/003-taupe.png',
  'ウノハナ雪原':   'assets/icons/004-unohana.png',
  'ラピスラズリ湖畔': 'assets/icons/005-rapis.png',
  'ゴールド旧発電所': 'assets/icons/006-gold.png',
  'ワカクサ本島EX': 'assets/icons/007-wakakusaex.png',
};

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

function buildRankMiniSummaryHTML(field, rank, state, sleepTypeFilter = '', statusFilter = 'すべて') {
  // 対象は「そのフィールドで rank 以下に出現する ☆1〜☆4」
  // 列: うとうと / すやすや / ぐっすり / 合計
  // 行: 入手済 / 未入手 / 合計
  const TYPES = SLEEP_TYPES;

  // カウンタ初期化
  const got = { 'うとうと':0, 'すやすや':0, 'ぐっすり':0 };
  const not = { 'うとうと':0, 'すやすや':0, 'ぐっすり':0 };

  for (const row of RAW_ROWS) {
    const rNum = getFieldRankNum(row, field);
    if (!rNum || rNum > rank) continue;
    if (!CHECKABLE_STARS.includes(row.DisplayRarity)) continue;  // ☆1〜☆4のみ
    if (sleepTypeFilter && row.Style !== sleepTypeFilter) continue;

    const style = row.Style;
    const k = rowKey(row);
    const star = row.DisplayRarity;
    const isChecked = getChecked(state, k, star);

    if (isChecked) got[style] = (got[style] || 0) + 1;
    else           not[style] = (not[style] || 0) + 1;
  }

  // 合計列
  const gotTotal = TYPES.reduce((s,t)=>s+got[t],0);
  const notTotal = TYPES.reduce((s,t)=>s+not[t],0);
  const all = { 'うとうと': got['うとうと']+not['うとうと'],
                'すやすや': got['すやすや']+not['すやすや'],
                'ぐっすり': got['ぐっすり']+not['ぐっすり'] };
  const allTotal = gotTotal + notTotal;

  // 0件なら空を返す（表示なし）
  if (allTotal === 0) return '';

  const td = (n)=>`<td class="text-center">${n}</td>`;
  const th = (s)=>`<th class="text-start">${s}</th>`;

  const header = `
    <thead class="table-light">
      <tr>
        <th style="width:72px;"></th>
        ${TYPES.map(t=>`<th class="text-center">${t}</th>`).join('')}
        <th class="text-center">合計</th>
      </tr>
    </thead>`;

  const rowGot = `<tr>${th('入手済')}${td(got['うとうと'])}${td(got['すやすや'])}${td(got['ぐっすり'])}${td(gotTotal)}</tr>`;
  const rowNot = `<tr>${th('未入手')}${td(not['うとうと'])}${td(not['すやすや'])}${td(not['ぐっすり'])}${td(notTotal)}</tr>`;
  const rowAll = `<tr class="table-light fw-semibold">${th('合計')}${td(all['うとうと'])}${td(all['すやすや'])}${td(all['ぐっすり'])}${td(allTotal)}</tr>`;

  return `
    <div class="card border-0">
      <div class="table-responsive">
        <table class="table table-sm mb-2 align-middle" style="font-size:0.9rem;">
          ${header}
          <tbody>${rowGot}${rowNot}${rowAll}</tbody>
        </table>
      </div>
    </div>`;
}

function styleRankMiniSummary() {
  const root = document.getElementById('rankMiniSummary') 
            || document.querySelector('#rankMiniSummary table') 
            || document.querySelector('[data-mini-summary]'); // 保険
  if (!root) return;

  const table = root.tagName === 'TABLE' ? root : root.querySelector('table') || root;
  const thead = table.querySelector('thead');
  const rows  = table.querySelectorAll('tr');
  if (!thead || !rows.length) return;

  const ths = thead.querySelectorAll('th');
  const colClassByIndex = {};

  ths.forEach((th, idx) => {
    const t = (th.textContent || '').trim();
    if (t.includes('うとうと'))  { th.classList.add('col-uto');   colClassByIndex[idx] = 'col-uto'; }
    if (t.includes('すやすや'))  { th.classList.add('col-suya');  colClassByIndex[idx] = 'col-suya'; }
    if (t.includes('ぐっすり'))  { th.classList.add('col-gusu');  colClassByIndex[idx] = 'col-gusu'; }
    if (t.includes('合計'))      { th.classList.add('col-total'); colClassByIndex[idx] = 'col-total'; }
  });

  rows.forEach(tr => {
    tr.querySelectorAll('td,th').forEach((cell, idx) => {
      const cls = colClassByIndex[idx];
      if (cls) cell.classList.add(cls);
    });
  });
}

// 種（形態）ごとの「コンプリート済」判定
// ルール：CHECKABLE_STARS(☆1〜☆4)のうち、そのポケモンに存在する星がすべてチェック済みなら true
function isEntryComplete(state, ent) {
  const key = entKey(ent);
  let hasAny = false;
  for (const star of CHECKABLE_STARS) {
    if (!speciesHasStar(ent, star)) continue; // その星が存在しない
    hasAny = true;
    if (!getChecked(state, key, star)) return false; // 未チェックが1つでもあれば未コンプ
  }
  // 対象星が1つも無い場合は「取得対象なし＝コンプ扱い」とする
  return true;
}

// ===================== Amber 渓谷：特設CTA & ポップアップ =====================

// CTAをサマリー直下・メインタブの直前に挿入
function ensureAmberCTA(){
  if (document.getElementById('amberCtaContainer')) return;
  const summary = document.getElementById('summary');
  const mainTabsWrap = document.getElementById('mainTabsWrap');
  if (!summary || !mainTabsWrap) return;

  const box = document.createElement('div');
  box.id = 'amberCtaContainer';
  box.innerHTML = `
    <a id="amberCtaLink" class="link-primary" href="#">
      11/6(木)よりアンバー渓谷が開放！<br>寝顔の取得数をチェックする
    </a>
  `;
  summary.insertAdjacentElement('afterend', box);

  box.querySelector('#amberCtaLink').addEventListener('click', (e)=>{
    e.preventDefault();
    openAmberPopup(loadState());
  });
}

// 現在の寝顔「取得済み」総数（☆1〜☆4のみ）
function countObtainedFaces(state){
  let n = 0;
  for (const row of RAW_ROWS){
    const star = row.DisplayRarity;
    if (!CHECKABLE_STARS.includes(star)) continue;
    if (getChecked(state, rowKey(row), star)) n++;
  }
  return n;
}

// Amber用ミニ表データ：行レンジ定義
const _AMBER_ROWS = [
  { labelStage:'ノーマル', label:'1~5',    from:1,  to:5   },
  { labelStage:'スーパー', label:'1~5',    from:6,  to:10  },
  { labelStage:'ハイパー', label:'1~5',    from:11, to:15  },
  { labelStage:'マスター', label:'1~10',   from:16, to:25  },
  { labelStage:'マスター', label:'11~20',  from:26, to:35  },
];

// Amber用ミニ表のHTMLを構築（各フィールドの“未取得数”を集計）
// Amber用ミニ表のHTMLを構築（各フィールドの“未取得数”を集計）
function buildAmberMiniTable(state){
  // 見出しを1文字（最後だけ改行入り）に
  const AMBER_COL_ABBR = ['島', '浜', '洞', '雪', '湖', '電', '島<br>EX'];

  // テーブルヘッダ（A1は空欄にする）
  const thead = `
    <thead class="table-light">
      <tr>
        <th style="min-width:88px;"></th>
        ${AMBER_COL_ABBR.map(t => `<th class="text-center">${t}</th>`).join('')}
      </tr>
    </thead>`;

  // 各レンジ行
  const bodyRows = _AMBER_ROWS.map(rg => {
    // 行ラベル（◓は1個だけ。ラベル文字列は数値レンジのみ）
    const rowLabel = `
      <span class="rank-chip--rowlabel" data-stage="${rg.labelStage}">
        <span class="ball">◓</span><span>${rg.label}</span>
      </span>`;

    const tds = FIELD_KEYS.map(field => {
      let notObtained = 0;
      for (const row of RAW_ROWS){
        const star = row.DisplayRarity;
        if (!CHECKABLE_STARS.includes(star)) continue;
        const rn = getFieldRankNum(row, field);
        if (!rn || rn < rg.from || rn > rg.to) continue;
        if (!getChecked(state, rowKey(row), star)) notObtained++;
      }
      return `<td class="text-center fw-semibold">${notObtained}</td>`;
    }).join('');

    return `<tr><th class="text-start">${rowLabel}</th>${tds}</tr>`;
  }).join('');

  return `
    <div class="table-responsive mini-grid">
      <table class="table table-sm align-middle">
        ${thead}
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

// モーダルDOMを一度だけ用意（Bootstrap）
let _amberModalEl = null, _amberModal = null;
function ensureAmberModal(){
  if (_amberModalEl) return { el:_amberModalEl, modal:_amberModal };
  const el = document.createElement('div');
  el.className = 'modal fade';
  el.id = 'amberPopup';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title">アンバー渓谷 開放チェック</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="閉じる"></button>
        </div>
        <div class="modal-body">
          <div class="amber-head">
            <span class="amber-target-badge">目標 <strong>${AMBER_GOAL}</strong></span>
            <span id="amberGoalBadge" class="goal-badge d-none">目標達成！</span>
          </div>
          <div id="amberCounter" class="amber-counter">— / ${AMBER_GOAL}</div>
          <div id="amberMiniTable"><!-- mini table --></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  _amberModalEl = el;
  _amberModal = new bootstrap.Modal(el, { backdrop:true, keyboard:true });
  return { el:_amberModalEl, modal:_amberModal };
}

// モーダルの中身を最新stateで更新
function updateAmberPopup(state){
  const { el } = ensureAmberModal();
  const got = countObtainedFaces(state);
  const counter = el.querySelector('#amberCounter');
  const badge   = el.querySelector('#amberGoalBadge');
  if (counter) counter.textContent = `${got} / ${AMBER_GOAL}`;
  if (badge)   badge.classList.toggle('d-none', !(got >= AMBER_GOAL));

  const miniWrap = el.querySelector('#amberMiniTable');
  if (miniWrap) miniWrap.innerHTML = buildAmberMiniTable(state);
}

// 開く
function openAmberPopup(state){
  const { modal } = ensureAmberModal();
  updateAmberPopup(state);
  modal.show();
}

// ==== 固定（sticky）ユーティリティ ====

// タブ高をCSS変数へ
function measureTabsHeight() {
  const tabs = document.getElementById('mainTabs');
  const h = tabs ? Math.ceil(tabs.getBoundingClientRect().height) : 48;
  document.documentElement.style.setProperty('--sticky-top', `${h}px`);
}

// パン内の固定化：先頭に .pane-sticky-wrap を用意し、渡されたノードをそこへ集約
function setupPaneSticky(paneId, nodes) {
  const pane = document.getElementById(paneId);
  if (!pane) return null;
  const host = pane.querySelector('.card-body') || pane;

  let wrap = host.querySelector(':scope > .pane-sticky-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'pane-sticky-wrap';
    host.insertBefore(wrap, host.firstChild);
  }
  nodes.filter(Boolean).forEach(n => { if (n && n.parentNode !== wrap) wrap.appendChild(n); });

  // 固定ブロックの高さを pane へ渡す（thead の top に使う）
  const extra = Math.ceil(wrap.getBoundingClientRect().height);
  pane.style.setProperty('--pane-sticky-extra', `${extra}px`);
  return wrap;
}

// 全タブの offset を再計算
function refreshAllSticky() {
  measureTabsHeight();
  ['pane-allfaces','pane-byfield','pane-search'].forEach(id => {
    const pane = document.getElementById(id);
    if (!pane) return;
    const wrap = pane.querySelector('.pane-sticky-wrap');
    if (!wrap) return;
    const extra = Math.ceil(wrap.getBoundingClientRect().height);
    pane.style.setProperty('--pane-sticky-extra', `${extra}px`);
  });
}

// レンダ後に thead に .is-sticky を付ける
function makeStickyHeaders(){
  // 全寝顔（1枚）
  document.querySelector('#pane-allfaces thead')?.classList.add('is-sticky');

  // フィールド別（タブ内に複数テーブルがある）
  document.querySelectorAll('#pane-byfield thead')
    .forEach(t => t.classList.add('is-sticky'));

  // 逆引き（1枚）
  document.querySelector('#pane-search thead')?.classList.add('is-sticky');
}

// === クローン方式: 1) テーブルごとに上部にヘッダーを複製して差し込む ===
function ensureStickyCloneForTable(table){
  if (!table || table.dataset.stickyPrepared === '1') return;

  const resp = table.closest('.table-responsive') || table.parentElement;
  // すでにホストがあるか？
  let host = resp.querySelector(':scope > .cloned-sticky-head');
  if (!host) {
    host = document.createElement('div');
    host.className = 'cloned-sticky-head';
    resp.insertBefore(host, resp.firstChild);
    // 横スクロールを同期
    resp.addEventListener('scroll', () => { host.scrollLeft = resp.scrollLeft; }, { passive: true });
  }

  // ヘッダーだけ持つクローンテーブルを作成
  const cloneTable = table.cloneNode(false);
  cloneTable.setAttribute('aria-hidden', 'true');
  cloneTable.dataset.stickyClone = '1';
  if (table.tHead) {
    cloneTable.appendChild(table.tHead.cloneNode(true));
  } else {
    // thead がない表は対象外
    return;
  }
  host.innerHTML = '';       // 同一 .table-responsive 内は常に最新を1つだけ
  host.appendChild(cloneTable);

  table.dataset.stickyPrepared = '1';
  // 初回はサイズ合わせ
  updateStickyCloneSizes(table);
  // レイアウト確定後（フォント/画像）にももう一度
  requestAnimationFrame(() => updateStickyCloneSizes(table));
}

// === クローン方式: 2) 列幅と総幅を元表と一致させる ===
function updateStickyCloneSizes(table){
  const resp = table.closest('.table-responsive') || table.parentElement;
  const host = resp.querySelector(':scope > .cloned-sticky-head');
  const cloneTable = host ? host.querySelector('table[data-sticky-clone="1"]') : null;
  if (!host || !cloneTable || !table.tHead) return;

  const ths  = table.tHead.querySelectorAll('th,td');
  let cthead = cloneTable.tHead;
  // 列数が変わっていたら作り直す
  if (!cthead || cthead.querySelectorAll('th,td').length !== ths.length) {
    cloneTable.innerHTML = '';
    cloneTable.appendChild(table.tHead.cloneNode(true));
    cthead = cloneTable.tHead;
  }
  const cths = cthead.querySelectorAll('th,td');

  // テーブル全体の幅
  const tableRect = table.getBoundingClientRect();
  cloneTable.style.width = Math.ceil(tableRect.width) + 'px';

  // 各列の幅を固定
  ths.forEach((th, i) => {
    const w = Math.ceil(th.getBoundingClientRect().width);
    const cth = cths[i];
    if (cth) {
      cth.style.width    = w + 'px';
      cth.style.minWidth = w + 'px';
      cth.style.maxWidth = w + 'px';
    }
  });
}

// ====== 固定ヘッダー（iOS安定版：GPU transform + rAF + DPR丸め） ======
// === rAF スケジューラ（イベント登録より前に定義しておく） ===
let _rafScheduled = false;
function _scheduleUpdate(){
  if (_rafScheduled) return;
  _rafScheduled = true;
  requestAnimationFrame(() => {
    _rafScheduled = false;
    _updateAllFloaters();   // ← この関数は後で定義されていてOK（関数宣言はホイスティングされます）
  });
}

const _floatHeads = new Map();      // table -> { host, innerTable, resp, pane, ro }
const DPR = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
const px = n => (Math.round(n * DPR) / DPR) + 'px';

function _getTopOffsetForTable(table){
  let top = 0;
  const tabs = document.getElementById('mainTabs');
  if (tabs) top = Math.max(top, Math.ceil(tabs.getBoundingClientRect().bottom));

  // ★「親セクション」を #pane-allfaces / #pane-byfield / #pane-search から取る
  const paneSection = table.closest('#pane-allfaces, #pane-byfield, #pane-search');

  // そのセクション直下の sticky ラッパ（= フィルター）
  const wrap = paneSection ? paneSection.querySelector(':scope .pane-sticky-wrap') : null;
  if (wrap) top = Math.max(top, Math.ceil(wrap.getBoundingClientRect().bottom));

  return top;
}
function _isShown(el){ return !!(el && el.offsetParent !== null); }

function _ensureFloaterForTable(table){
  if (!table || _floatHeads.has(table)) return;

  const resp = table.closest('.table-responsive') || table.parentElement;

  // ★ ここを .tab-pane ではなく「親セクション」に
  const paneSection =
    table.closest('#pane-allfaces, #pane-byfield, #pane-search') || document.body;

  const host = document.createElement('div');
  host.className = 'floating-head';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);

  const innerTable = table.cloneNode(false);
  if (table.tHead) innerTable.appendChild(table.tHead.cloneNode(true));
  host.appendChild(innerTable);

  resp?.addEventListener('scroll', ()=>_scheduleUpdate(), { passive:true });

  let ro = null;
  if (window.ResizeObserver){
    ro = new ResizeObserver(()=>_scheduleUpdate());
    ro.observe(table); if (resp) ro.observe(resp);
  }
  _floatHeads.set(table, { host, innerTable, resp, paneSection, ro });
}

function _syncColumns(table){
  const item = _floatHeads.get(table);
  if (!item || !table.tHead) return;

  // 列数が変わっていたら thead を作り直す
  const ths = table.tHead.querySelectorAll('th,td');
  let cthead = item.innerTable.tHead;
  if (!cthead || cthead.querySelectorAll('th,td').length !== ths.length){
    item.innerTable.innerHTML = '';
    item.innerTable.appendChild(table.tHead.cloneNode(true));
    cthead = item.innerTable.tHead;
  }
  const cths = cthead.querySelectorAll('th,td');

  // テーブルの総幅を合わせる
  const rectTable = table.getBoundingClientRect();
  item.innerTable.style.width = px(rectTable.width);

  // 各セル幅をピクセル固定（サブピクセルはDPR丸め）
  ths.forEach((th, i)=>{
    const w = th.getBoundingClientRect().width;
    const cth = cths[i];
    if (cth){
      const val = px(w);
      cth.style.width = val;
      cth.style.minWidth = val;
      cth.style.maxWidth = val;
    }
  });
}

function _layoutFloater(table){
  const item = _floatHeads.get(table);
  if (!item) return;
  const { host, innerTable, resp, paneSection } = item;

  // 非表示タブなどは無効
  const shown = el => !!(el && el.offsetParent !== null);
  if (!shown(table) || (paneSection && !shown(paneSection))){
    host.style.display = 'none';
    return;
  }

  const rectTable = table.getBoundingClientRect();
  const rectResp  = (resp || table).getBoundingClientRect();
  const topOffset = _getTopOffsetForTable(table);

  const theadH = Math.ceil((table.tHead?.getBoundingClientRect().height) || 32);
  const shouldShow = rectTable.top < topOffset && (rectTable.bottom - theadH) > topOffset;
  if (!shouldShow){ host.style.display = 'none'; return; }

  host.style.display = 'block';
  host.style.left  = px(rectResp.left);
  host.style.width = px(rectResp.width);
  host.style.transform = `translate3d(0, ${px(topOffset)}, 0)`;  // ★ iOS安定

  const sl = (resp && resp.scrollLeft) || 0;
  innerTable.style.transform = `translate3d(${-sl}px, 0, 0)`;
}

function _updateAllFloaters(){
  _floatHeads.forEach((_, table)=>{
    _syncColumns(table);
    _layoutFloater(table);
  });
}

function applyStickyHeaders(){
  const tables = [
    document.querySelector('#allFacesTable'),
    // ★ アクティブ/非アクティブに関わらず全フィールドの table を拾う
    ...document.querySelectorAll('#fieldTabsContent .table-responsive > table'),
    document.querySelector('#rankSearchTable')
  ].filter(Boolean);

  tables.forEach(t => _ensureFloaterForTable(t));
  _scheduleUpdate();
  setTimeout(_scheduleUpdate, 120);
  setTimeout(_scheduleUpdate, 500);
  requestAnimationFrame(_scheduleUpdate);
}

// 画面イベントは rAF 経由で合成（iOSの慣性スクロールでもブレにくい）
const _safeSchedule = () => { if (typeof _scheduleUpdate === 'function') _scheduleUpdate(); };

window.addEventListener('scroll',  _safeSchedule, { passive:true });
window.addEventListener('resize',  _safeSchedule);
document.getElementById('mainTabs')?.addEventListener('shown.bs.tab', _safeSchedule);


// ★ サマリーの除外判定
// scope: 'field' … フィールド列（ダークライ除外）
//        'all'   … 全体列（ダークライを含める）
function isExcludedFromSummary(row, scope = 'field') {
  // イベント限定は除外しない（= 常に集計に含める）
  const isDarkrai =
    EXCLUDED_SPECIES_FOR_SUMMARY.has(row.No) || /ダークライ/i.test(row.Name || '');
  if (scope === 'all') return false;   // 全体はダークライも含める
  return isDarkrai;                    // フィールド列はダークライのみ除外
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

// 変更があったチェック（key, star, on）を他シートにだけ反映（差分更新）
function syncOtherViews(key, star, on) {
  // 1) 全寝顔チェックシート（チェックボックスのON/OFF＋セル色）
  document.querySelectorAll(
    `#allFacesTable input[type="checkbox"][data-key="${key}"][data-star="${star}"]`
  ).forEach(el => {
    if (el.checked !== on) {
      el.checked = on;
      el.closest('td')?.classList.toggle('cell-checked', on);
    }
  });

  // 2) フィールド別寝顔一覧（セル全体に色だけ）
  document.querySelectorAll(
    `#fieldTabsContent td.toggle-cell[data-key="${key}"][data-star="${star}"]`
  ).forEach(td => {
    td.classList.toggle('cell-checked', on);
  });

  // 3) 逆引き（未入手のみ表示）は仕様どおり「その場では行を消さない」ので何もしない
  //    （サマリー＆ミニ要約は既存コードで更新済み）
}

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
    if (isExcludedFromSummary(row, 'field')) continue; // ★ 追加
    if (style && row.Style !== style) continue;
    const rankNum = getFieldRankNum(row, field);
    if (rankNum) {
      denom++;
      if (CHECKABLE_STARS.includes(row.DisplayRarity) &&
          getChecked(state, rowKey(row), row.DisplayRarity)) num++;
    }
  }
  const rate = denom ? Math.floor((num / denom) * 100) : 0;
  return { num, denom, rate };
};

// 全体
const calcForAll = (style) => {
  let denom = 0, num = 0;
  for (const row of RAW_ROWS) {
    if (isExcludedFromSummary(row, 'all')) continue;   // ★ 追加：全体はダークライ含める
    if (style && row.Style !== style) continue;
    denom++;
    if (CHECKABLE_STARS.includes(row.DisplayRarity) &&
        getChecked(state, rowKey(row), row.DisplayRarity)) num++;
  }
  const rate = denom ? Math.floor((num / denom) * 100) : 0;
  return { num, denom, rate };
};

  const header = `
    <table class="table table-sm align-middle mb-0 summary-table">
      <thead class="table-light">
        <tr>
          <th class="summary-lefthead-col"></th>
<th class="text-center" style="width:80px;">全体</th>
${FIELD_KEYS.map(f => {
  const src = FIELD_HEAD_ICON[f];              // 画像パス取得
  const alt = FIELD_SHORT[f] || f;             // 代替テキスト
  return `
    <th class="text-center" style="width:80px;">
      <img src="${src}" alt="${alt}" class="field-head-icon" loading="lazy" decoding="async">
    </th>`;
}).join('')}
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
            <th class="summary-lefthead text-center align-middle">
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
            <th class="text-center fw-semibold">合計</th>
            ${allTotal}
            ${tds}
          </tr>`;
        })()}
      </tbody>
    </table>`;
  root.innerHTML = header;
}

// ===================== 全寝顔チェックシート =====================
// 1) モーダルを1度だけ作る
let _fieldRankModalEl = null, _fieldRankModal = null;
function ensureFieldRankModal() {
  if (_fieldRankModalEl) return { modal:_fieldRankModal, el:_fieldRankModalEl };

  const el = document.createElement('div');
  el.id = 'fieldRankModalRoot';
  el.className = 'modal fade';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title">出現フィールド・ランク</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="閉じる"></button>
        </div>
        <div class="modal-body modal-field-rank">
          <!-- JSで表を差し込む -->
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  _fieldRankModalEl = el;
  _fieldRankModal = new bootstrap.Modal(el, { backdrop:true, keyboard:true });
  return { modal:_fieldRankModal, el:_fieldRankModalEl };
}

// 2) エントリ（species）→ フィールド×☆1..☆4 の最小必要ランク表HTML
function buildFieldRankMatrixHTML(ent) {
  const header = `
    <thead class="table-light">
      <tr>
        <th class="text-start">フィールド</th>
        ${CHECKABLE_STARS.map(s=>`<th class="text-center">${s}</th>`).join('')}
      </tr>
    </thead>`;

  const rows = [];
  for (const f of FIELD_KEYS) {
    // そのフィールドに1つでも出現があるか判定
    let appears = false;
    const cells = CHECKABLE_STARS.map(star=>{
      let min = Infinity;
      for (const r of ent.rows) {
        if (r.DisplayRarity !== star) continue;
        const rn = getFieldRankNum(r, f);
        if (rn) { min = Math.min(min, rn); }
      }
      if (min !== Infinity) { appears = true; return `<td class="text-center">${renderRankChip(min)}</td>`; }
      return `<td class="text-center text-muted">—</td>`;
    }).join('');
    if (appears) {
      const icon = FIELD_HEAD_ICON[f] ? `<img src="${FIELD_HEAD_ICON[f]}" class="field-icon" alt="">` : '';
      const short = FIELD_SHORT[f] || f;
      rows.push(`<tr><th class="text-start">${icon}${short}</th>${cells}</tr>`);
    }
  }
  if (rows.length === 0) return `<div class="text-muted">このポケモンの出現情報が見つかりません。</div>`;

  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle">${header}<tbody>${rows.join('')}</tbody></table>
    </div>`;
}

// 3) エントリ検索 & モーダルオープン
function findEntryByEntKey(key) {
  for (const ent of SPECIES_MAP.values()) { if (entKey(ent) === key) return ent; }
  return null;
}
function openFieldRankModal(ent) {
  const { modal, el } = ensureFieldRankModal();
  const title = el.querySelector('.modal-title');
    title.textContent = `${ent.no} ${ent.name} の出現フィールド・ランク`;
    title.style.fontSize = '12pt';
    el.querySelector('.modal-body').innerHTML = buildFieldRankMatrixHTML(ent);
    modal.show();
}

let LAST_RENDER_ENTRIES = [];
function renderAllFaces(state) {
  const tbody = document.querySelector('#allFacesTable tbody');
  const searchName = document.getElementById('searchName').value.trim();
  const filterStyle = document.getElementById('filterStyle').value;
  const sortBy = document.getElementById('sortBy').value;

  // ▼ 追加：取得状況プルダウン
  const filterGetStatus = (document.getElementById('allfacesGetStatus')?.value || 'すべて');

  const normQuery = normalizeJP(searchName);

  let entries = Array.from(SPECIES_MAP.values());
  if (normQuery) entries = entries.filter(ent => normalizeJP(ent.name).includes(normQuery));
  if (filterStyle) entries = entries.filter(ent => ent.rows.some(r => r.Style === filterStyle));

  // ▼ 追加：取得状況フィルター適用
  if (filterGetStatus !== 'すべて') {
    entries = entries.filter(ent => {
      const completed = isEntryComplete(state, ent);
      if (filterGetStatus === 'コンプリート済') return completed;
      if (filterGetStatus === '未取得あり')   return !completed;
      return true;
    });
  }

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
            <div class="poke-icon mx-auto position-relative" style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;line-height:0;">
              ${renderPokemonIconById(ent.iconNo || getIconKeyFromNo(no), ICON_SIZE)}
              <button type="button" class="btn btn-light btn-xxs icon-more"
                  data-entkey="${key}" aria-label="出現フィールド">▼</button>
            </div>
              <div class="pf-text mt-1" style="line-height:1.2; word-break:break-word; white-space:normal;">
                <div class="pf-no text-muted">${no}</div>
                <div class="pf-name fw-semibold" style="max-width:${ICON_SIZE + 8}px; margin:0 auto;">${escapeHtml(name)}</div>
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
      syncOtherViews(key, star, e.target.checked);  // ← 他シートへ差分同期
      renderSummary(state);
      renderRankSearch(state);
      updateAmberPopup(state);
      // ▼ 追加：取得状況フィルター中なら全体を再描画して行の見え方を更新
      if ((document.getElementById('allfacesGetStatus')?.value || 'すべて') !== 'すべて') {
        renderAllFaces(loadState());
      }
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
      updateAmberPopup(state);
    });
  });
    // ▼ボタン：出現フィールド・ランクのミニ表（モーダル）
    tbody.querySelectorAll('button.icon-more').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const k = e.currentTarget.dataset.entkey;
        const ent = findEntryByEntKey(k);
        if (ent) openFieldRankModal(ent);
      });
    });
  applyStickyHeaders();
  refreshAllSticky();
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
          <thead class="table-light">
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
              <div class="byfield-icon position-relative">
                ${renderPokemonIconById(ent.iconNo || getIconKeyFromNo(ent.no), ICON_SIZE_FIELD)}
                <button type="button" class="btn btn-light btn-xxs icon-more"
                        data-entkey="${key}" aria-label="出現フィールド">▼</button>
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
        syncOtherViews(key, star, !now);             // ← 他シートへ差分同期
        renderSummary(state);
        renderRankSearch(state);
        updateAmberPopup(state);
      });
    });
    // ▼ボタン（フィールド別）— モーダルを開く
    tbody.querySelectorAll('button.icon-more').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const k = e.currentTarget.dataset.entkey;
        const ent = findEntryByEntKey(k);
        if (ent) openFieldRankModal(ent);
      });
    });
    
  });
  applyStickyHeaders();
  refreshAllSticky();
}

function ensureRankMiniSummaryContainer() {
  let el = document.getElementById('rankMiniSummary');
  if (el) return el;

    el = document.createElement('div');
    el.id = 'rankMiniSummary';
    el.className = 'rank-mini-summary mt-2';
    const table = document.getElementById('rankSearchTable');
    if (!table || !table.parentNode) return null;
    table.parentNode.insertBefore(el, table);
    return el;
}

// 睡眠タイプセレクト要素を生成（DOMには挿入しない）
function createSleepTypeSelect() {
  let sel = document.getElementById('searchType');
  if (sel) return sel; // 既存があればそれを再利用

  sel = document.createElement('select');
  sel.id = 'searchType';
  sel.className = 'form-select form-select-sm';
  sel.innerHTML = [
    {v:'',        t:'全て'},
    {v:'うとうと', t:'うとうと'},
    {v:'すやすや', t:'すやすや'},
    {v:'ぐっすり', t:'ぐっすり'},
  ].map(o => `<option value="${o.v}">${o.t}</option>`).join('');
  sel.value = '';
  return sel;
}

function createStatusSelect() {
  let sel = document.getElementById('searchStatus');
  if (sel) return sel;

  sel = document.createElement('select');
  sel.id = 'searchStatus';
  sel.className = 'form-select form-select-sm';
  sel.innerHTML = [
    { v:'すべて', t:'すべて' },
    { v:'未入手', t:'未入手' },
    { v:'入手済', t:'入手済' },
  ].map(o => `<option value="${o.v}">${o.t}</option>`).join('');
  sel.value = 'すべて';
  return sel;
}

function createSortSelect() {
  let sel = document.getElementById('searchSort');
  if (sel) return sel;

  sel = document.createElement('select');
  sel.id = 'searchSort';
  sel.className = 'form-select form-select-sm';
  sel.innerHTML = [
    { v:'no-asc',     t:'No昇順' },
    { v:'no-desc',    t:'No降順' },
    { v:'name-asc',   t:'名前昇順' },
    { v:'name-desc',  t:'名前降順' },
    { v:'rank-asc',   t:'出現ランク昇順' },
    { v:'rank-desc',  t:'出現ランク降順' },
  ].map(o => `<option value="${o.v}">${o.t}</option>`).join('');
  sel.value = 'no-asc';
  return sel;
}

// 逆引きフィルターのDOMを「フィールド／ランク／睡眠タイプ」で再構成（行全体を置き換え）
function buildReverseFilterBar() {
  const fieldSel = document.getElementById('searchField');
  const rankSel  = document.getElementById('searchRank');
  if (!fieldSel || !rankSel) return;

  const row = fieldSel.closest('.row') || rankSel.closest('.row');
  if (!row) return;

  const typeSel   = createSleepTypeSelect();
  const statusSel = createStatusSelect();
  const sortSel   = createSortSelect();

  const makeGroup = (labelText, selectEl, extraClass = '') => {
    const wrap = document.createElement('div');
    wrap.className = 'filter-item';
    if (extraClass) wrap.classList.add(extraClass);
    const lab = document.createElement('label');
    lab.textContent = labelText;
    lab.htmlFor = selectEl.id;
    selectEl.classList.add('form-select','form-select-sm');
    wrap.appendChild(lab);
    wrap.appendChild(selectEl);
    return wrap;
  };

  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  bar.id = 'rankSearchFilters'; // compact 用

  // 1〜2行目（2×2）
  bar.appendChild(makeGroup('フィールド', fieldSel));
  bar.appendChild(makeGroup('ランク',     rankSel));
  bar.appendChild(makeGroup('睡眠タイプ', typeSel));
  bar.appendChild(makeGroup('入手状況',   statusSel));

  // 3行目（全幅）— ※1回だけ append する！
  bar.appendChild(makeGroup('ソート', sortSel, 'filter-item--sort'));

  row.replaceWith(bar);

  // リスナー
  typeSel.removeEventListener('change', _onTypeChange);
  typeSel.addEventListener('change', _onTypeChange);

  statusSel.removeEventListener('change', _onStatusChange);
  statusSel.addEventListener('change', _onStatusChange);

  sortSel.removeEventListener('change', _onSortChange);
  sortSel.addEventListener('change', _onSortChange);
}

function _onStatusChange(){ renderRankSearch(loadState()); }
function _onSortChange(){ renderRankSearch(loadState()); }

// 睡眠タイプ変更時のハンドラ
function _onTypeChange() {
  renderRankSearch(loadState());
}

// ===================== ランク検索（未入手のみ） =====================
function setupRankSearchControls() {
  // フィールド
  const sel = document.getElementById('searchField');
  sel.innerHTML = FIELD_KEYS.map(f=>`<option value="${f}">${FIELD_SHORT[f]}</option>`).join('');
  sel.addEventListener('change', ()=>renderRankSearch(loadState()));

  // ランク
  const rankSel = document.getElementById('searchRank');
  const opts = [];
  for (let n = 1; n <= 35; n++) opts.push(`<option value="${n}">${labelForRank(n)}</option>`);
  rankSel.innerHTML = opts.join('');
  rankSel.value = '1';
  rankSel.addEventListener('change', ()=>renderRankSearch(loadState()));

  // 3ブロック（フィールド/ランク/睡眠タイプ）に再構成
  buildReverseFilterBar();
}

// 「入手済？」ヘッダーを足す（重複追加しない）
function ensureRankSearchHeaderHasObtainedColumn() {
  const tr = document.querySelector('#rankSearchTable thead tr');
  if (!tr) return;
  const has = Array.from(tr.children).some(th => th.textContent.trim() === '入手済？');
  if (!has) {
    const th = document.createElement('th');
    th.textContent = '入手済？';
    th.className = 'text-center';
    tr.appendChild(th);
  }
}

function renderRankSearch(state) {
  const field = document.getElementById('searchField').value || FIELD_KEYS[0];
  const rank  = Math.max(1, Math.min(35, parseInt(document.getElementById('searchRank').value||'1',10)));
  const typeFilter   = (document.getElementById('searchType')?.value || '');
  const statusFilter = (document.getElementById('searchStatus')?.value || 'すべて');
  const sortMode     = (document.getElementById('searchSort')?.value || 'no-asc');
  const tbody = document.querySelector('#rankSearchTable tbody');

  // ヘッダーに「入手済？」列を用意（HTMLそのままでも動くように）
  ensureRankSearchHeaderHasObtainedColumn();

  const miniWrap = ensureRankMiniSummaryContainer();
  if (miniWrap) {
    miniWrap.innerHTML = buildRankMiniSummaryHTML(field, rank, state, typeFilter, statusFilter) || '';
    styleRankMiniSummary();
    refreshAllSticky();
  }

  const items = [];
    for (const row of RAW_ROWS) {
  const rNum = getFieldRankNum(row, field);
    if (!rNum || rNum > rank) continue;
    if (typeFilter && row.Style !== typeFilter) continue;

  const k = rowKey(row);
  const star = row.DisplayRarity;
  const checkable = CHECKABLE_STARS.includes(star);
  const isChecked = checkable ? getChecked(state, k, star) : false;

  // 入手状況フィルター
  if (statusFilter === '未入手') {
    if (!checkable) continue;         // 判定不可のものは除外
    if (isChecked) continue;          // 未入手のみ
  } else if (statusFilter === '入手済') {
    if (!checkable) continue;
    if (!isChecked) continue;         // 入手済のみ
  } else { // すべて
    // 何でも通す（checkable じゃなくてもOK）
  }

  items.push(row);
}
const rn = r => getFieldRankNum(r, field) ?? 999; // 念のためのフォールバック

const cmpNoAsc    = (a,b) => a.No.localeCompare(b.No, 'ja');
const cmpNoDesc   = (a,b) => b.No.localeCompare(a.No, 'ja');
const cmpNameAsc  = (a,b) => a.Name.localeCompare(b.Name, 'ja');
const cmpNameDesc = (a,b) => b.Name.localeCompare(a.Name, 'ja');
const cmpRankAsc  = (a,b) => rn(a) - rn(b);       // ★ 出現(必要)ランク
const cmpRankDesc = (a,b) => rn(b) - rn(a);

const tieBreaker  = (a,b) =>
  cmpNoAsc(a,b) ||
  cmpNameAsc(a,b) ||
  (RARITIES.indexOf(a.DisplayRarity) - RARITIES.indexOf(b.DisplayRarity)) ||
  (a.Style || '').localeCompare(b.Style || '', 'ja');

const primary =
  sortMode === 'no-desc'   ? cmpNoDesc   :
  sortMode === 'name-asc'  ? cmpNameAsc  :
  sortMode === 'name-desc' ? cmpNameDesc :
  sortMode === 'rank-asc'  ? cmpRankAsc  :
  sortMode === 'rank-desc' ? cmpRankDesc :
                              cmpNoAsc;

items.sort((a,b) => primary(a,b) || tieBreaker(a,b));
  if (items.length === 0) {
  if (statusFilter === '未入手') {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center">
          <div class="completed-msg">COMPLETED</div>
          <div class="text-muted small mt-1">この条件で出現する寝顔はすべて入手済みです</div>
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">該当するデータがありません</td></tr>`;
  }

  // ★ ここで色付けなど最低限の後処理を実行してから return
  styleRankMiniSummary();
  compactRankFilters();
  shrinkRankHelpText();
  applyStickyHeaders();
  refreshAllSticky();

  return;
}

  tbody.innerHTML = items.map(r=>{
    const needRank = getFieldRankNum(r, field);
    const iconSvg = renderPokemonIconById(r.IconNo || getIconKeyFromNo(r.No), ICON_SIZE_FIELD);

    const k = rowKey(r);
    const star = r.DisplayRarity;
    const checkable = CHECKABLE_STARS.includes(star);
    // 未入手一覧なので通常は false のはずだが、念のため同期
    const isChecked = checkable ? getChecked(state, k, star) : false;
    
    return `
      <tr>
        <td class="byfield-name-cell text-center align-middle">
          <div class="pf-wrap">
            <div class="byfield-icon position-relative">
              ${iconSvg}
              <button type="button" class="btn btn-light btn-xxs icon-more"
                      data-entkey="${k}" aria-label="出現フィールド">▼</button>
            </div>
            <div class="pf-text">
              <div class="pf-no text-muted">${r.No}</div>
              <div class="pf-name">${escapeHtml(r.Name)}</div>
            </div>
          </div>
        </td>
        <td class="text-center">${r.Style || '-'}</td>
        <td class="text-center">${r.DisplayRarity || '-'}</td>
        <td class="text-center">${renderRankChip(needRank)}</td>
        <td class="text-center">
        ${ checkable
            ? `<input type="checkbox" class="form-check-input mark-obtained"
                      data-key="${k}" data-star="${escapeHtml(star)}"
                      ${isChecked ? 'checked' : ''}>`
            : `<span class="text-muted">—</span>` }
        </td>
      </tr>`;
  }).join('');
  // ここでは再描画しない（＝行は残す）。ただしサマリーは更新。
tbody.querySelectorAll('input.mark-obtained').forEach(chk=>{
  chk.addEventListener('change', (e) => {
    const key  = e.target.dataset.key;
    const star = e.target.dataset.star;
    const on   = e.target.checked;
    const s = loadState();
    setChecked(s, key, star, on);
    syncOtherViews(key, star, on);
    renderSummary(s);
    updateAmberPopup(s);

    // ミニ要約だけは更新する（行は消さない＝仕様どおり）
    const fieldNow  = document.getElementById('searchField').value || FIELD_KEYS[0];
    const rankNow   = Math.max(1, Math.min(35, parseInt(document.getElementById('searchRank').value||'1',10)));
    const typeNow   = (document.getElementById('searchType')?.value || '');
    const statusNow = (document.getElementById('searchStatus')?.value || 'すべて'); // ← 追加（任意）
    const wrap = ensureRankMiniSummaryContainer();
    if (wrap) {
      wrap.innerHTML = buildRankMiniSummaryHTML(fieldNow, rankNow, s, typeNow, statusNow) || '';
      // ★ 差し替え直後に必ず色付け
      styleRankMiniSummary();
    }
  });
});

    // ▼ボタン（逆引き）— モーダルを開く
    tbody.querySelectorAll('button.icon-more').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const k = e.currentTarget.dataset.entkey;
        const ent = findEntryByEntKey(k);
        if (ent) openFieldRankModal(ent);
      });
    });
  
  applyStickyHeaders();
  refreshAllSticky();
  styleRankMiniSummary();
  compactRankFilters();
  shrinkRankHelpText();
  markPokemonNameSpans();
  afterRenderRankSearch();
}

function markPokemonNameSpans() {
  const table = document.querySelector('.table-rank-result'); // 逆引き結果テーブル
  if (!table) return;

  // 「ポケモン」列のインデックスを特定し、ヘッダに .col-pokemon を付与
  const ths = table.querySelectorAll('thead th');
  let pokemonCol = -1;
  ths.forEach((th, idx) => {
    const t = (th.textContent || '').trim();
    if (t.includes('ポケモン')) {
      pokemonCol = idx;
      th.classList.add('col-pokemon');
    }
  });
  if (pokemonCol === -1) return;

  // 各行の該当セル末尾のテキストを「名前」とみなし <span class="poke-name"> で包む
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(tr => {
    const td = tr.children[pokemonCol];
    if (!td) return;
    if (td.querySelector('.poke-name')) return; // 二重適用防止

    const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT, null);
    let lastText = null; let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim()) lastText = node;
    }
    if (lastText) {
      const span = document.createElement('span');
      span.className = 'poke-name';
      span.textContent = lastText.nodeValue.trim();
      lastText.parentNode.replaceChild(span, lastText);
      // 必要ならスペースを補う
      td.insertBefore(document.createTextNode(' '), span);
    }
  });
}

function compactRankFilters() {
  const el = document.getElementById('rankSearchFilters');
  if (el) el.classList.add('filters-compact');
}

function compactListFilters() {
  const af  = document.getElementById('allfacesFilters');
  const afb = document.getElementById('allfacesBulkBar');
  const bf  = document.getElementById('byfieldFilters');
  [af, afb, bf].forEach(el => el?.classList.add('filters-compact'));
  document.getElementById('fieldTabs')?.classList.add('tabs-compact'); //フィールド別のタブ群も 0.85x 縮小用クラスを付与
}

function shrinkRankHelpText() {
  // 既に #rankHelpText が存在すれば何もしない
  let el = document.getElementById('rankHelpText');
  if (!el) {
    // 代表的な説明文要素を探索（あなたの実装のクラスに合わせてOK）
    el = document.querySelector('.rank-help, .rank-desc, .rank-note');
    if (el) el.id = 'rankHelpText';
  }
}

// バックアップ用の簡単なエンコード/デコード（UTF-8対応）
function encodeStateToText(state) {
  const json = JSON.stringify(state);
  // プレフィックスなしのBase64のみを出力
  return btoa(unescape(encodeURIComponent(json)));
}
function decodeTextToState(text) {
  const raw = (text || '').trim();
  if (!raw) throw new Error('空のテキストです');
  // 「PSC1:」が付いていたら除去（後方互換）
  let payload = raw.replace(/^PSC1:/, '');
  try {
    // Base64 っぽければデコードを試みる
    const json = decodeURIComponent(escape(atob(payload)));
    return JSON.parse(json);
  } catch {
    // だめなら素のJSONとしてパースを試す
    return JSON.parse(payload);
  }
}

// ---- クリップボード：書き込み（writeText が失敗したら textarea 経由にフォールバック）
async function copyToClipboard(text, fallbackTextarea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      if (fallbackTextarea) {
        const prev = fallbackTextarea.value;
        fallbackTextarea.value = text;
        fallbackTextarea.select();
        const ok = document.execCommand && document.execCommand('copy');
        fallbackTextarea.value = prev;
        fallbackTextarea.blur();
        return !!ok;
      }
    } catch {}
    return false;
  }
}

// ---- クリップボード：読み取り（空や拒否なら空文字を返す）
async function readClipboardSafe() {
  try {
    // iOS/Safari でも「ボタン押下中」なら許可ダイアログ後に取得できる
    const txt = await navigator.clipboard.readText();
    return (txt || '').trim();
  } catch {
    return '';
  }
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
  const btnExportText = document.getElementById('btnExportText');
  const btnImportText = document.getElementById('btnImportText');
  const ta            = document.getElementById('backupText');

  // バックアップ用テキストを作成 → 自動コピーまでやる
  btnExportText?.addEventListener('click', async () => {
    const state = loadState();
    const text  = encodeStateToText(state);
    ta.value = text;                 // 一応テキストエリアにも表示しておく

    // 自動コピー（クリップボードAPI → 失敗時は textarea 経由）
    const ok = await copyToClipboard(text, ta);
    if (ok) {
      // 最短のフィードバック（alert は操作を止めるので控えめに）
      console.log('バックアップをクリップボードにコピーしました。');
      // 任意：バナーやトーストに置き換えてOK
      alert('バックアップ用テキストを作成し、クリップボードにコピーしました。\n「テキストから復旧」を押すとデータを自動で取り込めます。');
    } else {
      // コピーできなかったら選択状態にして手動コピーを促す
      ta.focus(); ta.select();
      alert('自動コピーに失敗しました。表示されたテキストを手動でコピーしてください。');
    }
  });

  // 復旧ボタン → まずはクリップボードを自動読取→ 復旧
  btnImportText?.addEventListener('click', async () => {
    try {
      // 1) まずクリップボードを読む（ユーザーのクリック中なので許可されやすい）
      let text = await readClipboardSafe();

      // 2) 空だったらテキストエリアの内容を使う（旧動作のフォールバック）
      if (!text) text = (ta.value || '').trim();

      if (!text) {
        alert('クリップボードやテキストエリアが空でした。\n「バックアップ用テキストを作成」→コピーしてから、もう一度お試しください。');
        return;
      }

      const incoming = decodeTextToState(text);
      if (!incoming || typeof incoming !== 'object') throw new Error('format');

      // 置き換え保存＆再描画
      localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
      const state = loadState();
      renderAllFaces(state);
      renderFieldTables(state);
      renderSummary(state);
      renderRankSearch(state);
      updateAmberPopup(state);

      alert('復旧しました！（クリップボード／テキスト）');
    } catch (e) {
      console.error(e);
      alert('復旧に失敗しました。テキストが正しいか確認し、再度お試しください。');
    }
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
  .pf-name-small { font-size: 7pt; }

  /* 逆引きシートの表 */
  #rankSearchTable th, #rankSearchTable td { text-align: center; vertical-align: middle; }

  /* ミニ表 */
  .rank-mini-summary:empty { display: none; }
  .rank-mini-summary tr.row-uto  > th, .rank-mini-summary tr.row-uto  > td  { background-color: #fff5db !important; }
  .rank-mini-summary tr.row-suya > th, .rank-mini-summary tr.row-suya > td { background-color: #e9f4ff !important; }
  .rank-mini-summary tr.row-gu   > th, .rank-mini-summary tr.row-gu   > td { background-color: #ecebff !important; }
  .rank-mini-summary table thead th { vertical-align: middle; }

  /* ---- 逆引きフィルター（最小構成） ---- */
  .filter-bar { display:flex; flex-direction:column; align-items:flex-start; gap:10px; }
  .filter-item { display:flex; flex-direction:row; align-items:center; gap:8px; white-space:nowrap; }
  .filter-item label { margin:0 !important; font-weight:500; }
  .filter-item .form-select { width:auto; display:inline-block; }

  /* PC（768px〜）は1行横並び */
  @media (min-width: 768px) {
    .filter-bar { flex-direction:row; flex-wrap:nowrap; align-items:center; gap:12px 16px; }
  }

  /* アイコン右上のミニボタン */
  .icon-more.btn-xxs{ padding:0 .3rem; font-size:.70rem; line-height:1.1 }
  .poke-icon.position-relative .icon-more,
  .byfield-icon.position-relative .icon-more{
    position:absolute; top:-6px; right:-6px; z-index:2;
  }

  /* モーダル内のミニ表 */
  .modal-field-rank table { font-size:0.9rem; }
  .modal-field-rank th, .modal-field-rank td { vertical-align:middle; }
  .modal-field-rank .field-icon{ height:18px; width:auto; margin-right:.25rem; }

  /* ===== 固定バー（フィルター/ミニ表） ===== */
  :root { --sticky-top: 48px; }  /* navタブの高さ。JS（measureTabsHeight）で実測して更新 */

  /* ★ JSが作る固定ラッパ */
  .pane-sticky-wrap{
    position: sticky;
    top: var(--sticky-top);
    z-index: 1020;            /* テーブルヘッダーより前面 */
    background:#fff;
    padding: .5rem 0;
    border-bottom: 1px solid rgba(0,0,0,.075);
  }

  /* 逆引きフィルター（スマホは2×2、PCは1行） */
  .filter-bar {
    display: grid;
    grid-template-columns: 1fr 1fr; /* 1行目: フィールド/ランク、2行目: タイプ/入手状況 */
    gap: 10px 12px;
    align-items: center;
  }
  @media (min-width: 768px) {
    .filter-bar {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      gap: 12px 16px;
    }
  }
  .filter-item { display:flex; flex-direction:row; align-items:center; gap:8px; white-space:nowrap; }
  .filter-item label { margin:0 !important; font-weight:500; }
  .filter-item .form-select { width:auto; display:inline-block; }

`;
  document.head.appendChild(style);
  _listLayoutStyleInjected = true;
}

// ===================== 初期化 =====================
async function main() {
  injectListLayoutCSS();

  // サマリー用スタイル（元のまま）
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
      .summary-table .field-head-icon{
        height: 60px; width: auto; display: inline-block; vertical-align: middle;
        image-rendering: -webkit-optimize-contrast;
      }
    `;
    document.head.appendChild(style);
    _summaryStyleInjected = true;
  })();

  await loadPokemonIconsScriptOnce();
  await loadData();

  setupFieldTabs();
  setupRankSearchControls();
  ensureRankSearchHeaderHasObtainedColumn();
  setupBackupUI();

  // === [A] 固定ブロックを「先に」組み立てる ===
  {
    const host = document.querySelector('#pane-allfaces .card-body');
    const filterRow = host?.querySelector('#searchName')?.closest('.row');
    const bulkBar   = host?.querySelector('#btnAllOn')?.closest('.d-flex');
    setupPaneSticky('pane-allfaces', [filterRow, bulkBar]);
  }
  {
    const host = document.querySelector('#pane-byfield .card-body');
    const filterRow = host?.querySelector('#byfieldSearchName')?.closest('.row');
    setupPaneSticky('pane-byfield', [filterRow]);
  }
  {
    const mini = ensureRankMiniSummaryContainer();
    setupPaneSticky('pane-search', [mini]);
  }
  
  // ★ スマホ縮小用クラス（0.85x）を全寝顔/フィールド別にも付与
  compactListFilters();

  // === [B] いったん計測 → thead の top を適用 ===
  refreshAllSticky();
  applyStickyHeaders();

  // === [C] 各シートを描画（ここで高さが変わる） ===
  const state = loadState();
  renderSummary(state);
  renderAllFaces(state);
  renderFieldTables(state);
  renderRankSearch(state);
  updateAmberPopup(state);
  ensureAmberCTA();

  // 描画により高さが変わったので、もう一度上書き
  applyStickyHeaders();

  // ▼ 全寝顔の検索・フィルタ（元のまま）
  document.getElementById('searchName').addEventListener('input', ()=>renderAllFaces(loadState()));
  document.getElementById('filterStyle').addEventListener('change', ()=>renderAllFaces(loadState()));
  document.getElementById('sortBy').addEventListener('change', ()=>renderAllFaces(loadState()));
  document.getElementById('allfacesGetStatus')?.addEventListener('change', ()=>renderAllFaces(loadState()));

  // ▼ 一括ON/OFF（元のまま）
  document.getElementById('btnAllOn').addEventListener('click', ()=>{
    if (!confirm('すべての寝顔をチェックします。よろしいですか？')) return;
    const state = loadState();
    for (const ent of LAST_RENDER_ENTRIES) {
      const key = entKey(ent);
      CHECKABLE_STARS.forEach(star=>{ if (speciesHasStar(ent, star)) setChecked(state, key, star, true); });
    }
    renderAllFaces(state); renderFieldTables(state); renderSummary(state); renderRankSearch(state);
    applyStickyHeaders();
  });
  document.getElementById('btnAllOff').addEventListener('click', ()=>{
    if (!confirm('すべての寝顔のチェックを解除します。よろしいですか？')) return;
    const state = loadState();
    for (const ent of LAST_RENDER_ENTRIES) {
      const key = entKey(ent);
      CHECKABLE_STARS.forEach(star=>{ if (speciesHasStar(ent, star)) setChecked(state, key, star, false); });
    }
    renderAllFaces(state);
    renderFieldTables(state);
    renderSummary(state);
    renderRankSearch(state);
    updateAmberPopup(state);
    applyStickyHeaders();
  });

  // 仕上げに計測＆適用（安全策）
  refreshAllSticky();
  applyStickyHeaders();
}

// タブ切替時：まず計測→次に適用
document.getElementById('mainTabs')?.addEventListener('shown.bs.tab', () => {
  refreshAllSticky();
  applyStickyHeaders();
});

// DOM 構築完了で main 起動
document.addEventListener('DOMContentLoaded', main);

// 画面サイズ変化やロード完了時も毎回再適用
window.addEventListener('resize', () => { refreshAllSticky(); applyStickyHeaders(); });
window.addEventListener('load',   () => { refreshAllSticky(); applyStickyHeaders(); });

// ハンバーガーメニュー開閉制御
(function(){
  const btn = document.getElementById("tab-menu");
  const menu = document.getElementById("hamburgerMenu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e)=>{
    e.stopPropagation();
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
  });

  // 外側クリックで閉じる
  document.addEventListener("click", (e)=>{
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.style.display = "none";
    }
  });
  
  // メニュークリック時に対象タブをアクティブ化
  document.querySelectorAll("#hamburgerMenu .hamburger-item").forEach(a=>{
    a.addEventListener("click", (e)=>{
      e.preventDefault();
      const target = document.querySelector(a.getAttribute("href"));
      if (target) {
        // BootstrapのタブAPIで切り替え
        const triggerEl = document.querySelector(`[data-bs-target="${a.getAttribute("href")}"]`);
        if (triggerEl) new bootstrap.Tab(triggerEl).show();
      }
      menu.style.display = "none";
    });
  });
})();

function afterRenderRankSearch() {
  styleRankMiniSummary();
  compactRankFilters();
  shrinkRankHelpText();
  markPokemonNameSpans();
}

// ===== HowTo（つかいかた）ボトムシート：イベントデリゲーション版 =====
(function () {
  // 必要DOMを保証（無ければ生成）
  function ensureHowtoDOM() {
    let backdrop = document.getElementById('howtoBackdrop');
    let sheet    = document.getElementById('howtoSheet');

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'howtoBackdrop';
      backdrop.className = 'howto-backdrop';
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'howtoSheet';
      sheet.className = 'howto-sheet';
      sheet.hidden = true;
      sheet.innerHTML = `
        <div class="howto-sheet__header">
          <div class="howto-sheet__title">つかいかた</div>
          <button type="button" class="howto-sheet__close" aria-label="閉じる">×</button>
        </div>
        <div class="howto-sheet__body">
          <p class="howto-sec--title"><strong>「全寝顔一覧」：</strong></p>
          <ul class="howto-list">
            <li>＊このシートから取得チェック(ON/OFF)を切り替えられます。</li>
          </ul>
          <p class="howto-sec--title"><strong>「フィールド別寝顔一覧」：</strong></p>
          <ul class="howto-list">
            <li>＊各フィールドで出現する寝顔の一覧を確認できます。</li>
            <li>＊このシートからも取得チェック(ON/OFF)を切り替えられます。</li>
          </ul>
          <p class="howto-sec--title"><strong>「フィールド・ランクから検索」：</strong></p>
          <ul class="howto-list">
            <li>＊「フィールド・ランク」や「取得状況」などから検索ができます。</li>
            <li>＊このシートからも取得チェック(ON/OFF)を切り替えられます。</li>
            <li>＊未取得の寝顔数などを確認しつつ「今日はどの睡眠タイプを狙おうか」みたいな使い方もしてみてください！</li>
          </ul>
        </div>`;
      document.body.appendChild(sheet);
    }
    return { backdrop, sheet };
  }

  const isOpen = () => document.body.classList.contains('is-howto-open');

  function openHowto() {
    const { backdrop, sheet } = ensureHowtoDOM();
    // ハンバーガーが開いていたら閉じる
    const menu = document.getElementById('hamburgerMenu');
    if (menu) menu.style.display = 'none';

    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      sheet.classList.add('show');
      document.body.classList.add('is-howto-open');
    });
  }

  function closeHowto() {
    const backdrop = document.getElementById('howtoBackdrop');
    const sheet    = document.getElementById('howtoSheet');
    if (!backdrop || !sheet) return;
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    const onEnd = () => {
      sheet.hidden = true;
      backdrop.hidden = true;
      document.body.classList.remove('is-howto-open');
      sheet.removeEventListener('transitionend', onEnd);
    };
    sheet.addEventListener('transitionend', onEnd);
  }

  // 1) 「つかいかた」タブのクリックを document で先取り（キャプチャ段階）
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('#tab-howto');
    if (!btn) return;

    // Bootstrapのタブ制御を確実に止める
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // タブ属性が付いていたら無効化（以降のクリックでも干渉しないように）
    btn.removeAttribute('data-bs-toggle');
    btn.removeAttribute('data-bs-target');
    btn.removeAttribute('href');

    isOpen() ? closeHowto() : openHowto();
  }, true); // ← capture:true が重要

  // 2) バックドロップ/✕ボタン/Escape で閉じる（動的生成に備えて委譲）
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'howtoBackdrop') closeHowto();
    if (e.target && e.target.closest('#howtoSheet .howto-sheet__close')) closeHowto();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closeHowto();
  });
})();

// ==== PWA Install Banner (deferred prompt) ====

// バナー要素
const pwaBanner     = document.getElementById('pwaBanner');
const pwaInstallBtn = document.getElementById('pwaInstallBtn');
const pwaCloseBtn   = document.getElementById('pwaCloseBtn');
const pwaIosHint    = document.getElementById('pwaIosHint');

let _deferredInstallEvt = null;
const _LS_HIDE_KEY = 'pwa-banner-hidden';

// 簡易UA判定（iOS Safari は beforeinstallprompt が来ない）
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// バナー表示/非表示
function showPwaBanner(){
  if (!pwaBanner) return;
  if (localStorage.getItem(_LS_HIDE_KEY) === '1') return; // ユーザーが閉じたら出さない

  // iOS は「ホーム画面に追加」の案内だけ出す
  if (isIos && !isInStandalone) {
    pwaIosHint?.classList.remove('d-none');
    pwaInstallBtn?.classList.add('d-none'); // iOSではボタン非表示（prompt不可）
    pwaBanner.classList.remove('d-none');
    return;
  }

  // Android/デスクトップ… beforeinstallprompt を受け取っている時のみ出す
  if (_deferredInstallEvt && !isInStandalone) {
    pwaIosHint?.classList.add('d-none');
    pwaInstallBtn?.classList.remove('d-none');
    pwaBanner.classList.remove('d-none');
  }
}
function hidePwaBanner(){
  pwaBanner?.classList.add('d-none');
}

// beforeinstallprompt: 標準バナーを止め、自前で制御
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                 // ← この時点で標準バナーは出ない
  _deferredInstallEvt = e;            // ← 後でボタンから呼ぶため保持
  showPwaBanner();                    // 自前バナーを表示
});

// ボタン押下で prompt() を1回だけ呼ぶ（ユーザー操作必須）
pwaInstallBtn?.addEventListener('click', async () => {
  if (!_deferredInstallEvt) return;
  pwaInstallBtn.disabled = true;
  try {
    _deferredInstallEvt.prompt();                         // ← ここが無いと今回の警告が出ます
    const choice = await _deferredInstallEvt.userChoice;  // accepted / dismissed
    // console.log('A2HS result:', choice.outcome);
  } finally {
    // promptは1回しか使えない → 解放しておく
    _deferredInstallEvt = null;
    pwaInstallBtn.disabled = false;
    hidePwaBanner();
  }
});

pwaCloseBtn?.addEventListener('click', () => {
  localStorage.setItem(_LS_HIDE_KEY, '1'); // 次回以降出さない
  hidePwaBanner();
});

// インストール完了時はバナーを閉じる
window.addEventListener('appinstalled', () => {
  localStorage.setItem(_LS_HIDE_KEY, '1');
  hidePwaBanner();
});

// 初期表示タイミング（iOS用に、ページロード時にも評価）
document.addEventListener('DOMContentLoaded', () => {
  if (isIos && !isInStandalone) showPwaBanner();
});

// DOMContentLoaded 内などで一度だけ
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .catch(console.error);
}
