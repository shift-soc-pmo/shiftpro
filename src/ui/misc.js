import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, today, getEmp, empIdx } from '../utils.js';
import { SHIFTS, BLOCK_SHIFTS, DAYS, ec, getHoliday, SHIFT_BY_ID } from '../config.js';
import { addVacation, deleteVacRequest } from '../vacations.js';
import { submitAvailability } from '../availability.js';
import { loadSchedule } from '../db.js';
import { handleLogout } from '../auth.js';
import { sb } from '../supabase.js';

let _render = () => {};
let _toast = () => {};
export function setMiscDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ══════════════════════════════════════════════════════
// EMPLOYEE VACATION VIEW (self-service)
// ══════════════════════════════════════════════════════
export function viewEmpVacations() {
  const viewingEmpId = S.testAsEmployee && S.empViewId ? S.empViewId : S.user.id;
  const my = S.vacations.filter(x => x.employee_id === viewingEmpId);
  const wrap = div("");

  wrap.appendChild(div("page-title", ["🌴 היעדרויות"]));

  wrap.appendChild(btn("btn-add", "+ הגשת בקשה חדשה", () => {
    S.showAddVac = !S.showAddVac;
    if (S.showAddVac) S.newVac = { type: "vacation", startDate: "", endDate: "", reason: "" };
    _render();
  }, { style: "width:100%; margin-bottom:15px; padding:15px; font-weight:800;" }));

  if (S.showAddVac) {
    const typeIcons = { vacation: "🌴", reserve: "🎖️", exam: "📝" };
    const typeNames = { vacation: "חופשה", reserve: "מילואים", exam: "מבחן" };

    const f = div("card", [div("card-title", ["📝 הגשת בקשה חדשה"])]);

    const typeSel = e("div", { style: "display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px" });
    ["vacation", "reserve", "exam"].forEach(type => {
      const sel = (S.newVac.type || "vacation") === type;
      const colors = { vacation: "#10B981", reserve: "#6366F1", exam: "#F59E0B" };
      typeSel.appendChild(e("button", {
        style: `padding:12px 8px;border-radius:12px;border:2px solid ${sel ? colors[type] : colors[type]+"44"};background:${sel ? colors[type]+"22" : "#0F172A"};color:${sel ? colors[type] : "#64748B"};font-family:inherit;font-weight:800;font-size:13px;cursor:pointer`,
        onclick: () => { S.newVac.type = type; _render(); }
      }, [
        e("div", { style: "font-size:20px;margin-bottom:4px" }, typeIcons[type]),
        e("div", {}, typeNames[type])
      ]));
    });
    f.appendChild(typeSel);

    const infos = {
      vacation: { color: "#10B981", text: "📤 בקשת חופשה תישלח לאישור מנהל — לאחר אישור תחסום את המשמרות" },
      reserve:  { color: "#6366F1", text: "📤 בקשת מילואים תישלח לאישור מנהל — לאחר אישור תחסום את המשמרות" },
      exam:     { color: "#F59E0B", text: "📤 בקשת מבחן תישלח לאישור מנהל — לאחר אישור לא תחסום משמרות, רק תתריע" },
    };
    const info = infos[S.newVac.type || "vacation"];
    f.appendChild(e("div", {
      style: `background:${info.color}11;border:1px solid ${info.color}33;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:600;color:${info.color};margin-bottom:14px`
    }, info.text));

    f.appendChild(div("form-row", [
      div("form-col", [
        e("label", { class: "form-label" }, "מתאריך *"),
        e("input", { type: "date", class: "fi", oninput: x => S.newVac.startDate = x.target.value })
      ]),
      div("form-col", [
        e("label", { class: "form-label" }, "עד תאריך *"),
        e("input", { type: "date", class: "fi", oninput: x => S.newVac.endDate = x.target.value })
      ])
    ]));

    f.appendChild(e("label", { class: "form-label", style: "margin-top:8px;display:block" }, "הערה (אופציונלי)"));
    f.appendChild(e("input", {
      class: "fi", placeholder: "למשל: מבחן בליניארית, מילואים בנגב...",
      style: "margin-bottom:14px",
      oninput: x => S.newVac.reason = x.target.value
    }));

    f.appendChild(btn("btn-primary", "שלח בקשה", async () => {
      if (!S.newVac.startDate || !S.newVac.endDate) return _toast("נא למלא תאריכים", "err");
      await addVacation();
      S.showAddVac = false;
      _render();
    }, { style: "width:100%; padding:12px;" }));
    wrap.appendChild(f);
  }

  if (my.length === 0) {
    wrap.appendChild(div("card", [e("div", { style: "text-align:center;padding:24px;color:#64748B" }, "אין בקשות קודמות")]));
  } else {
    const card = div("card");
    const typeIcons2 = { vacation: "🌴", reserve: "🎖️", exam: "📝" };
    const typeNames2 = { vacation: "חופשה", reserve: "מילואים", exam: "מבחן" };
    const typeColors = { vacation: "#10B981", reserve: "#6366F1", exam: "#F59E0B" };

    my.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))).forEach(v => {
      const st = v.status === "approved" ? "approved" : v.status === "rejected" ? "rejected" : "pending";
      const label = v.status === "approved" ? "אושרה ✓" : v.status === "rejected" ? "נדחתה ✗" : "ממתין לאישור";
      const col = typeColors[v.type] || "#10B981";

      card.appendChild(e("div", { style: "display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #0F172A" }, [
        e("div", {}, [
          e("div", { style: `font-weight:800;font-size:14px;color:#F1F5F9` }, [
            e("span", { style: `color:${col};margin-left:6px` }, typeIcons2[v.type] || "🌴"),
            `${typeNames2[v.type] || "חופשה"}: ${fmtDate(v.start_date)}${v.start_date !== v.end_date ? " — " + fmtDate(v.end_date) : ""}`
          ]),
          v.reason ? e("div", { style: "font-size:11px;color:#64748B;margin-top:3px" }, v.reason) : null,
          e("div", { style: "margin-top:5px" }, [e("span", { class: "status-badge status-" + st }, label)])
        ]),
        btn("btn-sm btn-sm-red", "🗑️", () => deleteVacRequest(v.id))
      ]));
    });
    wrap.appendChild(card);
  }
  return wrap;
}

// ══════════════════════════════════════════════════════
// CALENDAR VIEW
// ══════════════════════════════════════════════════════
export function viewCalendar() {
  const wrap = e("div");
  if (!S.monthOffset) S.monthOffset = 0;

  const now = new Date();
  const viewMonth = now.getMonth() + S.monthOffset;
  const viewYear = now.getFullYear() + Math.floor(viewMonth / 12);
  const actualMonth = ((viewMonth % 12) + 12) % 12;

  const monthName = new Date(viewYear, actualMonth, 1).toLocaleDateString("he-IL", {month:"long", year:"numeric"});

  wrap.appendChild(div("section-header",[
    div("page-title",["🗓️ "+monthName]),
    e("div",{style:"display:flex;gap:8px"},[
      btn("btn-sm btn-sm-gray","→",()=>{S.monthOffset--;_render();}),
      btn("btn-sm btn-sm-blue","החודש",()=>{S.monthOffset=0;_render();}),
      btn("btn-sm btn-sm-gray","←",()=>{S.monthOffset++;_render();})
    ])
  ]));

  const firstDay = new Date(viewYear, actualMonth, 1);
  const lastDay = new Date(viewYear, actualMonth + 1, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const calCard = div("card");
  calCard.style.padding = "12px";

  const hdrRow = e("div",{style:"display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px"});
  DAYS.forEach(d=>hdrRow.appendChild(e("div",{style:"text-align:center;font-size:11px;font-weight:700;color:#64748B;padding:4px 0"},d)));
  calCard.appendChild(hdrRow);

  const grid = e("div",{style:"display:grid;grid-template-columns:repeat(7,1fr);gap:2px"});

  for (let i=0; i<startDow; i++) {
    grid.appendChild(e("div",{style:"min-height:70px"}));
  }

  for (let d=1; d<=totalDays; d++) {
    const dateStr = viewYear+"-"+String(actualMonth+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    const dt = new Date(dateStr+"T00:00:00");
    const isToday = dateStr === today();

    const cell = e("div",{
      style:"min-height:70px;background:"+(isToday?"#1E3A5F":"#1E293B")+";border-radius:8px;padding:4px;border:1px solid "+(isToday?"#3B82F6":"#334155")+";cursor:pointer;overflow:hidden",
      onclick:()=>{
        const diffDays = Math.round((dt - new Date(today()+"T00:00:00"))/(1000*60*60*24));
        S.weekOffset = Math.floor(diffDays/7);
        S.view="schedule";
        loadSchedule().then(()=>_render());
      }
    });

    cell.appendChild(e("div",{style:"font-size:12px;font-weight:"+(isToday?"900":"600")+";color:"+(isToday?"#60A5FA":"#E2E8F0")+";margin-bottom:2px"},String(d)));
    const holiday = getHoliday(dateStr);
    if (holiday) {
      cell.appendChild(e("div",{style:"font-size:7px;color:#FCD34D;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"},"✡️ "+holiday));
    }

    const daySched = S.schedule[dateStr];
    if (daySched) {
      SHIFTS.forEach(sh => {
        const empIds = daySched[sh.id];
        if (Array.isArray(empIds) && empIds.length > 0) {
          cell.appendChild(e("div",{style:"font-size:8px;background:"+sh.color+"22;color:"+sh.color+";border-radius:3px;padding:1px 3px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"},sh.label+": "+empIds.length));
        }
      });
    }

    const dayVacs = S.vacations.filter(v=>v.status==="approved"&&v.type!=="exam"&&dateStr>=v.start_date&&dateStr<=v.end_date);
    dayVacs.slice(0,2).forEach(v=>{
      const emp=getEmp(v.employee_id);
      if(emp) cell.appendChild(e("div",{style:"font-size:8px;color:#F59E0B;white-space:nowrap;overflow:hidden"},"🌴 "+emp.name.split(" ")[0]));
    });

    grid.appendChild(cell);
  }

  calCard.appendChild(grid);
  wrap.appendChild(calCard);
  return wrap;
}

// ══════════════════════════════════════════════════════
// EMPLOYEE SETTINGS
// ══════════════════════════════════════════════════════
export function viewEmpSettings() {
  const wrap = e("div");
  wrap.appendChild(div("page-title",["⚙️ הגדרות"],{style:"margin-bottom:16px"}));

  const passCard = div("card",[e("div",{class:"card-title"},"🔐 שינוי סיסמה")]);
  const newPass = e("input",{class:"fi",type:"password",placeholder:"סיסמה חדשה (לפחות 6 תווים)",style:"margin-bottom:10px"});
  const confPass = e("input",{class:"fi",type:"password",placeholder:"אישור סיסמה חדשה",style:"margin-bottom:12px"});
  passCard.appendChild(div("form-col",[e("label",{class:"form-label"},"סיסמה חדשה"),newPass],{style:"margin-bottom:10px"}));
  passCard.appendChild(div("form-col",[e("label",{class:"form-label"},"אישור סיסמה"),confPass],{style:"margin-bottom:12px"}));
  passCard.appendChild(btn("btn-add","🔐 שמור סיסמה חדשה",async()=>{
    if (!newPass.value || newPass.value.length < 6) { _toast("סיסמה חייבת להיות לפחות 6 תווים","err"); return; }
    if (newPass.value !== confPass.value) { _toast("הסיסמאות לא תואמות","err"); return; }
    const {error} = await sb.auth.updateUser({password: newPass.value});
    if (error) { _toast("שגיאה: "+error.message,"err"); return; }
    newPass.value=""; confPass.value="";
    _toast("סיסמה עודכנה בהצלחה ✓");
  },{style:"width:100%"}));
  wrap.appendChild(passCard);

  const pwaCard = div("card",[e("div",{class:"card-title"},"📱 התקנה על הטלפון")]);
  pwaCard.appendChild(e("div",{style:"font-size:13px;color:#94A3B8;margin-bottom:12px"},"התקן את ShiftPro כאפליקציה על מסך הבית"));
  if (S.pwaPrompt) {
    pwaCard.appendChild(btn("btn-purple","📱 התקן אפליקציה",async()=>{
      S.pwaPrompt.prompt();
      const {outcome}=await S.pwaPrompt.userChoice;
      if(outcome==="accepted"){S.pwaPrompt=null;_toast("אפליקציה הותקנה ✓");}
      _render();
    },{style:"width:100%"}));
  } else {
    pwaCard.appendChild(e("div",{style:"background:#1E3A5F;border-radius:10px;padding:14px"},[
      e("div",{style:"font-weight:700;font-size:13px;color:#60A5FA;margin-bottom:8px"},"כיצד להתקין:"),
      e("div",{style:"font-size:12px;color:#94A3B8;line-height:1.8"},[
        e("div",{},"📱 iPhone: לחץ על שתף ← הוסף למסך הבית"),
        e("div",{},"🤖 Android: לחץ על תפריט ← הוסף למסך הבית"),
        e("div",{},"💻 Chrome: לחץ על + בשורת הכתובת")
      ])
    ]));
  }
  wrap.appendChild(pwaCard);

  wrap.appendChild(btn("btn-sm btn-sm-red","יציאה מהמערכת",handleLogout,{style:"width:100%;margin-top:16px;padding:12px"}));

  return wrap;
}

// ══════════════════════════════════════════════════════
// MANAGER BLOCKS VIEW
// ══════════════════════════════════════════════════════
export function viewManagerBlocks() {
  const wrap = e("div");
  wrap.appendChild(div("page-title", ["🚫 חסימות"], {style:"margin-bottom:16px"}));

  if (!S.mgrBlocksTab) S.mgrBlocksTab = "team";
  const tabRow = e("div",{style:"display:flex;gap:6px;margin-bottom:14px"});
  [{id:"mine",label:"🚫 החסימות שלי"},{id:"team",label:"👥 חסימות עובדים"}].forEach(t=>{
    const isActive = S.mgrBlocksTab===t.id;
    tabRow.appendChild(e("button",{
      style:"flex:1;padding:10px;border-radius:10px;border:1px solid "+(isActive?"#3B82F6":"#334155")+";background:"+(isActive?"#3B82F622":"#1E293B")+";color:"+(isActive?"#60A5FA":"#64748B")+";font-family:inherit;font-weight:700;font-size:13px",
      onclick:()=>{S.mgrBlocksTab=t.id;_render();}
    },t.label));
  });
  wrap.appendChild(tabRow);

  if (S.mgrBlocksTab === "mine") {
    const emp = S.employees.find(e=>e.id===S.user.id);
    if (emp) {
      const targetOffset = S.availTargetOffset || 1;
      const targetDates = getWeekDates(S.weekOffset + targetOffset);
      const targetStart = targetDates[0];
      const blockLimits = emp.block_limits || { weekday:{morning:3,afternoon:3,night:1}, weekend:{morning:1,afternoon:1,night:1} };

      function getMgrBlockCount(shiftId, isWE) {
        let count = 0;
        Object.entries(S.availDraft).forEach(([key,val]) => {
          if (!val) return;
          const [di, sid] = key.split("|");
          if (sid !== shiftId) return;
          const dt = new Date(targetDates[parseInt(di)]+"T00:00:00");
          const dayIsWE = dt.getDay() === 5 || dt.getDay() === 6;
          if (dayIsWE === isWE) count++;
        });
        return count;
      }

      const existingSub = S.availSubmissions.find(s => s.employee_id === emp.id && s.week_start === targetStart);
      if (existingSub && Object.keys(S.availDraft).length === 0 && !S._draftCleared) {
        (existingSub.slots || []).forEach(sl => {
          targetDates.forEach((date, di) => {
            if (sl.date === date || (!sl.date && new Date(date+"T00:00:00").getDay() === sl.day)) {
              S.availDraft[di+"|"+sl.shift] = true;
            }
          });
        });
      }

      const card = div("card");

      if (existingSub) {
        card.appendChild(e("div",{style:"background:#3B82F618;border:1px solid #3B82F633;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center"},[
          e("div",{style:"font-size:12px;color:#60A5FA;font-weight:600"},"📝 יש חסימות קיימות לשבוע זה — ניתן לעדכן ולשלוח מחדש"),
        ]));
      }

      card.appendChild(e("div",{style:"display:flex;gap:6px;margin-bottom:10px"},[
        btn("","שבוע הבא",()=>{S.availTargetOffset=1;S.availDraft={};S._draftCleared=true;_render();},{style:"flex:1;padding:10px;border-radius:10px;border:1px solid "+(targetOffset===1?"#EF4444aa":"#334155")+";background:"+(targetOffset===1?"#EF444422":"#1E293B")+";color:"+(targetOffset===1?"#EF4444":"#94A3B8")+";font-family:inherit;font-size:13px;font-weight:700"}),
        btn("","עוד שבועיים",()=>{S.availTargetOffset=2;S.availDraft={};S._draftCleared=true;_render();},{style:"flex:1;padding:10px;border-radius:10px;border:1px solid "+(targetOffset===2?"#EF4444aa":"#334155")+";background:"+(targetOffset===2?"#EF444422":"#1E293B")+";color:"+(targetOffset===2?"#EF4444":"#94A3B8")+";font-family:inherit;font-size:13px;font-weight:700"})
      ]));
      card.appendChild(e("div",{style:"display:flex;gap:6px;margin-bottom:14px;justify-content:center;align-items:center"},[
        btn("btn-sm btn-sm-gray","→",()=>{S.availTargetOffset=Math.max(S.availTargetOffset-1,-4);S.availDraft={};S._draftCleared=true;_render();}),
        e("span",{style:"font-size:12px;color:#64748B;min-width:80px;text-align:center"},targetOffset<=0?"שבוע "+(targetOffset===0?"נוכחי":"קודם"):"שבוע הבא"+(targetOffset>1?" +"+targetOffset:"")),
        btn("btn-sm btn-sm-gray","←",()=>{S.availTargetOffset++;S.availDraft={};S._draftCleared=true;_render();})
      ]));
      card.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px;text-align:center"},fmtDate(targetDates[0])+" — "+fmtDate(targetDates[6])));

      const quotaCard2 = e("div",{style:"background:#1E293B;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:14px"});
      quotaCard2.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},"🚫 מכסת חסימות"));
      quotaCard2.appendChild(e("div",{style:"display:grid;grid-template-columns:1fr 1fr;gap:8px"},[
        e("div",{style:"background:#0F172A;border-radius:8px;padding:8px"},[
          e("div",{style:"font-size:11px;color:#3B82F6;font-weight:700;margin-bottom:6px"},"ראשון — חמישי"),
          ...BLOCK_SHIFTS.map(sh=>{
            const lim = blockLimits.weekday?.[sh.id]??3;
            const used = getMgrBlockCount(sh.id, false);
            return e("div",{style:"display:flex;justify-content:space-between;font-size:11px;padding:2px 0"},[
              e("span",{style:"color:"+sh.color},sh.label),
              e("span",{style:"font-weight:700;color:"+(used>=lim?"#EF4444":"#94A3B8")},used+"/"+lim)
            ]);
          })
        ]),
        e("div",{style:"background:#0F172A;border-radius:8px;padding:8px"},[
          e("div",{style:"font-size:11px;color:#A855F7;font-weight:700;margin-bottom:6px"},"שישי — שבת"),
          ...SHIFTS.filter(sh=>sh.id!=="afternoon" && sh.id!=="morning2").map(sh=>{
            const lim = blockLimits.weekend?.[sh.id]??1;
            const used = getMgrBlockCount(sh.id, true);
            return e("div",{style:"display:flex;justify-content:space-between;font-size:11px;padding:2px 0"},[
              e("span",{style:"color:"+sh.color},sh.label),
              e("span",{style:"font-weight:700;color:"+(used>=lim?"#EF4444":"#94A3B8")},used+"/"+lim)
            ]);
          })
        ])
      ]));
      card.appendChild(quotaCard2);

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
          _toast("ברירת מחדל נטענה ✓"); _render();
        }) : null,
        e("div",{style:"font-size:11px;color:#475569;display:flex;align-items:center"},
          savedDefaults ? "יש ברירת מחדל שמורה" : "אין ברירת מחדל")
      ]));

      card.appendChild(e("div",{style:"font-size:13px;color:#94A3B8;margin-bottom:12px"},"לחץ על משמרות שאתה לא יכול לעבוד:"));

      targetDates.forEach((date, di) => {
        const dt = new Date(date+"T00:00:00");
        const dayName = DAYS[dt.getDay()];
        const isWeekend = dt.getDay() === 5 || dt.getDay() === 6;
        const dayCard = e("div",{style:"background:#0F172A;border:1px solid #334155;border-radius:12px;padding:12px;margin-bottom:10px"});
        dayCard.appendChild(e("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"},[
          e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},dayName),
          e("div",{style:"font-size:13px;color:#64748B"},dt.getDate()+"/"+(dt.getMonth()+1))
        ]));
        const shiftsRow = e("div",{style:"display:grid;grid-template-columns:"+(isWeekend?"1fr 1fr":"1fr 1fr 1fr")+";gap:6px"});
        (isWeekend ? BLOCK_SHIFTS.filter(sh=>sh.id!=="afternoon") : BLOCK_SHIFTS).forEach(sh => {
          const key = di+"|"+sh.id;
          const picked = !!S.availDraft[key];
          const shiftLimit = isWeekend ? (blockLimits.weekend?.[sh.id]??1) : (blockLimits.weekday?.[sh.id]??3);
          const shiftUsed = getMgrBlockCount(sh.id, isWeekend);
          const atLimit = !picked && shiftUsed >= shiftLimit;

          shiftsRow.appendChild(e("button",{
            disabled: atLimit && !picked,
            style: picked ? "padding:14px 8px;border-radius:10px;background:#EF444433;border:2px solid #EF4444;color:#EF4444;font-weight:800;cursor:pointer;font-family:inherit" : atLimit ? "padding:14px 8px;border-radius:10px;background:#0F172A;border:1px solid #1E293B;color:#1E293B;cursor:not-allowed;font-family:inherit" : "padding:14px 8px;border-radius:10px;background:#1E293B;border:1px solid "+sh.color+"44;color:"+sh.color+";font-weight:700;cursor:pointer;font-family:inherit",
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
        e("textarea",{class:"fi",placeholder:"למשל: מבחן ביום ראשון, אירוע משפחתי בשישי...",style:"min-height:70px;resize:vertical",id:"mgr-block-note"})
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
          localStorage.setItem(defaultKey, JSON.stringify(defaults));
          _toast("ברירת מחדל נשמרה ✓");
        }),
        btn("btn-sm btn-sm-red","📤 שלח חסימות",async()=>{
          if (!selKeys.length) { _toast("בחר לפחות משמרת אחת","err"); return; }
          const mgrNote = document.getElementById("mgr-block-note")?.value?.trim() || "";
          const slots = selKeys.map(k=>{
            const [di,shId]=k.split("|");
            return {day:new Date(targetDates[parseInt(di)]+"T00:00:00").getDay(),shift:shId,date:targetDates[parseInt(di)],reason:""};
          });
          await submitAvailability(emp.id, targetStart, slots, mgrNote || "חסימות");
          S.availDraft={};
          _toast("חסימות נשלחו ✓"); _render();
        },{style:"flex:1"}),
        btn("btn-sm btn-sm-gray","נקה",()=>{S.availDraft={};_render();})
      ],{style:"margin-top:12px"}));

      wrap.appendChild(card);
    }
    return wrap;
  }

  // Team blocks tab
  if (!S.blocksWeekOffset) S.blocksWeekOffset = 0;
  const viewWeekDates = getWeekDates(S.blocksWeekOffset);
  const viewWeekStart = viewWeekDates[0];

  wrap.appendChild(e("div",{style:"display:flex;gap:6px;margin-bottom:14px;align-items:center;justify-content:center"},[
    btn("btn-sm btn-sm-gray","→",()=>{S.blocksWeekOffset--;_render();}),
    btn("btn-sm btn-sm-blue","השבוע",()=>{S.blocksWeekOffset=0;_render();}),
    btn("btn-sm btn-sm-gray","←",()=>{S.blocksWeekOffset++;_render();}),
  ]));
  wrap.appendChild(e("div",{style:"text-align:center;font-size:13px;color:#64748B;margin-bottom:16px"},
    fmtDate(viewWeekDates[0]) + " — " + fmtDate(viewWeekDates[6])));

  const allSubs = S.availSubmissions || [];
  const weekSubs = allSubs.filter(sub => sub.week_start === viewWeekStart && getEmp(sub.employee_id));

  if (weekSubs.length === 0) {
    wrap.appendChild(div("card", [e("div",{style:"text-align:center;padding:30px;color:#64748B"},"אין חסימות לשבוע זה")]));
    return wrap;
  }

  const byEmp = {};
  weekSubs.forEach(sub => {
    if (!byEmp[sub.employee_id]) byEmp[sub.employee_id] = [];
    (sub.slots || []).forEach(sl => {
      byEmp[sub.employee_id].push({
        date: sl.date || null,
        day: sl.day,
        shift: sl.shift,
        reason: sl.reason || sub.note || ""
      });
    });
  });

  const todayStr = today();

  Object.entries(byEmp).forEach(([empId, blocks]) => {
    const emp = getEmp(empId);
    const col = ec(empIdx(empId));

    const empBox = e("div",{style:"background:#0F172A;border:1px solid "+col+"44;border-radius:14px;padding:14px;margin-bottom:12px"});

    empBox.appendChild(e("div",{style:"display:flex;align-items:center;gap:10px;margin-bottom:12px"},[
      e("div",{style:"width:36px;height:36px;border-radius:10px;background:"+col+"22;border:1px solid "+col+"44;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:"+col+";flex-shrink:0"},
        (emp?.name||"?").split(" ").map(n=>n[0]).join("").slice(0,2)),
      e("div",{style:"flex:1"},[
        e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},emp?.name || "עובד לא ידוע"),
        e("div",{style:"font-size:11px;color:#64748B"},blocks.length + " חסימות")
      ])
    ]));

    const gridEl = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px"});
    blocks.sort((a,b) => (a.date||"").localeCompare(b.date||"")).forEach(b => {
      const sh = SHIFT_BY_ID[b.shift];
      const dt = b.date ? new Date(b.date+"T00:00:00") : null;
      const isPast = b.date && b.date < todayStr;
      const dayLabel = dt ? (DAYS[dt.getDay()] + " " + dt.getDate() + "/" + (dt.getMonth()+1)) : ("יום " + (DAYS[b.day] || b.day));

      gridEl.appendChild(e("div",{style:"background:#1E293B;border:1px solid "+(sh?.color||"#64748B")+"44;border-radius:10px;padding:8px 12px;opacity:"+(isPast?"0.5":"1")},[
        e("div",{style:"font-weight:700;font-size:12px;color:"+(sh?.color||"#94A3B8")},dayLabel),
        e("div",{style:"font-size:11px;color:"+(sh?.color||"#64748B")},sh?.label || b.shift),
        null
      ]));
    });
    empBox.appendChild(gridEl);

    const empNote = weekSubs.find(s => s.employee_id === empId)?.note;
    if (empNote && empNote !== "חסימות") {
      empBox.appendChild(e("div",{style:"margin-top:8px;background:#F59E0B11;border:1px solid #F59E0B33;border-radius:8px;padding:8px 12px;font-size:12px;color:#FCD34D;font-style:italic"},"💬 "+empNote));
    }
    wrap.appendChild(empBox);
  });

  return wrap;
}

// ══════════════════════════════════════════════════════
// QUALIFICATIONS VIEW
// ══════════════════════════════════════════════════════
export function viewQualifications() {
  const wrap = e("div");
  wrap.appendChild(div("page-title",["🎯 כשירות עובדים"],{style:"margin-bottom:16px"}));

  const quals = S.qualifications || {systems:{},shifts:{}};
  const systems = S.systems || [];
  const trackedShifts = [
    {id:"morning",label:"בוקר",color:"#F59E0B"},
    {id:"morning2",label:"בוקר ב׳",color:"#F97316"}
  ];

  const hasSystemQuals = Object.keys(quals.systems||{}).length > 0;
  const hasShiftQuals = Object.keys(quals.shifts||{}).length > 0;

  if (!hasSystemQuals && !hasShiftQuals && systems.length === 0) {
    wrap.appendChild(div("card",[
      e("div",{style:"text-align:center;padding:40px"},[
        e("div",{style:"font-size:48px;margin-bottom:12px"},"🎯"),
        e("div",{style:"font-weight:800;font-size:18px;color:#94A3B8;margin-bottom:8px"},"לא מוגדרת כשירות"),
        e("div",{style:"font-size:13px;color:#64748B;margin-bottom:20px"},"קודם הוסף מערכות והגדר ימי כשירות בהגדרות"),
        btn("btn-add","עבור להגדרות →",()=>{S.view="settings";_render();})
      ])
    ]));
    return wrap;
  }

  const empData = {};
  S.employees.forEach(emp => { empData[emp.id] = { systems: {}, shifts: {} }; });

  Object.entries(S.assignmentNotes||{}).forEach(([key, note]) => {
    const [date, shift, empId] = key.split("|");
    if (!empData[empId] || !note) return;
    if (note.startsWith("🏷️ ")) {
      const tagPart = note.split(" | ")[0].replace("🏷️ ","");
      const tags = tagPart.split(", ").map(t=>t.trim()).filter(Boolean);
      tags.forEach(tag => {
        const existing = empData[empId].systems[tag];
        if (!existing || date > existing) empData[empId].systems[tag] = date;
      });
    }
  });

  Object.entries(S.schedule||{}).forEach(([date, shifts]) => {
    if (date === "id" || typeof shifts !== "object") return;
    Object.entries(shifts).forEach(([shiftId, empIds]) => {
      if (!Array.isArray(empIds)) return;
      empIds.forEach(empId => {
        if (!empData[empId]) return;
        const existing = empData[empId].shifts[shiftId];
        if (!existing || date > existing) empData[empId].shifts[shiftId] = date;
      });
    });
  });

  const todayStr = today();
  const todayDate = new Date(todayStr+"T12:00:00");

  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    const d = new Date(dateStr+"T12:00:00");
    return Math.floor((todayDate - d) / (1000*60*60*24));
  }

  function getStatus(daysSinceLast, expiryDays) {
    if (daysSinceLast === Infinity) return {color:"#EF4444", icon:"❌", label:"מעולם לא"};
    if (daysSinceLast >= expiryDays) return {color:"#EF4444", icon:"❌", label:"פג!"};
    const remaining = expiryDays - daysSinceLast;
    if (remaining <= 3) return {color:"#F59E0B", icon:"⚠️", label:"עוד "+remaining+" ימים"};
    return {color:"#10B981", icon:"✅", label:"כשיר"};
  }

  let totalExpired = 0;
  let totalWarning = 0;
  S.employees.forEach(emp => {
    Object.entries(quals.systems||{}).forEach(([sys, days]) => {
      const last = empData[emp.id]?.systems[sys];
      const since = daysSince(last);
      if (since >= days) totalExpired++;
      else if (days - since <= 3) totalWarning++;
    });
    trackedShifts.forEach(sh => {
      if (!quals.shifts?.[sh.id]) return;
      const last = empData[emp.id]?.shifts[sh.id];
      const since = daysSince(last);
      if (since >= quals.shifts[sh.id]) totalExpired++;
      else if (quals.shifts[sh.id] - since <= 3) totalWarning++;
    });
  });

  wrap.appendChild(e("div",{style:"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px"},[
    e("div",{style:"background:#EF444418;border:1px solid #EF444444;border-radius:12px;padding:14px;text-align:center"},[
      e("div",{style:"font-size:24px;font-weight:900;color:#EF4444"},String(totalExpired)),
      e("div",{style:"font-size:11px;color:#FCA5A5;font-weight:700"},"❌ פג")
    ]),
    e("div",{style:"background:#F59E0B18;border:1px solid #F59E0B44;border-radius:12px;padding:14px;text-align:center"},[
      e("div",{style:"font-size:24px;font-weight:900;color:#F59E0B"},String(totalWarning)),
      e("div",{style:"font-size:11px;color:#FCD34D;font-weight:700"},"⚠️ עומד לפוג")
    ]),
    e("div",{style:"background:#10B98118;border:1px solid #10B98144;border-radius:12px;padding:14px;text-align:center"},[
      e("div",{style:"font-size:24px;font-weight:900;color:#10B981"},String(S.employees.length)),
      e("div",{style:"font-size:11px;color:#34D399;font-weight:700"},"👥 עובדים")
    ])
  ]));

  if (!S.qualFilter) S.qualFilter = "all";
  const filters = [{id:"all",label:"הכל"},{id:"expired",label:"❌ פג"},{id:"warning",label:"⚠️ עומד לפוג"},{id:"ok",label:"✅ כשירים"}];
  const filterRow = e("div",{style:"display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap"});
  filters.forEach(f => {
    const isActive = S.qualFilter === f.id;
    filterRow.appendChild(e("button",{
      style:"padding:8px 14px;border-radius:8px;border:1px solid "+(isActive?"#3B82F6":"#334155")+";background:"+(isActive?"#3B82F622":"#1E293B")+";color:"+(isActive?"#60A5FA":"#94A3B8")+";font-family:inherit;font-weight:700;font-size:12px;cursor:pointer",
      onclick:()=>{S.qualFilter=f.id;_render();}
    },f.label));
  });
  wrap.appendChild(filterRow);

  S.employees.forEach((emp, idx) => {
    const col = ec(idx);
    const empQualSystems = Object.entries(quals.systems||{}).map(([sys, days]) => {
      const last = empData[emp.id]?.systems[sys];
      const since = daysSince(last);
      const status = getStatus(since, days);
      return {type:"system", name:sys, lastDate:last, since, expiryDays:days, status};
    });
    const empQualShifts = trackedShifts.filter(sh => quals.shifts?.[sh.id]).map(sh => {
      const last = empData[emp.id]?.shifts[sh.id];
      const since = daysSince(last);
      const status = getStatus(since, quals.shifts[sh.id]);
      return {type:"shift", name:sh.label, color:sh.color, lastDate:last, since, expiryDays:quals.shifts[sh.id], status};
    });

    const allQuals = [...empQualSystems, ...empQualShifts];

    let filtered = allQuals;
    if (S.qualFilter === "expired") filtered = allQuals.filter(q => q.status.icon === "❌");
    else if (S.qualFilter === "warning") filtered = allQuals.filter(q => q.status.icon === "⚠️");
    else if (S.qualFilter === "ok") filtered = allQuals.filter(q => q.status.icon === "✅");

    if (S.qualFilter !== "all" && filtered.length === 0) return;

    const expiredCount = allQuals.filter(q => q.status.icon === "❌").length;
    const warnCount = allQuals.filter(q => q.status.icon === "⚠️").length;
    const cardBorder = expiredCount > 0 ? "#EF444444" : warnCount > 0 ? "#F59E0B44" : col+"44";

    const empCard = e("div",{style:"background:#1E293B;border:1px solid "+cardBorder+";border-radius:14px;padding:14px;margin-bottom:12px"});

    empCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:10px;margin-bottom:12px"},[
      e("div",{style:"width:36px;height:36px;border-radius:10px;background:"+col+"22;border:1px solid "+col+"44;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:"+col},
        emp.name.split(" ").map(n=>n[0]).join("").slice(0,2)),
      e("div",{style:"flex:1"},[
        e("div",{style:"font-weight:800;font-size:15px;color:#E2E8F0"},emp.name),
        e("div",{style:"font-size:11px;color:#64748B;margin-top:2px"},
          (expiredCount > 0 ? "❌ "+expiredCount+" פג · " : "") +
          (warnCount > 0 ? "⚠️ "+warnCount+" קרוב · " : "") +
          (allQuals.length - expiredCount - warnCount)+" כשירים")
      ])
    ]));

    if (filtered.length === 0) {
      empCard.appendChild(e("div",{style:"color:#64748B;font-size:12px;padding:8px;text-align:center"},"אין פריטים שמתאימים לסינון"));
    } else {
      const gridEl = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px"});
      filtered.forEach(q => {
        gridEl.appendChild(e("div",{style:"background:#0F172A;border:1px solid "+q.status.color+"44;border-radius:10px;padding:8px 12px;min-width:140px"},[
          e("div",{style:"display:flex;align-items:center;gap:6px;margin-bottom:4px"},[
            e("span",{style:"font-size:13px"},q.status.icon),
            e("div",{style:"font-weight:700;font-size:12px;color:"+(q.color||q.status.color)},
              (q.type === "system" ? "🏷️ " : "🌅 ") + q.name)
          ]),
          e("div",{style:"font-size:10px;color:#64748B"},
            q.lastDate ? "אחרון: " + fmtDate(q.lastDate) + " ("+q.since+" ימים)" : "מעולם לא בוצע"),
          e("div",{style:"font-size:10px;color:"+q.status.color+";font-weight:700;margin-top:2px"},q.status.label)
        ]));
      });
      empCard.appendChild(gridEl);
    }

    wrap.appendChild(empCard);
  });

  return wrap;
}
