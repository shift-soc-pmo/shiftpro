import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, getTimeBasedGreeting, render } from '../utils.js';
import { SHIFTS } from '../config.js';
import { getActiveProfile } from '../db.js';

export function viewHome() {
  const wd = getWeekDates(S.weekOffset);
  const weekStart = wd[0];
  const isPublished = S.publishedWeeks.has(weekStart);
  const pendingVacs = S.vacations.filter(v=>v.status==="pending").length;
  const pendingSwaps = S.swapRequests.filter(s=>s.status==="pending_manager").length;
  const totalAssigned = wd.reduce((t,d) =>
    t + SHIFTS.reduce((s,sh)=>s+(S.schedule[d]?.[sh.id]?.length||0),0), 0);
  const wrap = e("div");
  // החזרת הברכה למנהל
  wrap.appendChild(e("div",{style:"margin-bottom:20px"},[
    e("div",{style:"font-size:13px;color:#64748B"}, new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})),
    e("div",{style:"font-weight:900;font-size:26px;color:#E2E8F0;margin-top:4px"}, (()=>{const g=getTimeBasedGreeting();return g.text+", "+(getActiveProfile()?.name||"").split(" ")[0]+" "+g.emoji;})()),
  ]));


  // KPIs
  const kpis = [
    {icon:"👥",lbl:"עובדים",val:S.employees.length,color:"#3B82F6"},
    {icon:"📅",lbl:"שיבוצים השבוע",val:totalAssigned,color:"#10B981"},
    {icon:"🌴",lbl:"חופשות ממתינות",val:pendingVacs,color:"#F59E0B"},
    {icon:"🔄",lbl:"חילופים פתוחים",val:pendingSwaps,color:"#A855F7"},
  ];
  const kpiGrid = div("kpi-grid");
  kpis.forEach(k => kpiGrid.appendChild(div("kpi",[
    div("kpi-icon",[k.icon]),
    e("div",{class:"kpi-val",style:"color:"+k.color},String(k.val)),
    div("kpi-lbl",[k.lbl])
  ],{style:"border-color:"+k.color+"33"})));
  wrap.appendChild(kpiGrid);

  // Week snapshot
  const snap = div("card",[
    div("",[
      e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0"},"📅 השבוע הנוכחי"),
      e("div",{style:"font-size:12px;color:#64748B;margin-top:2px"},fmtDate(wd[0])+" — "+fmtDate(wd[6]))
    ].map(x=>x),{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"}),
    isPublished ? div("published-banner",["📢 פורסם לעובדים"]) :
    totalAssigned > 0 ? btn("btn-purple","📢 פרסם סידור לעובדים",()=>{S.showPublishModal=true;render();},{style:"width:100%"}) :
    e("div",{style:"color:#64748B;font-size:13px;text-align:center"},"אין שיבוצים השבוע")
  ]);
  wrap.appendChild(snap);

  // Alerts
  const alerts = [];
  if (pendingVacs > 0) alerts.push({class:"alert-warn",icon:"🌴",msg:`${pendingVacs} בקשות חופשה ממתינות לאישור`,view:"vacations"});
  if (pendingSwaps > 0) alerts.push({class:"alert-info",icon:"🔄",msg:`${pendingSwaps} בקשות חילוף ממתינות למנהל`,view:"swaps"});
  if (alerts.length > 0) {
    const alertCard = div("card",[e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0;margin-bottom:10px"},"🔔 דורש טיפול")]);
    alerts.forEach(a => alertCard.appendChild(
      e("div",{class:"alert "+a.class,style:"cursor:pointer",onclick:()=>{S.view=a.view;render();}},[
        e("span",{style:"flex-shrink:0"},a.icon),
        e("span",{style:"flex:1"},a.msg),
        e("span",{},"←")
      ])
    ));
    wrap.appendChild(alertCard);
  }

  // Quick nav
  const quick = div("quick-grid");
  [{icon:"📅",lbl:"סידור עבודה",sub:"שיבוץ השבוע",v:"schedule"},
   {icon:"👥",lbl:"עובדים",sub:`${S.employees.length} עובדים`,v:"employees"},
   {icon:"🌴",lbl:"חופשות",sub:`${pendingVacs} ממתינות`,v:"vacations"},
   {icon:"📊",lbl:"דשבורד",sub:"נתונים וסטטיסטיקות",v:"stats"},
  ].forEach(it => quick.appendChild(
    e("button",{class:"quick-btn",onclick:()=>{S.view=it.v;render();}},[
      div("q-icon",[it.icon]),
      div("q-label",[it.lbl]),
      div("q-sub",[it.sub])
    ])
  ));
  wrap.appendChild(quick);
  return wrap;
}
