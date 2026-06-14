import { S } from '../state.js';
import { e, div, btn, fmtDate } from '../utils.js';
import { sb } from '../supabase.js';

let _render = () => {};
let _toast  = () => {};
export function setSuperAdminDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

const PLAN_COLORS = { free:'#64748B', pro:'#3B82F6', enterprise:'#A855F7' };
const PLAN_LABELS = { free:'חינמי', pro:'Pro', enterprise:'Enterprise' };

export function viewSuperAdmin() {
  const wrap = e("div");
  wrap.appendChild(div("page-title",["👑 Super Admin — כל העסקים"],{style:"margin-bottom:16px"}));

  const statsRow = e("div",{style:"display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px"});
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
    filtered.forEach(biz => {
      const planColor = PLAN_COLORS[biz.plan] || '#64748B';
      const row = e("div",{style:"display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #1E293B"},[
        e("div",{style:"flex:1;min-width:0"},[
          e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0;margin-bottom:2px"},biz.name),
          e("div",{style:"font-size:12px;color:#64748B"},biz.owner_email||"—"),
        ]),
        e("div",{style:"display:flex;align-items:center;gap:8px;flex-shrink:0"},[
          e("div",{style:`font-size:11px;color:#94A3B8`},biz.employee_count+" עובדים"),
          e("div",{style:`background:${planColor}22;color:${planColor};border:1px solid ${planColor}44;border-radius:8px;padding:2px 10px;font-size:11px;font-weight:800`},PLAN_LABELS[biz.plan]||biz.plan),
          _planSelector(biz),
        ])
      ]);
      card.appendChild(row);
    });
  }
  wrap.appendChild(card);
  return wrap;
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
