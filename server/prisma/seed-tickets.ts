// Seeds 100 realistic demo tickets (an online-learning support inbox) so the
// ticket list's sorting, filtering and pagination have something to show.
// Varies status, category (some uncategorized), assignee (some unassigned) and
// received date (spread over the last 90 days).
//
// Safe to re-run: each ticket has a fixed Message-ID (<demo-N@seed.local>), so
// existing demo tickets are skipped. Refuses to run against the test database.
//
//   cd server && bun run db:seed:tickets
import type { TicketCategory, TicketStatus } from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/lib/prisma.ts";

if (new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")) {
  throw new Error("Refusing to seed demo tickets into a *_test database");
}

type Demo = [subject: string, body: string, category: TicketCategory | null];

const G = "GENERAL_QUESTION";
const T = "TECHNICAL_QUESTION";
const R = "REFUND_REQUEST";

const demos: Demo[] = [
  ["Can't log in after password reset", "I reset my password this morning but the login page keeps saying my credentials are invalid. I've tried three times.", T],
  ["Refund for Advanced Python course", "I bought Advanced Python last week by mistake — I meant to buy the beginner course. Could I get a refund?", R],
  ["When does the spring cohort start?", "Hi, I'd like to join the next Data Science cohort. When does it start and is there a deadline to enrol?", G],
  ["Video stuck at 0:00 in Module 3", "Every lecture in Module 3 of Web Development Bootcamp stays on a black screen at 0:00. Other modules play fine.", T],
  ["Certificate has my name misspelled", "My completion certificate says 'Jonh' instead of 'John'. How can I get it reissued?", G],
  ["Charged twice for the same course", "My card statement shows two charges of $49.99 for UX Design Fundamentals on the same day. Please refund one.", R],
  ["Quiz won't submit", "When I click Submit on the Week 4 quiz nothing happens. I tried Chrome and Firefox.", T],
  ["Do you offer student discounts?", "I'm a full-time university student. Is there a discount on the annual plan?", G],
  ["Cancel subscription and refund this month", "I cancelled my monthly plan two days after renewal. Can I get this month refunded since I haven't used it?", R],
  ["Download button missing on mobile app", "The offline download icon disappeared from the iOS app after the latest update.", T],
  ["How long do I have access?", "If I buy a single course, do I keep access forever or does it expire?", G],
  ["Subtitles out of sync", "The English subtitles in Machine Learning 101, lecture 7, are about 5 seconds behind the audio.", T],
  ["Refund request - course not as described", "The Excel Mastery course description promised pivot table exercises but there are none. I'd like a refund.", R],
  ["Change the email on my account", "I'm moving away from my work email. How do I change the email address I log in with?", G],
  ["Error 500 when opening assignments", "Opening the Assignments tab gives 'Internal Server Error'. Started yesterday evening.", T],
  ["Can I pause my subscription?", "I'm travelling for two months without internet. Is it possible to pause rather than cancel?", G],
  ["Accidental annual plan purchase", "I clicked annual instead of monthly. Could you refund the difference or switch me to monthly?", R],
  ["Code editor not saving my work", "In the JavaScript exercises my code disappears whenever I refresh the page.", T],
  ["Invoice for my company", "My employer is paying for the course. Can you send an invoice with our company VAT number?", G],
  ["Two-factor code never arrives", "I turned on 2FA and now the SMS code never arrives, so I'm locked out.", T],
  ["Refund for duplicate account purchase", "I bought the same course on two accounts without realising. Please refund the second purchase.", R],
  ["Is the course content updated for 2026?", "Is the React course updated for the latest version? The preview looks a bit old.", G],
  ["Audio crackling on all videos", "Since Monday all lecture audio crackles badly. My other apps sound fine.", T],
  ["Group discount for a team of 12", "We'd like to enrol 12 people from our team. Do you have team pricing?", G],
  ["Course removed from my library", "Cloud Fundamentals vanished from My Courses, even though I bought it in January.", T],
  ["Refund - medical reasons", "I've been hospitalised and won't be able to complete the bootcamp. Is a refund possible?", R],
  ["Can't upload my project file", "Uploading my final project (a 40 MB zip) fails at 99% every time.", T],
  ["Where can I find the course syllabus?", "Before I buy, is there a full syllabus for the Cybersecurity course?", G],
  ["Promo code didn't apply", "I used code SPRING20 at checkout but was charged full price. Could you refund the 20%?", R],
  ["Progress bar reset to 0%", "My progress in SQL for Analysts reset to 0% even though I finished 8 modules.", T],
  ["Do certificates show a grade?", "Will my certificate show my final score, or just that I completed the course?", G],
  ["App crashes on Android 15", "The Android app crashes immediately on launch after updating to Android 15.", T],
  ["Refund - course too advanced", "Kubernetes Deep Dive is far more advanced than I expected. I watched one lecture. Refund please?", R],
  ["Delete my account and data", "Please delete my account and all personal data associated with it.", G],
  ["Live session link not working", "The Zoom link for Thursday's live Q&A says the meeting doesn't exist.", T],
  ["Gift a course to a friend", "Can I buy a course as a gift for someone else's account?", G],
  ["Billing address wrong on receipt", "My receipt shows my old address. Can you update it and resend?", G],
  ["Charged after free trial cancelled", "I cancelled my free trial on day 5 but was still charged $29. Please refund.", R],
  ["Dark mode makes code unreadable", "In dark mode the code snippets are dark grey on black and impossible to read.", T],
  ["Prerequisites for Data Engineering?", "Do I need to know Python before taking the Data Engineering track?", G],
  ["Payment declined but money taken", "Checkout said my payment was declined, but my bank shows the money left my account.", R],
  ["Keyboard shortcuts stopped working", "Space no longer pauses the video and the arrow keys don't seek anymore.", T],
  ["Can I switch courses?", "I enrolled in Graphic Design but would rather do Motion Graphics. Can I swap without paying again?", G],
  ["Exercise tests fail but my answer is right", "The auto-grader for Exercise 5.3 fails my solution even though the output matches exactly.", T],
  ["Refund for unused bundle courses", "I bought the 5-course bundle but only want 2 of them. Can I get a partial refund?", R],
  ["Is there a mobile app for iPad?", "Is the app optimised for iPad, or should I use the browser?", G],
  ["SSO login loop", "Signing in with my university SSO sends me back to the login page in a loop.", T],
  ["Need certificate for visa application", "I need an official letter confirming my enrolment for my visa application. Can you provide one?", G],
  ["Refund - instructor left mid-course", "The instructor stopped posting new content halfway through. I paid for a complete course.", R],
  ["Videos buffer constantly", "Even on fast Wi-Fi the videos buffer every few seconds. Speed tests show 200 Mbps.", T],
  ["How do I reset my progress?", "I want to retake a course from scratch. Is there a way to reset my progress?", G],
  ["Wrong currency charged", "I'm in the UK but was charged in USD and my bank added conversion fees.", R],
  ["Discussion forum posts not showing", "I've posted three questions in the forum and none of them appear.", T],
  ["Accessibility: screen reader support", "Are your course pages compatible with NVDA? Some buttons aren't announced.", T],
  ["Refund within 14 days policy", "I bought the course 10 days ago. Your policy says 14-day refunds — please process mine.", R],
  ["Can I download slides?", "Are the lecture slides available as PDFs to download?", G],
  ["Notifications email flood", "I'm getting 20+ notification emails a day. How do I turn these off?", G],
  ["Captions missing for Spanish", "The Spanish captions option shows up but there's no text displayed.", T],
  ["Refund - bought on wrong account", "I purchased on my personal account instead of my work account. Please refund so I can rebuy.", R],
  ["Corporate training options", "Our company wants a custom training programme for 50 engineers. Who should I talk to?", G],
  ["Exam timer kept running when offline", "My internet dropped during the final exam and the timer ran out while I was disconnected.", T],
  ["Lifetime deal still available?", "A friend mentioned a lifetime access deal. Is that still offered?", G],
  ["Refund - didn't receive the workbook", "The course was supposed to include a printed workbook that never arrived.", R],
  ["Can't change my display name", "The Save button on the profile page is greyed out when I edit my display name.", T],
  ["Will there be a part 2?", "I loved Intro to Game Design. Is an advanced follow-up course planned?", G],
  ["Browser says connection not secure", "Firefox shows a certificate warning when I open the course player.", T],
  ["Refund after accidental renewal", "My annual plan auto-renewed yesterday. I meant to cancel it. Can I get a refund?", R],
  ["Recommend a learning path", "I'm a nurse moving into health informatics. Which courses would you recommend?", G],
  ["Playback speed resets every video", "I set 1.5x speed but every new video starts at 1x again.", T],
  ["Scholarship application status", "I applied for the Women in Tech scholarship three weeks ago. Any update?", G],
  ["Refund - same course bought twice", "I didn't realise I already owned this course from a bundle. Please refund the new purchase.", R],
  ["Assignments due dates wrong timezone", "Due dates show in UTC instead of my local time, so I missed a deadline.", T],
  ["Can I share my account with my partner?", "Can my partner and I share one subscription, or do we need two?", G],
  ["Unable to cancel subscription", "The Cancel button on the billing page does nothing when I click it.", T],
  ["Refund - poor audio quality", "The audio on most lectures of Photography Basics is barely audible. I'd like a refund.", R],
  ["Mentor session booking", "How do I book a one-on-one session with a mentor? I can't find the option.", G],
  ["Jupyter notebook kernel keeps dying", "In the Data Science labs the notebook kernel restarts every few minutes.", T],
  ["Need receipt for tax purposes", "Could you send receipts for all my purchases in 2025?", G],
  ["Refund - job offer withdrawn", "My employer was going to cover this but the job offer fell through. Can I get a refund?", R],
  ["Search returns no results", "Searching for anything in the course catalogue returns 'No results'.", T],
  ["Language options for courses", "Are any courses taught in French?", G],
  ["Leaderboard shows wrong points", "The leaderboard shows me with 120 points but my profile says 450.", T],
  ["Refund - charged for cancelled plan", "I cancelled my plan in March but was charged again in April and May.", R],
  ["Email verification link expired", "The verification link in my welcome email says it has expired.", T],
  ["Request for an extension", "I've had a family emergency. Can I get a two-week extension on my capstone project?", G],
  ["Partial refund for price drop", "The course went on sale for half price two days after I bought it. Can you refund the difference?", R],
  ["", "Hello, I can't find where to start my course after paying. Please help.", null],
  ["Question", "Is there a phone number I can call for support?", null],
  ["Help!!!", "Nothing loads on the website since this morning, just a spinning wheel.", null],
  ["Thank you", "Just wanted to say the support team was really helpful last week. Thanks!", null],
  ["Re: your recent order", "I received an email about an order I don't remember placing. Is this legitimate?", null],
  ["Feedback on the new design", "The new dashboard is much harder to navigate. Where did My Courses go?", null],
  ["Partnership enquiry", "We run a coding bootcamp and would like to discuss a content partnership.", null],
  ["", "my account got hacked someone changed my email please help asap", null],
  ["Course recommendation for my son", "My 15-year-old wants to learn programming. Is there a course suitable for teenagers?", null],
  ["Urgent: exam tomorrow", "My exam access says 'not available' and the exam is tomorrow morning!", null],
  ["Wrong course in my library", "I have a course called 'Advanced Accounting' in my library that I never bought.", null],
  ["Billing question", "Why does my subscription cost more this month than last month?", null],
  ["Login issue", "I can log in on my phone but not on my laptop.", null],
  ["Certificate not generated", "I completed every module of Digital Marketing 101 a week ago but no certificate has appeared.", T],
];

const names = [
  "Aisha Khan", "Ben Carter", "Chloé Martin", "Daniel Okafor", "Elena Petrova", "Farid Haddad", "Grace Liu",
  "Hiro Tanaka", "Isabel Romero", "Jack O'Brien", "Kavya Nair", "Liam Murphy", "Maya Cohen", "Noah Fischer",
  "Olivia Brown", "Pedro Alves", "Quinn Taylor", "Rania Aziz", "Sven Larsson", "Tara Singh", "Umar Farouk",
  "Valentina Rossi", "Wei Zhang", "Ximena López", "Yusuf Demir", "Zoe Williams", "Amara Mensah", "Bruno Costa",
  "Chen Wei", "Dmitri Ivanov", "Emily Johnson", "Fatima Zahra", "Gabriel Silva", "Hannah Schmidt",
  "Ibrahim Musa", "Julia Nowak", "Kenji Sato", "Lucía Fernández", "Mohammed Ali", "Nadia Popescu",
];

const emailFor = (name: string, i: number) =>
  `${name.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ /g, ".")}${i % 3 === 0 ? i : ""}@example.com`;

// Deterministic pseudo-random numbers, so re-runs produce the same data.
let rngState = 20261128;
const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const assignees = await prisma.user.findMany({
  where: { deletedAt: null },
  select: { id: true, name: true },
  orderBy: { createdAt: "asc" },
});

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
let created = 0;

for (const [i, [subject, body, category]] of demos.entries()) {
  // Spread over the last 90 days, at random times of day.
  const ageDays = rand() * 90;
  const createdAt = new Date(now - ageDays * DAY);

  // Older tickets are more likely to be resolved or closed.
  const roll = rand();
  const status: TicketStatus =
    ageDays > 30 ? (roll < 0.2 ? "OPEN" : roll < 0.75 ? "RESOLVED" : "CLOSED")
    : ageDays > 7 ? (roll < 0.5 ? "OPEN" : roll < 0.9 ? "RESOLVED" : "CLOSED")
    : roll < 0.85 ? "OPEN" : "RESOLVED";

  // Most resolved/closed tickets were handled by someone; ~40% of open ones are unassigned.
  const assignee =
    assignees.length > 0 && (status !== "OPEN" ? rand() < 0.9 : rand() < 0.6)
      ? assignees[Math.floor(rand() * assignees.length)]!
      : null;

  // Very new tickets often haven't been categorized yet.
  const finalCategory = category && ageDays < 3 && rand() < 0.5 ? null : category;

  const name = names[i % names.length]!;
  const messageId = `<demo-${i + 1}@seed.local>`;
  const exists = await prisma.ticket.findUnique({ where: { messageId }, select: { id: true } });
  if (exists) continue;

  await prisma.ticket.create({
    data: {
      subject: subject || "(no subject)",
      body,
      fromName: name,
      fromEmail: emailFor(name, i),
      status,
      category: finalCategory,
      assigneeId: assignee?.id ?? null,
      messageId,
      createdAt,
    },
  });
  created++;
}

const byStatus = await prisma.ticket.groupBy({ by: ["status"], _count: true, where: { messageId: { endsWith: "@seed.local>" } } });
const byCategory = await prisma.ticket.groupBy({ by: ["category"], _count: true, where: { messageId: { endsWith: "@seed.local>" } } });
console.log(`Created ${created} demo tickets (${demos.length - created} already existed).`);
console.log("By status:", Object.fromEntries(byStatus.map((r) => [r.status, r._count])));
console.log("By category:", Object.fromEntries(byCategory.map((r) => [r.category ?? "Uncategorized", r._count])));
console.log(`Assignees used: ${assignees.map((a) => a.name).join(", ") || "none (all unassigned)"}`);

await prisma.$disconnect();
