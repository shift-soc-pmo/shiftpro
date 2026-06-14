import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, getEmp, empIdx, today, render, toast } from '../utils.js';
import { SHIFTS, WEEKEND_SHIFTS, DAYS, SHIFT_LABELS, SHIFT_BY_ID, EMP_COLORS, ec, getShiftsForDate, getHoliday } from '../config.js';
import { isManager } from '../db.js';
import { runSmartSchedule } from '../scheduler.js';
import { toggleCellEmp, toggleLock, publishWeek } from '../schedule-actions.js';
import { loadSchedule } from '../db.js';

// ── SCHEDULE ──
export function viewSchedule() {
  const wd = getWeekDates(S.weekOffset);
  const wdDisplay = wd;
  const weekStart = wd[0];
  const isPublished = S.publishedWeeks.has(weekStart);
  const isInitial = S.publishedInitial?.has(weekStart);
  const hasPublish = isPublished || isInitial || S.schedPublishType?.[weekStart];
  const wrap = e("div");

  // Employee: block unpublished schedules
  if (!isManager() && !hasPublish) {
    wrap.appendChild(div("card",[
      e("div",{style:"text-align:center;padding:40px"},[
        e("div",{style:"font-size:48px;margin-bottom:12px"},"🔒"),
        e("div",{style:"font-weight:800;font-size:18px;color:#94A3B8;margin-bottom:8px"},"הסידור טרם פורסם"),
        e("div",{style:"font-size:13px;color:#64748B"},"הסידור יהיה זמין לצפייה לאחר פרסום"),
        e("div",{style:"display:flex;gap:8px;justify-content:center;margin-top:20px"},[
          btn("btn-sm btn-sm-gray","→",()=>{S.weekOffset--;loadSchedule().then(()=>render());}),
          btn("btn-sm btn-sm-blue","השבוע",()=>{S.weekOffset=0;loadSchedule().then(()=>render());}),
          btn("btn-sm btn-sm-gray","←",()=>{S.weekOffset++;loadSchedule().then(()=>render());})
        ])
      ])
    ]));
    return wrap;
  }

  // Header
  const hdr = div("section-header",[
    e("div",{},[
      div("page-title",["📅 סידור שבועי"]),
      e("div",{style:"font-size:13px;color:#64748B;margin-top:2px"},fmtDate(wd[0])+" — "+fmtDate(wd[6])),
      isPublished ? div("published-banner",["📢 פורסם"]) : null
    ]),
    e("div",{style:"display:flex;gap:8px;flex-wrap:wrap"},[
      btn("btn-sm btn-sm-gray","→",()=>{S.weekOffset--;S.selectedCell=null;loadSchedule().then(()=>render());}),
      btn("btn-sm btn-sm-blue","השבוע",()=>{S.weekOffset=0;S.selectedCell=null;loadSchedule().then(()=>render());}),
      !isManager() && S.weekOffset >= 0 && !S.publishedInitial?.has(getWeekDates(S.weekOffset+1)[0]) && !S.publishedWeeks.has(getWeekDates(S.weekOffset+1)[0]) ? null : btn("btn-sm btn-sm-gray","←",()=>{S.weekOffset++;S.selectedCell=null;loadSchedule().then(()=>render());}),
      isManager() ? btn("btn-green","⚡ שיבוץ אוטומטי",runSmartSchedule) : null,
      isManager() ? btn("btn-sm btn-sm-red","🗑️ נקה שבוע",()=>{
        if(!confirm("למחוק את כל השיבוצים של השבוע הזה?")) return;
        const wd2 = getWeekDates(S.weekOffset);
        wd2.forEach(d=>{if(S.schedule[d]) SHIFTS.forEach(sh=>{S.schedule[d][sh.id]=[];});});
        saveScheduleToDB();
        toast("השבוע נוקה ✓");render();
      }) : null,
      isManager() && !isPublished ? btn("btn-purple","📢 פרסם",()=>{S.showPublishModal=true;render();}) : null
    ])
  ]);
  wrap.appendChild(hdr);

  // Employee notes for this week (managers only)
  if (isManager()) {
    const weekSubsForNotes = (S.availSubmissions||[]).filter(s => s.week_start === weekStart && (s.note||"").trim() && getEmp(s.employee_id));
    if (weekSubsForNotes.length > 0) {
      const notesBtn = e("button",{
        style:"width:100%;background:#F59E0B18;border:1px solid #F59E0B44;color:#FCD34D;border-radius:12px;padding:12px 16px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center",
        onclick:()=>{S.showWeekNotes=!S.showWeekNotes;render();}
      },[
        e("span",{},"💬 הערות עובדים מהגשת החסימות ("+weekSubsForNotes.length+")"),
        e("span",{style:"font-size:11px"},S.showWeekNotes?"▲ הסתר":"▼ הצג")
      ]);
      wrap.appendChild(notesBtn);
      
      if (S.showWeekNotes) {
        const notesCard = div("card",[],{style:"margin-bottom:12px;border:1px solid #F59E0B33;background:#F59E0B08"});
        weekSubsForNotes.forEach(sub => {
          const emp = getEmp(sub.employee_id);
          const idx = empIdx(sub.employee_id);
          const col = ec(idx);
          notesCard.appendChild(e("div",{style:"display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #33415544"},[
            e("div",{style:"width:32px;height:32px;border-radius:8px;background:"+col+"22;border:1px solid "+col+"44;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:"+col+";flex-shrink:0"},
              emp.name.split(" ").map(n=>n[0]).join("").slice(0,2)),
            e("div",{style:"flex:1"},[
              e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:2px"},emp.name),
              e("div",{style:"font-size:12px;color:#FCD34D;font-style:italic"},"💬 "+sub.note)
            ])
          ]));
        });
        wrap.appendChild(notesCard);
      }
    }
  }

  // Mobile view toggle (week / day)
  const isDayMode = S.schedMobileView === "day";
  const mobileToggle = e("div",{class:"sched-mobile-toggle"},[
    e("button",{
      class: !isDayMode ? "active" : "",
      onclick: () => { S.schedMobileView = "week"; render(); }
    },"📅 שבוע"),
    e("button",{
      class: isDayMode ? "active" : "",
      onclick: () => { 
        S.schedMobileView = "day"; 
        if (S.schedDayIdx == null) {
          // Default: today if in this week, else first day
          const todayIdx = wd.findIndex(d => d === today());
          S.schedDayIdx = todayIdx >= 0 ? todayIdx : 0;
        }
        render(); 
      }
    },"📆 יום")
  ]);
  wrap.appendChild(mobileToggle);
  
  // Mobile day view (only shown when toggle is on day, hidden on desktop via CSS)
  if (isDayMode) {
    wrap.appendChild(viewScheduleDayMobile(wd));
    return wrap;
  }

  // Grid
  const gridCard = div("card",[],{style:"padding:8px;overflow:hidden;max-width:100%"});
  const gridWrap = div("sched-wrap");
  // Scroll hint on mobile
  gridWrap.appendChild(e("div",{style:"font-size:10px;color:#475569;text-align:center;margin-bottom:4px;display:none",class:"scroll-hint"},"← גלול לצדדים לראות את כל הימים →"));
  const tbl = e("table",{class:"sched-table"});
  const thead = e("thead");
  const hrow = e("tr",[e("th",{style:"width:90px"},"משמרת")]);
  wdDisplay.forEach(date => {
    const dt = new Date(date+"T00:00:00");
    const isToday = date === today();
    hrow.appendChild(e("th",{class:"day-header",style:isToday?"color:#60A5FA":""},[
      e("div",{style:"font-size:11px"},DAYS[dt.getDay()]),
      e("div",{style:"font-size:18px;font-weight:900;color:"+(isToday?"#60A5FA":"#E2E8F0")},String(dt.getDate())),
      getHoliday(date) ? e("div",{style:"font-size:8px;color:#FCD34D;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px"},"✡️ "+getHoliday(date)) : null
    ]));
  });
  thead.appendChild(hrow);
  tbl.appendChild(thead);

  const tbody = e("tbody");

  // ── שורת העדרויות ──
  if (isManager()) {
    const absRow = e("tr");
    absRow.appendChild(e("td",{style:"border-right:2px solid #F59E0B44;padding-right:12px"},[
      e("div",{style:"font-weight:700;font-size:12px;color:#F59E0B"},"🌴 העדרויות"),
      e("div",{style:"font-size:9px;color:#475569"},"חופשה / מילואים")
    ]));
    wdDisplay.forEach(date => {
      const td = e("td",{style:"vertical-align:top;padding:4px 2px"});
      const dayAbs = S.vacations.filter(v =>
        v.status === "approved" && v.type !== "exam" &&
        date >= v.start_date && date <= v.end_date
      );
      const dayExams = S.vacations.filter(v =>
        v.type === "exam" && v.status === "approved" &&
        date >= v.start_date && date <= v.end_date
      );
      const dayBlocks = (S.availSubmissions||[]).filter(b => b.date === date);

      if (dayAbs.length === 0 && dayExams.length === 0 && dayBlocks.length === 0) {
        td.appendChild(e("div",{style:"font-size:10px;color:#334155;text-align:center;padding:4px"},"—"));
      } else {
        dayAbs.forEach(v => {
          const emp = getEmp(v.employee_id);
          if (!emp) return;
          const icon = v.type === "reserve" ? "🎖️" : "🌴";
          td.appendChild(e("div",{style:"font-size:10px;font-weight:700;color:#F59E0B;white-space:nowrap;margin-bottom:1px"},icon+" "+emp.name.split(" ")[0]));
        });
        dayExams.forEach(v => {
          const emp = getEmp(v.employee_id);
          if (!emp) return;
          td.appendChild(e("div",{style:"font-size:10px;font-weight:700;color:#10B981;white-space:nowrap;margin-bottom:1px"},"📝 "+emp.name.split(" ")[0]));
        });
        dayBlocks.forEach(b => {
          const emp = getEmp(b.employee_id);
          const sh = SHIFT_BY_ID[b.shift];
          if (!emp) return;
          td.appendChild(e("div",{style:"font-size:9px;color:#EF4444;white-space:nowrap;margin-bottom:1px"},"🚫 "+emp.name.split(" ")[0]+(sh?" "+sh.label:"")));
        });
      }
      absRow.appendChild(td);
    });
    tbody.appendChild(absRow);
  }

  SHIFTS.forEach(shift => {
    const row = e("tr");
    row.appendChild(e("td",{style:"border-right:2px solid "+shift.color+"44;padding-right:12px"},[
      e("div",{style:"font-weight:700;font-size:13px;color:"+shift.color},shift.label),
      e("div",{style:"font-size:10px;color:#475569"},shift.start+"–"+shift.end)
    ]));
    wdDisplay.forEach(date => {
      const dayNum = new Date(date+"T00:00:00").getDay();
      const isWeekendDay = dayNum === 5 || dayNum === 6;
      // On Fri/Sat skip afternoon
      if (isWeekendDay && (shift.id === "afternoon" || shift.id === "morning2")) {
        row.appendChild(e("td",{style:"background:#0F172A44;cursor:default"},[
          e("div",{style:"font-size:9px;color:#334155;text-align:center;padding:10px 0"},"—")
        ]));
        return;
      }
      const empIds = S.schedule[date]?.[shift.id] || [];
      const isSel = S.selectedCell?.date===date && S.selectedCell?.shift===shift.id;
      const canEdit = isManager();
      const _isTouchDev = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const tdProps = {
        class: isSel ? "selected" : "",
        style: "--shift-color:"+shift.color+(canEdit?";cursor:pointer":";cursor:default"),
        onclick: () => {
          if (!canEdit) return;
          S.selectedCell = isSel ? null : {date, shift:shift.id};
          render();
        }
      };
      // Drag & drop target (desktop only)
      if (canEdit && !_isTouchDev) {
        tdProps.ondragover = (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          ev.currentTarget.style.background = shift.color + "22";
          ev.currentTarget.style.outline = "2px dashed " + shift.color;
        };
        tdProps.ondragleave = (ev) => {
          // Only clear if leaving the cell entirely (not entering child element)
          if (!ev.currentTarget.contains(ev.relatedTarget)) {
            ev.currentTarget.style.background = "";
            ev.currentTarget.style.outline = "";
          }
        };
        tdProps.ondrop = async (ev) => {
          ev.preventDefault();
          ev.currentTarget.style.background = "";
          ev.currentTarget.style.outline = "";
          try {
            const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
            const { empId, fromDate, fromShift } = data;
            // Same cell - do nothing
            if (fromDate === date && fromShift === shift.id) return;
            // Check if employee is already in target cell
            const targetIds = S.schedule[date]?.[shift.id] || [];
            if (targetIds.includes(empId)) {
              toast("העובד כבר משובץ למשמרת הזאת","err");
              return;
            }
            // Remove from source
            if (S.schedule[fromDate] && S.schedule[fromDate][fromShift]) {
              S.schedule[fromDate][fromShift] = S.schedule[fromDate][fromShift].filter(id => id !== empId);
            }
            // Add to target
            if (!S.schedule[date]) S.schedule[date] = {};
            if (!S.schedule[date][shift.id]) S.schedule[date][shift.id] = [];
            S.schedule[date][shift.id].push(empId);
            
            // Move custom hours and notes if exist
            const oldChKey = fromDate+"|"+fromShift+"|"+empId;
            const newChKey = date+"|"+shift.id+"|"+empId;
            if (S.customHours[oldChKey]) {
              S.customHours[newChKey] = S.customHours[oldChKey];
              delete S.customHours[oldChKey];
            }
            const oldNoteKey = fromDate+"|"+fromShift+"|"+empId;
            const newNoteKey = date+"|"+shift.id+"|"+empId;
            if (S.assignmentNotes[oldNoteKey]) {
              S.assignmentNotes[newNoteKey] = S.assignmentNotes[oldNoteKey];
              delete S.assignmentNotes[oldNoteKey];
            }
            
            invalidateMemo && invalidateMemo();
            render();
            saveScheduleToDB();
            if (typeof logAction === "function") {
              logAction("drag_drop_move", { empId, from:{date:fromDate,shift:fromShift}, to:{date,shift:shift.id} });
            }
            toast("הועבר ✓");
          } catch (err) {
            console.error("Drag drop error:", err);
          }
        };
      }
      const td = e("td", tdProps);
      if (empIds.length === 0) {
        td.appendChild(div("cell-empty",["ריק"]));
      } else {
        empIds.forEach(empId => {
          const emp = getEmp(empId);
          if (!emp) return;
          const i = empIdx(empId);
          const col = ec(i);
          const ch = S.customHours[date+"|"+shift.id+"|"+empId];
          const isFilteredOut = S.schedFilter && S.schedFilter !== empId;
          const isHighlighted = S.schedFilter && S.schedFilter === empId;
          const chipProps = {class:"emp-chip",
            style:`background:${isHighlighted?col+"44":col+"22"};border:${isHighlighted?"2px":"1px"} solid ${isHighlighted?col:col+"44"};color:${col};opacity:${isFilteredOut?"0.2":"1"};${isHighlighted?"box-shadow:0 0 8px "+col+"44;":""};cursor:${isManager()?"grab":"default"}`
          };
          // Drag & drop only on desktop (not touch devices)
          const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
          if (isManager() && !isTouchDevice) {
            chipProps.draggable = "true";
            chipProps.ondragstart = (ev) => {
              ev.dataTransfer.setData("text/plain", JSON.stringify({empId:empId, fromDate:date, fromShift:shift.id}));
              ev.dataTransfer.effectAllowed = "move";
              ev.dataTransfer.dropEffect = "move";
              setTimeout(()=>{if(ev.target.style)ev.target.style.opacity="0.3";}, 0);
            };
            chipProps.ondragend = (ev) => { ev.target.style.opacity=""; };
          }
          // Parse note for tags and free text
          const noteKey = date+"|"+shift.id+"|"+empId;
          const rawNote = S.assignmentNotes[noteKey] || "";
          let chipTags = [];
          let chipNoteText = "";
          if (rawNote.startsWith("🏷️ ")) {
            const parts = rawNote.split(" | ");
            chipTags = parts[0].replace("🏷️ ","").split(", ").map(t=>t.trim()).filter(Boolean);
            chipNoteText = parts.slice(1).join(" | ");
          } else if (rawNote) {
            chipNoteText = rawNote;
          }
          
          const chip = e("div",chipProps,[
            // Name row with color dot
            e("div",{class:"emp-chip-row"},[
              e("span",{style:`width:6px;height:6px;border-radius:50%;background:${col};flex-shrink:0`},""),
              e("span",{style:"font-weight:700"},emp.name.split(" ")[0])
            ]),
            // Hours (custom or default)
            ch ? e("div",{class:"emp-chip-hours"},`⏰ ${ch.start}-${ch.end}`) : null,
            // System tags
            chipTags.length > 0 ? e("div",{class:"emp-chip-tags"},
              chipTags.map(t => e("span",{class:"emp-chip-tag"},"🏷️ "+t))
            ) : null,
            // Free-text note
            chipNoteText ? e("div",{class:"emp-chip-note"},"📝 "+chipNoteText) : null
          ]);
          td.appendChild(chip);
        });
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  tbl.appendChild(tbody);
  gridWrap.appendChild(tbl);
  gridCard.appendChild(gridWrap);
  wrap.appendChild(gridCard);

  // Cell editor
  if (S.selectedCell) {
    wrap.appendChild(viewCellEditor(S.selectedCell.date, S.selectedCell.shift));
  }

  // Workload
  wrap.appendChild(viewWorkload(wd));
  return wrap;
}

export function viewScheduleDayMobile(wd) {
  const wrap = e("div",{class:"sched-day-view",style:"display:block"});
  if (S.schedDayIdx == null || S.schedDayIdx < 0 || S.schedDayIdx > 6) S.schedDayIdx = 0;
  const date = wd[S.schedDayIdx];
  const dt = new Date(date+"T00:00:00");
  const isToday = date === today();
  const holiday = getHoliday(date);
  
  // Navigation row
  const navRow = e("div",{class:"sched-day-nav"},[
    btn("btn-sm btn-sm-gray","→",()=>{
      if (S.schedDayIdx > 0) { S.schedDayIdx--; render(); }
      else { 
        // Go to previous week's Saturday
        S.weekOffset--; S.schedDayIdx = 6; 
        loadSchedule().then(()=>render());
      }
    }),
    e("div",{style:"flex:1;text-align:center"},[
      e("div",{style:"font-weight:800;font-size:15px;color:"+(isToday?"#60A5FA":"#E2E8F0")},
        DAYS[dt.getDay()] + " " + dt.getDate() + "/" + (dt.getMonth()+1) + "/" + dt.getFullYear()),
      isToday ? e("div",{style:"font-size:10px;color:#60A5FA;font-weight:700;margin-top:2px"},"היום") : null,
      holiday ? e("div",{style:"font-size:10px;color:#FCD34D;font-weight:700;margin-top:2px"},"✡️ "+holiday) : null
    ]),
    btn("btn-sm btn-sm-gray","←",()=>{
      if (S.schedDayIdx < 6) { S.schedDayIdx++; render(); }
      else { 
        // Go to next week's Sunday
        S.weekOffset++; S.schedDayIdx = 0; 
        loadSchedule().then(()=>render());
      }
    })
  ]);
  wrap.appendChild(navRow);
  
  // Today shortcut
  if (!isToday) {
    wrap.appendChild(e("div",{style:"text-align:center;margin-bottom:10px"},[
      btn("btn-sm btn-sm-blue","← היום",()=>{
        const todayStr = today();
        const todayDt = new Date(todayStr+"T00:00:00");
        const curWeekStart = new Date(wd[0]+"T00:00:00");
        // Calculate offset from current week
        const diffMs = todayDt - curWeekStart;
        const diffDays = Math.floor(diffMs / (1000*60*60*24));
        if (diffDays >= 0 && diffDays < 7) {
          // In this week
          S.schedDayIdx = diffDays;
          render();
        } else {
          S.weekOffset = 0;
          S.schedDayIdx = todayDt.getDay();
          loadSchedule().then(()=>render());
        }
      })
    ]));
  }
  
  // Day card with shifts
  const dayCard = e("div",{class:"sched-day-card"});
  
  // Get absences for this day (managers only)
  if (isManager()) {
    const dayAbs = S.vacations.filter(v =>
      v.status === "approved" && v.type !== "exam" &&
      date >= v.start_date && date <= v.end_date
    );
    const dayExams = S.vacations.filter(v =>
      v.type === "exam" && v.status === "approved" &&
      date >= v.start_date && date <= v.end_date
    );
    const dayBlocks = (S.availSubmissions||[]).filter(b => 
      (b.slots||[]).some(sl => sl.date === date)
    );
    
    if (dayAbs.length > 0 || dayExams.length > 0 || dayBlocks.length > 0) {
      const absSection = e("div",{style:"padding:10px 14px;background:#F59E0B11;border-bottom:1px solid #334155"});
      absSection.appendChild(e("div",{style:"font-weight:700;font-size:12px;color:#F59E0B;margin-bottom:6px"},"🌴 העדרויות וחסימות"));
      dayAbs.forEach(v => {
        const emp = getEmp(v.employee_id);
        if (!emp) return;
        const icon = v.type === "reserve" ? "🎖️" : "🌴";
        absSection.appendChild(e("div",{style:"font-size:11px;color:#F59E0B;margin-bottom:2px"}, icon+" "+emp.name));
      });
      dayExams.forEach(v => {
        const emp = getEmp(v.employee_id);
        if (!emp) return;
        absSection.appendChild(e("div",{style:"font-size:11px;color:#10B981;margin-bottom:2px"}, "📝 "+emp.name));
      });
      dayBlocks.forEach(b => {
        (b.slots||[]).filter(sl => sl.date === date).forEach(sl => {
          const emp = getEmp(b.employee_id);
          const sh = SHIFT_BY_ID[sl.shift];
          if (!emp || !sh) return;
          absSection.appendChild(e("div",{style:"font-size:11px;color:#EF4444;margin-bottom:2px"}, "🚫 "+emp.name+" — "+sh.label));
        });
      });
      dayCard.appendChild(absSection);
    }
  }
  
  // Shifts for this day
  const dayShifts = getShiftsForDate(date);
  dayShifts.forEach(shift => {
    const empIds = S.schedule[date]?.[shift.id] || [];
    const isSel = S.selectedCell?.date===date && S.selectedCell?.shift===shift.id;
    
    const shiftRow = e("div",{
      class:"sched-day-shift-row",
      style: "padding:12px 14px;cursor:"+(isManager()?"pointer":"default")+";border-bottom:1px solid #0F172A;background:"+(isSel?"rgba(59,130,246,0.08)":"transparent")+";border-right:3px solid "+(isSel?shift.color:"transparent"),
      onclick: () => {
        if (!isManager()) return;
        S.selectedCell = isSel ? null : {date, shift:shift.id};
        render();
      }
    });
    
    // Shift label + hours
    shiftRow.appendChild(e("div",{class:"sched-day-shift-label",style:"color:"+shift.color},[
      e("div",{},shift.label),
      e("div",{class:"sched-day-shift-hours"},shift.start+"–"+shift.end)
    ]));
    
    // Employees in this shift
    const empsDiv = e("div",{class:"sched-day-shift-emps"});
    if (empIds.length === 0) {
      empsDiv.appendChild(e("div",{style:"color:#475569;font-size:12px;font-style:italic"},"— ריק —"));
    } else {
      empIds.forEach(empId => {
        const emp = getEmp(empId);
        if (!emp) return;
        const idx = empIdx(empId);
        const col = ec(idx);
        const ch = S.customHours[date+"|"+shift.id+"|"+empId];
        const noteKey = date+"|"+shift.id+"|"+empId;
        const rawNote = S.assignmentNotes[noteKey] || "";
        let chipTags = [];
        let chipNoteText = "";
        if (rawNote.startsWith("🏷️ ")) {
          const parts = rawNote.split(" | ");
          chipTags = parts[0].replace("🏷️ ","").split(", ").map(t=>t.trim()).filter(Boolean);
          chipNoteText = parts.slice(1).join(" | ");
        } else if (rawNote) {
          chipNoteText = rawNote;
        }
        
        empsDiv.appendChild(e("div",{
          style:"background:"+col+"18;border:1px solid "+col+"44;border-radius:8px;padding:8px 10px"
        },[
          e("div",{style:"display:flex;align-items:center;gap:6px"},[
            e("span",{style:"width:8px;height:8px;border-radius:50%;background:"+col+";flex-shrink:0"},""),
            e("span",{style:"font-weight:700;font-size:13px;color:"+col},emp.name)
          ]),
          ch ? e("div",{style:"font-size:11px;color:#94A3B8;margin-top:3px"},"⏰ "+ch.start+"–"+ch.end) : null,
          chipTags.length > 0 ? e("div",{style:"display:flex;flex-wrap:wrap;gap:3px;margin-top:4px"},
            chipTags.map(t => e("span",{style:"background:rgba(255,255,255,0.08);font-size:10px;padding:2px 7px;border-radius:6px;color:#E2E8F0"},"🏷️ "+t))
          ) : null,
          chipNoteText ? e("div",{style:"font-size:10px;color:#F59E0B;margin-top:3px;font-style:italic"},"📝 "+chipNoteText) : null
        ]));
      });
    }
    shiftRow.appendChild(empsDiv);
    dayCard.appendChild(shiftRow);
  });
  wrap.appendChild(dayCard);
  
  // Cell editor (if a cell is selected)
  if (S.selectedCell && S.selectedCell.date === date) {
    wrap.appendChild(viewCellEditor(S.selectedCell.date, S.selectedCell.shift));
  }
  
  return wrap;
}

export function viewCellEditor(date, shiftId) {
  const shift = SHIFT_BY_ID[shiftId];
  const assignedIds = S.schedule[date]?.[shiftId] || [];
  const editor = div("cell-editor");
  editor.appendChild(e("div",{class:"cell-editor-title"},`✏️ ${shift.label} — ${fmtDate(date)}`));

  const btnWrap = e("div");
  S.employees.forEach((emp, idx) => {
    const col = ec(idx);
    const onVac = S.vacations.some(v=>v.employee_id===emp.id&&v.status==="approved"&&date>=v.start_date&&date<=v.end_date);
    const isAssigned = assignedIds.includes(emp.id);
    const locked = S.lockedSlots[date+"|"+shiftId]?.has(emp.id);

    const chip = e("button",{
      class:"cell-emp-btn"+(isAssigned?" assigned":""),
      style:`background:${isAssigned?col+"33":"#0F172A"};border:1px solid ${isAssigned?col:col+"44"};color:${col};opacity:${onVac?0.4:1}`,
      disabled: onVac,
      onclick: () => toggleCellEmp(date, shiftId, emp.id)
    },[
      e("span",{style:`width:7px;height:7px;border-radius:50%;background:${col}`},""),
      e("span",{},emp.name),
      onVac ? e("span",{},"🌴") : null,
      locked ? e("span",{},"🔒") : null
    ]);
    btnWrap.appendChild(chip);

    if (isAssigned) {
      // Lock button
      const lockBtn = e("button",{
        class:"btn-icon",
        title: locked?"שחרר נעילה":"נעל שיבוץ",
        style:"margin-right:-8px;margin-left:4px",
        onclick: (ev) => { ev.stopPropagation(); toggleLock(date,shiftId,emp.id); }
      }, locked?"🔒":"🔓");
      btnWrap.appendChild(lockBtn);

      // Custom hours button
      const chKey = date+"|"+shiftId+"|"+emp.id;
      const existingCh = S.customHours[chKey];
      // Note button
      const noteKey = date+"|"+shiftId+"|"+emp.id;
      const existingNote = S.assignmentNotes[noteKey];
      const noteBtn = e("button",{
        class:"btn-icon",
        title:"הערה",
        style:"margin-right:-8px;margin-left:4px;font-size:12px;color:"+(existingNote?"#F59E0B":"#475569"),
        onclick: (ev) => {
          ev.stopPropagation();
          const editorId = "note-editor-"+noteKey.replace(/[|]/g,"_");
          const existingEditor = document.getElementById(editorId);
          if (existingEditor) { existingEditor.remove(); return; }
          
          // Parse existing note - separate system tags from free text
          // Format: "🏷️ Sys1, Sys2 | free text" or just plain
          let existingTags = [];
          let existingText = "";
          if (existingNote) {
            const parts = existingNote.split(" | ");
            if (parts[0].startsWith("🏷️ ")) {
              existingTags = parts[0].replace("🏷️ ","").split(", ").filter(x=>x.trim());
              existingText = parts.slice(1).join(" | ");
            } else {
              existingText = existingNote;
            }
          }
          
          const selectedTags = new Set(existingTags);
          const editorDiv = e("div",{
            id:editorId,
            style:"display:flex;flex-direction:column;gap:8px;background:#0F172A;border:1px solid #334155;border-radius:10px;padding:10px;margin:4px;width:100%;max-width:380px"
          });
          
          // System chips picker
          const systems = S.systems || [];
          if (systems.length > 0) {
            editorDiv.appendChild(e("div",{style:"font-size:10px;color:#64748B;font-weight:700"},"🏷️ בחר מערכות:"));
            const chipsRow = e("div",{style:"display:flex;flex-wrap:wrap;gap:4px"});
            systems.forEach(sys => {
              const isSel = selectedTags.has(sys);
              const chipBtn = e("button",{
                "data-sys":sys,
                style:`padding:4px 10px;border-radius:14px;border:1px solid ${isSel?"#3B82F6":"#334155"};background:${isSel?"#3B82F644":"#1E293B"};color:${isSel?"#60A5FA":"#94A3B8"};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit`,
                onclick:(ev2)=>{
                  ev2.stopPropagation();
                  if (selectedTags.has(sys)) selectedTags.delete(sys);
                  else selectedTags.add(sys);
                  // Re-style this chip
                  const newSel = selectedTags.has(sys);
                  ev2.target.style.background = newSel?"#3B82F644":"#1E293B";
                  ev2.target.style.color = newSel?"#60A5FA":"#94A3B8";
                  ev2.target.style.borderColor = newSel?"#3B82F6":"#334155";
                }
              }, sys);
              chipsRow.appendChild(chipBtn);
            });
            editorDiv.appendChild(chipsRow);
          } else {
            editorDiv.appendChild(e("div",{style:"font-size:10px;color:#475569;font-style:italic"},"💡 הוסף מערכות בהגדרות לבחירה מהירה"));
          }
          
          // Free text input
          editorDiv.appendChild(e("div",{style:"font-size:10px;color:#64748B;font-weight:700;margin-top:4px"},"💬 הערה חופשית:"));
          const textInp = e("input",{
            type:"text",
            value:existingText,
            placeholder:"הערה (אופציונלי)",
            style:"background:#1E293B;border:1px solid #334155;border-radius:6px;color:#E2E8F0;font-size:13px;padding:6px 10px;font-family:inherit;width:100%;box-sizing:border-box",
            id:"note-inp-"+noteKey.replace(/[|]/g,"_")
          });
          editorDiv.appendChild(textInp);
          
          // Action buttons
          const btnRow = e("div",{style:"display:flex;gap:6px"});
          btnRow.appendChild(e("button",{
            style:"flex:1;background:#10B98122;border:1px solid #10B98144;color:#10B981;border-radius:6px;padding:6px 12px;font-size:12px;font-family:inherit;font-weight:700;cursor:pointer",
            onclick:(ev2)=>{
              ev2.stopPropagation();
              const txt = document.getElementById("note-inp-"+noteKey.replace(/[|]/g,"_")).value.trim();
              const tags = Array.from(selectedTags);
              let combined = "";
              if (tags.length > 0 && txt) combined = "🏷️ " + tags.join(", ") + " | " + txt;
              else if (tags.length > 0) combined = "🏷️ " + tags.join(", ");
              else combined = txt;
              if (combined) S.assignmentNotes[noteKey] = combined;
              else delete S.assignmentNotes[noteKey];
              saveScheduleToDB();
              toast("הערה נשמרה ✓");
              render();
            }
          },"💾 שמור"));
          btnRow.appendChild(e("button",{
            style:"background:#EF444422;border:1px solid #EF444444;color:#EF4444;border-radius:6px;padding:6px 12px;font-size:12px;font-family:inherit;font-weight:700;cursor:pointer",
            onclick:(ev2)=>{
              ev2.stopPropagation();
              delete S.assignmentNotes[noteKey];
              saveScheduleToDB();
              toast("הערה הוסרה");
              render();
            }
          },"מחק"));
          btnRow.appendChild(e("button",{
            style:"background:#64748B22;border:1px solid #64748B44;color:#94A3B8;border-radius:6px;padding:6px 12px;font-size:12px;font-family:inherit;font-weight:700;cursor:pointer",
            onclick:(ev2)=>{
              ev2.stopPropagation();
              document.getElementById(editorId)?.remove();
            }
          },"ביטול"));
          editorDiv.appendChild(btnRow);
          
          btnWrap.appendChild(editorDiv);
        }
      }, existingNote?"📝":"💬");
      btnWrap.appendChild(noteBtn);

      const hoursBtn = e("button",{
        class:"btn-icon",
        title:"ערוך שעות",
        style:"margin-right:-8px;margin-left:4px;font-size:12px;color:#94A3B8",
        onclick: (ev) => {
          ev.stopPropagation();
          const sh = SHIFT_BY_ID[shiftId];
          const curStart = existingCh?.start || sh.start;
          const curEnd = existingCh?.end || sh.end;
          // Show inline editor
          const existingEditor = document.getElementById("hours-editor-"+chKey.replace(/[|]/g,"_"));
          if (existingEditor) { existingEditor.remove(); return; }
          const editorDiv = e("div",{
            id:"hours-editor-"+chKey.replace(/[|]/g,"_"),
            style:"display:inline-flex;align-items:center;gap:6px;background:#0F172A;border:1px solid #334155;border-radius:8px;padding:6px 10px;margin:4px"
          },[
            e("span",{style:"font-size:11px;color:#94A3B8"},emp.name.split(" ")[0]+":"),
            e("input",{type:"time",value:curStart,style:"background:#1E293B;border:1px solid #334155;border-radius:6px;color:#E2E8F0;font-size:12px;padding:3px 6px;font-family:inherit",
              id:"ch-start-"+chKey.replace(/[|]/g,"_")}),
            e("span",{style:"color:#475569;font-size:11px"},"—"),
            e("input",{type:"time",value:curEnd,style:"background:#1E293B;border:1px solid #334155;border-radius:6px;color:#E2E8F0;font-size:12px;padding:3px 6px;font-family:inherit",
              id:"ch-end-"+chKey.replace(/[|]/g,"_")}),
            e("button",{
              style:"background:#10B98122;border:1px solid #10B98144;color:#10B981;border-radius:6px;padding:3px 8px;font-size:11px;font-family:inherit;font-weight:700",
              onclick:(ev2)=>{
                ev2.stopPropagation();
                const s=document.getElementById("ch-start-"+chKey.replace(/[|]/g,"_")).value;
                const en=document.getElementById("ch-end-"+chKey.replace(/[|]/g,"_")).value;
                if(s&&en){S.customHours[chKey]={start:s,end:en};saveScheduleToDB();toast("שעות עודכנו ✓");render();}
              }
            },"שמור"),
            e("button",{
              style:"background:#EF444422;border:1px solid #EF444444;color:#EF4444;border-radius:6px;padding:3px 8px;font-size:11px;font-family:inherit;font-weight:700",
              onclick:(ev2)=>{
                ev2.stopPropagation();
                delete S.customHours[chKey];saveScheduleToDB();toast("שעות אופסו");render();
              }
            },"אפס")
          ]);
          btnWrap.appendChild(editorDiv);
        }
      }, "⏰");
      btnWrap.appendChild(hoursBtn);
    }
  });
  editor.appendChild(btnWrap);
  return editor;
}

export function viewWorkload(wd) {
  const counts = {};
  S.employees.forEach(emp => { counts[emp.id] = 0; });
  wd.forEach(d => SHIFTS.forEach(sh => {
    (S.schedule[d]?.[sh.id]||[]).forEach(id => { counts[id] = (counts[id]||0)+1; });
  }));

  if (!S.schedFilter) S.schedFilter = null;
  const card = div("card",[
    e("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"},[
      e("div",{class:"card-title",style:"margin-bottom:0"},"עומס עובדים — השבוע"),
      S.schedFilter ? btn("btn-sm btn-sm-gray","✕ הסר פילטר",()=>{S.schedFilter=null;render();}) : null
    ])
  ]);
  S.employees.forEach((emp, idx) => {
    const count = counts[emp.id]||0;
    const max = emp.max_shifts_per_week||5;
    const pct = Math.min(Math.round((count/max)*100),100);
    const over = count > max;
    const col = ec(idx);
    const barColor = over?"#EF4444":pct>80?"#F59E0B":"#10B981";
    const isFiltered = S.schedFilter === emp.id;
    card.appendChild(div("workload-row",[
      div("workload-info",[
        e("div",{style:"display:flex;align-items:center;gap:7px;cursor:pointer",onclick:()=>{S.schedFilter=isFiltered?null:emp.id;render();}},[
          e("span",{style:`width:8px;height:8px;border-radius:50%;background:${col}`},""),
          e("span",{style:"font-size:13px;font-weight:"+(isFiltered?"800":"600")+";color:"+(isFiltered?"#60A5FA":"#E2E8F0")},emp.name),
          isFiltered ? e("span",{style:"font-size:10px;background:#3B82F622;color:#60A5FA;border:1px solid #3B82F644;border-radius:4px;padding:1px 5px"},"מסונן") : null,
          over ? e("span",{style:"font-size:10px;background:#EF444422;color:#EF4444;border:1px solid #EF444444;border-radius:4px;padding:1px 5px"},"חריגה!") : null
        ]),
        e("span",{style:"font-size:12px;color:"+(over?"#EF4444":"#94A3B8")},`${count}/${max}`)
      ]),
      div("workload-bar-bg",[
        e("div",{class:"workload-bar-fill",style:`width:${pct}%;background:${isFiltered?"#3B82F6":barColor}`})
      ])
    ]));
  });
  return card;
}
