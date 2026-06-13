import { S } from '../state.js';
import { e, div, btn, render } from '../utils.js';
import { handleLogin, handleRegister, handleAcceptInvitation } from '../auth.js';
import { sb } from '../supabase.js';

export function viewLoading() {
  return div("loading-screen",[
    e("div",{style:"font-size:48px;margin-bottom:12px"},"📅"),
    e("div",{style:"font-weight:800;font-size:20px"},"ניהול משמרות"),
    e("div",{style:"color:#64748B;font-size:14px;margin-top:8px"},"טוען...")
  ]);
}

export function viewLogin() {
  const isReg = S.loginMode === "register";
  const isInvite = S.loginMode === "accept_invitation";
  const wrap = e("div",{class:"login-wrap"});
  const card = e("div",{class:"login-card"});

  card.appendChild(div("logo-box",[
    e("img",{src:"logo-favicon.png",style:"width:40px;height:40px;border-radius:12px"}),
    e("div",{},[
      e("div",{class:"logo-name"},"ניהול משמרות"),
      e("div",{class:"logo-sub"},"מערכת ניהול משמרות")
    ])
  ]));
  card.appendChild(e("div",{class:"login-h1"},
    isInvite ? "✉️ הזמנה ל-"+(S.pendingInvitation?.businessName||"") :
    isReg ? "הרשמה חינם" : "ברוך הבא"));
  card.appendChild(e("p",{class:"subtitle"},
    isInvite ? "השלם פרטים להצטרפות כ"+((S.pendingInvitation?.role==="admin"||S.pendingInvitation?.role==="manager")?"מנהל":"עובד") :
    isReg ? "צור חשבון מנהל" : "הכנס פרטים להמשך"));

  const errBox = e("div",{class:"err-box hidden",id:"lerr"});
  card.appendChild(errBox);

  const form = e("form",{onsubmit: async ev => {
    ev.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled=true; errBox.classList.add("hidden");
    try {
      if (isInvite) await handleAcceptInvitation(
        form.querySelector("[name=name]").value,
        form.querySelector("[name=pass]").value,
        S.pendingInvitation.token,
        S.pendingInvitation.email
      );
      else if (isReg) await handleRegister(
        form.querySelector("[name=name]").value,
        form.querySelector("[name=biz]")?.value||"",
        form.querySelector("[name=email]").value,
        form.querySelector("[name=pass]").value
      );
      else await handleLogin(
        form.querySelector("[name=email]").value,
        form.querySelector("[name=pass]").value
      );
      render();
    } catch(err) {
      errBox.textContent = "⚠️ "+(err.message||"שגיאה");
      errBox.classList.remove("hidden"); btn.disabled=false;
    }
  }});

  if (isInvite) {
    // Show pre-filled email (locked) and ask for name + password only
    form.appendChild(loginField("שם מלא","name","text",S.pendingInvitation?.name || "שם מלא",true));
    const emailField = div("field",[
      e("label",{},"אימייל"),
      e("input",{name:"emailDisplay",type:"email",value:S.pendingInvitation?.email||"",disabled:"disabled",style:"opacity:0.7;cursor:not-allowed"})
    ]);
    form.appendChild(emailField);
    form.appendChild(loginField("בחר סיסמה","pass","password","לפחות 6 תווים",true));
  } else if (isReg) {
    form.appendChild(loginField("שם מלא","name","text","ישראל ישראלי",true));
    form.appendChild(loginField("שם העסק","biz","text","החברה שלי",true));
    form.appendChild(loginField("אימייל","email","email","you@example.com",true));
    form.appendChild(loginField("סיסמה","pass","password","••••••••",true));
  } else {
    form.appendChild(loginField("אימייל","email","email","you@example.com",true));
    form.appendChild(loginField("סיסמה","pass","password","••••••••",true));
  }
  form.appendChild(e("button",{type:"submit",class:"btn-primary"},
    isInvite ? "✓ הצטרף לעסק →" :
    isReg?"צור חשבון מנהל →":"כניסה →"));
  card.appendChild(form);

  // Forgot password (login mode only)
  if (!isReg && !isInvite) {
    card.appendChild(div("switch-link",[
      e("a",{onclick:async()=>{
        const email = prompt("הכנס את האימייל שלך לקבלת לינק איפוס סיסמה:");
        if (!email) return;
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/?reset=true"
        });
        if (error) {
          alert("שגיאה: " + error.message);
        } else {
          alert("✓ לינק איפוס נשלח אל " + email + "\nבדוק את תיבת המייל שלך");
        }
      },style:"color:#94A3B8;font-size:13px"},"שכחתי סיסמה"),
    ]));
  }

  // Switch links
  if (isInvite) {
    // Don't show switch links during invite acceptance
  } else if (isReg) {
    card.appendChild(div("switch-link",[
      "יש לך חשבון? ",
      e("a",{onclick:()=>{S.loginMode="login";render();}},"כניסה →")
    ]));
  }
  // Note: regular employees can no longer sign up directly - they must receive an invitation
  wrap.appendChild(card);
  return wrap;
}

export function loginField(lbl, name, type, ph, req=false) {
  return div("field",[
    e("label",{},lbl+(req?" *":"")),
    e("input",{name,type,placeholder:ph,required:req?"required":null})
  ]);
}
