export type DemoRole = 'executive' | 'commander' | 'gladiator' | 'admin' | 'assessor' | 'candidate';

export interface DemoAccount {
  role: DemoRole;
  email: string;
  password: string;
  name: string;
  avatar: string;
  label: string;
  description: string;
}

export const DEMO_PASSWORD = 'Test123456!';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'executive',
    email: 'exec@test.local',
    password: DEMO_PASSWORD,
    name: 'Executive Beta (Admin)',
    avatar: '🏛️',
    label: 'Ministry Admin',
    description: 'Inter-assessor kappa, regional calibration & NCVET statutory audit.',
  },
  {
    role: 'commander',
    email: 'commander@test.local',
    password: DEMO_PASSWORD,
    name: 'Commander Kade (Assessor)',
    avatar: '📋',
    label: 'Field Assessor',
    description: 'Evaluate candidates, review trade evidence & rubric criterion scoring.',
  },
  {
    role: 'candidate',
    email: 'candidate@test.local',
    password: DEMO_PASSWORD,
    name: 'Priya Sharma (Candidate)',
    avatar: '🧑‍🔧',
    label: 'Worker / Candidate',
    description: 'Conversational self-declaration wizard with vernacular voice read-aloud.',
  },
];

export const DEMO_ROLE_HOME: Record<string, string> = {
  executive: '/rpl/admin',
  admin: '/rpl/admin',
  commander: '/rpl/assessor',
  assessor: '/rpl/assessor',
  gladiator: '/rpl',
  candidate: '/rpl',
};

export function getDemoAccount(role: string): DemoAccount | undefined {
  if (role === 'admin') return DEMO_ACCOUNTS.find(a => a.role === 'executive');
  if (role === 'assessor') return DEMO_ACCOUNTS.find(a => a.role === 'commander');
  return DEMO_ACCOUNTS.find(a => a.role === role);
}
