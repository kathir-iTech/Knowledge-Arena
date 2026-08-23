export type DemoRole = 'executive' | 'commander' | 'gladiator';

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
    name: 'Executive Beta',
    avatar: '🏛️',
    label: 'Executive',
    description: 'Company-wide analytics, battle command center and governance.',
  },
  {
    role: 'commander',
    email: 'commander@test.local',
    password: DEMO_PASSWORD,
    name: 'Commander Kade',
    avatar: '🎖️',
    label: 'Commander',
    description: 'Create arenas, forge AI questions and command live battles.',
  },
  {
    role: 'gladiator',
    email: 'glad1@test.local',
    password: DEMO_PASSWORD,
    name: 'Ruby',
    avatar: '🦊',
    label: 'Gladiator',
    description: 'Join battles, climb leaderboards and get AI study recommendations.',
  },
];

export const DEMO_ROLE_HOME: Record<DemoRole, string> = {
  executive: '/executive/workspace',
  commander: '/commander/dashboard',
  gladiator: '/gladiator/dashboard',
};

export function getDemoAccount(role: DemoRole): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find(a => a.role === role);
}
