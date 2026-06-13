import { S } from '../state.js';
import { e, div, btn, getEmp, fmtDate, render } from '../utils.js';
import { isManager } from '../db.js';
import { addVacation, deleteVacRequest, updateVacStatus } from '../vacations.js';

// ── VACATIONS ──
export function viewVacations() {
  const wrap = e("div");
  wrap.appendChild(div("page-title",["🌴 העדרויות"],{style:"margin-bottom:16px"}));

  const icons = { vacation: "🌴", reserve: "🎖️", exam: "📝" };
  const names = { vacation: "חופשה", reserve: "מילואים", exam: "מבחן" };
  const colors = { vacation: "#10B981", reserve: "#6366F1", exam: "#F59E0B" };

  // Manager tabs
  if (!S.mgrVacTab) S.mgrVacTab = "approve";
  const vacTabRow = e("div",{style:"display:flex;gap:6px;margin-bottom:14px"});
  [{id:"mine",label:"🌴 ההעדרויות שלי"},{id:"approve",label:"👥 אישור בקשות"}].forEach(t=>{
    const isActive = S.mgrVacTab===t.id;
    vacTabRow.appendChild(e("button",{
      style:"flex:1;padding:10px;border-radius:10px;border:1px solid "+(isActive?"#3B82F6":"#334155")+";background:"+(isActive?"#3B82F622":"#1E293B")+";color:"+(isActive?"#60A5FA":"#64748B")+";font-family:inherit;font-weight:700;font-size:13px",
      onclick:()=>{S.mgrVacTab=t.id;render();}
    },t.label));
  });
  wrap.appendChild(vacTabRow);

  // Manager personal vacations
  if (S.mgrVacTab === "mine") {
    wrap.appendChild(viewEmpVacations());
    return wrap;
  }

  // ── בקשות ממתינות לאישור ──
  const pending = S.vacations.filter(v => v.status === "pending" && getEmp(v.employee_id));
  if (pending.length > 0) {
    const pCard = div("card",[
      e("div",{style:"font-weight:800;font-size:15px;color:#F59E0B;margin-bottom:14px"},`⏳ ממתינות לאישור (${pending.length})`)
    ]);
    pending.forEach(vac => {
      const emp = getEmp(vac.employee_id);
      const col = colors[vac.type] || "#10B981";
      const icon = icons[vac.type] || "🌴";
      const name = names[vac.type] || "חופשה";
      const isExam = vac.type === "exam";

      pCard.appendChild(e("div",{style:`background:#0F172A;border:1px solid ${col}44;border-radius:14px;padding:14px;margin-bottom:10px`},[
        e("div",{style:"display:flex;justify-content:space-between;align-items:start;margin-bottom:10px"},[
          e("div",{},[
            e("div",{style:`font-weight:800;font-size:15px;color:${col}`},`${icon} ${name}`),
            e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0;margin-top:4px"},emp?.name || "עובד"),
            e("div",{style:"font-size:12px;color:#64748B;margin-top:2px"},
              fmtDate(vac.start_date) + (vac.start_date !== vac.end_date ? " — " + fmtDate(vac.end_date) : "")),
            vac.reason ? e("div",{style:"font-size:12px;color:#94A3B8;font-style:italic;margin-top:4px"},`"${vac.reason}"`) : null,
          ]),
          isExam ? e("div",{style:"background:#F59E0B22;border:1px solid #F59E0B44;border-radius:8px;padding:4px 8px;font-size:10px;color:#FCD34D;font-weight:700"},"לא חוסם") : null
        ]),
        div("form-actions",[
          btn("btn-green","✓ אשר",()=>updateVacStatus(vac.id,"approved"),{style:"flex:1"}),
          btn("btn-sm btn-sm-red","✗ דחה",()=>{
            const reason = prompt("סיבת דחייה (אופציונלי):");
            if (reason === null) return; // cancelled
            updateVacStatus(vac.id,"rejected",reason);
          },{style:"flex:1"})
        ])
      ]));
    });
    wrap.appendChild(pCard);
  } else {
    wrap.appendChild(div("card",[
      e("div",{style:"text-align:center;padding:20px;color:#64748B;font-size:13px"},"אין בקשות ממתינות לאישור ✓")
    ]));
  }

  // ── ייצוא חופשות מאושרות ──
  const approved = S.vacations.filter(v => v.status === "approved" && getEmp(v.employee_id));
  if (approved.length > 0) {
    wrap.appendChild(div("form-actions",[
      btn("btn-green","📤 ייצוא CSV",()=>{
        const icons = {vacation:"חופשה",reserve:"מילואים",exam:"מבחן"};
        let csv = "שם,סוג,מתאריך,עד תאריך,סטטוס,סיבה"+String.fromCharCode(10);
        approved.forEach(v=>{
          const emp=getEmp(v.employee_id);
          csv+="\""+((emp?.name)||"?")+"\""+","+"\""+((icons[v.type])||"חופשה")+"\""+","+v.start_date+","+v.end_date+","+"מאושר"+","+"\""+((v.reason)||"")+"\""+String.fromCharCode(10);
        });
        const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;a.download="absences_approved.csv";a.click();URL.revokeObjectURL(url);
        toast("קובץ CSV הורד ✓");
      },{style:"flex:1"}),
      btn("btn-sm btn-sm-blue","🖨️ הדפסה",()=>{
        const icons = {vacation:"🌴 חופשה",reserve:"🎖️ מילואים",exam:"📝 מבחן"};
        let html = "<!DOCTYPE html><html dir=rtl lang=he><head><meta charset=UTF-8><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th{background:#1E293B;color:white;padding:8px;text-align:right}td{padding:6px 8px;border:1px solid #ddd}</style></head><body>";
        html += "<h1>היעדרויות מאושרות — "+(S.business?.name||"")+"</h1>";
        html += "<table><tr><th>שם</th><th>סוג</th><th>מתאריך</th><th>עד תאריך</th><th>סיבה</th></tr>";
        approved.forEach(v=>{
          const emp=getEmp(v.employee_id);
          html+="<tr><td>"+(emp?.name||"?")+"</td><td>"+(icons[v.type]||"חופשה")+"</td><td>"+v.start_date+"</td><td>"+v.end_date+"</td><td>"+(v.reason||"")+"</td></tr>";
        });
        html+="</table></body></html>";
        const win=window.open("","_blank");
        if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500);}
        toast("פותח להדפסה ✓");
      },{style:"flex:1"})
    ],{style:"margin-bottom:14px"}));
  }

  // ── היסטוריה ──
  const history = S.vacations.filter(v => v.status !== "pending" && getEmp(v.employee_id));
  if (history.length > 0) {
    const hCard = div("card",[
      e("div",{style:"font-weight:700;font-size:14px;color:#94A3B8;margin-bottom:14px"},"📜 היסטוריה")
    ]);
    history.sort((a,b) => (b.start_date||"").localeCompare(a.start_date||"")).forEach(vac => {
      const emp = getEmp(vac.employee_id);
      const isApp = vac.status === "approved";
      const col = colors[vac.type] || "#10B981";
      const icon = icons[vac.type] || "🌴";

      hCard.appendChild(e("div",{style:"display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #0F172A"},[
        e("div",{},[
          e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0"},[
            e("span",{style:`color:${col};margin-left:6px`},icon),
            emp?.name || "עובד"
          ]),
          e("div",{style:"font-size:11px;color:#64748B;margin-top:2px"},
            fmtDate(vac.start_date) + (vac.start_date !== vac.end_date ? " — " + fmtDate(vac.end_date) : ""))
        ]),
        e("div",{style:"display:flex;align-items:center;gap:6px"},[
          e("span",{class:"status-badge status-"+(isApp?"approved":"rejected")},isApp?"אושר":"נדחה"),
          vac.reject_reason ? e("div",{style:"font-size:10px;color:#FCA5A5;margin-top:2px"},"סיבה: "+vac.reject_reason) : null,
          btn("btn-sm btn-sm-red","🗑️",()=>deleteVacRequest(vac.id),{style:"padding:4px 6px"})
        ])
      ]));
    });
    wrap.appendChild(hCard);
  }

  return wrap;
}
