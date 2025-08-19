// ============================================================
// 状態管理
// ============================================================

const CHECKABLE_STARS = ["★☆☆☆☆","★★☆☆☆","★★★☆☆","★★★★☆","★★★★★"];
let RAW_ROWS = [];             // JSONから読み込む全ポケモンデータ
let LAST_RENDER_ENTRIES = [];  // 全寝顔チェックシートの直近描画対象

function loadState(){
  try { return JSON.parse(localStorage.getItem("sleepState")) || {checked:{}}; }
  catch(e){ return {checked:{}}; }
}
function saveState(state){
  localStorage.setItem("sleepState", JSON.stringify(state));
}

// ============================================================
// 保存キー（IconNo優先、なければNo）
// ============================================================

function rowKey(row){ return String(row.IconNo || row.No); }
function entKey(ent){ return String(ent.iconNo || ent.no); }

// ============================================================
// チェック状態管理（独立管理、レガシーデータ互換付き）
// ============================================================

function setChecked(state, key, star, val){
  if (!state.checked[key]) state.checked[key] = {};
  state.checked[key][star] = !!val;
  saveState(state);
}
function getChecked(state, key, star){
  const hit = !!(state.checked?.[key]?.[star]);
  if (hit) return true;
  // レガシーデータ対応（IconNo→Noにフォールバック）
  const legacy = (/^\d{5,}$/.test(key)) ? key.slice(0,4) : null;
  return legacy ? !!(state.checked?.[legacy]?.[star]) : false;
}
function setRowAll(state, key, val){
  CHECKABLE_STARS.forEach(star => setChecked(state, key, star, val));
}

// ============================================================
// サマリー集計（ダークライ除外）
// ============================================================

function calcSummary(state){
  const excluded = new Set(["ダークライ"]);

  function calcFor(style, field){
    let denom=0,num=0;
    for(const row of RAW_ROWS){
      if(excluded.has(row.Name)) continue;
      if(style && row.Style!==style) continue;
      const rankNum = getFieldRankNum(row,field);
      if(rankNum){
        denom++;
        if(CHECKABLE_STARS.includes(row.DisplayRarity) &&
           getChecked(state,rowKey(row),row.DisplayRarity)) num++;
      }
    }
    return {num,denom};
  }

  function calcForAll(style){
    let denom=0,num=0;
    for(const row of RAW_ROWS){
      if(excluded.has(row.Name)) continue;
      if(style && row.Style!==style) continue;
      denom++;
      if(CHECKABLE_STARS.includes(row.DisplayRarity) &&
         getChecked(state,rowKey(row),row.DisplayRarity)) num++;
    }
    return {num,denom};
  }

  // ...ここで画面更新処理を呼ぶ
}

// ============================================================
// 全寝顔チェックシートの描画
// ============================================================

function renderAllSheet(state,entries){
  LAST_RENDER_ENTRIES = entries;
  const tbody=document.querySelector("#all-sheet tbody");
  tbody.innerHTML="";

  for(const ent of entries){
    const key=entKey(ent);
    const row=document.createElement("tr");

    // ポケモンセル（アイコン＋No＋名前）
    const tdPoke=document.createElement("td");
    tdPoke.classList.add("pokemon-cell");
    tdPoke.innerHTML=`
      <div class="pokemon-icon-wrapper">
        <img src="icons/${key}.png" class="poke-icon">
        <div class="poke-label">${ent.no} ${ent.name}</div>
      </div>`;
    row.appendChild(tdPoke);

    // 各星セル
    for(const star of CHECKABLE_STARS){
      const td=document.createElement("td");
      if(speciesHasStar(ent,star)){
        const checked=getChecked(state,key,star);
        td.innerHTML=`<input type="checkbox" data-key="${key}" data-star="${star}" ${checked?"checked":""}>`;
      }else{
        td.textContent="ー";
      }
      row.appendChild(td);
    }

    // 一括ON/OFF
    const tdCtrl=document.createElement("td");
    tdCtrl.innerHTML=`
      <button data-bulk="on"  data-key="${key}">一括ON</button>
      <button data-bulk="off" data-key="${key}">一括OFF</button>`;
    row.appendChild(tdCtrl);

    tbody.appendChild(row);
  }

  // イベント
  tbody.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener("change",e=>{
      const key=e.target.dataset.key;
      const star=e.target.dataset.star;
      setChecked(state,key,star,e.target.checked);
      calcSummary(state);
    });
  });
  tbody.querySelectorAll("button[data-bulk]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      const key=e.currentTarget.dataset.key;
      const mode=e.currentTarget.dataset.bulk;
      setRowAll(state,key,mode==="on");
      CHECKABLE_STARS.forEach(star=>{
        const input=tbody.querySelector(`input[data-key="${key}"][data-star="${star}"]`);
        if(input) input.checked=(mode==="on");
      });
      calcSummary(state);
    });
  });
}

// ============================================================
// フィールド別寝顔一覧（全寝顔と同様にdata-key管理）
// ============================================================

function renderByField(state,entries){
  const tbody=document.querySelector("#byfield tbody");
  tbody.innerHTML="";
  for(const ent of entries){
    const key=entKey(ent);
    const row=document.createElement("tr");
    // ポケモンセル
    const tdPoke=document.createElement("td");
    tdPoke.classList.add("byfield-name-cell");
    tdPoke.innerHTML=`
      <div class="pokemon-icon-wrapper">
        <img src="icons/${key}.png" class="poke-icon">
        <div class="poke-label">${ent.no} ${ent.name}</div>
      </div>`;
    row.appendChild(tdPoke);
    // 星セル
    for(const star of CHECKABLE_STARS){
      const td=document.createElement("td");
      if(speciesHasStar(ent,star)){
        const checked=getChecked(state,key,star);
        td.innerHTML=`<input type="checkbox" data-key="${key}" data-star="${star}" ${checked?"checked":""}>`;
      }else{
        td.textContent="ー";
      }
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  tbody.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener("change",e=>{
      const key=e.target.dataset.key;
      const star=e.target.dataset.star;
      setChecked(state,key,star,e.target.checked);
      calcSummary(state);
    });
  });
}

// ============================================================
// 現在のフィールド・ランクから検索
// ============================================================

function renderSearch(state,field,rank){
  const tbody=document.querySelector("#search tbody");
  tbody.innerHTML="";
  const items=[];
  for(const row of RAW_ROWS){
    const rNum=getFieldRankNum(row,field);
    if(!rNum||rNum>rank) continue;
    if(CHECKABLE_STARS.includes(row.DisplayRarity) &&
       getChecked(state,rowKey(row),row.DisplayRarity)) continue;
    items.push(row);
  }
  if(items.length===0){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=5;
    td.innerHTML=`<div class="completed">COMPLETED 🎉</div>`;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for(const row of items){
    const key=rowKey(row);
    const tr=document.createElement("tr");
    const tdPoke=document.createElement("td");
    tdPoke.innerHTML=`
      <div class="pokemon-icon-wrapper">
        <img src="icons/${key}.png" class="poke-icon">
        <div class="poke-label">${row.No} ${row.Name}</div>
      </div>`;
    tr.appendChild(tdPoke);
    tr.appendChild(Object.assign(document.createElement("td"),{textContent:row.Style||"ー"}));
    tr.appendChild(Object.assign(document.createElement("td"),{textContent:row.DisplayRarity||"ー"}));
    tbody.appendChild(tr);
  }
}

// ============================================================
// 補助関数（ダミー）
// ============================================================

function getFieldRankNum(row,field){
  // JSONのフィールド列からランク数値を返す想定
  const v=row[field];
  return v?parseInt(v):0;
}
function speciesHasStar(ent,star){
  return ent.DisplayRarity===star;
}

// ============================================================
// 初期化
// ============================================================

document.addEventListener("DOMContentLoaded",()=>{
  const state=loadState();
  fetch("sleepdata.json").then(r=>r.json()).then(data=>{
    RAW_ROWS=data["すべての寝顔一覧"];
    renderAllSheet(state,RAW_ROWS);
    renderByField(state,RAW_ROWS);
    calcSummary(state);
  });
});
