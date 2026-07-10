export interface User {
  id: string;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  avatar: string;
}
