import type { User, Quiz, Room } from '@/lib/types';

// In-memory store
const users: User[] = [
  { id: '1', name: 'CyberBlade', email: 'teacher@staffs.com', role: 'Teacher', avatar: '🤖', xp: 1500 },
  { id: '2', name: 'SynthWave', email: 'student1@example.com', role: 'Student', avatar: '👾', xp: 2200 },
  { id: '3', name: 'NeonSpecter', email: 'student2@example.com', role: 'Student', avatar: '🔮', xp: 1850 },
  { id: '4', name: 'GlitchMaster', email: 'student3@example.com', role: 'Student', avatar: '🧠', xp: 3100 },
  { id: '5', name: 'DataWraith', email: 'student4@example.com', role: 'Student', avatar: '👻', xp: 950 },
  { id: '6', name: 'CodeRonin', email: 'student5@example.com', role: 'Student', avatar: ' Samurai', xp: 2500 },
];

const quizzes = new Map<string, Quiz>();
const rooms = new Map<string, Room>();

// User Management
export const findUserByEmail = (email: string): User | undefined => {
  return users.find(user => user.email === email);
};

export const createUser = (userData: Omit<User, 'id' | 'xp' | 'role'> & { role: 'Student' | 'Teacher' }): User => {
  const newUser: User = {
    ...userData,
    id: (users.length + 1).toString(),
    xp: 0,
  };
  users.push(newUser);
  return newUser;
};

export const updateUser = (userId: string, updates: Partial<User>): User | undefined => {
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return undefined;
  users[userIndex] = { ...users[userIndex], ...updates };
  return users[userIndex];
}

export const getAllUsers = (): User[] => {
  return [...users].sort((a, b) => b.xp - a.xp);
};

// Quiz and Room Management
export const createQuizAndRoom = (quiz: Omit<Quiz, 'id'>, host: User): Quiz => {
  const newQuiz: Quiz = { ...quiz, id: quiz.id };
  quizzes.set(newQuiz.id, newQuiz);

  const newRoom: Room = {
    quizId: newQuiz.id,
    participants: [host],
    status: 'waiting',
    scores: { [host.id]: 0 },
    currentQuestionIndex: 0,
    startTime: 0,
  };
  rooms.set(newQuiz.id, newRoom);

  return newQuiz;
};

export const getQuiz = (quizId: string): Quiz | undefined => {
  return quizzes.get(quizId);
};

export const getRoom = (roomId: string): Room | undefined => {
  return rooms.get(roomId);
};

export const joinRoom = (roomId: string, user: User): Room | undefined => {
    const room = rooms.get(roomId);
    if (!room || room.participants.some(p => p.id === user.id)) return undefined;

    room.participants.push(user);
    if (!room.scores[user.id]) {
      room.scores[user.id] = 0;
    }
    rooms.set(roomId, room);
    return room;
}

export const updateRoom = (roomId: string, updates: Partial<Room>): Room | undefined => {
    const room = rooms.get(roomId);
    if (!room) return undefined;
    const updatedRoom = { ...room, ...updates };
    rooms.set(roomId, updatedRoom);
    return updatedRoom;
}
