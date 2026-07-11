import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';

export interface QuestionDoc {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
}

export interface AnswerKeyDoc {
  id: string;
  correct_option_index: number;
}

export interface SubmissionDoc {
  id: string;
  selected_option: number;
  submittedAt: number;
  question_id?: string;
}

export interface QuizAnalytics {
  quizId: string;
  title: string;
  status: string;
  created_at: number;
  duration: number;
  totalParticipants: number;
  finishedParticipants: number;
  blockedParticipants: number;
  completionPercent: number;
  dropoutPercent: number;
  totalViolations: number;
  averageScore: number;
  medianScore: number;
  stdDevScore: number;
  scoreDistribution: { range: string; count: number }[];
  participationTimeline: { time: number; count: number }[];
  averageAnswerTime: number;
  engagementScore: number;
}

export interface StudentAnalytics {
  userId: string;
  name: string;
  avatar: string;
  quizzesAttended: number;
  quizzesCompleted: number;
  completionPercent: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  rankHistory: { quizId: string; title: string; rank: number; total: number }[];
  latestPercentile: number;
  improvementTrend: number;
  participationFrequency: number;
  lastSeen: number;
  averageAnswerTime: number;
  totalViolations: number;
  blockedCount: number;
}

export interface QuestionAnalytics {
  questionId: string;
  text: string;
  quizId: string;
  quizTitle: string;
  correctPercent: number;
  wrongPercent: number;
  skippedPercent: number;
  averageResponseTime: number;
  optionDistribution: { label: string; count: number; isCorrect: boolean }[];
  commonWrongAnswer: { option: string; count: number } | null;
  totalSubmissions: number;
}

export interface OverviewStats {
  totalQuizzes: number;
  liveQuizzes: number;
  completedQuizzes: number;
  archivedQuizzes: number;
  totalParticipants: number;
  activeParticipants: number;
  averageParticipantsPerQuiz: number;
  completionRate: number;
  averageScore: number;
  averageQuizDuration: number;
}

export interface AnalyticsData {
  overview: OverviewStats;
  students: StudentAnalytics[];
  questions: QuestionAnalytics[];
  quizzes: QuizAnalytics[];
  fetchedAt: number;
}

function escCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function escHtml(v: string | number): string {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeDiv(a: number, b: number): number {
  if (b === 0) return 0;
  return a / b;
}

function clamp(v: number): number {
  if (isNaN(v)) return 0;
  if (!isFinite(v)) return v > 0 ? 100 : 0;
  return v;
}

function round2(v: number): number {
  return Math.round(clamp(v) * 100) / 100;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const sqDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function scoreHistogram(scores: number[]): { range: string; count: number }[] {
  const buckets = [0, 0, 0, 0, 0];
  const ranges = ['0-200', '201-400', '401-600', '601-800', '801-1000+'];
  for (const s of scores) {
    if (s <= 200) buckets[0]++;
    else if (s <= 400) buckets[1]++;
    else if (s <= 600) buckets[2]++;
    else if (s <= 800) buckets[3]++;
    else buckets[4]++;
  }
  return ranges.map((range, i) => ({ range, count: buckets[i] }));
}

export function computeAnalytics(
  quizzes: ValidatedQuiz[],
  participantsMap: Record<string, ValidatedParticipant[]>,
  questionsMap: Record<string, QuestionDoc[]>,
  answerKeysMap: Record<string, AnswerKeyDoc[]>,
  submissionsMap: Record<string, SubmissionDoc[]>,
): AnalyticsData {
  const finishedQuizzes = quizzes.filter(q => q.status === 'finished');
  const now = Date.now();

  // --- Quiz Overview ---
  const allParticipants = Object.values(participantsMap).flat();
  const totalParticipants = allParticipants.length;
  const activeParticipants = allParticipants.filter(p => p.status === 'playing').length;
  const allScores = allParticipants.map(p => p.score || 0);

  const overview: OverviewStats = {
    totalQuizzes: quizzes.length,
    liveQuizzes: quizzes.filter(q => q.status === 'live').length,
    completedQuizzes: finishedQuizzes.length,
    archivedQuizzes: quizzes.filter(q => q.archived).length,
    totalParticipants,
    activeParticipants,
    averageParticipantsPerQuiz: round2(safeDiv(totalParticipants, quizzes.length)),
    completionRate: round2(safeDiv(finishedQuizzes.length, quizzes.length) * 100),
    averageScore: round2(safeDiv(allScores.reduce((a, b) => a + b, 0), allScores.length || 1)),
    averageQuizDuration: 0,
  };

  // Sort finished quizzes chronologically for consistent student analytics
  finishedQuizzes.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

  // --- Quiz Analytics ---
  const quizAnalytics: QuizAnalytics[] = [];
  for (const q of finishedQuizzes) {
    const parts = participantsMap[q.id] || [];
    const students = parts.filter(p => p.user_id !== (q as ValidatedQuiz).created_by);
    const scores = students.map(p => p.score || 0);
    const total = scores.length;
    const finished = students.filter(p => p.status === 'finished').length;
    const blocked = students.filter(p => p.status === 'blocked').length;
    const violations = students.reduce((s, p) => s + (p.violations_count || 0), 0);
    const avgScore = safeDiv(scores.reduce((a, b) => a + b, 0), scores.length || 1);

    const subs = submissionsMap[q.id] || [];
    // Per-question response times using earliest submission as proxy for question start
    const subsByQ = new Map<string, SubmissionDoc[]>();
    for (const s of subs) {
      const qid = s.question_id || '';
      if (!qid) continue;
      const arr = subsByQ.get(qid) || [];
      arr.push(s);
      subsByQ.set(qid, arr);
    }
    const responseTimes: number[] = [];
    for (const [, qSubs] of subsByQ) {
      if (qSubs.length < 2) continue;
      const sorted = [...qSubs].sort((a, b) => a.submittedAt - b.submittedAt);
      const estStart = sorted[0].submittedAt;
      for (let si = 1; si < sorted.length; si++) {
        const rt = sorted[si].submittedAt - estStart;
        if (rt > 0 && rt < 3600000) responseTimes.push(rt);
      }
    }
    const avgAnswerTime = safeDiv(responseTimes.reduce((a, b) => a + b, 0), responseTimes.length || 1);

    // Quiz duration from earliest to latest submission timestamp across all questions
    const allTimestamps = subs.map(s => s.submittedAt).filter(t => t > 0);
    const duration = allTimestamps.length > 1 ? Math.max(...allTimestamps) - Math.min(...allTimestamps) : 0;

    const timeline = buildTimeline(subs);

    quizAnalytics.push({
      quizId: q.id,
      title: q.title || 'Untitled',
      status: q.status,
      created_at: q.created_at || 0,
      duration,
      totalParticipants: total,
      finishedParticipants: finished,
      blockedParticipants: blocked,
      completionPercent: round2(safeDiv(finished, total || 1) * 100),
      dropoutPercent: round2(safeDiv(total - finished, total || 1) * 100),
      totalViolations: violations,
      averageScore: round2(avgScore),
      medianScore: round2(median(scores)),
      stdDevScore: round2(stdDev(scores, avgScore)),
      scoreDistribution: scoreHistogram(scores),
      participationTimeline: timeline,
      averageAnswerTime: Math.round(avgAnswerTime / 1000),
      engagementScore: computeEngagement(finished, total, violations, blocked),
    });
  }

  const quizDurations = quizAnalytics.map(q => q.duration).filter(d => d > 0);
  overview.averageQuizDuration = Math.round(safeDiv(quizDurations.reduce((a, b) => a + b, 0), quizDurations.length || 1));

  // --- Student Analytics ---
  const studentMap = new Map<string, {
    name: string; avatar: string;
    quizzesAttended: Set<string>;
    quizzesCompleted: Set<string>;
    scores: number[];
    ranks: { quizId: string; title: string; rank: number; total: number }[];
    firstSeen: number;
    lastSeen: number;
    responseTimes: number[];
    violations: number;
    blocked: number;
  }>();

  for (const q of finishedQuizzes) {
    const parts = participantsMap[q.id] || [];
    const currStudents = parts.filter(p => p.user_id !== (q as ValidatedQuiz).created_by);
    const sorted = [...currStudents].sort((a, b) => (b.score || 0) - (a.score || 0));
    const qCreatedAt = q.created_at || 0;

    for (const p of currStudents) {
      let entry = studentMap.get(p.user_id);
      if (!entry) {
        entry = { name: p.name || p.user_id.slice(0, 8), avatar: p.avatar || '🎮', quizzesAttended: new Set(), quizzesCompleted: new Set(), scores: [], ranks: [], firstSeen: qCreatedAt, lastSeen: 0, responseTimes: [], violations: 0, blocked: 0 };
        studentMap.set(p.user_id, entry);
      }
      entry.quizzesAttended.add(q.id);
      if (p.status === 'finished') entry.quizzesCompleted.add(q.id);
      entry.scores.push(p.score || 0);
      entry.violations += p.violations_count || 0;
      if (p.status === 'blocked') entry.blocked++;
      if (qCreatedAt > 0 && qCreatedAt < entry.firstSeen) entry.firstSeen = qCreatedAt;
      if (qCreatedAt > entry.lastSeen) entry.lastSeen = qCreatedAt;
      const rank = sorted.findIndex(s => s.user_id === p.user_id) + 1;
      entry.ranks.push({ quizId: q.id, title: q.title || 'Untitled', rank, total: sorted.length });
    }
  }

  // Submissions for answer times — per-question min submission time proxy
  for (const [quizId, subs] of Object.entries(submissionsMap)) {
    const subsByQ = new Map<string, SubmissionDoc[]>();
    for (const s of subs) {
      const qId = s.question_id || '';
      if (!qId) continue;
      const arr = subsByQ.get(qId) || [];
      arr.push(s);
      subsByQ.set(qId, arr);
    }
    for (const [, qSubs] of subsByQ) {
      if (qSubs.length < 2) continue;
      const sorted = [...qSubs].sort((a, b) => a.submittedAt - b.submittedAt);
      const estStart = sorted[0].submittedAt;
      for (let si = 1; si < sorted.length; si++) {
        const rt = sorted[si].submittedAt - estStart;
        if (rt > 0 && rt < 3600000) {
          const entry = studentMap.get(sorted[si].id);
          if (entry) entry.responseTimes.push(rt);
        }
      }
    }
  }

  const students: StudentAnalytics[] = [];
  for (const [userId, entry] of studentMap) {
    const attended = entry.quizzesAttended.size;
    const completed = entry.quizzesCompleted.size;
    const avgScore = safeDiv(entry.scores.reduce((a, b) => a + b, 0), entry.scores.length || 1);
    const latestRank = entry.ranks.length > 0 ? entry.ranks[entry.ranks.length - 1] : null;
    const latestPercentile = latestRank ? safeDiv(latestRank.total - latestRank.rank, latestRank.total || 1) * 100 : 0;
    const firstScore = entry.scores.length > 0 ? entry.scores[0] : 0;
    const lastScore = entry.scores.length > 0 ? entry.scores[entry.scores.length - 1] : 0;
    const improvement = entry.scores.length >= 2 ? lastScore - firstScore : 0;

    const timeSpanDays = entry.firstSeen > 0 && entry.lastSeen > entry.firstSeen
      ? Math.max(1, (entry.lastSeen - entry.firstSeen) / 86400000)
      : 1;
    const frequency = safeDiv(attended, timeSpanDays);

    const avgResponseTime = safeDiv(entry.responseTimes.reduce((a, b) => a + b, 0), entry.responseTimes.length || 1);

    students.push({
      userId,
      name: entry.name,
      avatar: entry.avatar,
      quizzesAttended: attended,
      quizzesCompleted: completed,
      completionPercent: round2(safeDiv(completed, attended || 1) * 100),
      averageScore: round2(avgScore),
      highestScore: entry.scores.length > 0 ? Math.max(...entry.scores) : 0,
      lowestScore: entry.scores.length > 0 ? Math.min(...entry.scores) : 0,
      rankHistory: entry.ranks,
      latestPercentile: round2(latestPercentile),
      improvementTrend: improvement,
      participationFrequency: round2(frequency),
      lastSeen: entry.lastSeen,
      averageAnswerTime: Math.round(avgResponseTime / 1000),
      totalViolations: entry.violations,
      blockedCount: entry.blocked,
    });
  }

  students.sort((a, b) => b.averageScore - a.averageScore);

  // --- Question Analytics ---
  const questionAnalytics: QuestionAnalytics[] = [];
  for (const q of finishedQuizzes) {
    const questions = questionsMap[q.id] || [];
    const aks = answerKeysMap[q.id] || [];
    const akMap = new Map(aks.map(ak => [ak.id, ak.correct_option_index]));
    const subs = submissionsMap[q.id] || [];
    const subsByQuestion = new Map<string, SubmissionDoc[]>();
    for (const s of subs) {
      const qId = s.question_id || '';
      if (!qId) continue;
      const arr = subsByQuestion.get(qId) || [];
      arr.push(s);
      subsByQuestion.set(qId, arr);
    }

    const totalParts = (participantsMap[q.id] || []).filter(p => p.user_id !== (q as ValidatedQuiz).created_by).length;

    for (const question of questions) {
      const correctIdx = akMap.get(question.id);
      const questionSubs = subsByQuestion.get(question.id) || [];
      const total = totalParts;
      const submitted = questionSubs.length;
      const correct = correctIdx !== undefined ? questionSubs.filter(s => s.selected_option === correctIdx).length : 0;
      const wrong = submitted - correct;
      const skipped = Math.max(0, total - submitted);

      const optionCounts = question.options.map((_, i) => questionSubs.filter(s => s.selected_option === i).length);
      // Per-question response time using earliest submission as proxy for question start
      let avgTime = 0;
      if (questionSubs.length >= 2) {
        const sorted = [...questionSubs].sort((a, b) => a.submittedAt - b.submittedAt);
        const estStart = sorted[0].submittedAt;
        const rts = sorted.slice(1).map(s => s.submittedAt - estStart).filter(t => t > 0 && t < 3600000);
        avgTime = safeDiv(rts.reduce((a, b) => a + b, 0), rts.length || 1);
      }

      let commonWrong: { option: string; count: number } | null = null;
      if (correctIdx !== undefined) {
        let maxWrong = 0;
        let maxWrongIdx = -1;
        for (let i = 0; i < question.options.length; i++) {
          if (i !== correctIdx && optionCounts[i] > maxWrong) {
            maxWrong = optionCounts[i];
            maxWrongIdx = i;
          }
        }
        if (maxWrongIdx >= 0 && maxWrong > 0) {
          commonWrong = { option: question.options[maxWrongIdx], count: maxWrong };
        }
      }

      questionAnalytics.push({
        questionId: question.id,
        text: question.text,
        quizId: q.id,
        quizTitle: q.title || 'Untitled',
        correctPercent: round2(safeDiv(correct, submitted || 1) * 100),
        wrongPercent: round2(safeDiv(wrong, submitted || 1) * 100),
        skippedPercent: round2(safeDiv(skipped, total || 1) * 100),
        averageResponseTime: Math.round(avgTime / 1000),
        optionDistribution: question.options.map((opt, i) => ({
          label: opt,
          count: optionCounts[i],
          isCorrect: i === correctIdx,
        })),
        commonWrongAnswer: commonWrong,
        totalSubmissions: submitted,
      });
    }
  }

  return {
    overview,
    students,
    questions: questionAnalytics,
    quizzes: quizAnalytics,
    fetchedAt: now,
  };
}

function computeEngagement(finished: number, total: number, violations: number, blocked: number): number {
  if (total === 0) return 0;
  const completionScore = safeDiv(finished, total) * 40;
  const dropoutScore = safeDiv(total - finished, total) * 30;
  const violationScore = Math.max(0, 30 - safeDiv(violations + blocked * 3, total || 1) * 10);
  return round2(Math.min(100, completionScore + (30 - dropoutScore) + violationScore));
}

function buildTimeline(submissions: SubmissionDoc[]): { time: number; count: number }[] {
  const timestamps = submissions
    .map(s => s.submittedAt)
    .filter(t => t > 0)
    .map(t => Math.floor(t / 30000) * 30000);

  if (!timestamps.length) return [];

  const counts = new Map<number, number>();
  for (const t of timestamps) counts.set(t, (counts.get(t) || 0) + 1);

  return Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, count]) => ({ time, count }));
}

export function exportAnalyticsCSV(data: AnalyticsData): string {
  const rows: string[][] = [['Metric', 'Value']];
  rows.push(['Total Quizzes', String(data.overview.totalQuizzes)]);
  rows.push(['Completed Quizzes', String(data.overview.completedQuizzes)]);
  rows.push(['Total Participants', String(data.overview.totalParticipants)]);
  rows.push(['Average Score', String(data.overview.averageScore)]);
  rows.push(['Completion Rate (%)', String(data.overview.completionRate)]);
  rows.push([]);
  rows.push(['Student', 'Quizzes', 'Completed', 'Completion %', 'Avg Score', 'Highest', 'Lowest', 'Violations', 'Blocked']);
  for (const s of data.students) {
    rows.push([s.name, String(s.quizzesAttended), String(s.quizzesCompleted), String(s.completionPercent), String(s.averageScore), String(s.highestScore), String(s.lowestScore), String(s.totalViolations), String(s.blockedCount)]);
  }
  return rows.map(r => r.map(c => escCsv(c)).join(',')).join('\n');
}

export function exportAnalyticsHTML(data: AnalyticsData): string {
  const studentRows = data.students.map(s =>
    `<tr><td>${escHtml(s.name)}</td><td>${s.quizzesAttended}</td><td>${s.completionPercent}%</td><td>${s.averageScore}</td><td>${s.highestScore}</td><td>${s.totalViolations}</td></tr>`
  ).join('');

  const quizRows = data.quizzes.map(q =>
    `<tr><td>${escHtml(q.title)}</td><td>${q.totalParticipants}</td><td>${q.completionPercent}%</td><td>${q.averageScore}</td><td>${q.engagementScore}</td><td>${q.totalViolations}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Analytics Report</title><style>
body{font-family:system-ui,sans-serif;padding:40px;max-width:1200px;margin:auto}
h1{font-size:28px}h2{font-size:20px;margin-top:32px}h3{font-size:16px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin-top:12px;page-break-inside:auto}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd;page-break-inside:avoid}
th{background:#f5f5f5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}
tr{page-break-inside:avoid}
.overview{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-top:16px}
.card{background:#f9f9f9;padding:16px;border-radius:12px;text-align:center}
.card .value{font-size:28px;font-weight:bold;color:#333}
.card .label{font-size:12px;color:#666;margin-top:4px}
@media print{body{padding:20px}th{background:#eee!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<h1>Knowledge Arena — Analytics Report</h1>
<p>Generated: ${escHtml(new Date(data.fetchedAt).toLocaleString())}</p>
<h2>Overview</h2>
<div class="overview">
<div class="card"><div class="value">${data.overview.totalQuizzes}</div><div class="label">Total Quizzes</div></div>
<div class="card"><div class="value">${data.overview.completedQuizzes}</div><div class="label">Completed</div></div>
<div class="card"><div class="value">${data.overview.totalParticipants}</div><div class="label">Participants</div></div>
<div class="card"><div class="value">${data.overview.averageScore}</div><div class="label">Avg Score</div></div>
<div class="card"><div class="value">${data.overview.completionRate}%</div><div class="label">Completion Rate</div></div>
</div>
<h2>Students</h2>
<table><thead><tr><th>Name</th><th>Quizzes</th><th>Completion</th><th>Avg Score</th><th>Highest</th><th>Violations</th></tr></thead>
<tbody>${studentRows}</tbody></table>
${quizRows ? `<h2>Finished Quizzes</h2>
<table><thead><tr><th>Title</th><th>Participants</th><th>Completion</th><th>Avg Score</th><th>Engagement</th><th>Violations</th></tr></thead>
<tbody>${quizRows}</tbody></table>` : ''}
</body></html>`;
}
