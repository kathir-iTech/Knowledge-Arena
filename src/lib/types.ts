
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Teacher' | 'Student';
  avatar: string;
}

export interface Quiz {
  id: string;
  title: string;
  status: 'waiting' | 'live' | 'finished';
  currentQuestionIndex: number;
  questionCount: number;
  questionStartAt?: number;
  createdBy: string;
  createdAt: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  timer: number;
  index: number;
}

export interface QuizParticipant {
  id: string;
  name: string;
  avatar: string;
  role: 'teacher' | 'student';
  score: number;
  status: 'playing' | 'finished' | 'blocked';
  violationsCount: number;
}

export interface QuizSubmission {
  id?: string;
  selectedOption: number;
  submittedAt: number;
}

export interface QuizFormData {
  title: string;
  questions: {
    id: string;
    text: string;
    options: string[];
    correctAnswerIndex: number;
    timer: number;
  }[];
}
