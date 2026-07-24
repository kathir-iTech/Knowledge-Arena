export const STAFF_EMAIL_DOMAIN = 'knowledgearena.app';

export function mapStaffIdToEmail(input: string): string {
  if (input.includes('@')) return input;
  return `${input}@${STAFF_EMAIL_DOMAIN}`;
}
