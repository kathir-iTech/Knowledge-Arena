export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
} as const;

const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/;
const SPECIAL = /[^A-Za-z0-9]/;

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, errors: ['Password is required.'] };
  }
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    errors.push(`Password must be at most ${PASSWORD_POLICY.MAX_LENGTH} characters.`);
  }
  if (!LOWER.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (!UPPER.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!DIGIT.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  if (!SPECIAL.test(password)) {
    errors.push('Password must contain at least one special character (e.g. !@#$%).');
  }

  return { valid: errors.length === 0, errors };
}

export function firstPasswordError(password: string): string | null {
  const result = validatePasswordStrength(password);
  return result.valid ? null : result.errors[0];
}
