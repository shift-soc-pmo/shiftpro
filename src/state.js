// ══════════════════════════════════════════════════════
// APPLICATION STATE
// ══════════════════════════════════════════════════════
export let S = {
  view: "loading",
  user: null, profile: null, business: null,
  employees: [], vacations: [], swapRequests: [], availSubmissions: [],
  schedule: {},         // { [dateStr]: { [shiftId]: [empId,...] } }
  publishedWeeks: new Set(),
  lockedSlots: {},      // { "date|shift": Set<empId> }
  customHours: {},      // { "date|shift|empId": {start,end} }
  assignmentNotes: {},  // { "date|shift|empId": "note text" }
  systems: [],
  invitations: [],
  showInviteModal: false,
  newInvitation: { name: "", email: "", role: "employee" },
  weekOffset: 0,
  selectedCell: null,   // { date, shift }
  constraintsEmp: null,
  empViewId: null, empViewTab: "shifts",
  showAddEmp: false, showAddVac: false, showSwapModal: false,
  showPublishModal: false, swapMyShift: null, swapTargetShift: null,
  empSwapTab: "swap", handoverShift: null, handoverTarget: null,
  showShiftEditor: false, publishType: 'final',
  newEmp: { name:"", email:"", idNumber:"", phone:"", role:"employee" },
  newVac: { employeeId:"", startDate:"", endDate:"", reason:"" },
  availDraft: {}, availTargetOffset: 1,
  testAsEmployee: false, blockReasons: {}, schedPublishType: {}, publishedInitial: null,
  monthOffset: 0, blocksWeekOffset: 0, swapWeekOffset: 0,
  mgrBlocksTab: "team", mgrSwapsTab: "approve", mgrVacTab: "approve",
  schedMobileView: "week", schedDayIdx: null,
  currentPublishType: null, showBlocksModal: false,
  toast: null, modal: null,
  loginMode: "login",
};

if (typeof window !== 'undefined') {
  window.S = S;
}
