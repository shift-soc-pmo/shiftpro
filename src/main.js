import { S } from './state.js';
import { e, div, btn, setRenderFn, toast, getWeekDates, fmtDate } from './utils.js';
import { DAYS } from './config.js';
import { checkAuth } from './auth.js';
import { isManager, loadSchedule, loadAll, loadAvailSubmissions, loadSwapRequests, loadVacations, loadEmployees, setPostLoadFn } from './db.js';
import { setupRealtime } from './realtime.js';
import { setSchedulerDeps } from './scheduler.js';
import { setScheduleActionsDeps } from './schedule-actions.js';
import { setEmployeesDeps } from './employees.js';
import { setVacationsDeps } from './vacations.js';
import { setSwapsDeps } from './swaps.js';
import { setAvailabilityDeps } from './availability.js';
import { sendEmail } from './notifications.js';

// UI views
import { viewLoading, viewLogin } from './ui/login.js';
import { viewHeader } from './ui/header.js';
import { viewHome } from './ui/home.js';
import { viewSchedule } from './ui/schedule.js';
import { viewEmployees } from './ui/employees-view.js';
import { viewVacations } from './ui/vacations-view.js';
import { viewSwaps } from './ui/swaps-view.js';
import { viewStats } from './ui/stats.js';
import { viewEmpView, setEmpViewDeps, setEmpViewImports } from './ui/empview.js';
import { viewConstraintsModal, viewInviteModal, viewExportModal, viewPublishModal, setModalsDeps } from './ui/modals.js';
import { viewSettings, setSettingsDeps } from './ui/settings.js';
import { viewEmpVacations, viewCalendar, viewEmpSettings, viewManagerBlocks, viewQualifications, setMiscDeps } from './ui/misc.js';

// ── RENDER ──
function $(id) { return document.getElementById(id); }

function render() {
  const app = $("app");
  app.innerHTML = "";

  if (S.view==="loading") { app.appendChild(viewLoading()); return; }
  if (S.view==="login")   { app.appendChild(viewLogin()); }
  else {
    const appWrap = div("app");
    appWrap.appendChild(viewHeader());
    const main = div("main");

    if (S.view==="home")       main.appendChild(viewHome());
    else if(S.view==="schedule")  main.appendChild(viewSchedule());
    else if(S.view==="calendar")  main.appendChild(viewCalendar());
    else if(S.view==="employees" && isManager()) main.appendChild(viewEmployees());
    else if(S.view==="employees" && !isManager()) { S.view="empview"; main.appendChild(viewEmpView()); }
    else if(S.view==="manager_blocks" && isManager()) main.appendChild(viewManagerBlocks());
    else if(S.view==="vacations" && !isManager()) { S.empViewTab="vacation"; main.appendChild(viewEmpView()); }
    else if(S.view==="vacations") main.appendChild(viewVacations());
    else if(S.view==="swaps" && !isManager()) { S.empViewTab="swaps_emp"; main.appendChild(viewEmpView()); }
    else if(S.view==="swaps")     main.appendChild(viewSwaps());
    else if(S.view==="stats")     main.appendChild(viewStats());
    else if(S.view==="blocks")    { S.empViewTab="avail"; main.appendChild(viewEmpView()); }
    else if(S.view==="emp_settings") main.appendChild(viewEmpSettings());
    else if(S.view==="empview")   main.appendChild(viewEmpView());
    else if(S.view==="settings")  main.appendChild(viewSettings());
    else if(S.view==="qualifications" && isManager())  main.appendChild(viewQualifications());

    appWrap.appendChild(main);
    app.appendChild(appWrap);

    // Modals
    if(S.constraintsEmp) app.appendChild(viewConstraintsModal());
    if(S.showPublishModal) app.appendChild(viewPublishModal());
    if(S.showExportModal) app.appendChild(viewExportModal());
  }

  // Mobile bottom nav
  if (S.view !== "login" && S.view !== "loading") {
    const pendingVacs2 = S.vacations.filter(v=>v.status==="pending").length;
    const bottomNav = e("div",{class:"mobile-bottom-nav",style:"overflow-x:auto;-webkit-overflow-scrolling:touch"});
    const isEmpOnly = S.profile?.role === "employee";
    const bottomTabs = isEmpOnly ? [
      {id:"empview",icon:"📋",label:"שלי"},
      {id:"schedule",icon:"📅",label:"סידור"},
      {id:"blocks",icon:"🚫",label:"חסימות"},
      {id:"vacations",icon:"🌴",label:"העדרויות"},
      {id:"swaps_nav",icon:"🔄",label:"חילופים"},
      {id:"emp_settings",icon:"⚙️",label:"הגדרות"},
    ] : [
      {id:"home",icon:"🏠",label:"בית"},
      {id:"schedule",icon:"📅",label:"סידור"},
      {id:"employees",icon:"👥",label:"עובדים"},
      {id:"manager_blocks",icon:"🚫",label:"חסימות"},
      {id:"qualifications",icon:"🎯",label:"כשירות"},
      {id:"vacations",icon:"🌴",label:"העדרויות",badge:pendingVacs2},
      {id:"swaps",icon:"🔄",label:"חילופים"},
      {id:"settings",icon:"⚙️",label:"הגדרות"},
    ];
    bottomTabs.forEach(t => {
      const isActive = S.view===t.id;
      const btn2 = e("button",{
        style:`flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 4px 8px;border:none;border-top:2px solid ${isActive?"#3B82F6":"transparent"};background:transparent;color:${isActive?"#3B82F6":"#64748B"};font-family:inherit;cursor:pointer;position:relative;min-height:56px;transition:color 0.15s`,
        onclick:()=>{
          if(t.id==="swaps_nav"){S.view="empview";S.empViewTab="swaps_emp";S.selectedCell=null;render();}
          else if(t.id==="empview"){S.view="empview";S.empViewTab="shifts";S.selectedCell=null;render();}
          else{S.view=t.id;S.selectedCell=null;render();}
        }
      },[
        t.badge>0?e("span",{style:"position:absolute;top:6px;right:calc(50% - 16px);background:#EF4444;color:white;border-radius:50%;width:14px;height:14px;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center"},String(t.badge)):null,
        e("span",{style:"font-size:22px;line-height:1"},t.icon),
        e("span",{style:`font-size:10px;font-weight:${isActive?"700":"500"};margin-top:1px`},t.label)
      ]);
      bottomNav.appendChild(btn2);
    });
    app.appendChild(bottomNav);
  }

  // Toast
  if(S.toast) {
    app.appendChild(e("div",{class:"toast"+(S.toast.type==="err"?" err":"")},S.toast.msg));
  }
}

// ── SWIPE GESTURES ──
let _touchStartX = null, _touchStartY = null;

function setupSwipeGestures() {
  document.removeEventListener("touchstart", _onTouchStart);
  document.removeEventListener("touchend", _onTouchEnd);
  document.addEventListener("touchstart", _onTouchStart, {passive:true});
  document.addEventListener("touchend", _onTouchEnd, {passive:true});
}

function _onTouchStart(ev) {
  if (ev.touches.length !== 1) return;
  _touchStartX = ev.touches[0].clientX;
  _touchStartY = ev.touches[0].clientY;
}

function _onTouchEnd(ev) {
  if (_touchStartX == null) return;
  const dx = ev.changedTouches[0].clientX - _touchStartX;
  const dy = ev.changedTouches[0].clientY - _touchStartY;
  _touchStartX = null;
  if (Math.abs(dx) < 80 || Math.abs(dy) > 50) return;
  const t = ev.target;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "SELECT") return;
  if (t.closest(".modal,.bottom-sheet,.emp-chip,.shift-cell")) return;

  if (S.view === "schedule") {
    if (S.schedMobileView === "day") {
      if (dx > 0) {
        if (S.schedDayIdx < 6) { S.schedDayIdx++; render(); }
        else { S.weekOffset++; S.schedDayIdx = 0; loadSchedule().then(()=>render()); }
      } else {
        if (S.schedDayIdx > 0) { S.schedDayIdx--; render(); }
        else { S.weekOffset--; S.schedDayIdx = 6; loadSchedule().then(()=>render()); }
      }
    } else {
      if (dx > 0) { S.weekOffset++; loadSchedule().then(()=>render()); }
      else { S.weekOffset--; loadSchedule().then(()=>render()); }
    }
  } else if (S.view === "calendar") {
    if (dx > 0) { S.monthOffset++; render(); }
    else { S.monthOffset--; render(); }
  } else if (S.view === "empview" && S.empViewTab === "schedule") {
    if (dx > 0) { S.weekOffset++; loadSchedule().then(()=>render()); }
    else { S.weekOffset--; loadSchedule().then(()=>render()); }
  }
}

// ── AUTO-REMINDER CHECK ──
async function checkAutoReminder() {
  if (!isManager()) return;
  const biz = S.business;
  if (!biz) return;
  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");

  if (biz.reminder_day == null) return;
  if (now.getDay() !== biz.reminder_day) return;
  if (currentTime < (biz.reminder_time||"09:00")) return;
  const sentKey = "reminder_sent_"+now.getDay()+"_"+getWeekDates(1)[0];
  if (localStorage.getItem(sentKey)) return;
  const nextWD = getWeekDates(1);
  const sub = S.availSubmissions.filter(s=>s.week_start===nextWD[0]).map(s=>s.employee_id);
  const notSub = S.employees.filter(emp=>!sub.includes(emp.id)&&emp.email&&emp.role!=="admin"&&emp.role!=="manager");
  if (notSub.length===0) return;
  for (const emp of notSub) {
    const adlDay = S.business?.deadline_day;
    const adlTime = S.business?.deadline_time || "20:00";
    const adlText = adlDay != null ? "יום " + DAYS[adlDay] + " בשעה " + adlTime : "";
    await sendEmail("reminder",emp.email,{weekLabel:fmtDate(nextWD[0])+" — "+fmtDate(nextWD[6]),deadline:adlText});
  }
  localStorage.setItem(sentKey,"1");
}

// ── SILENT REFRESH ──
let _autoRefreshTimer = null;
let _refreshDebounce = null;

function isUserBusy() {
  if (S.selectedCell) return true;
  if (S.constraintsEmp) return true;
  if (S.showAddEmp) return true;
  if (S.showAddVac) return true;
  if (S.showPublishModal) return true;
  if (S.showExportModal) return true;
  if (S.showWeekNotes) return true;
  if (S.showSwapModal) return true;
  if (S.view === "blocks" || (S.view === "empview" && S.empViewTab === "avail")) return true;
  if (S.view === "manager_blocks" && S.mgrBlocksTab === "mine") return true;
  if (Object.values(S.availDraft||{}).some(Boolean)) return true;
  if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "SELECT")) return true;
  return false;
}

function doSilentRefresh() {
  clearTimeout(_refreshDebounce);
  _refreshDebounce = setTimeout(async () => {
    if (!S.user || S.view === "login" || S.view === "loading") return;
    if (isUserBusy()) return;
    try {
      await Promise.all([loadSchedule(), loadAvailSubmissions(), loadSwapRequests(), loadVacations(), loadEmployees()]);
      render();
    } catch(err) {
      console.warn("🔄 Refresh failed:", err);
    }
  }, 1500);
}

function startLocalAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(() => {
    if (!isUserBusy()) doSilentRefresh();
  }, 30000);
}

// ── WIRE UP DEPS ──
setRenderFn(render);
setPostLoadFn(() => setupRealtime(render));
setSchedulerDeps(render, toast);
setScheduleActionsDeps(render, toast);
setEmployeesDeps(render, toast);
setVacationsDeps(render, toast);
setSwapsDeps(render, toast);
setAvailabilityDeps(toast);
setEmpViewDeps(render, toast);
setEmpViewImports(viewEmpVacations, viewSwaps);
setModalsDeps(render, toast);
setSettingsDeps(render, toast);
setMiscDeps(render, toast);

// Expose render globally (used by index.html inline event handlers during transition)
window.render = render;

// ── PWA ──
window.addEventListener("beforeinstallprompt", (ev) => { S.pwaPrompt = ev; });

// ── SERVICE WORKER ──
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

// ── SWIPE ──
setupSwipeGestures();

// ── INIT ──
checkAuth(render).then(() => {
  render();
  startLocalAutoRefresh();
  checkAutoReminder();
});
