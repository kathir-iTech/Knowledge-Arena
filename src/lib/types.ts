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
  options: string[];
  correctAnswer: number;
  explanation: string;
  timer: number; // in seconds
}

export interface Quiz {
  id: string; 
  topic: string;
  createdBy: string; // userId
  questions: Question[];
}

export interface Room {
  id: string;
  quizId: string;
  participants: User[];
  status: 'waiting' | 'playing' | 'finished';
  scores: { [userId: string]: number };
  currentQuestionIndex: number;
  startTime: number;
}

export interface BattlePlayer extends User {
  score: number;
}
