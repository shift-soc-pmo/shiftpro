import { S } from '../state.js';
import { e, div, btn, render } from '../utils.js';
import { handleLogout } from '../auth.js';
import { isManager } from '../db.js';

export function viewHeader() {
  const pendingVacs = S.vacations.filter(v=>v.status==="pending").length;
  const pendingSwaps = S.swapRequests.filter(s=>s.status==="pending_manager").length;

  const empOnly = S.profile?.role === "employee";
const tabs = empOnly ? [
    {id:"empview",  icon:"📋", label:"המשמרות שלי"},
    {id:"schedule", icon:"📅", label:"סידור"},
    {id:"blocks",   icon:"🚫", label:"חסימות"},
    {id:"vacations",icon:"🌴", label:"היעדרויות"},
    {id:"swaps",    icon:"🔄", label:"חילופים"},
    {id:"emp_settings", icon:"⚙️", label:"הגדרות"},
  ] : [
    {id:"home",     icon:"🏠", label:"בית"},
    {id:"schedule", icon:"📅", label:"סידור"},
    {id:"calendar", icon:"🗓️", label:"חודש"},
    {id:"employees",icon:"👥", label:"עובדים"},
    {id:"manager_blocks", icon:"🚫", label:"חסימות"}, // <--- הוספנו את הטאב הזה למנהלים!
    {id:"qualifications", icon:"🎯", label:"כשירות"},
    {id:"vacations",icon:"🌴", label:"חופשות", badge:pendingVacs},
    {id:"swaps",    icon:"🔄", label:"חילופים", badge:pendingSwaps, badgeClass:"badge-purple"},
    {id:"stats",    icon:"📊", label:"נתונים"},
    {id:"empview",  icon:"👤", label:"עובד"},
    {id:"settings", icon:"⚙️", label:"הגדרות"},
  ];
  return e("header",{class:"header"},[
    div("header-inner",[
      div("",[
        e("img",{src:"logo-favicon.png",style:"width:40px;height:40px;border-radius:12px"}),
        e("div",{style:"margin-right:10px"},[
          e("div",{style:"font-weight:900;font-size:15px;color:#E2E8F0"},"משמרת"),
          e("div",{style:"font-size:11px;color:#64748B"},S.business?.name||"")
        ])
      ].map((x,i)=>i===0?x:x), {style:"display:flex;align-items:center;gap:10px"}),
      div("nav", tabs.map(t =>
        e("button",{
          class:"nav-btn"+(S.view===t.id?" active":""),
          onclick:()=>{
          if(t.id==="swaps_nav"){S.view="empview";S.empViewTab="swaps_emp";S.selectedCell=null;render();}
          else if(t.id==="empview"){S.view="empview";S.empViewTab="shifts";S.selectedCell=null;render();}
          else{S.view=t.id;S.selectedCell=null;render();}
        }
        },[
          t.badge>0 ? e("span",{class:"badge "+(t.badgeClass||"")},String(t.badge)) : null,
          e("span",{style:"font-size:15px;line-height:1"},t.icon),
          e("span",{},t.label)
        ])
      )),
      div("user-area",[
        e("div",{},[
          e("div",{class:"user-name"},S.profile?.name||""),
          e("div",{class:"user-role-label"},S.profile?.role==="admin"||S.profile?.role==="manager"?"מנהל":"עובד")
        ]),
        btn("btn-logout","יציאה",handleLogout)
      ])
    ])
  ]);
}
