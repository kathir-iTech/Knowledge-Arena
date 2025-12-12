
export interface User {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
  role: 'Teacher' | 'Student';
  avatar: string; // Emoji
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  timer: number; // in seconds
}

export interface Quiz {
  id: string;
  teacherId: string;
  title: string;
  questions: Question[];
}

export interface BattleRoom {
  id: string; // The room code
  teacherId: string;
  quiz: Quiz; // Denormalized quiz object
  status: 'waiting' | 'in-progress' | 'finished';
  currentQuestionIndex: number;
  createdAt: number;
  participantCount?: number; // Number of students who were in the room when it finished
}

export interface BattleParticipation {
  id: string; // studentId
  studentId: string;
  studentName: string;
  studentAvatar: string;
  battleRoomId: string;
  answers: {
    questionId: string;
    answerIndex: number | null; // null if timed out
    isCorrect: boolean;
    score: number;
  }[];
  totalScore: number;
  malpracticeCount: number;
  isBlocked: boolean;
}
