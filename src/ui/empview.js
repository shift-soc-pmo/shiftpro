import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, today, getEmp, empIdx, getTimeBasedGreeting } from '../utils.js';
import { SHIFTS, BLOCK_SHIFTS, DAYS, ec, getHoliday, SHIFT_BY_ID } from '../config.js';
import { getActiveProfile, loadSchedule } from '../db.js';
import { submitAvailability } from '../availability.js';
import { sendEmail } from '../notifications.js';

let _render = () => {};
let _toast = () => {};
export function setEmpViewDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// viewEmpVacations and viewSwaps will be imported lazily to avoid circular deps
let _viewEmpVacations = null;
let _viewSwaps = null;
export function setEmpViewImports(viewEmpVacationsFn, viewSwapsFn) {
  _viewEmpVacations = viewEmpVacationsFn;
  _viewSwaps = viewSwapsFn;
}

export function viewEmpView() {
  const wrap = e("div",{style:"width:100%"});
  const selfOnly = S.profile?.role === "employee" || S.testAsEmployee;

  if (selfOnly && !S.empViewId) S.empViewId = S.user.id;

  if (selfOnly) {
    wrap.appendChild(div("page-title",["📋 המשמרות שלי"],{style:"margin-bottom:14px"}));
  } else {
    wrap.appendChild(div("section-header",[
      div("page-title",["👤 תצוגת עובד"]),
      e("div",{style:"display:flex;align-items:center;gap:8px"},[
        e("span",{style:"font-size:12px;color:#64748B"},"מצב בדיקה:"),
        e("button",{
          style:`padding:6px 14px;border-radius:8px;border:1px solid ${S.testAsEmployee?"#10B981aa":"#334155"};background:${S.testAsEmployee?"#10B98122":"#1E293B"};color:${S.testAsEmployee?"#10B981":"#64748B"};font-family:inherit;font-size:12px;font-weight:700`,
          onclick:()=>{ S.testAsEmployee=!S.testAsEmployee; if(S.testAsEmployee&&!S.empViewId) S.empViewId=S.employees[0]?.id; _render(); }
        },S.testAsEmployee?"✅ פעיל — לחץ לביטול":"הפעל")
      ])
    ],{style:"margin-bottom:14px"}));
    const picker = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px"});
    S.employees.forEach((emp,idx) => {
      const col = ec(idx);
      const sel = S.empViewId===emp.id;
      picker.appendChild(btn("",emp.name.split(" ")[0],()=>{S.empViewId=emp.id;S.empViewTab="shifts";_render();},{
        style:`padding:7px 14px;border-radius:10px;border:1px solid ${sel?col+"cc":col+"44"};background:${sel?col+"33":"#1E293B"};color:${sel?col:"#94A3B8"};font-family:inherit;font-weight:${sel?"700":"500"};font-size:13px`
      }));
    });
    wrap.appendChild(picker);
  }

  const emp = S.employees.find(e=>e.id===S.empViewId);
  if (!emp) {
    wrap.appendChild(div("card",[e("div",{style:"text-align:center;padding:40px;color:#64748B"},["בחר עובד לצפייה"])]));
    return wrap;
  }

  const idx = empIdx(emp.id);
  const col = ec(idx);
  const wd = getWeekDates(S.weekOffset);
  const weekStart = wd[0];
  const isPublished = S.publishedWeeks.has(weekStart);

  wrap.appendChild(e("div",{style:`background:#1E293B;border:1px solid ${col}44;border-radius:16px;padding:18px;margin-bottom:14px`},[
    e("div",{style:"display:flex;align-items:center;gap:14px"},[
      e("div",{style:`width:48px;height:48px;border-radius:14px;background:${col}22;border:1px solid ${col}44;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:${col};flex-shrink:0`},
        emp.name.split(" ").map(n=>n[0]).join("").slice(0,2)),
      e("div",{style:"flex:1"},[
        e("div",{style:"font-weight:800;font-size:17px;color:#E2E8F0"},emp.name),
        e("div",{style:"font-size:12px;color:#64748B;margin-top:2px"},emp.role==="admin"||emp.role==="manager"?"מנהל":"עובד"),
        emp.email?e("div",{style:"font-size:11px;color:#475569;margin-top:2px"},"✉️ "+emp.email):null
      ])
    ])
  ]));

  if (S.testAsEmployee) {
    wrap.appendChild(e("div",{style:"background:#F59E0B18;border:1px solid #F59E0B44;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:8px"},[
      e("div",{style:"display:flex;align-items:center;gap:8px"},[
        e("span",{},"⚠️"),
        e("span",{style:"font-size:13px;color:#FCD34D;font-weight:600"},"מצב בדיקה — רואה כמו עובד")
      ]),
      btn("btn-sm btn-sm-gray","צא",()=>{S.testAsEmployee=false;_render();})
    ]));
  }

  const tabs = [["shifts","📋 המשמרות שלי"],["schedule","📅 סידור"],["avail","🚫 חסימה"],["vacation","🌴 היעדרויות"],["swaps_emp","🔄 חילופים"]];
  wrap.appendChild(e("div",{class:"emp-view-tabs"},tabs.map(([id,lbl])=>
    btn("ev-tab"+(S.empViewTab===id?" active":""),lbl,()=>{S.empViewTab=id;_render();})
  )));

  if (S.empViewTab==="shifts") {
    wrap.appendChild(e("div",{style:"margin-bottom:20px"},[
      e("div",{style:"font-size:13px;color:#64748B"}, new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})),
      e("div",{style:"font-weight:900;font-size:26px;color:#E2E8F0;margin-top:4px"}, (()=>{const g=getTimeBasedGreeting();return g.text+", "+(getActiveProfile()?.name||"").split(" ")[0]+" "+g.emoji;})()),
    ]));

    const weekStartMyShifts = wd[0];
    const isPublishedMyShifts = S.publishedWeeks.has(weekStartMyShifts) || S.publishedInitial?.has(weekStartMyShifts) || S.schedPublishType?.[weekStartMyShifts];
    const isRealEmp2 = S.profile?.role === "employee" || S.testAsEmployee;

    const myShifts = [];
    if (!isRealEmp2 || isPublishedMyShifts) {
      wd.forEach(date => {
        SHIFTS.forEach(sh => {
          if ((S.schedule[date]?.[sh.id]||[]).includes(emp.id)) {
            const ch = S.customHours[date+"|"+sh.id+"|"+emp.id];
            myShifts.push({date,shift:sh,ch});
          }
        });
      });
    }

    const card = div("card",[e("div",{style:"display:flex;justify-content:space-between;margin-bottom:12px"},[
      e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0"},"📅 "+fmtDate(wd[0])+" — "+fmtDate(wd[6])),
      e("div",{style:"font-size:12px;color:#475569"},myShifts.length+" משמרות")
    ])]);

    if (myShifts.length===0) {
      card.appendChild(e("div",{style:"text-align:center;padding:24px;color:#64748B"},"לא שובצת השבוע"));
    } else {
      myShifts.forEach(({date,shift,ch}) => {
        const dt = new Date(date+"T00:00:00");
        const isToday = date===today();
        const others = (S.schedule[date]?.[shift.id]||[]).filter(id=>id!==emp.id).map(id=>getEmp(id)?.name.split(" ")[0]).filter(Boolean);
        card.appendChild(e("div",{style:`display:flex;align-items:center;gap:12px;background:#0F172A;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid ${isToday?"#3B82F6":shift.color+"33"}`},[
          e("div",{style:`width:46px;height:54px;border-radius:12px;background:${shift.color}18;border:1px solid ${shift.color}33;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0`},[
            e("div",{style:"font-size:9px;color:"+shift.color+"99;font-weight:600"},DAYS[dt.getDay()]),
            e("div",{style:"font-size:20px;font-weight:900;color:"+shift.color},String(dt.getDate()))
          ]),
          e("div",{style:"flex:1"},[
            e("div",{style:"display:flex;align-items:center;gap:6px;margin-bottom:2px"},[
              e("span",{style:"font-weight:800;font-size:15px;color:"+shift.color},shift.label),
              isToday?e("span",{style:"font-size:10px;background:#3B82F622;color:#60A5FA;border-radius:5px;padding:1px 6px"},"היום"):null,
              getHoliday(date)?e("span",{style:"font-size:9px;background:#FCD34D22;color:#FCD34D;border-radius:5px;padding:1px 6px"}, "✡️ "+getHoliday(date)):null
            ]),
            e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0"},(ch?ch.start:shift.start)+" – "+(ch?ch.end:shift.end)),
            others.length>0?e("div",{style:"font-size:11px;color:#64748B;margin-top:3px"},"יחד עם: "+others.join(", ")):null,
            S.assignmentNotes[date+"|"+shift.id+"|"+emp.id]?e("div",{style:"font-size:11px;color:#F59E0B;margin-top:3px;background:#F59E0B11;border-radius:6px;padding:2px 8px"},"📝 "+S.assignmentNotes[date+"|"+shift.id+"|"+emp.id]):null
          ]),
          e("span",{style:"font-size:20px"},isToday?"🔔":date<today()?"✅":"📌")
        ]));
      });
    }
    wrap.appendChild(card);
  }

  else if (S.empViewTab==="schedule") {
    const weekStartRO = wd[0];
    const isPublishedRO = S.publishedWeeks.has(weekStartRO) || S.publishedInitial?.has(weekStartRO) || S.schedPublishType?.[weekStartRO];
    const isRealEmployee = S.profile?.role === "employee" || S.testAsEmployee;

    if (isRealEmployee && !isPublishedRO && Object.keys(S.schedule).length > 0) {
      const card = div("card",[
        e("div",{style:"text-align:center;padding:30px"},[
          e("div",{style:"font-size:40px;margin-bottom:12px"},"🔒"),
          e("div",{style:"font-weight:800;font-size:16px;color:#94A3B8"},"הסידור טרם פורסם"),
          e("div",{style:"font-size:13px;color:#64748B;margin-top:8px"},"הסידור יהיה זמין לצפייה לאחר פרסום ראשוני או סופי")
        ])
      ]);
      wrap.appendChild(card);
      wrap.appendChild(e("div",{style:"display:flex;gap:8px;justify-content:center;margin-top:12px"},[
        btn("btn-sm btn-sm-gray","→",()=>{S.weekOffset--;loadSchedule().then(()=>_render());}),
        btn("btn-sm btn-sm-blue","השבוע",()=>{S.weekOffset=0;loadSchedule().then(()=>_render());}),
        btn("btn-sm btn-sm-gray","←",()=>{S.weekOffset++;loadSchedule().then(()=>_render());})
      ]));
    } else {
      const card = div("card",[e("div",{style:"font-weight:700;font-size:14px;color:#E2E8F0;margin-bottom:14px"},"📅 סידור שבועי — קריאה בלבד")]);
      const gridWrap = div("sched-wrap");
      const tbl = e("table",{class:"sched-table"});
      const thead = e("thead");
      const hrow = e("tr",[e("th",{style:"width:80px"},"")]);
      wd.forEach(date => {
        const dt = new Date(date+"T00:00:00");
        const isToday = date===today();
        const fullDate = dt.getDate()+"/"+(dt.getMonth()+1);
        hrow.appendChild(e("th",{class:"day-header",style:isToday?"color:#60A5FA":""},[
          e("div",{style:"font-size:11px;font-weight:600"},DAYS[dt.getDay()]),
          e("div",{style:"font-size:16px;font-weight:900"},String(dt.getDate())),
          e("div",{style:"font-size:9px;color:#64748B"},fullDate),
          getHoliday(date) ? e("div",{style:"font-size:8px;color:#FCD34D;font-weight:600"},"✡️") : null
        ]));
      });
      thead.appendChild(hrow);
      tbl.appendChild(thead);
      const tbody = e("tbody");
      SHIFTS.forEach(sh => {
        const row = e("tr");
        row.appendChild(e("td",{style:"font-weight:700;font-size:11px;color:"+sh.color},sh.label));
        wd.forEach(date => {
          const dayNum2 = new Date(date+"T00:00:00").getDay();
          if ((dayNum2 === 5 || dayNum2 === 6) && (sh.id === "afternoon" || sh.id === "morning2")) {
            row.appendChild(e("td",{style:"background:#0F172A44"},[e("div",{style:"font-size:9px;color:#334155"},"—")]));
            return;
          }
          const empIds = S.schedule[date]?.[sh.id]||[];
          const isMe = empIds.includes(emp.id);
          const td = e("td",{style:isMe?"background:"+sh.color+"18":""});
          empIds.forEach(id => {
            const e2 = getEmp(id);
            if (!e2) return;
            const c = ec(empIdx(id));
            td.appendChild(e("div",{style:`font-size:10px;color:${id===emp.id?sh.color:c};font-weight:${id===emp.id?"900":"500"};white-space:nowrap`},e2.name.split(" ")[0]));
          });
          if (empIds.length===0) td.appendChild(e("div",{style:"font-size:9px;color:#334155"},"—"));
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      tbl.appendChild(tbody);
      gridWrap.appendChild(tbl);
      card.appendChild(gridWrap);
      card.appendChild(e("div",{style:"font-size:11px;color:#475569;text-align:center;margin-top:8px"},"👁 תצוגה בלבד"));
      card.appendChild(e("div",{style:"display:flex;gap:8px;justify-content:center;margin-top:12px"},[
        btn("btn-sm btn-sm-gray","→",()=>{S.weekOffset--;loadSchedule().then(()=>_render());}),
        btn("btn-sm btn-sm-blue","השבוע",()=>{S.weekOffset=0;loadSchedule().then(()=>_render());}),
        btn("btn-sm btn-sm-gray","←",()=>{S.weekOffset++;loadSchedule().then(()=>_render());})
      ]));
      wrap.appendChild(card);
    }
  }

  else if (S.empViewTab==="avail") {
    const dlDay = S.business?.deadline_day;
    const dlTime = S.business?.deadline_time || "20:00";
    const now = new Date();
    const nowDay = now.getDay();
    const nowTime = String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
    const isPastDeadline = dlDay !== null && dlDay !== undefined && (nowDay > dlDay || (nowDay === dlDay && nowTime > dlTime));

    if (isPastDeadline) {
      wrap.appendChild(div("card",[
        e("div",{style:"text-align:center;padding:30px"},[
          e("div",{style:"font-size:40px;margin-bottom:12px"},"⏰"),
          e("div",{style:"font-weight:800;font-size:18px;color:#EF4444;margin-bottom:8px"},"הדדליין עבר!"),
          e("div",{style:"font-size:13px;color:#64748B"},"לא ניתן להגיש חסימות אחרי יום "+DAYS[dlDay]+" בשעה "+dlTime),
          e("div",{style:"font-size:12px;color:#475569;margin-top:10px"},"לבקשות מיוחדות — פנה למנהל")
        ])
      ]));
    } else {
      const targetOffset = S.availTargetOffset || 1;
      const targetDates = getWeekDates(S.weekOffset + targetOffset);
      const targetStart = targetDates[0];
      const blockLimits = emp.block_limits || { weekday:{morning:3,afternoon:3,night:1}, weekend:{morning:1,afternoon:1,night:1} };
      const rawAllowed = emp.allowed_block_slots || {};
      const noConfig = Object.keys(rawAllowed).length === 0;
      const allowedSlots = noConfig ? Object.fromEntries(DAYS.map(d=>[d, SHIFTS.map(s=>s.id)])) : rawAllowed;

      function getBlockCount(shiftId, isWeekend) {
        let count = 0;
        Object.entries(S.availDraft).forEach(([key,val]) => {
          if (!val) return;
          const [di, sid] = key.split("|");
          if (sid !== shiftId) return;
          const dt = new Date(targetDates[parseInt(di)]+"T00:00:00");
          const isWE = dt.getDay() === 5 || dt.getDay() === 6;
          if (isWE === isWeekend) count++;
        });
        return count;
      }

      const card = div("card");

      card.appendChild(e("div",{style:"display:flex;gap:6px;margin-bottom:14px"},[
        btn("",`שבוע הבא`,()=>{S.availTargetOffset=1;S.availDraft={};_render();},{style:`flex:1;padding:10px;border-radius:10px;border:1px solid ${targetOffset===1?"#EF4444aa":"#334155"};background:${targetOffset===1?"#EF444422":"#1E293B"};color:${targetOffset===1?"#EF4444":"#94A3B8"};font-family:inherit;font-size:13px;font-weight:700`}),
        btn("",`עוד שבועיים`,()=>{S.availTargetOffset=2;S.availDraft={};_render();},{style:`flex:1;padding:10px;border-radius:10px;border:1px solid ${targetOffset===2?"#EF4444aa":"#334155"};background:${targetOffset===2?"#EF444422":"#1E293B"};color:${targetOffset===2?"#EF4444":"#94A3B8"};font-family:inherit;font-size:13px;font-weight:700`})
      ]));

      card.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px;text-align:center"},
        fmtDate(targetDates[0]) + " — " + fmtDate(targetDates[6])));

      const quotaCard = e("div",{style:"background:#1E293B;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:14px"});
      quotaCard.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},"🚫 מכסת חסימות"));
      quotaCard.appendChild(e("div",{style:"display:grid;grid-template-columns:1fr 1fr;gap:8px"},[
        e("div",{style:"background:#0F172A;border-radius:8px;padding:8px"},[
          e("div",{style:"font-size:11px;color:#3B82F6;font-weight:700;margin-bottom:6px"},"ראשון — חמישי"),
          ...BLOCK_SHIFTS.map(sh=>{
            const lim = blockLimits.weekday?.[sh.id]??3;
            const used = getBlockCount(sh.id, false);
            return e("div",{style:"display:flex;justify-content:space-between;font-size:11px;padding:2px 0"},[
              e("span",{style:"color:"+sh.color},sh.label),
              e("span",{style:`font-weight:700;color:${used>=lim?"#EF4444":"#94A3B8"}`},`${used}/${lim}`)
            ]);
          })
        ]),
        e("div",{style:"background:#0F172A;border-radius:8px;padding:8px"},[
          e("div",{style:"font-size:11px;color:#A855F7;font-weight:700;margin-bottom:6px"},"שישי — שבת"),
          ...BLOCK_SHIFTS.filter(sh=>sh.id!=="afternoon").map(sh=>{
            const lim = blockLimits.weekend?.[sh.id]??1;
            const used = getBlockCount(sh.id, true);
            return e("div",{style:"display:flex;justify-content:space-between;font-size:11px;padding:2px 0"},[
              e("span",{style:"color:"+sh.color},sh.label),
              e("span",{style:`font-weight:700;color:${used>=lim?"#EF4444":"#94A3B8"}`},`${used}/${lim}`)
            ]);
          })
        ])
      ]));
      card.appendChild(quotaCard);

      const defaultKey = "blockDefaults_" + emp.id;
      const savedDefaults = JSON.parse(localStorage.getItem(defaultKey) || "null");

      card.appendChild(e("div",{style:"display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap"},[
        savedDefaults ? btn("btn-sm btn-sm-blue","📥 טען ברירת מחדל",()=>{
          S.availDraft = {};
          savedDefaults.forEach(def => {
            targetDates.forEach((date, di) => {
              const dt = new Date(date+"T00:00:00");
              if (dt.getDay() === def.day) S.availDraft[di+"|"+def.shift] = true;
            });
          });
          _toast("ברירת מחדל נטענה ✓");
          _render();
        }) : null,
        e("div",{style:"font-size:11px;color:#475569;display:flex;align-items:center"},
          savedDefaults ? "יש ברירת מחדל שמורה" : "אין ברירת מחדל — חסום ולחץ ׳שמור כברירת מחדל׳")
      ]));

      card.appendChild(e("div",{style:"font-size:13px;color:#94A3B8;margin-bottom:12px"},"לחץ על משמרות שאתה לא יכול לעבוד:"));

      targetDates.forEach((date, di) => {
        const dt = new Date(date+"T00:00:00");
        const dayName = DAYS[dt.getDay()];
        const dayAllowed = allowedSlots[dayName] || [];
        if (dayAllowed.length === 0) return;

        const dayCard = e("div",{style:"background:#0F172A;border:1px solid #334155;border-radius:12px;padding:12px;margin-bottom:10px"});
        const dateStr = dt.getDate()+"/"+(dt.getMonth()+1)+"/"+dt.getFullYear();
        dayCard.appendChild(e("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"},[
          e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},dayName),
          e("div",{style:"font-size:13px;color:#64748B"},dateStr)
        ]));

        const shiftsRow = e("div",{style:"display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"});
        const isWeekendDay = dt.getDay() === 5 || dt.getDay() === 6;
        (isWeekendDay ? BLOCK_SHIFTS.filter(sh=>sh.id!=="afternoon") : BLOCK_SHIFTS).forEach(sh => {
          const key = di+"|"+sh.id;
          const canBlock = dayAllowed.includes(sh.id);
          const picked = !!S.availDraft[key];
          const isWeekend = isWeekendDay;
          const shiftLimit = isWeekend ? (blockLimits.weekend?.[sh.id]??1) : (blockLimits.weekday?.[sh.id]??3);
          const shiftUsed = getBlockCount(sh.id, isWeekend);
          const atLimit = !picked && shiftUsed >= shiftLimit;

          if (!canBlock) {
            shiftsRow.appendChild(e("div",{style:"padding:14px 8px;border-radius:10px;background:#1E293B;color:#475569;text-align:center;font-size:11px"},[
              e("div",{},sh.label),
              e("div",{style:"font-size:9px;margin-top:2px"},"לא ניתן")
            ]));
            return;
          }

          shiftsRow.appendChild(e("button",{
            disabled: atLimit && !picked,
            style: picked ? `padding:14px 8px;border-radius:10px;background:#EF444433;border:2px solid #EF4444;color:#EF4444;font-weight:800;cursor:pointer;font-family:inherit` : atLimit ? `padding:14px 8px;border-radius:10px;background:#0F172A;border:1px solid #1E293B;color:#1E293B;cursor:not-allowed;font-family:inherit` : `padding:14px 8px;border-radius:10px;background:#1E293B;border:1px solid ${sh.color}44;color:${sh.color};font-weight:700;cursor:pointer;font-family:inherit`,
            onclick: () => { S.availDraft[key]=!S.availDraft[key]; _render(); }
          },[
            e("div",{style:"font-size:13px"},picked?"🚫 "+sh.label:sh.label),
            e("div",{style:"font-size:9px;opacity:0.8;margin-top:2px"},sh.start+"-"+sh.end)
          ]));
        });
        dayCard.appendChild(shiftsRow);
        card.appendChild(dayCard);
      });

      const selKeys = Object.entries(S.availDraft).filter(([,v])=>v).map(([k])=>k);

      card.appendChild(e("div",{style:"margin-top:14px;border-top:1px solid #334155;padding-top:12px"},[
        e("div",{style:"font-weight:700;font-size:13px;color:#F59E0B;margin-bottom:8px"},"💬 פירוט / הערה (אופציונלי)"),
        e("textarea",{
          class:"fi",
          placeholder:"למשל: מבחן ביום ראשון, אירוע משפחתי בשישי...",
          style:"min-height:70px;resize:vertical",
          id:"block-special-request"
        })
      ]));

      card.appendChild(div("form-actions",[
        btn("btn-sm btn-sm-blue","💾 שמור כברירת מחדל",()=>{
          const selKeys2 = Object.entries(S.availDraft).filter(([,v])=>v).map(([k])=>k);
          if (!selKeys2.length) { _toast("בחר לפחות משמרת אחת","err"); return; }
          const defaults = selKeys2.map(k => {
            const [di, shId] = k.split("|");
            const dt = new Date(targetDates[parseInt(di)]+"T00:00:00");
            return { day: dt.getDay(), shift: shId };
          });
          localStorage.setItem("blockDefaults_" + emp.id, JSON.stringify(defaults));
          _toast("ברירת מחדל נשמרה ✓");
        }),
        btn("btn-sm btn-sm-red","📤 שלח / עדכן חסימות",async()=>{
          if (!selKeys.length && !document.getElementById("block-special-request")?.value?.trim()) { _toast("בחר משמרת או כתוב הודעה","err"); return; }
          const specialMsg = document.getElementById("block-special-request")?.value?.trim() || "";
          if (selKeys.length > 0) {
            const slots = selKeys.map(k=>{
              const [di,shId]=k.split("|");
              return {day:new Date(targetDates[parseInt(di)]+"T00:00:00").getDay(),shift:shId,date:targetDates[parseInt(di)],reason:""};
            });
            await submitAvailability(emp.id, targetStart, slots, specialMsg || "חסימות");
          }
          if (specialMsg) {
            S.employees.filter(e=>(e.role==="admin"||e.role==="manager") && e.email).forEach(adminEmp => {
              sendEmail("block_message", adminEmp.email, {
                requesterName: emp.name,
                targetDate: fmtDate(targetDates[0])+" — "+fmtDate(targetDates[6]),
                shiftLabel: "בקשה מיוחדת לחסימות",
                note: specialMsg
              });
            });
          }
          S.availDraft={}; S.blockReasons={};
          _toast("נשלח בהצלחה ✓"); _render();
        },{style:"flex:1"}),
        btn("btn-sm btn-sm-gray","נקה",()=>{S.availDraft={};S.blockReasons={};S._draftCleared=true;_render();})
      ],{style:"margin-top:12px"}));

      wrap.appendChild(card);
    }

    // History
    const myPastSubs = (S.availSubmissions||[]).filter(b=>b.employee_id===emp.id);
    if (myPastSubs.length > 0) {
      const histCard = div("card",[
        e("div",{style:"font-weight:800;font-size:14px;color:#94A3B8;margin-bottom:12px"},"📜 חסימות שהגשת בעבר")
      ]);

      myPastSubs.sort((a,b) => (b.week_start||"").localeCompare(a.week_start||"")).forEach(sub => {
        const wk = sub.week_start;
        histCard.appendChild(e("div",{style:"font-weight:700;font-size:12px;color:#60A5FA;margin-bottom:6px;margin-top:10px"},
          "שבוע " + (wk ? fmtDate(wk) : "לא ידוע")));

        const slotsGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"});
        (sub.slots||[]).sort((a,b) => (a.date||"").localeCompare(b.date||"")).forEach(sl => {
          const sh = SHIFT_BY_ID[sl.shift];
          const dt = sl.date ? new Date(sl.date+"T00:00:00") : null;
          const dayLabel = dt ? (DAYS[dt.getDay()]+" "+dt.getDate()+"/"+(dt.getMonth()+1)) : ("יום "+(DAYS[sl.day]||sl.day));
          slotsGrid.appendChild(e("div",{style:"background:#1E293B;border:1px solid "+(sh?.color||"#64748B")+"44;border-radius:8px;padding:6px 10px"},[
            e("div",{style:"font-weight:700;font-size:11px;color:"+(sh?.color||"#94A3B8")},dayLabel),
            e("div",{style:"font-size:10px;color:"+(sh?.color||"#64748B")},sh?.label||sl.shift),
            sl.reason ? e("div",{style:"font-size:9px;color:#FCA5A5;margin-top:2px"},"💬 "+sl.reason) : null
          ]));
        });
        histCard.appendChild(slotsGrid);

        if (sub.note) {
          histCard.appendChild(e("div",{style:"font-size:11px;color:#F59E0B;font-style:italic;margin-bottom:8px"},"📩 "+sub.note));
        }
      });
      wrap.appendChild(histCard);
    }
  }

  else if (S.empViewTab==="vacation") {
    if (_viewEmpVacations) wrap.appendChild(_viewEmpVacations());
  }
  else if (S.empViewTab==="swaps_emp") {
    if (_viewSwaps) wrap.appendChild(_viewSwaps(true));
  }

  return wrap;
}
