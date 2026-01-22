
// Represents a user profile, typically stored in /users/{uid}
export interface User {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
  role: 'Teacher' | 'Student'; // For UI purposes, security is via custom claims
  avatar: string; // Emoji
}

// Represents the main quiz document at /quizzes/{quizId}
export interface Quiz {
  id: string;
  title: string;
  status: 'waiting' | 'live' | 'finished';
  currentQuestionIndex: number;
  questionCount: number;
  questionStartAt?: number; // Server timestamp (optional)
  timeLimit?: number;       // Seconds for the current question (optional)
  createdBy: string; // UID of the teacher
  createdAt: number;
}

// Represents a question document at /quizzes/{quizId}/questions/{questionId}
// This is the public data visible to students.
export interface QuizQuestion {
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

// Represents a participant document at /quizzes/{quizId}/participants/{userId}
export interface QuizParticipant {
  id: string; // userId
  name: string;
  avatar: string;
  role: 'teacher' | 'student';
  score: number;
  status: 'playing' | 'finished' | 'blocked';
  violationsCount: number;
}

// Represents an answer submission document at /quizzes/{quizId}/submissions/{userId}/{questionId}
export interface QuizSubmission {
  selectedOption: number;
  submittedAt: number; // Should be a server timestamp
}

// Represents a violation document at /quizzes/{quizId}/violations/{violationId}
export interface Violation {
    id: string;
    userId: string;
    timestamp: number; // Server timestamp
}
