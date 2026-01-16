
// Represents a user profile, typically stored in /users/{uid}
export interface User {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
  role: 'Teacher' | 'Student'; // For UI purposes, security is via custom claims
  avatar: string; // Emoji
}

// Represents the main battle document at /battles/{battleId}
export interface Battle {
  id: string;
  title: string;
  state: 'waiting' | 'live' | 'finished';
  currentQuestionIndex: number;
  questionCount: number;
  questionStartAt?: number; // Server timestamp (optional)
  timeLimit?: number;       // Seconds for the current question (optional)
  createdBy: string; // UID of the teacher
  createdAt: number;
}

// Represents a question document at /battles/{battleId}/questions/{questionId}
// This is the public data visible to students.
export interface BattleQuestion {
  id: string;
  text: string;
  options: string[];
  timer: number; // Stored here for client-side display
}

// Represents the full quiz structure used during creation
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

// Represents a participant document at /battles/{battleId}/participants/{userId}
export interface BattleParticipant {
  id: string; // userId
  name: string;
  avatar: string;
  role: 'teacher' | 'student';
  score: number;
  status: 'playing' | 'finished' | 'blocked';
  violationsCount: number;
}

// Represents an answer submission document at /battles/{battleId}/answers/{userId}/{questionId}
export interface BattleAnswer {
  selectedOption: number;
  submittedAt: number; // Should be a server timestamp
}

// Represents a violation document at /battles/{battleId}/violations/{userId}
export interface Violation {
    timestamp: number; // Server timestamp
    userId: string;
}

// Represents the aggregated leaderboard document
export interface Leaderboard {
    topPlayers: {
        userId: string;
        name: string;
        avatar: string;
        score: number;
    }[];
    updatedAt: number;
}
