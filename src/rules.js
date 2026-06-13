import { SHIFTS } from './config.js';

// ══════════════════════════════════════════════════════
// RULE ENGINE — pluggable scheduling rules
// Each rule receives context and returns:
//   - blocked: true → employee cannot be assigned to this shift
//   - score: number → added to total score (positive = prefer, negative = avoid)
// ══════════════════════════════════════════════════════
export const RULES = {
  // === HARD BLOCKS ===
  vacation: {
    name: "חופשה מאושרת",
    enabled: true,
    check: (ctx) => {
      const v = ctx.S.vacations.find(v =>
        v.employee_id === ctx.emp.id && v.status === "approved" &&
        ctx.dateStr >= v.start_date && ctx.dateStr <= v.end_date
      );
      return v ? { blocked: true, reason: "חופשה" } : null;
    }
  },
  exclusion: {
    name: "השעיה זמנית",
    enabled: true,
    check: (ctx) => {
      const e = ctx.emp;
      if (e.exclude_from && e.exclude_to && ctx.dateStr >= e.exclude_from && ctx.dateStr <= e.exclude_to) {
        return { blocked: true, reason: e.exclude_reason || "השעיה" };
      }
      return null;
    }
  },
  activeDays: {
    name: "ימים פעילים",
    enabled: true,
    check: (ctx) => {
      const active = ctx.emp.active_days || [0,1,2,3,4,5,6];
      if (!active.includes(ctx.dayOfWeek)) return { blocked: true, reason: "יום לא פעיל" };
      return null;
    }
  },
  allowedShifts: {
    name: "משמרות מותרות",
    enabled: true,
    check: (ctx) => {
      const allowed = ctx.emp.allowed_shifts || SHIFTS.map(s => s.id);
      if (!allowed.includes(ctx.shiftId)) return { blocked: true, reason: "משמרת לא מותרת" };
      return null;
    }
  },
  maxShifts: {
    name: "מקסימום משמרות",
    enabled: true,
    check: (ctx) => {
      const max = ctx.emp.max_shifts_per_week || 5;
      if ((ctx.totalCount[ctx.emp.id] || 0) >= max) return { blocked: true, reason: "מקסימום הגיע" };
      return null;
    }
  },
  alreadyToday: {
    name: "כבר עובד היום",
    enabled: true,
    check: (ctx) => {
      const works = SHIFTS.some(s => s.id !== ctx.shiftId && (ctx.newSched[ctx.dateStr]?.[s.id]||[]).includes(ctx.emp.id));
      return works ? { blocked: true, reason: "כבר עובד היום" } : null;
    }
  },
  blockedShift: {
    name: "חסימת עובד",
    enabled: true,
    check: (ctx) => {
      const blockId = ctx.shiftId === "morning2" ? "morning" : ctx.shiftId;
      const isBlocked = ctx.S.availSubmissions.some(s =>
        s.employee_id === ctx.emp.id &&
        (s.slots||[]).some(sl => sl.date === ctx.dateStr && (sl.shift === blockId || sl.shift === ctx.shiftId))
      );
      return isBlocked ? { blocked: true, reason: "עובד חסם" } : null;
    }
  },

  // === SCORING RULES ===
  equalDistribution: {
    name: "חלוקה שווה",
    enabled: true,
    check: (ctx) => {
      const count = ctx.totalCount[ctx.emp.id] || 0;
      let score = 0;
      if (count >= ctx.idealShifts + 1) score -= 200;
      if (count < ctx.idealShifts) score += (ctx.idealShifts - count) * 40;
      else score -= (count - ctx.idealShifts) * 50;
      score -= count * 15;
      return { score };
    }
  },
  shiftTypeVariety: {
    name: "גיוון סוגי משמרות",
    enabled: true,
    check: (ctx) => {
      const myShiftCounts = ctx.shiftTypeCount[ctx.emp.id] || {};
      const isMorningOnly = ctx.emp.allowed_shifts && ctx.emp.allowed_shifts.length > 0 &&
        !ctx.emp.allowed_shifts.includes("afternoon") && !ctx.emp.allowed_shifts.includes("night");
      if (isMorningOnly) return { score: 0 };

      const morningTotal = (myShiftCounts["morning"]||0) + (myShiftCounts["morning2"]||0);
      const afternoonTotal = myShiftCounts["afternoon"] || 0;
      const nightTotal = myShiftCounts["night"] || 0;
      const isMorningShift = ctx.shiftId === "morning" || ctx.shiftId === "morning2";
      const thisTypeTotal = isMorningShift ? morningTotal : (ctx.shiftId === "afternoon" ? afternoonTotal : nightTotal);
      const minType = Math.min(morningTotal, afternoonTotal, nightTotal);
      const maxType = Math.max(morningTotal, afternoonTotal, nightTotal);

      let score = 0;
      if (thisTypeTotal >= 2 && minType === 0) score -= 300;
      score -= thisTypeTotal * 35;
      if (thisTypeTotal === minType) score += 40;
      if (thisTypeTotal < maxType) score += 20;
      return { score };
    }
  },
  weekendFairness: {
    name: "חלוקת סופ״ש שווה",
    enabled: true,
    check: (ctx) => {
      if (!ctx.isWeekend) return { score: 0 };
      const wkCount = ctx.weekendCount[ctx.emp.id] || 0;
      const totalWk = Object.values(ctx.weekendCount).reduce((a,b) => a+b, 0);
      const avgWk = totalWk / (ctx.S.employees.length || 1);
      let score = 0;
      if (wkCount > avgWk + 0.5) score -= 25;
      if (wkCount < avgWk) score += 20;
      return { score };
    }
  },
  restBetweenShifts: {
    name: "מנוחה בין משמרות",
    enabled: true,
    check: (ctx) => {
      if (ctx.dayIdx === 0) return { score: 0 };
      const pd = ctx.weekDates[ctx.dayIdx-1];
      const prevDate = pd.getFullYear()+"-"+String(pd.getMonth()+1).padStart(2,"0")+"-"+String(pd.getDate()).padStart(2,"0");
      const prevShifts = ctx.newSched[prevDate] || {};
      let score = 0;
      if (ctx.shiftId === "morning" || ctx.shiftId === "morning2") {
        if ((prevShifts["night"]||[]).includes(ctx.emp.id)) score -= 200;
        if ((prevShifts["afternoon"]||[]).includes(ctx.emp.id)) score -= 40;
      }
      if (ctx.shiftId === "afternoon" && (prevShifts["night"]||[]).includes(ctx.emp.id)) score -= 60;
      return { score };
    }
  },
  consecutiveDays: {
    name: "מניעת רצף ימים",
    enabled: true,
    check: (ctx) => {
      if (ctx.dayIdx < 2) return { score: 0 };
      const pd1 = ctx.weekDates[ctx.dayIdx-1];
      const pd2 = ctx.weekDates[ctx.dayIdx-2];
      const pd1Str = pd1.getFullYear()+"-"+String(pd1.getMonth()+1).padStart(2,"0")+"-"+String(pd1.getDate()).padStart(2,"0");
      const pd2Str = pd2.getFullYear()+"-"+String(pd2.getMonth()+1).padStart(2,"0")+"-"+String(pd2.getDate()).padStart(2,"0");
      const w1 = SHIFTS.some(s => (ctx.newSched[pd1Str]?.[s.id]||[]).includes(ctx.emp.id));
      const w2 = SHIFTS.some(s => (ctx.newSched[pd2Str]?.[s.id]||[]).includes(ctx.emp.id));
      return { score: (w1 && w2) ? -25 : 0 };
    }
  },
  blockOverIdeal: {
    name: "חסימת חריגה",
    enabled: true,
    check: (ctx) => {
      const count = ctx.totalCount[ctx.emp.id] || 0;
      if (count < ctx.idealShifts + 1) return { score: 0 };
      const someoneBelow = ctx.S.employees.some(o =>
        o.id !== ctx.emp.id && (ctx.totalCount[o.id]||0) < ctx.idealShifts - 1
      );
      if (someoneBelow) return { blocked: true, reason: "אחרים מתחת לממוצע" };
      return { score: 0 };
    }
  }
};

export function runRules(ctx) {
  let totalScore = 0;
  for (const ruleId in RULES) {
    const rule = RULES[ruleId];
    if (!rule.enabled) continue;
    const result = rule.check(ctx);
    if (!result) continue;
    if (result.blocked) {
      return { blocked: true, reason: ruleId + ": " + (result.reason || ""), score: 0 };
    }
    if (result.score) totalScore += result.score;
  }
  return { blocked: false, score: totalScore };
}
