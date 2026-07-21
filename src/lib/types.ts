export interface User {
  id: string;
  name: string;
  email: string;
  role: 'executive' | 'commander' | 'gladiator';
  avatar: string;
  mustChangePassword?: boolean;
}
