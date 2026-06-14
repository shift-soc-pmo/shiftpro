import { S } from '../state.js';
import { e, div, btn, getEmp, fmtDate, render, toast } from '../utils.js';
import { SHIFTS, SHIFT_BY_ID, DAYS } from '../config.js';
import { isManager } from '../db.js';
import { updateSwapStatus } from '../swaps.js';

// Cache for schedule data loaded for swap weeks (other than current)
export const _swapWeekCache = {};  // { weekStartStr: { date: { shift: [empIds] } } }

export async function loadScheduleForSwapWeek(weekOffset) {
  const wd = getWeekDates(weekOffset);
  const weekStart = wd[0];
  
  // If it's the current week being viewed in schedule, just use S.schedule
  if (weekOffset === S.weekOffset) {
    return S.schedule;
  }
  
  // Check cache
  if (_swapWeekCache[weekStart]) {
    return _swapWeekCache[weekStart];
  }
  
  // Load from DB
  try {
    const { data: sched } = await sb.from("schedules")
      .select("id").eq("business_id", S.profile.business_id)
      .eq("week_start", weekStart).maybeSingle();
    
    if (!sched) {
      _swapWeekCache[weekStart] = {};
      return {};
    }
    
    const { data: assigns } = await sb.from("assignments")
      .select("*").eq("schedule_id", sched.id);
    
    const result = {};
    (assigns || []).forEach(a => {
      if (!result[a.date]) result[a.date] = {};
      if (!result[a.date][a.shift]) result[a.date][a.shift] = [];
      result[a.date][a.shift].push(a.employee_id);
    });
    
    _swapWeekCache[weekStart] = result;
    return result;
  } catch (err) {
    console.warn("Could not load swap week:", err);
    return {};
  }
}

// Invalidate swap cache when schedule changes
export function invalidateSwapCache() {
  for (const key in _swapWeekCache) delete _swapWeekCache[key];
}

export async function processManagerDecision(swap, isApproved, rejectReason) {
  if (isApproved) {
    // אימות אחרון לפני אישור בסידור
    if (swap.target_date && swap.giver_id) { // חילוף הדדי
      // מקבל המשמרת (העובד השני) מקבל את המשמרת שלך, ומתעלמים מהמשמרת שהוא מוסר
      const c1 = checkShiftConflict(swap.date, swap.shift, swap.taker_id, swap.target_date, swap.target_shift);
      // אתה (מוסר המשמרת) מקבל את המשמרת שלו, ומתעלמים מהמשמרת שאתה מוסר
      const c2 = checkShiftConflict(swap.target_date, swap.target_shift, swap.giver_id, swap.date, swap.shift);
      
      if (c1) { toast("לא ניתן לאשר: "+c1,"err"); return; }
      if (c2) { toast("לא ניתן לאשר: "+c2,"err"); return; }
      
      const empsA = S.schedule[swap.date]?.[swap.shift];
      if (empsA) { const i = empsA.indexOf(swap.giver_id); if (i > -1) empsA[i] = swap.taker_id; }
      const empsB = S.schedule[swap.target_date]?.[swap.target_shift];
      if (empsB) { const i = empsB.indexOf(swap.taker_id); if (i > -1) empsB[i] = swap.giver_id; }
    } else if (swap.giver_id) { // מסירת משמרת
      const c = checkShiftConflict(swap.date, swap.shift, swap.taker_id);
      if (c) { toast("לא ניתן לאשר: "+c,"err"); return; }
      const emps = S.schedule[swap.date]?.[swap.shift];
      if (emps) { const i = emps.indexOf(swap.giver_id); if (i > -1) emps[i] = swap.taker_id; }
    } else { // הצטרפות למשמרת
      const c = checkShiftConflict(swap.date, swap.shift, swap.taker_id);
      if (c) { toast("לא ניתן לאשר: "+c,"err"); return; }
      const emps = S.schedule[swap.date]?.[swap.shift];
      if (emps && !emps.includes(swap.taker_id)) emps.push(swap.taker_id);
    }
    saveScheduleToDB();
  }

  const swapUpdate = {status: isApproved?"approved":"rejected"};
  if (rejectReason) swapUpdate.reject_reason = rejectReason;
  await sb.from("swaps").update(swapUpdate).eq("id", swap.id);

  const taker = getEmp(swap.taker_id);
  if (taker?.email) {
    const sh = SHIFT_BY_ID[swap.shift];
    sendEmail(
      "swap_decision", 
      taker.email,
      {
        empName: taker.name,
        targetDate: swap.target_date ? fmtDate(swap.date) + " ⇆ " + fmtDate(swap.target_date) : fmtDate(swap.date),
        shiftLabel: sh?.label || swap.shift,
        statusText: isApproved ? "אושרה" : "נדחתה",
        isApproved: isApproved,
        rejectReason: rejectReason||""
      }
    );
  }

  toast(isApproved ? "✓ אושר ועודכן בסידור" : "נדחה");
  await loadSwapRequests();
  render();
  silentRefresh();
}

// ── אישור/דחייה של העובד השני (Peer) ──
export async function processPeerDecision(swap, isApproved) {
  const newStatus = isApproved ? "pending_manager" : "rejected";
  const { error } = await sb.from("swaps").update({status: newStatus}).eq("id", swap.id);
  if (error) { toast("שגיאה: " + error.message, "err"); return; }

  // אם העובד אישר, עכשיו שולחים את המייל למנהל!
  if (isApproved) {
    const allMgrs = S.employees.filter(e => (e.role === "admin" || e.role === "manager") && e.email);
    const giverEmp = getEmp(swap.giver_id);
    const takerEmp = getEmp(swap.taker_id);
    const sh = SHIFT_BY_ID[swap.shift];
    const tSh = SHIFT_BY_ID[swap.target_shift];
    
    allMgrs.forEach(adminEmp => {
      let shiftLabel = "";
      let tDateStr = fmtDate(swap.date);
      
      if (swap.target_date) {
        shiftLabel = "החלפה הדדית בין " + giverEmp?.name + " ל-" + takerEmp?.name;
        tDateStr = fmtDate(swap.date) + " (" + sh?.label + ") ⇆ " + fmtDate(swap.target_date) + " (" + tSh?.label + ")";
      } else {
        shiftLabel = sh?.label + " — מסירה מ-" + giverEmp?.name + " ל-" + takerEmp?.name;
      }

     let emailTitle = swap.target_date ? "🔄 בקשת החלפה הדדית" : "📤 בקשת מסירת משמרת";
      sendEmail("swap_request", adminEmp.email, {
        title: emailTitle, // <--- הוספנו כותרת
        requesterName: "הודעת מערכת",
        targetDate: tDateStr,
        shiftLabel: shiftLabel,
        note: swap.note || ""
      });
    });
    toast("אישרת את הבקשה! הועבר לאישור מנהל ✓");
  } else {
    toast("דחית את הבקשה");
  }
  
  await loadSwapRequests();
  render();
  silentRefresh();
}

export function viewSwaps(forceEmployee) {
  const wrap = e("div");
  wrap.appendChild(div("page-title", ["🔄 חילופים והצטרפות"], {style:"margin-bottom:16px"}));

  const todayStr = today();
  if (!S.swaps) S.swaps = [];

  const myEmpId = getActiveEmpId();

  // ══ מנהל: טאבים — שלי / אישור בקשות ══
  if (isManager() && !forceEmployee) {
    if (!S.mgrSwapsTab) S.mgrSwapsTab = "approve";
    const swapTabRow = e("div",{style:"display:flex;gap:6px;margin-bottom:14px"});
    [{id:"mine",label:"🔄 החילופים שלי"},{id:"approve",label:"👥 אישור בקשות"}].forEach(t=>{
      const isActive = S.mgrSwapsTab===t.id;
      swapTabRow.appendChild(e("button",{
        style:"flex:1;padding:10px;border-radius:10px;border:1px solid "+(isActive?"#3B82F6":"#334155")+";background:"+(isActive?"#3B82F622":"#1E293B")+";color:"+(isActive?"#60A5FA":"#64748B")+";font-family:inherit;font-weight:700;font-size:13px",
        onclick:()=>{S.mgrSwapsTab=t.id;render();}
      },t.label));
    });
    wrap.appendChild(swapTabRow);

    // Manager's personal swaps tab
    if (S.mgrSwapsTab === "mine") {
      // Render the employee swap view for the manager
      const mgrSwapContent = viewSwaps(true);
      // Copy children from the returned element
      while (mgrSwapContent.firstChild) {
        // Skip the title (already have it)
        const child = mgrSwapContent.firstChild;
        mgrSwapContent.removeChild(child);
        if (child.classList?.contains("page-title")) continue;
        wrap.appendChild(child);
      }
      return wrap;
    }

    // Approval tab (existing code continues)
    const pending = S.swaps.filter(s => (s.status === "pending_manager" || s.status === "pending_approval") && (getEmp(s.taker_id) || getEmp(s.giver_id)));

    if (pending.length === 0) {
      wrap.appendChild(div("card", [
        e("div",{style:"text-align:center;padding:30px;color:#64748B"},"אין בקשות ממתינות לאישור")
      ]));
    } else {
      const mCard = div("card", [
        e("div",{style:"font-weight:800;font-size:14px;color:#F59E0B;margin-bottom:14px"},
          "⏳ ממתינות לאישורך (" + pending.length + ")")
      ]);

      pending.forEach(s => {
        const giver = getEmp(s.giver_id);
        const taker = getEmp(s.taker_id);
        const giverShift = SHIFT_BY_ID[s.shift];
        const takerShift = SHIFT_BY_ID[s.target_shift];
        const isSwap = !!s.target_date;
        const isJoin = !s.giver_id;

        mCard.appendChild(e("div",{style:"background:#0F172A;border:1px solid #334155;border-radius:14px;padding:14px;margin-bottom:10px"},[
          e("div",{style:"font-weight:800;font-size:14px;color:#E2E8F0;margin-bottom:10px"},
            isJoin ? "➕ " + (taker?.name||"?") + " מבקש להצטרף למשמרת" :
            isSwap ? "🔄 החלפה הדדית" : "📤 מסירת משמרת"
          ),
          isSwap ? e("div",{style:"display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-bottom:12px"},[
            e("div",{style:"background:"+(giverShift?.color||"#3B82F6")+"18;border:1px solid "+(giverShift?.color||"#3B82F6")+"44;border-radius:10px;padding:10px;text-align:center"},[
              e("div",{style:"font-size:11px;color:#64748B;margin-bottom:2px"},"מוסר"),
              e("div",{style:"font-weight:800;font-size:13px;color:"+(giverShift?.color||"#E2E8F0")},giver?.name||"?"),
              e("div",{style:"font-size:11px;color:#94A3B8"},fmtDate(s.date)),
              e("div",{style:"font-size:11px;font-weight:700;color:"+(giverShift?.color||"#E2E8F0")},giverShift?.label||s.shift)
            ]),
            e("div",{style:"font-size:20px;text-align:center"},"⇆"),
            e("div",{style:"background:"+(takerShift?.color||"#3B82F6")+"18;border:1px solid "+(takerShift?.color||"#3B82F6")+"44;border-radius:10px;padding:10px;text-align:center"},[
              e("div",{style:"font-size:11px;color:#64748B;margin-bottom:2px"},"מקבל"),
              e("div",{style:"font-weight:800;font-size:13px;color:"+(takerShift?.color||"#E2E8F0")},taker?.name||"?"),
              e("div",{style:"font-size:11px;color:#94A3B8"},fmtDate(s.target_date)),
              e("div",{style:"font-size:11px;font-weight:700;color:"+(takerShift?.color||"#E2E8F0")},takerShift?.label||s.target_shift)
            ])
          ]) :
          e("div",{style:"background:"+(giverShift?.color||"#3B82F6")+"18;border:1px solid "+(giverShift?.color||"#3B82F6")+"44;border-radius:10px;padding:10px;margin-bottom:12px;display:flex;gap:10px;align-items:center"},[
            e("div",{style:"flex:1"},[
              e("div",{style:"font-size:12px;color:#64748B"},isJoin?"מצטרף":"מוסר"),
              e("div",{style:"font-weight:800;font-size:14px"},isJoin?taker?.name:giver?.name),
              !isJoin?e("div",{style:"font-size:12px;color:#94A3B8"},"← מועבר אל " + (taker?.name||"?")):null
            ]),
            e("div",{style:"text-align:left"},[
              e("div",{style:"font-size:12px;color:#94A3B8"},fmtDate(s.date)),
              e("div",{style:"font-weight:700;font-size:13px;color:"+(giverShift?.color||"#3B82F6")},giverShift?.label||s.shift)
            ])
          ]),
          s.note ? e("div",{style:"font-size:12px;color:#64748B;font-style:italic;margin-bottom:10px"},"\"" + s.note + "\""):null,
          div("form-actions",[
            btn("btn-green","✓ אשר בסידור",()=>processManagerDecision(s,true),{style:"flex:1"}),
            btn("btn-sm btn-sm-red","✗ דחה",()=>{
          const reason = prompt("סיבת דחייה (אופציונלי):");
          if (reason === null) return;
          processManagerDecision(s,false,reason);
        },{style:"flex:1"})
          ])
        ]));
      });
      wrap.appendChild(mCard);
    }

    const done = S.swaps.filter(s=>(s.status==="approved"||s.status==="rejected") && (getEmp(s.taker_id)||getEmp(s.giver_id))).slice(0,5);
    if (done.length > 0) {
      const hCard = div("card",[e("div",{style:"font-weight:700;font-size:13px;color:#64748B;margin-bottom:10px"},"היסטוריה אחרונה")]);
      done.forEach(s=>{
        const giver=getEmp(s.giver_id);const taker=getEmp(s.taker_id);
        const isApp=s.status==="approved";
        hCard.appendChild(e("div",{style:"display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0F172A"},[
          e("div",{style:"font-size:12px;color:#94A3B8"},(taker?.name||"?") + " · " + fmtDate(s.date) + " · " + (SHIFT_BY_ID[s.shift]?.label||s.shift)),
          e("span",{class:"status-badge status-"+(isApp?"approved":"rejected")},isApp?"אושר":"נדחה")
        ]));
      });
      wrap.appendChild(hCard);
    }
    return wrap;
  }

  // ══ עובד: בקשות הממתינות לאישור שלי (Peer) ══
  const incomingReqs = S.swaps.filter(s => s.status === "pending_peer" && s.taker_id === myEmpId && getEmp(s.giver_id));
  if (incomingReqs.length > 0) {
    const incCard = div("card", [
      e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:14px"},[
        e("span",{style:"font-size:20px"},"📥"),
        e("div",{style:"font-weight:800;font-size:15px;color:#60A5FA"},"בקשות שממתינות לאישורך (" + incomingReqs.length + ")")
      ])
    ],{style:"border:1px solid #3B82F644;background:#1E3A5F22"});

    incomingReqs.forEach(s => {
      const giver = getEmp(s.giver_id);
      const giverShift = SHIFT_BY_ID[s.shift];
      const takerShift = SHIFT_BY_ID[s.target_shift];
      const isSwap = !!s.target_date;

      incCard.appendChild(e("div",{style:"background:#0F172A;border:1px solid #334155;border-radius:12px;padding:12px;margin-bottom:10px"},[
        e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},
          isSwap ? (giver?.name||"?") + " מציע החלפה הדדית:" : (giver?.name||"?") + " רוצה למסור לך משמרת:"
        ),
        e("div",{style:"font-size:12px;color:#94A3B8;margin-bottom:10px"},[
          e("div",{},"📅 המשמרת שתקבל: " + fmtDate(s.date) + " — " + (giverShift?.label||"?")),
          isSwap ? e("div",{style:"margin-top:4px"},"📅 המשמרת שתיתן: " + fmtDate(s.target_date) + " — " + (takerShift?.label||"?")) : null,
        ]),
        div("form-actions",[
          btn("btn-green","✓ אשר (העבר למנהל)",()=>processPeerDecision(s,true),{style:"flex:1"}),
          btn("btn-sm btn-sm-red","✗ דחה",()=>processPeerDecision(s,false),{style:"flex:1"})
        ])
      ]));
    });
    wrap.appendChild(incCard);
  }

  // ══ עובד: הגשת בקשות ══
  if (!S.empSwapTab) S.empSwapTab = "swap";
  if (S.swapWeekOffset == null) S.swapWeekOffset = 0;

  // Week navigator
  const swapWd = getWeekDates(S.swapWeekOffset);
  const navRow = e("div",{style:"display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;background:#0F172A;border:1px solid #334155;border-radius:10px;padding:10px 14px"});
  navRow.appendChild(btn("btn-sm btn-sm-gray","→",()=>{S.swapWeekOffset--;render();}));
  navRow.appendChild(e("div",{style:"flex:1;text-align:center"},[
    e("div",{style:"font-size:13px;font-weight:700;color:#E2E8F0"},
      S.swapWeekOffset===0?"השבוע":S.swapWeekOffset===1?"שבוע הבא":"עוד "+S.swapWeekOffset+" שבועות"),
    e("div",{style:"font-size:11px;color:#64748B;margin-top:2px"},fmtDate(swapWd[0])+" — "+fmtDate(swapWd[6]))
  ]));
  navRow.appendChild(btn("btn-sm btn-sm-blue","היום",()=>{S.swapWeekOffset=0;render();}));
  navRow.appendChild(btn("btn-sm btn-sm-gray","←",()=>{S.swapWeekOffset++;render();}));
  wrap.appendChild(navRow);
  
  // Trigger loading of schedule data for the selected swap week (if different from current)
  const swapTargetWeek = swapWd[0];
  if (S.swapWeekOffset !== S.weekOffset && !_swapWeekCache[swapTargetWeek]) {
    loadScheduleForSwapWeek(S.swapWeekOffset).then(()=>render());
    // Show loading state
    wrap.appendChild(e("div",{style:"text-align:center;padding:20px;color:#64748B"},"⏳ טוען נתוני סידור..."));
    return wrap;
  }

  const tabs = div("",[],{style:"display:flex;gap:6px;margin-bottom:14px"});
  [{id:"swap",label:"🔄 החלפה"},{id:"handover",label:"📤 מסירה"},{id:"join",label:"➕ הצטרפות"}].forEach(t=>{
    const isActive = S.empSwapTab===t.id;
    tabs.appendChild(e("button",{
      style:"flex:1;padding:10px;border-radius:10px;border:1px solid " + (isActive?"#3B82F6":"#334155") + ";background:" + (isActive?"#3B82F622":"#1E293B") + ";color:" + (isActive?"#60A5FA":"#64748B") + ";font-family:inherit;font-weight:700;font-size:13px",
      onclick:()=>{S.empSwapTab=t.id;render();}
    },t.label));
  });
  wrap.appendChild(tabs);
  
  // Date range for filtering shifts to this week only (and future)
  const swapWeekStart = swapWd[0];
  const swapWeekEnd = swapWd[6];
  const minDate = todayStr > swapWeekStart ? todayStr : swapWeekStart;
  const inSwapWeek = (d) => d >= minDate && d <= swapWeekEnd;
  
  // Use the correct schedule data — either current S.schedule or cached for other weeks
  const swapSched = (S.swapWeekOffset === S.weekOffset) ? S.schedule : (_swapWeekCache[swapWeekStart] || {});

  // ── החלפה הדדית ──
  if (S.empSwapTab === "swap") {
    const card = div("card",[e("div",{class:"card-title"},"🔄 בקשת החלפה הדדית")]);
    card.appendChild(e("div",{style:"font-size:13px;color:#64748B;margin-bottom:14px"},"בחר את המשמרת שתרצה לתת, ואת המשמרת שתרצה לקבל."));

    const myFutureShifts = [];
    Object.keys(swapSched).filter(d=>inSwapWeek(d)).sort().forEach(date=>{
      const mfDt = new Date(date+"T00:00:00");
      const mfIsWeekend = mfDt.getDay() === 5 || mfDt.getDay() === 6;
      SHIFTS.filter(sh => !(mfIsWeekend && (sh.id === "afternoon" || sh.id === "morning2"))).forEach(sh=>{
        if((swapSched[date]?.[sh.id]||[]).includes(myEmpId)){
          myFutureShifts.push({date,shift:sh});
        }
      });
    });

    if (myFutureShifts.length === 0) {
      card.appendChild(e("div",{style:"text-align:center;padding:20px;color:#64748B;font-size:13px"},"אין לך משמרות בשבוע זה."));
      wrap.appendChild(card);
    } else {
      card.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},"1️⃣ איזו משמרת שלך תרצה לתת?"));
      const myGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px"});
      myFutureShifts.forEach(({date,shift})=>{
        const key = date+"|"+shift.id;
        const sel = S.swapMyShift===key;
        myGrid.appendChild(e("button",{
          style:"padding:8px 12px;border-radius:10px;border:1px solid " + (sel?shift.color:shift.color+"44") + ";background:" + (sel?shift.color+"33":"#0F172A") + ";color:" + (sel?shift.color:"#94A3B8") + ";font-family:inherit;font-size:12px;font-weight:700",
          onclick:()=>{S.swapMyShift=sel?null:key;S.swapTargetShift=null;render();}
        },[
          e("div",{},DAYS[new Date(date+"T00:00:00").getDay()] + " " + new Date(date+"T00:00:00").getDate()),
          e("div",{style:"font-size:10px;opacity:0.8"},shift.label)
        ]));
      });
      card.appendChild(myGrid);

      if (S.swapMyShift) {
        card.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},"2️⃣ איזו משמרת תרצה לקבל?"));
        const otherShifts = [];
        Object.keys(swapSched).filter(d=>inSwapWeek(d)).sort().forEach(date=>{
          SHIFTS.forEach(sh=>{
            const empIds = swapSched[date]?.[sh.id]||[];
            empIds.forEach(empId=>{
              if(empId!==myEmpId){
                const [myDate, myShiftId] = S.swapMyShift.split("|");
                if (checkShiftConflict(date, sh.id, myEmpId, myDate, myShiftId)) return;
                if (checkShiftConflict(myDate, myShiftId, empId, date, sh.id)) return;
                otherShifts.push({date,shift:sh,empId});
              }
            });
          });
        });

        if (otherShifts.length === 0) {
          card.appendChild(e("div",{style:"color:#64748B;font-size:13px;padding:10px 0"},"אין משמרות פנויות להחלפה ללא התנגשויות."));
        } else {
          const targetGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px"});
          otherShifts.forEach(({date,shift,empId})=>{
            const key = date+"|"+shift.id+"|"+empId;
            const sel = S.swapTargetShift===key;
            const emp = getEmp(empId);
            const col = ec(empIdx(empId));
            targetGrid.appendChild(e("button",{
              style:"padding:8px 12px;border-radius:10px;border:1px solid " + (sel?col:col+"44") + ";background:" + (sel?col+"33":"#0F172A") + ";color:" + (sel?col:"#94A3B8") + ";font-family:inherit;font-size:12px;font-weight:700",
              onclick:()=>{S.swapTargetShift=sel?null:key;render();}
            },[
              e("div",{style:"font-size:10px;color:"+col},emp?.name.split(" ")[0]||"?"),
              e("div",{},DAYS[new Date(date+"T00:00:00").getDay()] + " " + new Date(date+"T00:00:00").getDate()),
              e("div",{style:"font-size:10px;opacity:0.8"},shift.label)
            ]));
          });
          card.appendChild(targetGrid);
        }
      }

      if (S.swapMyShift && S.swapTargetShift) {
        const noteInp = e("input",{class:"fi",placeholder:"הערה לבקשה (אופציונלי)",style:"margin-bottom:12px"});
        card.appendChild(noteInp);
        card.appendChild(btn("btn-add","📤 שלח בקשה לעובד השני",async()=>{
          if (!S.swapMyShift || !S.swapTargetShift) return; // הגנה
          const [myDate,myShiftId] = S.swapMyShift.split("|");
          const [tDate,tShiftId,tEmpId] = S.swapTargetShift.split("|");

          const {error} = await sb.from("swaps").insert([{
            business_id: S.profile.business_id,
            giver_id: myEmpId,
            taker_id: tEmpId,
            date: myDate,
            shift: myShiftId,
            target_date: tDate,
            target_shift: tShiftId,
            note: noteInp.value||null,
            status: "pending_peer" 
          }]);

          if(error){toast("שגיאה: " + error.message,"err");return;}
          S.swapMyShift=null;S.swapTargetShift=null;
          invalidateSwapCache();
          await loadSwapRequests();
          
          const takerEmp = getEmp(tEmpId);
          if(takerEmp?.email){
            const viewingEmp = getActiveProfile();
            sendEmail("swap_request", takerEmp.email, {
              title: "🔄 בקשת החלפה הדדית",
              requesterName: viewingEmp?.name || "עובד",
              targetDate: "החלפה: " + fmtDate(myDate) + " ⇆ " + fmtDate(tDate),
              shiftLabel: "יש לך בקשה הממתינה לאישור באפליקציה",
              note: noteInp.value||""
            });
          }
          toast("הבקשה נשלחה לעובד ✓");render();
        },{style:"width:100%"}));
      }
      wrap.appendChild(card);
    }
  }

  // ── מסירת משמרת ──
  if (S.empSwapTab === "handover") {
    const card = div("card",[e("div",{class:"card-title"},"📤 מסירת משמרת")]);
    card.appendChild(e("div",{style:"font-size:13px;color:#64748B;margin-bottom:14px"},"בחר משמרת למסירה, ואז בחר עובד. הבקשה תעבור לאישורו ואז למנהל."));

    const myHandoverShifts = [];
    Object.keys(swapSched).filter(d=>inSwapWeek(d)).sort().forEach(date=>{
      const hoDt = new Date(date+"T00:00:00");
      const hoIsWeekend = hoDt.getDay() === 5 || hoDt.getDay() === 6;
      SHIFTS.filter(sh => !(hoIsWeekend && (sh.id === "afternoon" || sh.id === "morning2"))).forEach(sh=>{
        if((swapSched[date]?.[sh.id]||[]).includes(myEmpId)){
          myHandoverShifts.push({date,shift:sh});
        }
      });
    });

    if (myHandoverShifts.length === 0) {
      card.appendChild(e("div",{style:"text-align:center;padding:20px;color:#64748B"},"אין לך משמרות בשבוע זה למסירה"));
    } else {
      card.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},"1️⃣ איזו משמרת למסור?"));
      const myGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px"});
      myHandoverShifts.forEach(({date,shift})=>{
        const key = date+"|"+shift.id;
        const sel = S.handoverShift===key;
        const dt = new Date(date+"T00:00:00");
        myGrid.appendChild(e("button",{
          style:"padding:8px 12px;border-radius:10px;border:1px solid " + (sel?shift.color:shift.color+"44") + ";background:" + (sel?shift.color+"33":"#0F172A") + ";color:" + (sel?shift.color:"#94A3B8") + ";font-family:inherit;font-size:12px;font-weight:700",
          onclick:()=>{S.handoverShift=sel?null:key;S.handoverTarget=null;render();}
        },[
          e("div",{},DAYS[dt.getDay()] + " " + dt.getDate() + "/" + (dt.getMonth()+1)),
          e("div",{style:"font-size:10px;opacity:0.8"},shift.label)
        ]));
      });
      card.appendChild(myGrid);

      if (S.handoverShift) {
        const [hDate,hShiftId] = S.handoverShift.split("|");
        card.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:8px"},"2️⃣ למי למסור? (רק למי שפנוי)"));

        const eligible = S.employees.filter(emp=>{
          if(emp.id === myEmpId) return false;
          return !checkShiftConflict(hDate, hShiftId, emp.id);
        });

        if (eligible.length === 0) {
          card.appendChild(e("div",{style:"color:#64748B;font-size:13px;padding:10px 0"},"אין עובדים פנויים לקחת את המשמרת הזו"));
        } else {
          const empGrid = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px"});
          eligible.forEach(emp=>{
            const col = ec(empIdx(emp.id));
            const sel = S.handoverTarget===emp.id;
            empGrid.appendChild(e("button",{
              style:"padding:8px 14px;border-radius:10px;border:1px solid " + (sel?col:col+"44") + ";background:" + (sel?col+"33":"#0F172A") + ";color:" + (sel?col:"#94A3B8") + ";font-family:inherit;font-size:13px;font-weight:700",
              onclick:()=>{S.handoverTarget=sel?null:emp.id;render();}
            },emp.name));
          });
          card.appendChild(empGrid);
        }
      }

      if (S.handoverShift && S.handoverTarget) {
        const noteInp2 = e("input",{class:"fi",placeholder:"הערה (אופציונלי)",style:"margin-bottom:12px"});
        card.appendChild(noteInp2);
        card.appendChild(btn("btn-add","📤 שלח לאישור העובד",async()=>{
          if (!S.handoverShift || !S.handoverTarget) return; // הגנה
          const [hDate,hShiftId] = S.handoverShift.split("|");
          const {error} = await sb.from("swaps").insert([{
            business_id: S.profile.business_id,
            giver_id: myEmpId,
            taker_id: S.handoverTarget,
            date: hDate,
            shift: hShiftId,
            note: noteInp2.value||null,
            status: "pending_peer" 
          }]);
          if(error){toast("שגיאה: " + error.message,"err");return;}
          
          const takerEmp = getEmp(S.handoverTarget);
          if(takerEmp?.email){
            const viewingEmp = getActiveProfile();
            sendEmail("swap_request", takerEmp.email, {
              title: "📤 בקשת מסירת משמרת",
              requesterName: viewingEmp?.name||"עובד",
              targetDate: fmtDate(hDate),
              shiftLabel: "ממתין לאישורך באפליקציה",
              note: noteInp2.value||""
            });
          }
          S.handoverShift=null;S.handoverTarget=null;
          await loadSwapRequests();
          toast("הבקשה נשלחה לעובד ✓");render();
        },{style:"width:100%"}));
      }
    }
    wrap.appendChild(card);
  }

  // ── הצטרפות למשמרת (ישירות למנהל) ──
  if (S.empSwapTab === "join") {
    const card = div("card",[e("div",{class:"card-title"},"➕ הצטרפות למשמרת")]);
    card.appendChild(e("div",{style:"font-size:13px;color:#64748B;margin-bottom:14px"},"כל המשמרות שאתה לא משובץ אליהן — לחץ על אחת כדי לבקש להצטרף."));

    const availableShifts = [];
    Object.keys(S.schedule).filter(d=>inSwapWeek(d)).sort().forEach(date=>{
      const joinDt = new Date(date+"T00:00:00");
      const joinIsWeekend = joinDt.getDay() === 5 || joinDt.getDay() === 6;
      SHIFTS.filter(sh => !(joinIsWeekend && (sh.id === "afternoon" || sh.id === "morning2"))).forEach(sh=>{
        const empIds = S.schedule[date]?.[sh.id]||[];
        if(!empIds.includes(myEmpId)){
            if (checkShiftConflict(date, sh.id, myEmpId)) return;
          availableShifts.push({date,shift:sh,empIds});
        }
      });
    });

    if(availableShifts.length===0){
      card.appendChild(e("div",{style:"text-align:center;padding:30px;color:#64748B"},"אין משמרות זמינות להצטרפות בשבוע זה."));
    } else {
      availableShifts.forEach(({date,shift,empIds})=>{
        const dt = new Date(date+"T00:00:00");
        card.appendChild(e("div",{style:"background:#0F172A;border:1px solid " + shift.color + "33;border-radius:12px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center"},[
          e("div",{},[
            e("div",{style:"font-weight:800;font-size:14px;color:" + shift.color},DAYS[dt.getDay()] + " " + dt.getDate() + " — " + shift.label),
            e("div",{style:"font-size:11px;color:#64748B;margin-top:3px"},
              empIds.length > 0 ? "משובצים: " + empIds.map(id=>getEmp(id)?.name.split(" ")[0]||"?").join(", ") : "אין משובצים")
          ]),
          btn("btn-sm btn-sm-blue","+ הצטרף",async()=>{
            const conflict = checkShiftConflict(date, shift.id, myEmpId);
            if (conflict) { toast(conflict,"err"); return; }

            const {error}=await sb.from("swaps").insert([{
              business_id:S.profile.business_id,
              taker_id:myEmpId,
              giver_id:null,
              date,shift:shift.id,
              status:"pending_manager"
            }]);
            if(error){toast("שגיאה: " + error.message,"err");return;}
            await loadSwapRequests();
            S.employees.filter(e=>(e.role==="admin"||e.role==="manager") && e.email).forEach(adminEmp2 => {
              const viewingEmp = getActiveProfile();
              sendEmail("swap_request",adminEmp2.email,{
                title: "➕ בקשת הצטרפות למשמרת", 
                requesterName: viewingEmp?.name || "עובד",
                targetDate: fmtDate(date),
                shiftLabel: (shift.label + " (" + shift.start + "–" + shift.end + ")"),
                note: ""
              });
            });
            toast("הבקשה נשלחה למנהל ✓");render();
          })
        ]));
      });
    }
    wrap.appendChild(card);
  }

  // ── סטטוס הבקשות שהגשתי ──
  const myReqs = S.swaps.filter(s=>s.giver_id===myEmpId||s.taker_id===myEmpId);
  if(myReqs.length>0){
    const sCard = div("card",[e("div",{style:"font-weight:700;font-size:13px;color:#64748B;margin-bottom:10px"},"⏳ הבקשות שלי")]);
    myReqs.slice(0,10).forEach(s=>{
      const sh=SHIFT_BY_ID[s.shift];
      
      let badgeClass = "pending";
      let badgeText = "ממתין";
      if (s.status === "approved") { badgeClass = "approved"; badgeText = "אושר"; }
      else if (s.status === "rejected") { badgeClass = "rejected"; badgeText = "נדחה"; }
      else if (s.status === "pending_peer") { badgeClass = "pending"; badgeText = "ממתין לעובד"; }
      else if (s.status === "pending_manager") { badgeClass = "pending"; badgeText = "ממתין למנהל"; }

      sCard.appendChild(e("div",{style:"display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0F172A"},[
        e("div",{style:"font-size:12px;color:#94A3B8"},fmtDate(s.date) + " · " + (sh?.label||s.shift)),
        e("span",{class:"status-badge status-"+badgeClass}, badgeText)
      ]));
    });
    wrap.appendChild(sCard);
  }

  return wrap;
}
