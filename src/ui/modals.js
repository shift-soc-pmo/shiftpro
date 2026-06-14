import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, getEmp } from '../utils.js';
import { SHIFTS, BLOCK_SHIFTS, DAYS, SHIFT_BY_ID, WEEKEND_SHIFTS } from '../config.js';
import { saveConstraints } from '../employees.js';
import { createInvitation } from '../employees.js';
import { publishWeek } from '../schedule-actions.js';
import { sb } from '../supabase.js';
import { activeShifts } from '../db.js';

let _render = () => {};
let _toast = () => {};
export function setModalsDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ── CONSTRAINTS MODAL ──
export function viewConstraintsModal() {
  const emp = S.constraintsEmp;
  if (!emp) return null;

  let localDC = JSON.parse(JSON.stringify(emp.day_constraints||{}));
  let localMax = emp.max_shifts_per_week||5;
  let localPerShift = JSON.parse(JSON.stringify(emp.max_per_shift||{}));
  let localAvail = [...(emp.availability||DAYS)];
  let localPref = [...(emp.preferred_shifts||[])];
  let localActiveDays = [...(emp.active_days || [0,1,2,3,4,5,6])];
  let localWorkShifts = [...(emp.allowed_shifts || SHIFTS.map(s=>s.id))];
  let localFixedShifts = JSON.parse(JSON.stringify(emp.fixed_shifts || {}));
  let localExcludeFrom = emp.exclude_from || null;
  let localExcludeTo = emp.exclude_to || null;
  let localExcludeReason = emp.exclude_reason || "";
  let localMaxBlocks = emp.max_blocks_per_week ?? 99;
  let localBlockLimits = JSON.parse(JSON.stringify(emp.block_limits || {
    weekday: { morning: 3, afternoon: 3, night: 1 },
    weekend: { morning: 1, afternoon: 1, night: 1 }
  }));
  let localAllowedBlocks = JSON.parse(JSON.stringify(emp.allowed_block_slots||{}));

  const modal = div("modal");
  const mh = div("modal-header",[
    div("modal-title",[`הגבלות — ${emp.name}`]),
    btn("modal-close","✕",()=>{S.constraintsEmp=null;_render();})
  ]);
  modal.appendChild(mh);

  function rebuildModal() {
    while(modal.childNodes.length>1) modal.removeChild(modal.lastChild);

    const r1 = div("card",[
      e("div",{class:"form-label",style:"margin-bottom:6px"},"מקסימום משמרות בשבוע"),
      e("div",{style:"display:flex;align-items:center;gap:10px"},[
        e("input",{class:"fi",type:"number",min:1,max:21,value:localMax,style:"width:80px;text-align:center",
          oninput:ev=>{localMax=parseInt(ev.target.value)||1;}}),
        e("span",{style:"font-size:13px;color:#64748B"},"משמרות")
      ])
    ],{style:"margin-bottom:12px"});
    modal.appendChild(r1);

    const daysCard = div("card",[
      e("div",{class:"form-label",style:"margin-bottom:10px"},"📅 ימים פעילים"),
      e("div",{style:"font-size:11px;color:#475569;margin-bottom:10px"},"בחר באילו ימים העובד עובד — ימים לא פעילים לא יישובצו אוטומטית")
    ],{style:"margin-bottom:12px"});
    const daysGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px"});
    DAYS.forEach((dayName, dayIdx) => {
      const isActive = localActiveDays.includes(dayIdx);
      daysGrid.appendChild(e("button",{
        style:`padding:10px 14px;border-radius:10px;border:1px solid ${isActive?"#10B981":"#334155"};background:${isActive?"#10B98122":"#0F172A"};color:${isActive?"#10B981":"#475569"};font-family:inherit;font-weight:700;font-size:13px;cursor:pointer`,
        onclick:()=>{
          if(isActive) localActiveDays = localActiveDays.filter(d=>d!==dayIdx);
          else localActiveDays.push(dayIdx);
          rebuildModal();
        }
      },isActive ? "✓ "+dayName : dayName));
    });
    daysCard.appendChild(daysGrid);
    modal.appendChild(daysCard);

    const shiftsCard = div("card",[
      e("div",{class:"form-label",style:"margin-bottom:10px"},"🕐 משמרות מותרות"),
      e("div",{style:"font-size:11px;color:#475569;margin-bottom:10px"},"למשל: עובד שעובד רק בוקר — בטל את הסימון מצהריים ולילה")
    ],{style:"margin-bottom:12px"});
    const shiftsGrid = e("div",{style:"display:flex;gap:8px"});
    activeShifts().forEach(sh => {
      const isAllowed = localWorkShifts.includes(sh.id);
      shiftsGrid.appendChild(e("button",{
        style:`flex:1;padding:14px 10px;border-radius:12px;border:2px solid ${isAllowed?sh.color:sh.color+"33"};background:${isAllowed?sh.color+"22":"#0F172A"};color:${isAllowed?sh.color:"#475569"};font-family:inherit;font-weight:800;font-size:14px;cursor:pointer;text-align:center`,
        onclick:()=>{
          if(isAllowed) localWorkShifts = localWorkShifts.filter(s=>s!==sh.id);
          else localWorkShifts.push(sh.id);
          rebuildModal();
        }
      },[
        e("div",{style:"font-size:20px;margin-bottom:4px"},isAllowed?"✓":"✗"),
        e("div",{},sh.label)
      ]));
    });
    shiftsCard.appendChild(shiftsGrid);
    modal.appendChild(shiftsCard);

    const fixedCard = div("card",[
      e("div",{class:"form-label",style:"margin-bottom:10px"},"📌 שיבוץ קבוע"),
      e("div",{style:"font-size:11px;color:#475569;margin-bottom:10px"},"העובד ישובץ אוטומטית בימים ובמשמרות שתבחר — תמיד, בכל שבוע")
    ],{style:"margin-bottom:12px"});
    if (!localFixedShifts) localFixedShifts = {};
    const FIXED_SHIFTS = [
      { id:"morning", label:"בוקר", color:"#F59E0B" },
      { id:"afternoon", label:"צהריים", color:"#10B981" },
      { id:"night", label:"לילה", color:"#6366F1" },
    ];
    DAYS.forEach((dayName, dayIdx) => {
      const isWE = dayIdx >= 5;
      const dayShifts = isWE ? FIXED_SHIFTS.filter(sh=>sh.id!=="afternoon") : FIXED_SHIFTS;
      const dayRow = e("div",{style:"background:#0F172A;border:1px solid #334155;border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between"});
      dayRow.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:"+(isWE?"#A855F7":"#E2E8F0")+";min-width:50px"},dayName));
      const btnsWrap = e("div",{style:"display:flex;gap:6px;flex-wrap:wrap"});
      dayShifts.forEach(sh => {
        const key = dayIdx + "_" + sh.id;
        const key2 = sh.id === "morning" ? dayIdx + "_morning2" : null;
        const isFixed = !!localFixedShifts[key] || (key2 && !!localFixedShifts[key2]);
        btnsWrap.appendChild(e("button",{
          style:"padding:8px 14px;border-radius:8px;border:1px solid "+(isFixed?sh.color:sh.color+"33")+";background:"+(isFixed?sh.color+"22":"#1E293B")+";color:"+(isFixed?sh.color:"#475569")+";font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap",
          onclick:()=>{
            if(isFixed) {
              delete localFixedShifts[key];
              if(key2) delete localFixedShifts[key2];
            } else {
              localFixedShifts[key] = true;
              if(key2) localFixedShifts[key2] = true;
            }
            rebuildModal();
          }
        },(isFixed?"✓ ":"")+sh.label));
      });
      dayRow.appendChild(btnsWrap);
      fixedCard.appendChild(dayRow);
    });
    const fixedCount = Object.values(localFixedShifts).filter(Boolean).length;
    if (fixedCount > 0) {
      fixedCard.appendChild(e("div",{style:"margin-top:8px;font-size:11px;color:#10B981;font-weight:700"},"📌 "+fixedCount+" משמרות קבועות הוגדרו"));
    }
    modal.appendChild(fixedCard);

    const exCard = div("card",[
      e("div",{class:"form-label",style:"margin-bottom:10px"},"🚑 השעיה זמנית מהסידור"),
      e("div",{style:"font-size:11px;color:#475569;margin-bottom:10px"},"העובד לא יישובץ בתאריכים אלו (מחלה, חל״ת, וכו׳)")
    ],{style:"margin-bottom:12px"});
    exCard.appendChild(div("form-row",[
      div("form-col",[
        e("label",{class:"form-label"},"מתאריך"),
        e("input",{class:"fi",type:"date",value:localExcludeFrom||"",oninput:ev=>{localExcludeFrom=ev.target.value||null;}})
      ]),
      div("form-col",[
        e("label",{class:"form-label"},"עד תאריך"),
        e("input",{class:"fi",type:"date",value:localExcludeTo||"",oninput:ev=>{localExcludeTo=ev.target.value||null;}})
      ])
    ]));
    exCard.appendChild(e("input",{class:"fi",placeholder:"סיבה (מחלה, חל״ת...)",value:localExcludeReason,style:"margin-top:8px",
      oninput:ev=>{localExcludeReason=ev.target.value;}}));
    if (localExcludeFrom && localExcludeTo) {
      exCard.appendChild(e("div",{style:"margin-top:10px;background:#EF444418;border:1px solid #EF444433;border-radius:8px;padding:8px 12px;font-size:12px;color:#FCA5A5"},
        "🚑 מושעה: " + fmtDate(localExcludeFrom) + " — " + fmtDate(localExcludeTo) + (localExcludeReason ? " (" + localExcludeReason + ")" : "")));
    }
    exCard.appendChild(btn("btn-sm btn-sm-gray","נקה השעיה",()=>{localExcludeFrom=null;localExcludeTo=null;localExcludeReason="";rebuildModal();},{style:"margin-top:8px"}));
    modal.appendChild(exCard);

    const limCard = div("card",[
      e("div",{class:"form-label",style:"margin-bottom:10px"},"🚫 כמות חסימות מותרת לעובד")
    ],{style:"margin-bottom:12px"});

    limCard.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#3B82F6;margin-bottom:8px"},"ראשון — חמישי"));
    limCard.appendChild(e("div",{style:"display:flex;gap:10px;margin-bottom:14px"},BLOCK_SHIFTS.map(sh =>
      div("form-col",[
        e("label",{style:"font-size:11px;font-weight:700;color:"+sh.color},sh.label),
        e("input",{class:"fi",type:"number",min:0,max:5,value:localBlockLimits.weekday?.[sh.id]??3,style:"text-align:center",
          oninput:ev=>{if(!localBlockLimits.weekday)localBlockLimits.weekday={};localBlockLimits.weekday[sh.id]=parseInt(ev.target.value)||0;}})
      ])
    )));

    limCard.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#A855F7;margin-bottom:8px"},"שישי — שבת"));
    limCard.appendChild(e("div",{style:"display:flex;gap:10px;margin-bottom:8px"},BLOCK_SHIFTS.filter(sh=>sh.id!=="afternoon").map(sh =>
      div("form-col",[
        e("label",{style:"font-size:11px;font-weight:700;color:"+sh.color},sh.label),
        e("input",{class:"fi",type:"number",min:0,max:2,value:localBlockLimits.weekend?.[sh.id]??1,style:"text-align:center",
          oninput:ev=>{if(!localBlockLimits.weekend)localBlockLimits.weekend={};localBlockLimits.weekend[sh.id]=parseInt(ev.target.value)||0;}})
      ])
    )));
    limCard.appendChild(e("div",{style:"font-size:11px;color:#475569"},"0 = אסור לחסום כלל"));
    modal.appendChild(limCard);

    modal.appendChild(div("form-actions",[
      btn("btn-add","שמור הגבלות",async()=>{
        await saveConstraints(emp.id,{maxShifts:localMax,blockLimits:localBlockLimits,activeDays:localActiveDays,allowedShifts:localWorkShifts,excludeFrom:localExcludeFrom,excludeTo:localExcludeTo,excludeReason:localExcludeReason,fixedShifts:localFixedShifts});
      },{style:"flex:1"}),
      btn("btn-sm btn-sm-gray","ביטול",()=>{S.constraintsEmp=null;_render();})
    ]));
  }

  rebuildModal();
  return div("modal-bg",[modal],{onclick:ev=>{if(ev.target.classList.contains("modal-bg")){S.constraintsEmp=null;_render();}}});
}

// ── INVITATION MODAL ──
export function viewInviteModal() {
  return div("modal-bg",[
    div("modal",[
      div("modal-header",[
        div("modal-title",["✉️ הזמנת עובד חדש"]),
        btn("modal-close","✕",()=>{S.showInviteModal=false;_render();})
      ]),
      e("div",{style:"color:#64748B;font-size:13px;margin-bottom:16px"},
        "תישלח הזמנה במייל עם לינק חד-פעמי. הלינק תקף 48 שעות."),

      div("form-col",[
        e("label",{class:"form-label"},"שם מלא (אופציונלי)"),
        e("input",{class:"fi",placeholder:"ישראל ישראלי",value:S.newInvitation.name,
          oninput:ev=>{S.newInvitation.name=ev.target.value;}})
      ],{style:"margin-bottom:12px"}),

      div("form-col",[
        e("label",{class:"form-label"},"אימייל *"),
        e("input",{class:"fi",type:"email",placeholder:"name@example.com",value:S.newInvitation.email,
          oninput:ev=>{S.newInvitation.email=ev.target.value;}})
      ],{style:"margin-bottom:12px"}),

      div("form-col",[
        e("label",{class:"form-label"},"תפקיד"),
        e("select",{class:"fi",onchange:ev=>{S.newInvitation.role=ev.target.value;}},[
          e("option",{value:"employee",selected:S.newInvitation.role==="employee"?"selected":null},"👤 עובד"),
          e("option",{value:"admin",selected:S.newInvitation.role==="admin"?"selected":null},"👑 מנהל")
        ])
      ],{style:"margin-bottom:16px"}),

      div("form-actions",[
        btn("btn-add","📤 שלח הזמנה",createInvitation,{style:"flex:1"}),
        btn("btn-sm btn-sm-gray","ביטול",()=>{S.showInviteModal=false;_render();})
      ])
    ])
  ],{onclick:ev=>{if(ev.target.classList.contains("modal-bg")){S.showInviteModal=false;_render();}}});
}

// ── EXPORT MODAL ──
export function viewExportModal() {
  const exportType = S.showExportModal;
  const currentOffset = S.weekOffset;
  const offsets = [-3, -2, -1, 0, 1, 2];

  return div("modal-bg",[
    div("modal",[
      div("modal-header",[
        div("modal-title",[`📤 ייצוא ${exportType === "pdf" ? "PDF" : "CSV"} — בחר שבוע`]),
        btn("modal-close","✕",()=>{S.showExportModal=null;_render();})
      ]),
      e("div",{style:"color:#64748B;font-size:13px;margin-bottom:16px"}, "אפשר לייצא גם סידור שעוד עובדים עליו"),

      e("div",{style:"display:flex;flex-direction:column;gap:8px;margin-bottom:16px"},
        offsets.map(off => {
          const wd = getWeekDates(off);
          const isCurrent = off === currentOffset;
          let label = "";
          if (off === 0) label = "השבוע הזה";
          else if (off === -1) label = "שבוע שעבר";
          else if (off === 1) label = "שבוע הבא";
          else if (off < 0) label = `לפני ${Math.abs(off)} שבועות`;
          else label = `עוד ${off} שבועות`;

          return e("button",{
            style:`width:100%;text-align:right;padding:14px;background:${isCurrent?"#3B82F622":"#0F172A"};border:1px solid ${isCurrent?"#3B82F6":"#334155"};border-radius:12px;color:#E2E8F0;font-family:inherit;cursor:pointer;font-size:14px;display:flex;justify-content:space-between;align-items:center;transition:all 0.15s`,
            onmouseover:(ev)=>{ev.currentTarget.style.borderColor="#60A5FA";ev.currentTarget.style.background="#3B82F611";},
            onmouseout:(ev)=>{ev.currentTarget.style.borderColor=isCurrent?"#3B82F6":"#334155";ev.currentTarget.style.background=isCurrent?"#3B82F622":"#0F172A";},
            onclick:async()=>{
              S.showExportModal = null;
              _render();
              if (exportType === "pdf") await exportSchedulePDF(off);
              else await exportScheduleCSV(off);
            }
          },[
            e("div",{},[
              e("div",{style:"font-weight:700;margin-bottom:2px"},[
                label,
                isCurrent ? e("span",{style:"font-size:10px;background:#3B82F644;color:#60A5FA;border-radius:4px;padding:2px 6px;margin-right:6px"},"נוכחי") : null
              ]),
              e("div",{style:"font-size:11px;color:#64748B"},`${fmtDate(wd[0])} — ${fmtDate(wd[6])}`)
            ]),
            e("span",{style:"font-size:18px;color:#64748B"},"←")
          ]);
        })
      ),

      btn("btn-sm btn-sm-gray","ביטול",()=>{S.showExportModal=null;_render();},{style:"width:100%"})
    ])
  ],{onclick:ev=>{if(ev.target.classList.contains("modal-bg")){S.showExportModal=null;_render();}}});
}

// ── PUBLISH MODAL ──
export function viewPublishModal() {
  const wd = getWeekDates(S.weekOffset);
  const weekStart = wd[0];
  const isInitialPublished = S.publishedInitial?.has(weekStart);
  const isFinalPublished = S.publishedWeeks.has(weekStart);

  return div("modal-bg",[
    div("modal",[
      div("modal-header",[
        div("modal-title",["📢 פרסום סידור"]),
        btn("modal-close","✕",()=>{S.showPublishModal=false;_render();})
      ]),
      e("div",{style:"color:#64748B;font-size:13px;margin-bottom:16px"},
        `שבוע ${fmtDate(wd[0])} — ${fmtDate(wd[6])}`),

      e("div",{style:"background:#A855F708;border:1px solid #A855F744;border-radius:14px;padding:16px;margin-bottom:12px"},[
        e("div",{style:"display:flex;align-items:center;gap:10px;margin-bottom:8px"},[
          e("span",{style:"font-size:22px"},"📝"),
          e("div",{},[
            e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},"שליחה ניסיונית"),
            e("div",{style:"font-size:12px;color:#64748B"},"רק למנהלים — לבדיקה לפני פרסום רשמי")
          ])
        ]),
        btn("btn-purple","📝 שלח למנהלים לבדיקה",()=>publishWeek("preview"),{style:"width:100%"})
      ]),

      e("div",{style:`background:#1E3A5F22;border:1px solid ${isInitialPublished?"#3B82F6":"#334155"};border-radius:14px;padding:16px;margin-bottom:12px`},[
        e("div",{style:"display:flex;align-items:center;gap:10px;margin-bottom:8px"},[
          e("span",{style:"font-size:22px"},"📋"),
          e("div",{},[
            e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},"סידור ראשוני"),
            e("div",{style:"font-size:12px;color:#64748B"},"ניתן לשינוי לאחר פרסום · עובדים יקבלו מייל עם הערה")
          ]),
          isInitialPublished ? e("span",{style:"font-size:11px;background:#3B82F622;color:#60A5FA;border:1px solid #3B82F644;border-radius:6px;padding:2px 8px"},"פורסם") : null
        ]),
        btn("btn-add", isInitialPublished?"📋 פרסם מחדש (ראשוני)":"📋 פרסם ראשוני",
          ()=>publishWeek("initial"),{style:"width:100%"})
      ]),

      e("div",{style:`background:#10B98108;border:1px solid ${isFinalPublished?"#10B981":"#334155"};border-radius:14px;padding:16px;margin-bottom:16px`},[
        e("div",{style:"display:flex;align-items:center;gap:10px;margin-bottom:8px"},[
          e("span",{style:"font-size:22px"},"📢"),
          e("div",{},[
            e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},"סידור סופי"),
            e("div",{style:"font-size:12px;color:#64748B"},"נעול · עובדים יקבלו מייל סופי")
          ]),
          isFinalPublished ? e("span",{style:"font-size:11px;background:#10B98122;color:#10B981;border:1px solid #10B98144;border-radius:6px;padding:2px 8px"},"פורסם") : null
        ]),
        !isFinalPublished
          ? btn("btn-green","📢 פרסם סופי",()=>publishWeek("final"),{style:"width:100%"})
          : e("div",{style:"text-align:center;font-size:12px;color:#64748B;padding:6px"},"הסידור הסופי פורסם ✓")
      ]),

      btn("btn-sm btn-sm-gray","ביטול",()=>{S.showPublishModal=false;_render();},{style:"width:100%"})
    ])
  ],{onclick:ev=>{if(ev.target.classList.contains("modal-bg")){S.showPublishModal=false;_render();}}});
}

// ══════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ══════════════════════════════════════════════════════
export async function exportSchedulePDF(weekOffsetParam) {
  const offset = weekOffsetParam != null ? weekOffsetParam : S.weekOffset;
  const wd = getWeekDates(offset);
  const weekStart = wd[0];
  const weekLabel = fmtDate(wd[0]) + " — " + fmtDate(wd[6]);

  let scheduleData = S.schedule;
  if (offset !== S.weekOffset) {
    const { data: sched } = await sb.from("schedules")
      .select("id").eq("business_id", S.profile.business_id).eq("week_start", weekStart).maybeSingle();
    if (sched) {
      const { data: assigns } = await sb.from("assignments").select("*").eq("schedule_id", sched.id);
      scheduleData = {};
      (assigns || []).forEach(a => {
        if (!scheduleData[a.date]) scheduleData[a.date] = {};
        if (!scheduleData[a.date][a.shift]) scheduleData[a.date][a.shift] = [];
        scheduleData[a.date][a.shift].push(a.employee_id);
      });
    } else {
      scheduleData = {};
    }
  }

  let html = `<!DOCTYPE html><html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  body{font-family:Heebo,sans-serif;direction:rtl;padding:20px;color:#1a1a2e;background:white}
  h1{font-weight:900;font-size:22px;margin-bottom:4px}
  .sub{color:#666;font-size:13px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#1E293B;color:white;padding:8px 6px;text-align:center;font-weight:700}
  th:first-child{text-align:right}
  td{padding:7px 5px;border:1px solid #ddd;text-align:center;vertical-align:top}
  td:first-child{text-align:right;font-weight:700;white-space:nowrap}
  .chip{display:inline-block;border-radius:4px;padding:2px 6px;margin:1px;font-size:10px;font-weight:700}
  .morning{background:#FEF3C7;color:#92400E}
  .afternoon{background:#D1FAE5;color:#065F46}
  .night{background:#EDE9FE;color:#4C1D95}
  .empty{color:#ccc;font-size:11px}
  @media print{body{padding:0}}
</style></head><body>
<h1>סידור עבודה — ${S.business?.name||"ניהול משמרות"}</h1>
<div class="sub">${weekLabel}</div>
<table>
<tr><th>משמרת</th>`;

  wd.forEach(date => {
    const dt = new Date(date+"T00:00:00");
    html += `<th>${DAYS[dt.getDay()]}<br><strong>${dt.getDate()}</strong></th>`;
  });
  html += "</tr>";

  activeShifts().forEach(sh => {
    html += `<tr><td class="${sh.id}">${sh.label}<br><small>${sh.start}–${sh.end}</small></td>`;
    wd.forEach(date => {
      const empIds = scheduleData[date]?.[sh.id]||[];
      html += "<td>";
      if (empIds.length === 0) {
        html += '<span class="empty">—</span>';
      } else {
        empIds.forEach(id => {
          const emp = getEmp(id);
          const ch = S.customHours[date+"|"+sh.id+"|"+id];
          html += `<span class="chip ${sh.id}">${emp?.name||"?"}</span>`;
          if (ch) html += `<br><small style="font-size:9px;color:#666">${ch.start}–${ch.end}</small>`;
        });
      }
      html += "</td>";
    });
    html += "</tr>";
  });
  html += `</table>
<div style="margin-top:16px;font-size:11px;color:#999">הופק מ-ShiftPro · ${new Date().toLocaleDateString("he-IL")}</div>
</body></html>`;

  const win = window.open("","_blank");
  if (!win) { _toast("אפשר חלונות קופצים בדפדפן","err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(()=>win.print(), 500);
  _toast("פותח לייצוא PDF ✓");
}

export async function exportScheduleCSV(weekOffsetParam) {
  const offset = weekOffsetParam != null ? weekOffsetParam : S.weekOffset;
  const wd = getWeekDates(offset);
  const weekStart = wd[0];

  let scheduleData = S.schedule;
  if (offset !== S.weekOffset) {
    const { data: sched } = await sb.from("schedules")
      .select("id").eq("business_id", S.profile.business_id).eq("week_start", weekStart).maybeSingle();
    if (sched) {
      const { data: assigns } = await sb.from("assignments").select("*").eq("schedule_id", sched.id);
      scheduleData = {};
      (assigns || []).forEach(a => {
        if (!scheduleData[a.date]) scheduleData[a.date] = {};
        if (!scheduleData[a.date][a.shift]) scheduleData[a.date][a.shift] = [];
        scheduleData[a.date][a.shift].push(a.employee_id);
      });
    } else {
      scheduleData = {};
    }
  }

  let csv = "משמרת,שעות,"+wd.map(d=>{const dt=new Date(d+"T00:00:00");return DAYS[dt.getDay()]+" "+dt.getDate();}).join(",")+String.fromCharCode(10);
  SHIFTS.forEach(sh => {
    const row = [sh.label, sh.start+"–"+sh.end];
    wd.forEach(date => {
      const empIds = scheduleData[date]?.[sh.id]||[];
      row.push(empIds.map(id=>getEmp(id)?.name||"?").join(" + ")||"—");
    });
    csv += row.map(v=>"\""+v+"\"").join(",") + String.fromCharCode(10);
  });
  const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`seder_avoda_${weekStart}.csv`;
  a.click(); URL.revokeObjectURL(url);
  _toast("קובץ CSV הורד ✓");
}
