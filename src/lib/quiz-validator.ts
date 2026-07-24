export interface QuizValidationIssue {
  type: IssueType;
  questionIndex: number;
  message: string;
  severity: 'error' | 'warning';
}

export type IssueType =
  | 'duplicate_question'
  | 'duplicate_option'
  | 'empty_option'
  | 'correct_answer_missing'
  | 'min_options'
  | 'question_length'
  | 'option_length'
  | 'duplicate_correct_answer'
  | 'invalid_json';

export interface ValidatedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
}

const MIN_QUESTION_LENGTH = 5;
const MAX_QUESTION_LENGTH = 500;
const MIN_OPTION_LENGTH = 1;
const MAX_OPTION_LENGTH = 200;

export function validateQuiz(questions: ValidatedQuestion[]): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  if (!questions || !Array.isArray(questions)) {
    issues.push({
      type: 'invalid_json',
      questionIndex: -1,
      message: 'Quiz data is not a valid array of questions.',
      severity: 'error',
    });
    return issues;
  }

  const questionTexts = new Map<string, number[]>();

  questions.forEach((q, idx) => {
    const lowerText = q.text?.toLowerCase().trim() || '';

    if (questionTexts.has(lowerText)) {
      questionTexts.get(lowerText)!.push(idx);
    } else {
      questionTexts.set(lowerText, [idx]);
    }

    if (!q.text || q.text.trim().length < MIN_QUESTION_LENGTH) {
      issues.push({
        type: 'question_length',
        questionIndex: idx,
        message: `Question ${idx + 1} is too short (${(q.text || '').trim().length} chars). Minimum ${MIN_QUESTION_LENGTH} characters required.`,
        severity: 'error',
      });
    } else if (q.text.trim().length > MAX_QUESTION_LENGTH) {
      issues.push({
        type: 'question_length',
        questionIndex: idx,
        message: `Question ${idx + 1} is too long (${q.text.trim().length} chars). Maximum ${MAX_QUESTION_LENGTH} characters allowed.`,
        severity: 'warning',
      });
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      issues.push({
        type: 'min_options',
        questionIndex: idx,
        message: `Question ${idx + 1} has ${q.options?.length || 0} options. Minimum 2 required.`,
        severity: 'error',
      });
    }

    if (Array.isArray(q.options)) {
      const optionTexts = new Set<string>();
      q.options.forEach((opt, oi) => {
        const trimmed = (opt || '').trim();
        if (!trimmed) {
          issues.push({
            type: 'empty_option',
            questionIndex: idx,
            message: `Question ${idx + 1}, Option ${String.fromCharCode(65 + oi)} is empty.`,
            severity: 'error',
          });
        } else if (trimmed.length > MAX_OPTION_LENGTH) {
          issues.push({
            type: 'option_length',
            questionIndex: idx,
            message: `Question ${idx + 1}, Option ${String.fromCharCode(65 + oi)} is too long (${trimmed.length} chars). Maximum ${MAX_OPTION_LENGTH} characters.`,
            severity: 'warning',
          });
        }

        if (trimmed && optionTexts.has(trimmed.toLowerCase())) {
          issues.push({
            type: 'duplicate_option',
            questionIndex: idx,
            message: `Question ${idx + 1} has duplicate option text "${trimmed.substring(0, 40)}".`,
            severity: 'error',
          });
        }
        optionTexts.add(trimmed.toLowerCase());
      });

      if (
        q.correctAnswerIndex === undefined ||
        q.correctAnswerIndex < 0 ||
        q.correctAnswerIndex >= q.options.length
      ) {
        issues.push({
          type: 'correct_answer_missing',
          questionIndex: idx,
          message: `Question ${idx + 1} has no valid correct answer selected (index ${q.correctAnswerIndex} out of range).`,
          severity: 'error',
        });
      }
    }
  });

  for (const [text, indices] of questionTexts.entries()) {
    if (indices.length > 1) {
      indices.forEach(i => {
        issues.push({
          type: 'duplicate_question',
          questionIndex: i,
          message: `Question ${i + 1} is a duplicate of Question ${indices.filter(j => j !== i)[0] + 1}: "${text.substring(0, 40)}".`,
          severity: 'warning',
        });
      });
    }
  }

  const correctIndices = questions
    .filter(q => q.correctAnswerIndex >= 0 && q.correctAnswerIndex < (q.options?.length || 0))
    .map(q => q.correctAnswerIndex);

  if (correctIndices.length >= 2) {
    const allSame = correctIndices.every(idx => idx === correctIndices[0]);
    if (allSame && questions.length >= 2) {
      issues.push({
        type: 'duplicate_correct_answer',
        questionIndex: -1,
        message: `All questions have the correct answer at Option ${String.fromCharCode(65 + correctIndices[0])}. Consider varying the correct answer position.`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

function groupIssuesByQuestion(issues: QuizValidationIssue[]): Map<number, QuizValidationIssue[]> {
  const grouped = new Map<number, QuizValidationIssue[]>();
  for (const issue of issues) {
    if (!grouped.has(issue.questionIndex)) {
      grouped.set(issue.questionIndex, []);
    }
    grouped.get(issue.questionIndex)!.push(issue);
  }
  return grouped;
}
