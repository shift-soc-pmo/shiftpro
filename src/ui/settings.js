import { S } from '../state.js';
import { e, div, btn, getWeekDates, fmtDate, getEmp } from '../utils.js';
import { SHIFTS, WEEKEND_SHIFTS, SHIFT_BY_ID, DAYS, BLOCK_SHIFTS } from '../config.js';
import { RULES } from '../rules.js';
import { sb } from '../supabase.js';
import { handleLogout } from '../auth.js';
import { loadAll, effectivePlan, PLAN_LIMITS, hasFeature } from '../db.js';
import { sendEmail } from '../notifications.js';
import { logAction } from '../db.js';

export const APP_URL = "https://shiftpmosoc.com/";

let _render = () => {};
let _toast = () => {};
export function setSettingsDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

const PLAN_META = {
  free:       {label:"חינמי",      color:"#64748B", emoji:"🆓", empLimit:10,  features:["עד 10 עובדים","שיבוץ ידני","ניהול חופשות"]},
  pro:        {label:"Pro",        color:"#3B82F6", emoji:"⭐", empLimit:null, features:["עובדים ללא הגבלה","שיבוץ אוטומטי","התראות מייל","דוחות מתקדמים"]},
  enterprise: {label:"Enterprise", color:"#A855F7", emoji:"👑", empLimit:null, features:["מספר סניפים","API גישה","תמיכה ייעודית 24/7","SLA מובטח"]},
};

export function viewSettings() {
  const wrap = e("div");
  wrap.appendChild(div("page-title",["⚙️ הגדרות"],{style:"margin-bottom:16px"}));

  // Billing / Plan card
  const plan = effectivePlan();
  const rawPlan = S.business?.plan || 'free';
  const isExpired = rawPlan !== 'free' && plan === 'free';
  const pm   = PLAN_META[plan];
  const billingCard = div("card",[]);
  billingCard.appendChild(e("div",{style:"display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"},[
    e("div",{class:"card-title",style:"margin-bottom:0"},"💳 תוכנית נוכחית"),
    e("div",{style:`background:${pm.color}22;color:${pm.color};border:1px solid ${pm.color}44;border-radius:10px;padding:4px 14px;font-weight:800;font-size:13px`},pm.emoji+" "+pm.label)
  ]));
  if (isExpired) {
    billingCard.appendChild(e("div",{style:"background:#7F1D1D22;border:1px solid #EF4444;border-radius:8px;padding:8px 12px;font-size:12px;color:#FCA5A5;margin-bottom:10px"},
      "⚠️ תוכנית ה-"+PLAN_META[rawPlan].label+" שלך פגה. צור קשר לחידוש."));
  }
  billingCard.appendChild(e("div",{style:"display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px"},
    pm.features.map(f=>e("div",{style:"background:#1E293B;border:1px solid #334155;border-radius:8px;padding:4px 10px;font-size:12px;color:#94A3B8"},f))
  ));
  if (pm.empLimit) {
    const cnt = (S.employees||[]).filter(e=>!e.is_deleted).length;
    billingCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px"},
      `עובדים: ${cnt} / ${pm.empLimit}`));
  }
  if (plan === 'free') {
    billingCard.appendChild(btn("btn-primary","⭐ שדרג לתוכנית Pro",()=>{
      window.open("mailto:hello@shiftpro.co.il?subject=שדרוג%20לPro&body=שלום%2C%20אשמח%20לשדרג%20את%20החשבון%20שלי%20לתוכנית%20Pro","_blank");
    },{style:"width:100%"}));
  }
  wrap.appendChild(billingCard);

  if (!S.settingsData) S.settingsData = {
    morningStart: SHIFTS[0].start, morningEnd: SHIFTS[0].end,
    morning2Start: SHIFTS[1].start, morning2End: SHIFTS[1].end,
    afternoonStart: SHIFTS[2].start, afternoonEnd: SHIFTS[2].end,
    nightStart: SHIFTS[3].start, nightEnd: SHIFTS[3].end,
    emailNotify: true,
  };
  const sd = S.settingsData;

  // Shift hours settings
  const shiftCard = div("card",[e("div",{class:"card-title"},"🕐 שעות משמרות")]);
  const shiftDefs = [
    {id:"morning",label:"בוקר",sk:"morning"},
    ...(hasFeature("morning2") ? [{id:"morning2",label:"בוקר ב׳",sk:"morning2"}] : []),
    {id:"afternoon",label:"צהריים",sk:"afternoon"},
    {id:"night",label:"לילה",sk:"night"},
  ];
  shiftDefs.forEach(sh=>{
    const shColor = SHIFT_BY_ID[sh.id]?.color || "#94A3B8";
    shiftCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:8px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid "+shColor+"33"},[
      e("div",{style:"font-weight:700;font-size:12px;color:"+shColor+";min-width:55px"},sh.label),
      e("input",{type:"time",value:sd[sh.sk+"Start"]||SHIFT_BY_ID[sh.id]?.start||"07:00",style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 8px;font-size:14px;font-family:inherit;flex:1",onchange:ev=>{sd[sh.sk+"Start"]=ev.target.value}}),
      e("span",{style:"color:#475569;font-size:12px"},"—"),
      e("input",{type:"time",value:sd[sh.sk+"End"]||SHIFT_BY_ID[sh.id]?.end||"15:00",style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 8px;font-size:14px;font-family:inherit;flex:1",onchange:ev=>{sd[sh.sk+"End"]=ev.target.value}})
    ]));
  });
  shiftCard.appendChild(btn("btn-add","שמור שעות",async()=>{
    if(sd.morningStart && sd.morningEnd) { SHIFTS[0].start=sd.morningStart; SHIFTS[0].end=sd.morningEnd; }
    if(sd.morning2Start && sd.morning2End) { SHIFTS[1].start=sd.morning2Start; SHIFTS[1].end=sd.morning2End; }
    if(sd.afternoonStart && sd.afternoonEnd) { SHIFTS[2].start=sd.afternoonStart; SHIFTS[2].end=sd.afternoonEnd; }
    if(sd.nightStart && sd.nightEnd) { SHIFTS[3].start=sd.nightStart; SHIFTS[3].end=sd.nightEnd; }
    if(sd.weMorningStart && sd.weMorningEnd) { WEEKEND_SHIFTS[0].start=sd.weMorningStart; WEEKEND_SHIFTS[0].end=sd.weMorningEnd; }
    if(sd.weNightStart && sd.weNightEnd) { WEEKEND_SHIFTS[1].start=sd.weNightStart; WEEKEND_SHIFTS[1].end=sd.weNightEnd; }

    const shiftHours = {
      morning:  { start: SHIFTS[0].start, end: SHIFTS[0].end },
      morning2: { start: SHIFTS[1].start, end: SHIFTS[1].end },
      afternoon:{ start: SHIFTS[2].start, end: SHIFTS[2].end },
      night:    { start: SHIFTS[3].start, end: SHIFTS[3].end },
      weMorning:{ start: WEEKEND_SHIFTS[0].start, end: WEEKEND_SHIFTS[0].end },
      weNight:  { start: WEEKEND_SHIFTS[1].start, end: WEEKEND_SHIFTS[1].end }
    };
    const { error } = await sb.from("businesses").update({shift_hours: shiftHours}).eq("id", S.profile.business_id);
    if (error) { _toast("שגיאה בשמירה: "+error.message,"err"); return; }
    S.business.shift_hours = shiftHours;
    logAction("shift_hours_updated", shiftHours);
    _toast("שעות עודכנו ✓");
    _render();
  }));
  wrap.appendChild(shiftCard);

  // Weekend shift hours
  const weCard = div("card",[e("div",{class:"card-title"},"🕐 שעות שישי — שבת")]);
  weCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px"},"בסופ״ש יש רק 2 משמרות: בוקר ולילה"));
  if(!sd.weMorningStart) sd.weMorningStart = WEEKEND_SHIFTS[0].start;
  if(!sd.weMorningEnd) sd.weMorningEnd = WEEKEND_SHIFTS[0].end;
  if(!sd.weNightStart) sd.weNightStart = WEEKEND_SHIFTS[1].start;
  if(!sd.weNightEnd) sd.weNightEnd = WEEKEND_SHIFTS[1].end;

  weCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:8px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid #F59E0B33"},[
    e("div",{style:"font-weight:700;font-size:12px;color:#F59E0B;min-width:55px"},"בוקר"),
    e("input",{type:"time",value:sd.weMorningStart,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 8px;font-size:14px;font-family:inherit;flex:1",onchange:ev=>{sd.weMorningStart=ev.target.value}}),
    e("span",{style:"color:#475569;font-size:12px"},"—"),
    e("input",{type:"time",value:sd.weMorningEnd,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 8px;font-size:14px;font-family:inherit;flex:1",onchange:ev=>{sd.weMorningEnd=ev.target.value}})
  ]));
  weCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:8px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid #6366F133"},[
    e("div",{style:"font-weight:700;font-size:12px;color:#6366F1;min-width:55px"},"לילה"),
    e("input",{type:"time",value:sd.weNightStart,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 8px;font-size:14px;font-family:inherit;flex:1",onchange:ev=>{sd.weNightStart=ev.target.value}}),
    e("span",{style:"color:#475569;font-size:12px"},"—"),
    e("input",{type:"time",value:sd.weNightEnd,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 8px;font-size:14px;font-family:inherit;flex:1",onchange:ev=>{sd.weNightEnd=ev.target.value}})
  ]));
  weCard.appendChild(btn("btn-add","שמור שעות סופ״ש",async()=>{
    if(sd.weMorningStart && sd.weMorningEnd) { WEEKEND_SHIFTS[0].start=sd.weMorningStart; WEEKEND_SHIFTS[0].end=sd.weMorningEnd; }
    if(sd.weNightStart && sd.weNightEnd) { WEEKEND_SHIFTS[1].start=sd.weNightStart; WEEKEND_SHIFTS[1].end=sd.weNightEnd; }
    const shiftHours = {
      morning:  { start: SHIFTS[0].start, end: SHIFTS[0].end },
      morning2: { start: SHIFTS[1].start, end: SHIFTS[1].end },
      afternoon:{ start: SHIFTS[2].start, end: SHIFTS[2].end },
      night:    { start: SHIFTS[3].start, end: SHIFTS[3].end },
      weMorning:{ start: WEEKEND_SHIFTS[0].start, end: WEEKEND_SHIFTS[0].end },
      weNight:  { start: WEEKEND_SHIFTS[1].start, end: WEEKEND_SHIFTS[1].end }
    };
    const { error } = await sb.from("businesses").update({shift_hours: shiftHours}).eq("id", S.profile.business_id);
    if (error) { _toast("שגיאה בשמירה: "+error.message,"err"); return; }
    S.business.shift_hours = shiftHours;
    logAction("shift_hours_updated", shiftHours);
    _toast("שעות סופ״ש עודכנו ✓");
    _render();
  }));
  wrap.appendChild(weCard);

  // Shift targets
  const targetsCard = div("card",[e("div",{class:"card-title"},"👥 כמות עובדים למשמרת")]);
  targetsCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px"},"כמה עובדים לשבץ בכל משמרת בשיבוץ האוטומטי"));
  if(!sd.targets) sd.targets = S.business?.shift_targets || {morning:2,morning2:1,afternoon:1,night:1};
  const targetShifts = [
    {id:"morning",label:"בוקר",color:"#F59E0B"},
    {id:"morning2",label:"בוקר ב׳",color:"#F97316"},
    {id:"afternoon",label:"צהריים",color:"#10B981"},
    {id:"night",label:"לילה",color:"#6366F1"},
  ];
  targetShifts.forEach(sh => {
    targetsCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:6px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid "+sh.color+"33"},[
      e("div",{style:"font-weight:700;font-size:12px;color:"+sh.color+";min-width:65px"},sh.label),
      e("input",{type:"number",min:0,max:10,value:sd.targets[sh.id]||0,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 10px;font-size:14px;font-family:inherit;width:60px;text-align:center",
        oninput:ev=>{sd.targets[sh.id]=parseInt(ev.target.value)||0;}}),
      e("span",{style:"font-size:12px;color:#64748B"},"עובדים")
    ]));
  });
  targetsCard.appendChild(btn("btn-add","שמור כמויות",async()=>{
    await sb.from("businesses").update({shift_targets:sd.targets}).eq("id",S.profile.business_id);
    S.business.shift_targets = sd.targets;
    _toast("כמויות עודכנו ✓");_render();
  },{style:"width:100%;margin-top:8px"}));
  wrap.appendChild(targetsCard);

  // Weekend shift targets
  const weTargetsCard = div("card",[e("div",{class:"card-title"},"👥 כמות עובדים — שישי שבת")]);
  weTargetsCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px"},"בסופ״ש יש רק בוקר ולילה"));
  if(!sd.weTargets) sd.weTargets = S.business?.weekend_targets || {morning:2,night:1};
  const weTargetShifts = [{id:"morning",label:"בוקר",color:"#F59E0B"},{id:"night",label:"לילה",color:"#6366F1"}];
  weTargetShifts.forEach(sh => {
    weTargetsCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:6px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid "+sh.color+"33"},[
      e("div",{style:"font-weight:700;font-size:12px;color:"+sh.color+";min-width:65px"},sh.label),
      e("input",{type:"number",min:0,max:10,value:sd.weTargets[sh.id]||0,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 10px;font-size:14px;font-family:inherit;width:60px;text-align:center",
        oninput:ev=>{sd.weTargets[sh.id]=parseInt(ev.target.value)||0;}}),
      e("span",{style:"font-size:12px;color:#64748B"},"עובדים")
    ]));
  });
  weTargetsCard.appendChild(btn("btn-add","שמור כמויות סופ״ש",async()=>{
    await sb.from("businesses").update({weekend_targets:sd.weTargets}).eq("id",S.profile.business_id);
    S.business.weekend_targets = sd.weTargets;
    _toast("כמויות סופ״ש עודכנו ✓");_render();
  },{style:"width:100%;margin-top:8px"}));
  wrap.appendChild(weTargetsCard);

  // Deadline
  const dlCard = div("card",[e("div",{class:"card-title"},"⏰ דדליין להגשת חסימות")]);
  dlCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px"},"עובדים לא יוכלו להגיש חסימות אחרי הדדליין"));
  if (!sd.deadlineDay) sd.deadlineDay = S.business?.deadline_day != null ? String(S.business.deadline_day) : "";
  if (!sd.deadlineTime) sd.deadlineTime = S.business?.deadline_time || "20:00";

  const dlDaySelect = e("select",{class:"fi",onchange:ev=>{sd.deadlineDay=ev.target.value}});
  dlDaySelect.appendChild(e("option",{value:"",selected:sd.deadlineDay===""?"selected":null},"ללא דדליין"));
  DAYS.forEach((d,i)=>{
    dlDaySelect.appendChild(e("option",{value:String(i),selected:sd.deadlineDay===String(i)?"selected":null},"יום "+d));
  });

  dlCard.appendChild(div("form-row",[
    div("form-col",[e("label",{class:"form-label"},"יום סגירה"),dlDaySelect]),
    div("form-col",[e("label",{class:"form-label"},"שעת סגירה"),e("input",{class:"fi",type:"time",value:sd.deadlineTime,oninput:ev=>{sd.deadlineTime=ev.target.value}})])
  ]));

  if (sd.deadlineDay !== "") {
    dlCard.appendChild(e("div",{style:"background:#F59E0B18;border:1px solid #F59E0B33;border-radius:10px;padding:10px 14px;margin-top:12px;font-size:12px;color:#FCD34D"},
      "⏰ דדליין נוכחי: יום " + DAYS[parseInt(sd.deadlineDay)] + " בשעה " + sd.deadlineTime));
  }

  dlCard.appendChild(btn("btn-add","שמור דדליין",async()=>{
    await sb.from("businesses").update({
      deadline_day: sd.deadlineDay==="" ? null : parseInt(sd.deadlineDay),
      deadline_time: sd.deadlineTime
    }).eq("id",S.profile.business_id);
    S.business.deadline_day = sd.deadlineDay==="" ? null : parseInt(sd.deadlineDay);
    S.business.deadline_time = sd.deadlineTime;
    _toast("דדליין עודכן ✓"); _render();
  },{style:"width:100%;margin-top:12px"}));
  wrap.appendChild(dlCard);

  // Reminder
  const remCard = div("card",[e("div",{class:"card-title"},"🔔 תזכורת הגשת חסימות")]);
  remCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:14px"},"שלח תזכורת לעובדים שעדיין לא הגישו חסימות לשבוע הבא"));
  const nextWeekDates2 = getWeekDates(1);
  const allEmps = S.employees.filter(emp => emp.email);

  remCard.appendChild(e("button",{
    style:"width:100%;padding:14px;background:linear-gradient(135deg,#F59E0B,#F97316);color:#0F172A;border:none;border-radius:12px;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;margin-bottom:12px",
    onclick:async()=>{
      if(allEmps.length===0){_toast("אין עובדים עם מייל","err");return;}
      for(const emp of allEmps){
        const dlDay2 = S.business?.deadline_day;
        const dlTime2 = S.business?.deadline_time || "20:00";
        const dlText = dlDay2 != null ? "יום " + DAYS[dlDay2] + " בשעה " + dlTime2 : "";
        await sendEmail("reminder",emp.email,{weekLabel:fmtDate(nextWeekDates2[0])+" — "+fmtDate(nextWeekDates2[6]),deadline:dlText});
      }
      _toast("תזכורת נשלחה ל-"+allEmps.length+" עובדים ✓");
    }
  },"📧 שלח תזכורת לכל העובדים במייל ("+allEmps.length+")"));
  remCard.appendChild(e("button",{
    style:"width:100%;padding:14px;background:#25D366;color:white;border:none;border-radius:12px;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;margin-bottom:12px",
    onclick:()=>{
      const dlDay3 = S.business?.deadline_day;
      const dlTime3 = S.business?.deadline_time || "20:00";
      const dlLine = dlDay3 != null ? "⏰ *דדליין: יום " + DAYS[dlDay3] + " בשעה " + dlTime3 + "*\n\n" : "";
      const msg = "📢 *תזכורת הגשת חסימות*\n\n"
        + "שלום לכולם,\n"
        + "נא להגיש חסימות לשבוע *" + fmtDate(nextWeekDates2[0]) + " — " + fmtDate(nextWeekDates2[6]) + "*\n\n"
        + dlLine
        + "היכנסו למערכת והגישו בהקדם:\n"
        + APP_URL;
      window.open("https://wa.me/?text="+encodeURIComponent(msg));
      _toast("נפתח WhatsApp ✓");
    }
  },"📲 שלח תזכורת ב-WhatsApp"));

  remCard.appendChild(e("div",{style:"border-top:1px solid #334155;padding-top:14px;margin-top:14px"},[
    e("div",{style:"font-weight:700;font-size:13px;color:#E2E8F0;margin-bottom:10px"},"⏰ תזכורת אוטומטית")
  ]));
  if(!sd.reminderDay) sd.reminderDay = S.business?.reminder_day!=null ? String(S.business.reminder_day) : "";
  if(!sd.reminderTime) sd.reminderTime = S.business?.reminder_time || "09:00";
  const remDaySelect = e("select",{class:"fi",style:"flex:1",onchange:ev=>{sd.reminderDay=ev.target.value}});
  remDaySelect.appendChild(e("option",{value:"",selected:sd.reminderDay===""?"selected":null},"ללא תזכורת אוטומטית"));
  DAYS.forEach((d,i)=>{remDaySelect.appendChild(e("option",{value:String(i),selected:sd.reminderDay===String(i)?"selected":null},"יום "+d));});
  remCard.appendChild(div("form-row",[
    div("form-col",[e("label",{class:"form-label"},"יום שליחה"),remDaySelect]),
    div("form-col",[e("label",{class:"form-label"},"שעה"),e("input",{class:"fi",type:"time",value:sd.reminderTime,oninput:ev=>{sd.reminderTime=ev.target.value}})])
  ]));
  remCard.appendChild(e("div",{style:"font-size:11px;color:#475569;margin-top:6px;margin-bottom:12px"},"התזכורת תישלח אוטומטית לעובדים שטרם הגישו"));
  remCard.appendChild(btn("btn-add","שמור הגדרות תזכורת",async()=>{
    await sb.from("businesses").update({reminder_day:sd.reminderDay===""?null:parseInt(sd.reminderDay),reminder_time:sd.reminderTime}).eq("id",S.profile.business_id);
    S.business.reminder_day=sd.reminderDay===""?null:parseInt(sd.reminderDay);
    S.business.reminder_time=sd.reminderTime;
    _toast("הגדרות תזכורת נשמרו ✓");_render();
  },{style:"width:100%"}));
  if(sd.reminderDay!==""){
    remCard.appendChild(e("div",{style:"background:#3B82F618;border:1px solid #3B82F633;border-radius:10px;padding:10px 14px;margin-top:12px;font-size:12px;color:#60A5FA"},"⏰ תזכורת כל יום "+DAYS[parseInt(sd.reminderDay)]+" בשעה "+sd.reminderTime));
  }
  wrap.appendChild(remCard);

  // Rule Engine Settings
  const rulesCard = div("card",[e("div",{class:"card-title"},"⚙️ חוקי שיבוץ אוטומטי")]);
  rulesCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:14px"},"הפעל/כבה חוקים לפי הצורך. שינויים שמורים בדפדפן."));

  const savedRules = JSON.parse(localStorage.getItem("rules_enabled") || "{}");
  for (const id in RULES) {
    if (savedRules[id] === false) RULES[id].enabled = false;
  }

  Object.entries(RULES).forEach(([id, rule]) => {
    const row = e("div",{style:"display:flex;justify-content:space-between;align-items:center;padding:10px;background:#0F172A;border-radius:8px;margin-bottom:6px;border:1px solid #1E293B"},[
      e("div",{style:"font-size:13px;font-weight:600;color:#E2E8F0"},rule.name),
      e("label",{class:"switch",style:"cursor:pointer"},[
        e("input",{type:"checkbox",checked:rule.enabled?"checked":null,onchange:(ev)=>{
          RULES[id].enabled = ev.target.checked;
          savedRules[id] = ev.target.checked;
          localStorage.setItem("rules_enabled", JSON.stringify(savedRules));
        }}),
        e("span",{class:"slider"})
      ])
    ]);
    rulesCard.appendChild(row);
  });
  rulesCard.appendChild(e("div",{style:"font-size:11px;color:#475569;margin-top:10px;text-align:center"},"💡 חוקים מסומנים בכחול = חוקי חסימה (קריטיים). שינויים יכולים להוביל לסידור לא תקין."));
  wrap.appendChild(rulesCard);

  // Qualifications Config
  const qualCard = div("card",[e("div",{class:"card-title"},"🎯 הגדרות כשירות")]);
  qualCard.appendChild(e("div",{style:"color:#64748B;font-size:13px;margin-bottom:14px"},"הגדר כמה ימים עובד נחשב כשיר על מערכת/משמרת לפני שפג"));

  if (!S.qualifications) S.qualifications = {systems:{},shifts:{}};
  if (!S.qualifications.systems) S.qualifications.systems = {};
  if (!S.qualifications.shifts) S.qualifications.shifts = {};

  if ((S.systems||[]).length === 0) {
    qualCard.appendChild(e("div",{style:"color:#475569;font-size:12px;padding:8px;text-align:center;background:#0F172A;border-radius:8px;margin-bottom:12px"},"💡 הוסף קודם מערכות בכרטיס מתחת"));
  } else {
    qualCard.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#94A3B8;margin-bottom:8px"},"🏷️ מערכות"));
    S.systems.forEach(sys => {
      const curVal = S.qualifications.systems[sys] || 30;
      qualCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:6px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid #3B82F633"},[
        e("div",{style:"font-weight:700;font-size:12px;color:#60A5FA;flex:1"},"🏷️ "+sys),
        e("input",{type:"number",min:1,max:365,value:curVal,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 10px;font-size:14px;font-family:inherit;width:70px;text-align:center",
          oninput:ev=>{S.qualifications.systems[sys]=parseInt(ev.target.value)||30;}}),
        e("span",{style:"font-size:12px;color:#64748B"},"ימים")
      ]));
    });
  }

  qualCard.appendChild(e("div",{style:"font-weight:700;font-size:13px;color:#94A3B8;margin-bottom:8px;margin-top:14px"},"🌅 משמרות בוקר"));
  [{id:"morning",label:"בוקר",color:"#F59E0B"},{id:"morning2",label:"בוקר ב׳",color:"#F97316"}].forEach(sh => {
    const curVal = S.qualifications.shifts[sh.id] || 21;
    qualCard.appendChild(e("div",{style:"display:flex;align-items:center;gap:8px;margin-bottom:6px;background:#0F172A;border-radius:10px;padding:8px 12px;border:1px solid "+sh.color+"33"},[
      e("div",{style:"font-weight:700;font-size:12px;color:"+sh.color+";flex:1"},sh.label),
      e("input",{type:"number",min:1,max:365,value:curVal,style:"background:#1E293B;border:1px solid #334155;border-radius:8px;color:#E2E8F0;padding:6px 10px;font-size:14px;font-family:inherit;width:70px;text-align:center",
        oninput:ev=>{S.qualifications.shifts[sh.id]=parseInt(ev.target.value)||21;}}),
      e("span",{style:"font-size:12px;color:#64748B"},"ימים")
    ]));
  });

  qualCard.appendChild(btn("btn-add","שמור הגדרות כשירות",async()=>{
    await sb.from("businesses").update({qualifications:S.qualifications}).eq("id",S.profile.business_id);
    S.business.qualifications = S.qualifications;
    logAction("qualifications_updated", S.qualifications);
    _toast("הגדרות נשמרו ✓");_render();
  },{style:"width:100%;margin-top:8px"}));
  wrap.appendChild(qualCard);

  // Systems / Tags Management
  const sysCard = div("card",[e("div",{class:"card-title"},"🏷️ מערכות / תגיות להערות")]);
  sysCard.appendChild(e("div",{style:"color:#64748B;font-size:13px;margin-bottom:14px"},"הגדר רשימת מערכות שתופיע באפשרות לבחירה כשמוסיפים הערה לשיבוץ"));

  const sysListDiv = e("div",{style:"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;min-height:32px"});
  if ((S.systems||[]).length === 0) {
    sysListDiv.appendChild(e("div",{style:"color:#475569;font-size:12px;padding:8px;text-align:center;width:100%"},"אין מערכות עדיין — הוסף מערכת ראשונה למטה"));
  } else {
    S.systems.forEach((sys, i) => {
      sysListDiv.appendChild(e("div",{
        style:"display:inline-flex;align-items:center;gap:6px;background:#3B82F622;border:1px solid #3B82F644;color:#60A5FA;border-radius:20px;padding:5px 10px;font-size:12px;font-weight:600"
      },[
        e("span",{},"🏷️ "+sys),
        e("button",{
          style:"background:none;border:none;color:#EF4444;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;font-family:inherit",
          title:"מחק",
          onclick:async()=>{
            if(!confirm("למחוק את \"" + sys + "\"?")) return;
            S.systems.splice(i,1);
            await sb.from("businesses").update({systems:S.systems}).eq("id",S.profile.business_id);
            S.business.systems = S.systems;
            _toast("המערכת נמחקה");
            _render();
          }
        },"×")
      ]));
    });
  }
  sysCard.appendChild(sysListDiv);

  const sysInputRow = e("div",{style:"display:flex;gap:6px"});
  const sysInput = e("input",{class:"fi",placeholder:"שם מערכת (לדוגמה: Cortex XDR, Firewall...)",style:"flex:1",id:"sysAddInput"});
  sysInputRow.appendChild(sysInput);
  sysInputRow.appendChild(e("button",{
    style:"padding:10px 16px;background:#3B82F6;color:white;border:none;border-radius:8px;font-weight:700;font-family:inherit;font-size:13px;cursor:pointer",
    onclick:async()=>{
      const inp = document.getElementById("sysAddInput");
      const val = (inp?.value||"").trim();
      if (!val) return;
      if ((S.systems||[]).includes(val)) { _toast("המערכת כבר קיימת","err"); return; }
      S.systems = [...(S.systems||[]), val];
      await sb.from("businesses").update({systems:S.systems}).eq("id",S.profile.business_id);
      S.business.systems = S.systems;
      _toast("✓ נוספה");
      _render();
    }
  },"+ הוסף"));
  sysCard.appendChild(sysInputRow);
  wrap.appendChild(sysCard);

  // Export
  const expCard = div("card",[e("div",{class:"card-title"},"📤 ייצוא סידור")]);
  expCard.appendChild(e("div",{style:"color:#64748B;font-size:13px;margin-bottom:14px"},"ייצא את הסידור השבועי הנוכחי"));
  expCard.appendChild(div("form-actions",[
    btn("btn-green","🖨️ ייצוא PDF / הדפסה",()=>{S.showExportModal="pdf";_render();},{style:"flex:1"}),
    btn("btn-sm btn-sm-blue","📊 ייצוא CSV",()=>{S.showExportModal="csv";_render();},{style:"flex:1"})
  ]));
  wrap.appendChild(expCard);

  // Email notifications
  const emailCard = div("card",[e("div",{class:"card-title"},"🔔 התראות")]);
  emailCard.appendChild(e("div",{style:"background:#F59E0B18;border:1px solid #F59E0B33;border-radius:10px;padding:12px 14px;margin-bottom:12px"},[
    e("div",{style:"font-weight:700;font-size:13px;color:#F59E0B;margin-bottom:4px"},"📧 התראות אימייל"),
    e("div",{style:"font-size:12px;color:#94A3B8"},"התראות אימייל דורשות שרת SMTP. ניתן לשלב עם Supabase Edge Functions.")
  ]));

  const notifSettings = S.business?.notification_settings || {};
  const notifItems = [
    {id:"notif_publish",label:"פרסום סידור לעובדים",sub:"עובדים מקבלים מייל כשסידור פורסם"},
    {id:"notif_vac_approved",label:"אישור / דחיית היעדרות",sub:"עובד מקבל מייל על תשובת הבקשה"},
    {id:"notif_swap",label:"בקשות חילוף והצטרפות",sub:"מנהל/עובד מקבל מייל על בקשות"},
  ];
  notifItems.forEach(item=>{
    const isOn = notifSettings[item.id] !== false;
    emailCard.appendChild(e("div",{style:"display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #0F172A"},[
      e("div",{},[
        e("div",{style:"font-weight:600;font-size:13px;color:#E2E8F0"},item.label),
        e("div",{style:"font-size:11px;color:#64748B;margin-top:2px"},item.sub)
      ]),
      e("button",{
        style:`width:44px;height:24px;border-radius:12px;border:none;background:${isOn?"#10B981":"#334155"};position:relative;cursor:pointer;transition:background 0.2s`,
        onclick:async()=>{
          const newVal = !isOn;
          const updated = {...(S.business?.notification_settings||{}), [item.id]: newVal};
          await sb.from("businesses").update({notification_settings: updated}).eq("id", S.profile.business_id);
          S.business.notification_settings = updated;
          _toast(newVal ? "התראה הופעלה ✓" : "התראה כובתה");
          _render();
        }
      },[e("span",{style:`position:absolute;top:2px;right:${isOn?"2px":"20px"};width:20px;height:20px;border-radius:50%;background:white;transition:right 0.2s`})])
    ]));
  });
  wrap.appendChild(emailCard);

  // PWA install
  const pwaCard = div("card",[e("div",{class:"card-title"},"📱 התקנה על הטלפון")]);
  pwaCard.appendChild(e("div",{style:"font-size:13px;color:#94A3B8;margin-bottom:12px"},"התקן את ShiftPro כאפליקציה על מסך הבית שלך"));

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

  // Change password
  const passCard = div("card",[e("div",{class:"card-title"},"🔐 שינוי סיסמה")]);
  const newPassInp = e("input",{class:"fi",type:"password",placeholder:"סיסמה חדשה (לפחות 6 תווים)",style:"margin-bottom:12px"});
  const confPassInp = e("input",{class:"fi",type:"password",placeholder:"אשר סיסמה חדשה",style:"margin-bottom:12px"});
  passCard.appendChild(div("form-col",[e("label",{class:"form-label"},"סיסמה חדשה"),newPassInp],{style:"margin-bottom:10px"}));
  passCard.appendChild(div("form-col",[e("label",{class:"form-label"},"אישור סיסמה"),confPassInp],{style:"margin-bottom:12px"}));
  passCard.appendChild(btn("btn-add","🔐 שמור סיסמה חדשה",async()=>{
    const newPass = newPassInp.value;
    const confPass = confPassInp.value;
    if (!newPass || newPass.length < 6) { _toast("סיסמה חייבת להיות לפחות 6 תווים","err"); return; }
    if (newPass !== confPass) { _toast("הסיסמאות לא תואמות","err"); return; }
    const {error} = await sb.auth.updateUser({password: newPass});
    if (error) { _toast("שגיאה: "+error.message,"err"); return; }
    newPassInp.value=""; confPassInp.value="";
    _toast("סיסמה עודכנה בהצלחה ✓");
  },{style:"width:100%"}));
  wrap.appendChild(passCard);

  // Transfer ownership (admin only)
  if (S.profile?.role === "admin") {
    const transCard = div("card",[e("div",{class:"card-title"},"👑 העברת בעלות")]);
    transCard.appendChild(e("div",{style:"font-size:12px;color:#64748B;margin-bottom:12px"},"העבר את תפקיד המנהל הראשי לעובד אחר. לאחר ההעברה תהפוך לעובד רגיל."));

    const empSelect = e("select",{class:"fi",style:"margin-bottom:12px",id:"transfer-select"});
    empSelect.appendChild(e("option",{value:""},"בחר עובד..."));
    S.employees.filter(emp => emp.id !== S.user.id).forEach(emp => {
      empSelect.appendChild(e("option",{value:emp.id},emp.name + " (" + (emp.email||"ללא מייל") + ")"));
    });
    transCard.appendChild(empSelect);

    transCard.appendChild(btn("btn-sm btn-sm-red","👑 העבר בעלות",async()=>{
      const targetId = document.getElementById("transfer-select")?.value;
      if (!targetId) { _toast("בחר עובד","err"); return; }
      const targetEmp = getEmp(targetId);
      if (!confirm("האם אתה בטוח שברצונך להעביר את הבעלות ל-" + targetEmp?.name + "?\n\nלאחר ההעברה:\n• " + targetEmp?.name + " יהפוך למנהל ראשי\n• אתה תהפוך לעובד רגיל\n• הפעולה לא ניתנת לביטול")) return;
      if (!confirm("אישור סופי — להעביר את כל ההרשאות ל-" + targetEmp?.name + "?")) return;

      await sb.from("businesses").update({owner_id: targetId}).eq("id", S.profile.business_id);
      await sb.from("profiles").update({role: "admin"}).eq("id", targetId);
      await sb.from("profiles").update({role: "employee"}).eq("id", S.user.id);

      if (targetEmp?.email) {
        sendEmail("swap_request", targetEmp.email, {
          requesterName: "מערכת ShiftPro",
          targetDate: new Date().toLocaleDateString("he-IL"),
          shiftLabel: "👑 הועברה אליך בעלות על המערכת",
          note: S.profile.name + " העביר אליך את ניהול המערכת. כעת יש לך גישת מנהל מלאה."
        });
      }

      _toast("הבעלות הועברה ל-" + targetEmp?.name + " ✓");
      await loadAll(S.user);
    },{style:"width:100%"}));
    wrap.appendChild(transCard);
  }

  // Danger zone
  const dangerCard = div("card",[e("div",{style:"font-weight:700;font-size:14px;color:#EF4444;margin-bottom:12px"},"⚠️ אזור מסוכן")]);
  dangerCard.appendChild(btn("btn-sm btn-sm-red","יציאה מהמערכת",handleLogout,{style:"margin-bottom:8px;width:100%"}));
  wrap.appendChild(dangerCard);

  return wrap;
}
