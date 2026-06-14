import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, getEmp, empIdx } from '../utils.js';
import { SHIFTS, ec } from '../config.js';

// ── STATS ──
export function viewStats() {
  const wd = getWeekDates(S.weekOffset);
  const totalAssigned = wd.reduce((t,d)=>t+SHIFTS.reduce((s,sh)=>s+(S.schedule[d]?.[sh.id]?.length||0),0),0);
  const maxPossible = wd.length * SHIFTS.length * 2;
  const fillRate = maxPossible > 0 ? Math.round((totalAssigned/maxPossible)*100) : 0;

  const wrap = e("div");
  wrap.appendChild(div("page-title",["📊 דשבורד נתונים"],{style:"margin-bottom:16px"}));

  // KPIs
  const kpis = [
    {icon:"📅",lbl:"שיבוצים",val:totalAssigned,sub:"השבוע",color:"#3B82F6"},
    {icon:"📈",lbl:"אחוז מילוי",val:fillRate+"%",sub:fillRate>70?"מצוין":"דורש שיפור",color:fillRate>70?"#10B981":"#F59E0B"},
    {icon:"🌴",lbl:"חופשות ממתינות",val:S.vacations.filter(v=>v.status==="pending").length,sub:"לאישור",color:"#6366F1"},
    {icon:"👥",lbl:"עובדים פעילים",val:S.employees.length,sub:"במערכת",color:"#10B981"},
  ];
  const kpiGrid = div("kpi-grid");
  kpis.forEach(k => kpiGrid.appendChild(div("kpi",[
    div("kpi-icon",[k.icon]),
    e("div",{class:"kpi-val",style:"color:"+k.color},String(k.val)),
    div("kpi-lbl",[k.lbl]),
    k.sub?e("div",{class:"kpi-sub"},[k.sub]):null
  ],{style:"border-color:"+k.color+"33"})));
  wrap.appendChild(kpiGrid);

  // Per shift
  const shiftCard = div("card",[e("div",{class:"card-title"},"מילוי לפי משמרת")]);
  SHIFTS.forEach(sh => {
    const total = wd.reduce((s,d)=>s+(S.schedule[d]?.[sh.id]?.length||0),0);
    const max = wd.length*2;
    const pct = Math.round((total/max)*100);
    shiftCard.appendChild(div("workload-row",[
      div("workload-info",[
        e("span",{style:"font-weight:700;color:"+sh.color},sh.label+" ("+sh.start+"–"+sh.end+")"),
        e("span",{style:"font-size:12px;color:#94A3B8"},`${total}/${max} · ${pct}%`)
      ]),
      div("workload-bar-bg",[e("div",{class:"workload-bar-fill",style:`width:${pct}%;background:${sh.color}`})])
    ]));
  });
  wrap.appendChild(shiftCard);

  // Per employee
  const empCard = div("card",[e("div",{class:"card-title"},"פירוט לפי עובד")]);
  S.employees.forEach((emp,idx) => {
    const col = ec(idx);
    const count = wd.reduce((t,d)=>t+SHIFTS.reduce((s,sh)=>s+((S.schedule[d]?.[sh.id]||[]).includes(emp.id)?1:0),0),0);
    const max = emp.max_shifts_per_week||5;
    const pct = Math.min(Math.round((count/max)*100),100);
    const over = count>max;
    empCard.appendChild(div("workload-row",[
      div("workload-info",[
        e("div",{style:"display:flex;align-items:center;gap:7px"},[
          e("span",{style:`width:8px;height:8px;border-radius:50%;background:${col}`},""),
          e("span",{style:"font-weight:600;font-size:13px"},emp.name),
          over?e("span",{style:"font-size:10px;color:#EF4444"},"⚠️"):null
        ]),
        e("span",{style:"font-size:12px;font-weight:700;color:"+(over?"#EF4444":"#94A3B8")},`${count}/${max}`)
      ]),
      div("workload-bar-bg",[e("div",{class:"workload-bar-fill",style:`width:${pct}%;background:${over?"#EF4444":pct>80?"#F59E0B":"#10B981"}`})])
    ]));
  });
  wrap.appendChild(empCard);
  return wrap;
}
