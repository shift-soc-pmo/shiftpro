import { S } from '../state.js';
import { e, div, btn, fmtDate } from '../utils.js';
import { sb } from '../supabase.js';
import { getPlanConfig, saveGlobalPlanConfig } from '../db.js';

let _render = () => {};
let _toast  = () => {};
export function setSuperAdminDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

const PLAN_COLORS = { free:'#64748B', pro:'#3B82F6', enterprise:'#A855F7' };
const PLAN_LABELS = { free:'חינמי', pro:'Pro', enterprise:'Enterprise' };

const ALL_FEATURES = [
  { id:'morning2',       icon:'🌅', label:'בוקר ב׳' },
  { id:'qualifications', icon:'🎯', label:'כשירות' },
  { id:'swaps',          icon:'🔄', label:'חילופים' },
  { id:'vacations',      icon:'🌴', label:'חופשות' },
  { id:'blocks',         icon:'🚫', label:'חסימות' },
  { id:'stats',          icon:'📊', label:'נתונים' },
  { id:'calendar',       icon:'🗓️', label:'לוח שנה' },
  { id:'auto_schedule',  icon:'🤖', label:'שיבוץ אוטומטי' },
];

function _viewPlanConfig() {
  const cfg = getPlanConfig();
  const plans = ['free','pro','enterprise'];
  const card = div("card",[
    e("div",{class:"card-title",style:"margin-bottom:14px"},"💳 תצורת תוכניות")
  ]);

  // draft edits stored in S.planDraft
  if (!S.planDraft) S.planDraft = JSON.parse(JSON.stringify(cfg));

  const grid = e("div",{style:"display:grid;grid-template-columns:repeat(3,1fr);gap:12px"});
  plans.forEach(p => {
    const d = S.planDraft[p] || {};
    const col = { free:'#64748B', pro:'#3B82F6', enterprise:'#A855F7' }[p];
    const planCard = e("div",{style:`background:#0F172A;border:2px solid ${col}33;border-radius:12px;padding:14px`});
    planCard.appendChild(e("div",{style:`font-weight:800;font-size:14px;color:${col};margin-bottom:12px`},
      (d.emoji||'')+" "+( d.label||p )));

    // price
    planCard.appendChild(e("label",{style:"font-size:11px;color:#64748B;display:block;margin-bottom:4px"},"מחיר ₪/חודש"));
    const priceInp = e("input",{
      class:"fi", type:"number", min:"0", value: String(d.price ?? 0),
      style:"margin-bottom:10px",
      oninput: ev => { S.planDraft[p].price = Number(ev.target.value); }
    });
    planCard.appendChild(priceInp);

    // emp limit
    planCard.appendChild(e("label",{style:"font-size:11px;color:#64748B;display:block;margin-bottom:4px"},"מקסימום עובדים"));
    const limitInp = e("input",{
      class:"fi", type:"number", min:"1",
      placeholder: d.emp_limit === null ? "ללא הגבלה" : "",
      value: d.emp_limit !== null ? String(d.emp_limit) : "",
      style:"margin-bottom:4px",
      oninput: ev => {
        const v = ev.target.value.trim();
        S.planDraft[p].emp_limit = v === "" ? null : Number(v);
      }
    });
    planCard.appendChild(limitInp);
    planCard.appendChild(e("div",{style:"font-size:10px;color:#475569"},"השאר ריק = ללא הגבלה"));

    grid.appendChild(planCard);
  });
  card.appendChild(grid);

  card.appendChild(btn("btn-add","💾 שמור תצורה", async () => {
    try {
      await saveGlobalPlanConfig(S.planDraft);
      S.planDraft = null;
      _toast("תצורת תוכניות עודכנה ✓");
      _render();
    } catch(err) { _toast("שגיאה: "+err.message,"err"); }
  },{style:"width:100%;margin-top:14px"}));

  return card;
}

export function viewSuperAdmin() {
  const wrap = e("div");
  wrap.appendChild(div("page-title",["👑 Super Admin — כל העסקים"],{style:"margin-bottom:16px"}));

  wrap.appendChild(_viewPlanConfig());

  const statsRow = e("div",{style:"display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;margin-top:20px"});
  const businesses = S.allBusinesses || [];
  const totalEmps  = businesses.reduce((s,b)=>s+(b.employee_count||0),0);
  const proCount   = businesses.filter(b=>b.plan==='pro'||b.plan==='enterprise').length;
  [
    {icon:"🏢",lbl:"עסקים",val:businesses.length,color:"#3B82F6"},
    {icon:"👥",lbl:"עובדים סה״כ",val:totalEmps,color:"#10B981"},
    {icon:"💳",lbl:"מנויים פעילים",val:proCount,color:"#A855F7"},
  ].forEach(k => statsRow.appendChild(div("kpi",[
    div("kpi-icon",[k.icon]),
    e("div",{class:"kpi-val",style:"color:"+k.color},String(k.val)),
    div("kpi-lbl",[k.lbl])
  ],{style:"border-color:"+k.color+"33"})));
  wrap.appendChild(statsRow);

  if (!S.allBusinessesLoaded) {
    const loadBtn = btn("btn-add","🔄 טען נתונים",async () => {
      loadBtn.disabled = true;
      loadBtn.textContent = "טוען...";
      const { data, error } = await sb.rpc('get_all_businesses_admin');
      if (error) { _toast("שגיאה: "+error.message,"err"); loadBtn.disabled=false; loadBtn.textContent="🔄 טען נתונים"; return; }
      S.allBusinesses = data || [];
      S.allBusinessesLoaded = true;
      _render();
    },{style:"width:100%;margin-bottom:16px"});
    wrap.appendChild(loadBtn);
    return wrap;
  }

  // Search
  if (!S.adminSearch) S.adminSearch = "";
  const searchRow = e("div",{style:"margin-bottom:14px;display:flex;gap:10px;align-items:center"});
  const searchInp = e("input",{class:"fi",placeholder:"חפש עסק / מייל...",value:S.adminSearch,oninput:ev=>{S.adminSearch=ev.target.value;_render();}});
  searchRow.appendChild(searchInp);
  searchRow.appendChild(btn("btn-sm btn-sm-blue","🔄 רענן",async()=>{
    S.allBusinessesLoaded=false; S.allBusinesses=[]; _render();
  }));
  wrap.appendChild(searchRow);

  const filtered = businesses.filter(b =>
    !S.adminSearch ||
    b.name?.toLowerCase().includes(S.adminSearch.toLowerCase()) ||
    b.owner_email?.toLowerCase().includes(S.adminSearch.toLowerCase())
  );

  const card = div("card",[]);
  if (filtered.length === 0) {
    card.appendChild(e("div",{style:"color:#64748B;text-align:center;padding:20px"},"אין תוצאות"));
  } else {
    filtered.forEach(biz => _bizRow(card, biz));
  }
  wrap.appendChild(card);
  return wrap;
}

function _bizRow(card, biz) {
  const planColor = PLAN_COLORS[biz.plan] || '#64748B';
  const expires = biz.plan_expires_at ? new Date(biz.plan_expires_at) : null;
  const isExpired = expires && expires < new Date();
  const isPaid = biz.plan === 'pro' || biz.plan === 'enterprise';

  // Format expiry label
  let expiryLabel = "";
  if (isPaid) {
    if (!expires) expiryLabel = "♾️ ללא תפוגה";
    else if (isExpired) expiryLabel = "⚠️ פג " + expires.toLocaleDateString("he-IL");
    else expiryLabel = "⏳ עד " + expires.toLocaleDateString("he-IL");
  }

  const row = e("div",{style:"padding:14px 0;border-bottom:1px solid #1E293B"});

  // Top line: name + email + counters + plan badge + plan selector
  const topLine = e("div",{style:"display:flex;align-items:center;gap:10px;flex-wrap:wrap"});
  topLine.appendChild(e("div",{style:"flex:1;min-width:160px"},[
    e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0"},biz.name),
    e("div",{style:"font-size:11px;color:#64748B"},biz.owner_email||"—"),
  ]));
  topLine.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap"},[
    e("div",{style:"font-size:11px;color:#94A3B8"},biz.employee_count+" עובדים"),
    e("div",{style:`background:${planColor}22;color:${planColor};border:1px solid ${planColor}44;border-radius:8px;padding:2px 10px;font-size:11px;font-weight:800`},PLAN_LABELS[biz.plan]||biz.plan),
    _planSelector(biz),
  ]));
  row.appendChild(topLine);

  // Feature toggles — collapsible
  const featKey = 'adminFeat_' + biz.id;
  if (!S[featKey]) S[featKey] = false;
  const featToggleBtn = btn("btn-sm btn-sm-gray",
    (S[featKey] ? "▲ " : "▼ ") + "מודולים",
    () => { S[featKey] = !S[featKey]; _render(); },
    { style:"margin-top:8px;font-size:11px" }
  );
  row.appendChild(featToggleBtn);

  if (S[featKey]) {
    const feats = biz.features || {};
    const featGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;padding:10px;background:#0F172A;border-radius:8px;border:1px solid #1E293B"});
    ALL_FEATURES.forEach(f => {
      const isOn = feats[f.id] !== false; // default true
      const pill = e("div",{
        style:`display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;cursor:pointer;font-size:12px;border:1px solid;transition:all 0.15s;`
          + (isOn
            ? "background:#10B98122;color:#10B981;border-color:#10B98144"
            : "background:#1E293B;color:#475569;border-color:#334155"),
        onclick: async () => {
          const newFeats = { ...feats, [f.id]: !isOn };
          const { error } = await sb.rpc('set_business_features',{ p_business_id:biz.id, p_features:newFeats });
          if (error) { _toast("שגיאה: "+error.message,"err"); return; }
          biz.features = newFeats;
          _toast((isOn?"כובה":"הופעל")+" — "+f.label+" ✓");
          _render();
        }
      },[
        e("span",{},f.icon),
        e("span",{},f.label),
        e("span",{style:"font-weight:800;margin-right:2px"},isOn?"✓":"✕"),
      ]);
      featGrid.appendChild(pill);
    });
    row.appendChild(featGrid);
  }

  // Expiry controls (only for paid plans)
  if (isPaid) {
    const expiryRow = e("div",{style:"display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap"});
    expiryRow.appendChild(e("span",{style:"font-size:11px;color:"+(isExpired?"#EF4444":"#94A3B8")},expiryLabel));

    // Date picker
    const dateVal = expires ? expires.toISOString().slice(0,10) : "";
    const dateInp = e("input",{
      type:"date",
      value:dateVal,
      style:"background:#0F172A;border:1px solid #334155;border-radius:6px;color:#E2E8F0;font-size:11px;padding:3px 8px;font-family:inherit"
    });
    expiryRow.appendChild(dateInp);

    expiryRow.appendChild(btn("btn-sm btn-sm-blue","שמור תאריך", async () => {
      const val = dateInp.value;
      const ts = val ? new Date(val+"T23:59:59").toISOString() : null;
      const { error } = await sb.rpc('set_plan_expires',{p_business_id:biz.id, p_expires_at:ts});
      if (error) { _toast("שגיאה: "+error.message,"err"); return; }
      biz.plan_expires_at = ts;
      _toast("תאריך תפוגה עודכן ✓");
      _render();
    }));

    expiryRow.appendChild(btn("btn-sm btn-sm-gray","♾️ ללא תפוגה", async () => {
      const { error } = await sb.rpc('set_plan_expires',{p_business_id:biz.id, p_expires_at:null});
      if (error) { _toast("שגיאה: "+error.message,"err"); return; }
      biz.plan_expires_at = null;
      dateInp.value = "";
      _toast("הוסר תאריך תפוגה — גישה לצמיתות ✓");
      _render();
    }));

    row.appendChild(expiryRow);
  }

  card.appendChild(row);
}

function _planSelector(biz) {
  const sel = e("select",{
    style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:4px 8px;font-size:12px;font-family:inherit;cursor:pointer",
    onchange: async ev => {
      const newPlan = ev.target.value;
      sel.disabled = true;
      const { error } = await sb.rpc('set_business_plan',{p_business_id:biz.id, p_plan:newPlan});
      if (error) { _toast("שגיאה: "+error.message,"err"); sel.value=biz.plan; sel.disabled=false; return; }
      biz.plan = newPlan;
      _toast("תוכנית עודכנה ל-"+newPlan+" ✓");
      sel.disabled = false;
      _render();
    }
  });
  ['free','pro','enterprise'].forEach(p => {
    const opt = e("option",{value:p},p);
    if (p===biz.plan) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}
