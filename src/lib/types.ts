export interface User {
  id: string;
  name: string;
  email: string;
  // RPL Compass roles: candidate (self-serve signup), assessor/admin (assigned
  // via RPL_ASSESSOR_EMAILS / RPL_ADMIN_EMAILS at session mint).
  role: 'executive' | 'commander' | 'gladiator' | 'candidate' | 'assessor' | 'admin';
  avatar: string;
  mustChangePassword?: boolean;
  institution_domain?: string | null; // Commander institution domain (e.g. psgitech.ac.in). Blank = open.
}
