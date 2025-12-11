
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Student' | 'Teacher';
  avatar: string; // emoji
  xp: number;
}

export interface Question {
  id: string;
  text: string;
  answerOptions: string[];
  correctAnswerIndex: number;
  explanation: string;
  timer: number; // in seconds
}

export interface Quiz {
  id: string; 
  topic: string;
  teacherId: string; // userId
  questions: Question[];
  createdAt: number;
}

export interface Room {
  id: string;
  quizId: string;
  quiz: Quiz; // Denormalized for easy access
  teacherId: string; // userId of teacher who created the quiz
  studentIds: string[];
  status: 'waiting' | 'playing' | 'finished';
  currentQuestionIndex: number;
  startTime: number;
  battleResultIds: string[];
  createdAt: number;
}

export interface BattleResult {
  id: string;
  battleRoomId: string;
  studentId: string;
  teacherId: string;
  studentName: string;
  studentAvatar: string;
  score: number;
  completedAt: number;
}

export interface BattlePlayer extends User {
  score: number;
}

    