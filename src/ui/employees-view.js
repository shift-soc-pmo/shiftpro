import { S } from '../state.js';
import { e, div, btn, getEmp, empIdx, render, toast } from '../utils.js';
import { SHIFTS, EMP_COLORS, ec } from '../config.js';
import { isManager, isAtEmployeeLimit, getPlan, effectivePlan } from '../db.js';
import { addEmployee, renameEmployee, deleteEmployee, saveConstraints, createInvitation, revokeInvitation, resendInvitation, copyInviteLink, resetPassword } from '../employees.js';

// ── EMPLOYEES ──
export function viewEmployees() {
  const wrap = e("div");
  wrap.appendChild(div("section-header",[
    div("page-title",["👥 עובדים"]),
    e("div",{style:"display:flex;gap:8px;align-items:center"},[
      isAtEmployeeLimit()
        ? e("div",{style:"display:flex;align-items:center;gap:8px"},[
            e("div",{style:"font-size:12px;color:#F59E0B;font-weight:700"},
              `הגעת למגבלת ${getPlan(effectivePlan())?.emp_limit ?? '?'} עובדים`),
            btn("btn-sm btn-sm-blue","⭐ שדרג",()=>{S.view='settings';render();})
          ])
        : btn("btn-add","✉️ הזמן עובד",()=>{
            S.showInviteModal=true;
            S.newInvitation={name:"",email:"",role:"employee"};
            loadInvitations().then(()=>render());
          })
    ])
  ]));

  // Invitations modal
  if (S.showInviteModal) {
    wrap.appendChild(viewInviteModal());
  }
  
  // Pending invitations list
  const pendingInvs = (S.invitations||[]).filter(i => i.status === "pending");
  if (pendingInvs.length > 0) {
    const invCard = div("card",[
      e("div",{style:"font-weight:700;font-size:14px;color:#60A5FA;margin-bottom:12px"},
        "✉️ הזמנות פתוחות (" + pendingInvs.length + ")")
    ]);
    pendingInvs.forEach(inv => {
      const expDate = new Date(inv.expires_at);
      const isExpiringSoon = (expDate - new Date()) < 12 * 60 * 60 * 1000; // < 12h
      invCard.appendChild(e("div",{style:"background:#0F172A;border:1px solid #334155;border-radius:10px;padding:10px 14px;margin-bottom:8px"},[
        e("div",{style:"display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap"},[
          e("div",{style:"flex:1;min-width:180px"},[
            e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0"},inv.name || inv.email),
            e("div",{style:"font-size:11px;color:#94A3B8;margin-top:2px"},"📧 "+inv.email),
            e("div",{style:"font-size:11px;color:#64748B;margin-top:2px"},[
              "תפקיד: " + (inv.role==="admin"||inv.role==="manager" ? "מנהל":"עובד"),
              " · ",
              e("span",{style:"color:"+(isExpiringSoon?"#F59E0B":"#64748B")},
                "פג: " + expDate.toLocaleString("he-IL",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}))
            ])
          ]),
          e("div",{style:"display:flex;gap:4px;flex-wrap:wrap"},[
            btn("btn-sm btn-sm-blue","📋",()=>copyInviteLink(inv),{title:"העתק לינק"}),
            btn("btn-sm btn-sm-gray","📧",()=>resendInvitation(inv),{title:"שלח מחדש"}),
            btn("btn-sm btn-sm-red","✕",()=>revokeInvitation(inv.id),{title:"בטל"})
          ])
        ])
      ]));
    });
    wrap.appendChild(invCard);
  }
  
  // Add form
  if (S.showAddEmp) {
    const form = div("card",[div("card-title",["עובד חדש"])]);
    const r1 = div("form-row",[
      div("form-col",[e("label",{class:"form-label"},"שם מלא *"),e("input",{class:"fi",placeholder:"ישראל ישראלי",value:S.newEmp.name,oninput:ev=>{S.newEmp.name=ev.target.value}})]),
      div("form-col",[e("label",{class:"form-label"},"אימייל"),e("input",{class:"fi",type:"email",placeholder:"name@example.com",value:S.newEmp.email,oninput:ev=>{S.newEmp.email=ev.target.value}})])
    ]);
    const r2 = div("form-row",[
      div("form-col",[e("label",{class:"form-label"},"תעודת זהות"),e("input",{class:"fi",placeholder:"000000000",value:S.newEmp.idNumber,oninput:ev=>{S.newEmp.idNumber=ev.target.value}})]),
      div("form-col",[e("label",{class:"form-label"},"תפקיד"),e("select",{class:"fi",onchange:ev=>{S.newEmp.role=ev.target.value}},[
        e("option",{value:"employee",selected:S.newEmp.role==="employee"?"selected":null},"עובד"),
        e("option",{value:"admin",selected:S.newEmp.role==="admin"?"selected":null},"מנהל")
      ])])
    ]);
    form.appendChild(r1); form.appendChild(r2);
    form.appendChild(div("form-actions",[
      btn("btn-add","שמור עובד",addEmployee,{style:"flex:1"}),
      btn("btn-sm btn-sm-gray","ביטול",()=>{S.showAddEmp=false;render();})
    ]));
    wrap.appendChild(form);
  }

  // List
  if (S.employees.length === 0) {
    wrap.appendChild(div("card",[e("div",{style:"text-align:center;padding:40px;color:#64748B"},["אין עובדים עדיין"])]));
  } else {
    const card = div("card");
    const tbl = e("table",{class:"emp-table"},[
      e("thead",[e("tr",[e("th",{},"שם"),e("th",{},"אימייל"),e("th",{},"ת.ז."),e("th",{},"תפקיד"),e("th",{},"")])])
    ]);
    const tbody = e("tbody");
    S.employees.forEach((emp,idx) => {
      const col = ec(idx);
      const tr = e("tr",[
        e("td",{style:"font-weight:700"},[
          e("span",{style:`display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-left:8px`},""),
          e("span",{style:"cursor:pointer;border-bottom:1px dashed transparent;transition:all 0.2s",
            onmouseover:(ev)=>{ev.target.style.borderBottomColor="#3B82F6";ev.target.style.color="#60A5FA";},
            onmouseout:(ev)=>{ev.target.style.borderBottomColor="transparent";ev.target.style.color="";},
            onclick:()=>renameEmployee(emp),
            title:"לחץ לעריכת השם"
          }, emp.name),
          e("span",{style:"font-size:10px;color:#475569;margin-right:4px"},"✏️")
        ]),
        e("td",{style:"color:#94A3B8"},emp.email||"—"),
        e("td",{style:"color:#64748B"},emp.id_number||"—"),
        e("td",{},emp.role==="admin"||emp.role==="manager"?"מנהל":"עובד"),
        e("td",{},[
          btn("btn-sm btn-sm-blue","✏️ הגבלות",()=>{S.constraintsEmp=emp;render();},{style:"margin-left:4px"}),
          emp.id !== S.user.id ? e("select",{
            style:"background:#0F172A;border:1px solid #334155;border-radius:6px;color:#94A3B8;font-size:11px;padding:3px 6px;font-family:inherit;margin-left:4px",
            onchange: async (ev) => {
              const newRole = ev.target.value;
              await sb.from("profiles").update({role:newRole}).eq("id",emp.id);
              await loadEmployees();
              toast("תפקיד עודכן ✓");
              render();
            }
          },[
            e("option",{value:"employee",selected:emp.role==="employee"?"selected":null},"עובד"),
            e("option",{value:"admin",selected:emp.role==="admin"||emp.role==="manager"?"selected":null},"מנהל")
          ]) : e("span",{style:"font-size:11px;color:#F59E0B;margin-left:4px"},""),
          emp.email && emp.id !== S.user.id ? btn("btn-sm btn-sm-gray","🔑",()=>resetPassword(emp),{style:"margin-left:4px",title:"שליחת איפוס סיסמה"}) : null,
          emp.id !== S.user.id ? btn("btn-sm btn-sm-red","🗑️",()=>deleteEmployee(emp.id)) : null
        ])
      ]);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    card.appendChild(tbl);
    wrap.appendChild(card);
  }

  // Availability submissions
  const subs = S.availSubmissions.filter(s => getEmp(s.employee_id) && !s.read);
  if (subs.length > 0) {
    const subCard = div("card",[
      e("div",{style:"font-weight:700;font-size:14px;color:#F59E0B;margin-bottom:10px"},`📋 הגשות זמינות (${subs.length})`)
    ]);
    subs.forEach((sub,i) => {
      const emp = getEmp(sub.employee_id);
      subCard.appendChild(div("",[ 
        e("div",{style:"display:flex;justify-content:space-between;align-items:start;background:#0F172A;border-radius:10px;padding:10px 14px;margin-bottom:6px"},[
          e("div",{},[
            e("div",{style:"font-weight:700;font-size:13px"},emp?.name||"—"),
            e("div",{style:"font-size:11px;color:#64748B;margin-top:3px"},sub.week_start),
            div("",( sub.slots||[]).map(sl=>{
              const sh=SHIFT_BY_ID[sl.shift];
              return sh?e("span",{style:`font-size:10px;color:${sh.color};background:${sh.color}18;border:1px solid ${sh.color}33;border-radius:4px;padding:1px 6px;margin-left:4px`},DAYS[sl.day]+" "+sh.label):null;
            }).filter(Boolean))
          ]),
          btn("btn-sm btn-sm-green","✓ קראתי",async()=>{
            await sb.from("availability_submissions").update({read:true}).eq("id",sub.id);
            S.availSubmissions = S.availSubmissions.filter(s=>s.id!==sub.id);
            toast("סומן כנקרא ✓");render();
          })
        ])
      ]));
    });
    wrap.appendChild(subCard);
  }

  return wrap;
}
