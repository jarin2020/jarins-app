export const outcomes = [
  { area: "Family", title: "Prepare tomorrow calmly", note: "Bags, clothes and breakfast basics", progress: 70, tone: "family" },
  { area: "Self", title: "30 minutes just for you", note: "A walk, tea or quiet time. No target.", progress: 45, tone: "self" },
  { area: "Future", title: "B2 + Digital Marketing", note: "One focused learning block", progress: 60, tone: "career" },
];

export const essentials = [
  { id: "e1", title: "Children’s essentials ready", meta: "Family · recurring", done: true },
  { id: "e2", title: "One nourishing family meal", meta: "Home · food", done: true },
  { id: "e3", title: "10-minute home reset", meta: "Home · minimum routine", done: true },
  { id: "e4", title: "30-minute B2 / career block", meta: "Learning · future", done: false },
  { id: "e5", title: "Prepare tomorrow’s top three", meta: "Self · planning", done: false },
];

export const schedule = [
  { time: "18:30", title: "Family dinner", meta: "Simple dinner · no extra cooking project", tone: "green" },
  { time: "19:15", title: "Children’s evening routine", meta: "Bath · pajamas · story · tomorrow prep", tone: "family" },
  { time: "20:45", title: "B2 micro-session", meta: "20 min vocabulary + 10 min speaking", tone: "career" },
  { time: "21:20", title: "Reset kitchen + inbox", meta: "Maximum 15 minutes", tone: "warm" },
];

export const moduleData = {
  family: {
    stats: [["2", "Child profiles"], ["4", "Appointments this month"], ["6", "Shared routines"]],
    cards: [
      ["Family calendar", "Tomorrow", "Kita preparation", "Clothes · water · bag · weather check"],
      ["Child profiles", "2 people", "Seasonal clothing check", "Review current sizes and missing basics"],
      ["Packing lists", "5 templates", "Ready for ordinary days", "Kita · swimming · doctor · travel · winter"],
      ["Memories", "Private", "One photo, one sentence", "A light record — never a social feed"],
    ],
  },
  home: {
    stats: [["3", "Dinners planned"], ["7", "Grocery items"], ["4", "Routines this week"]],
    cards: [
      ["Meals", "This week", "Plan just three dinners", "Family base with optional adult variation"],
      ["Groceries", "7 items", "Shared shopping list", "Produce · fridge · pantry · household"],
      ["Routines", "Minimum ready", "Kitchen close", "10-minute minimum · 25-minute full"],
      ["Maintenance", "Next in 12 days", "Insurance renewal", "Important commitments appear before urgency"],
    ],
  },
  self: {
    stats: [["3/5", "Energy today"], ["22m", "Movement"], ["30m", "Protected time"]],
    cards: [
      ["Daily check-in", "Optional", "How are you arriving?", "Energy, mood, sleep and one short note"],
      ["Protected time", "Today", "Coffee alone", "Time that is not childcare, housework, study or work"],
      ["Morning routine", "Minimum", "Water + get dressed + 3-minute plan", "Low energy calls for the smaller version"],
      ["Reflection", "Gentle", "Good enough for today", "No punishment, streak pressure or performance score"],
    ],
  },
  learning: {
    stats: [["150m", "This week"], ["2", "Active programs"], ["4", "Evidence items"]],
    cards: [
      ["German B2 Beruf", "Active", "Next: 20-minute speaking", "Vocabulary · speaking · writing · listening · grammar"],
      ["Digital Marketing", "28%", "SEO foundations", "Build useful evidence as you learn"],
      ["Study sessions", "3 this week", "Small blocks count", "Plan minutes, actual minutes, focus and confidence"],
      ["Certificates", "Upcoming", "B2 exam preparation", "Keep proof connected to your career bridge"],
    ],
  },
  career: {
    stats: [["4", "Transition milestones"], ["7", "Evidence items"], ["2027", "Target re-entry"]],
    cards: [
      ["My transition", "Living narrative", "Caregiving → language → training", "Explain verified growth without inventing employment"],
      ["Evidence vault", "7 items", "B1 certificate", "Courses, projects, assignments and recommendations"],
      ["Portfolio", "1 active", "Local campaign analysis", "Challenge · approach · metrics · lessons"],
      ["Job readiness", "5 of 9", "Build the return-to-work toolkit", "CV · LinkedIn · interview stories · constraints"],
    ],
  },
  money: {
    stats: [["€1,240", "Monthly commitments"], ["€180", "Upcoming costs"], ["2", "Savings goals"]],
    cards: [
      ["Recurring costs", "Monthly", "Known household commitments", "Amounts, due dates and payment status"],
      ["Upcoming", "12 days", "Annual insurance", "See one-off costs before they become surprises"],
      ["Education", "Budgeted", "B2 exam fee", "Keep career investment visible and intentional"],
      ["Savings goals", "2 active", "Family buffer", "Planning only — no bank credentials or aggregation"],
    ],
  },
  documents: {
    stats: [["12", "Indexed documents"], ["2", "Expiring soon"], ["4", "Private categories"]],
    cards: [
      ["Identity & official", "Private", "Passports and IDs", "Issue dates, expiry dates and issuer"],
      ["Children", "Private", "Kita records", "Related person, notes and reminders"],
      ["Learning & career", "4 files", "Certificates", "Evidence stays connected to progress"],
      ["Home & finance", "6 files", "Contracts and insurance", "Short-lived access links in production storage"],
    ],
  },
  future: {
    stats: [["3", "Active horizons"], ["2", "Linked projects"], ["1", "Action today"]],
    cards: [
      ["This month", "Family", "Calmer morning rhythm", "Prepare essentials the evening before"],
      ["3 months", "Learning", "Confident B2 speaking", "Three small sessions per week"],
      ["12 months", "Career", "Portfolio-ready skills", "Complete training plus two evidence projects"],
      ["3 years", "Whole life", "Work that fits family life", "Direction creates today’s next small action"],
    ],
  },
} as const;
