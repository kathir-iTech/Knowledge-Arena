export interface User {
  id: string;
  name: string;
  email: string;
  role: 'executive' | 'commander' | 'gladiator';
  avatar: string;
  mustChangePassword?: boolean;
  institution_domain?: string | null; // Commander institution domain (e.g. psgitech.ac.in). Blank = open.
}
