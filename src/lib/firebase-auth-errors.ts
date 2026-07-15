export interface MappedAuthError {
  title: string;
  message: string;
  isSilent: boolean;
}

export function mapFirebaseAuthError(
  error: unknown,
  context: 'login' | 'signup' | 'google'
): MappedAuthError {
  const err = error as { code?: string; message?: string } | null;
  const code = err?.code || null;

  if (code) {
    console.error(`[Auth Error] ${code}`, error);
  } else {
    console.error('[Auth Error]', error);
  }

  const baseTitle = context === 'login' ? 'Sign In Failed'
    : context === 'signup' ? 'Account Creation Failed'
    : 'Google Sign-In Failed';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        title: 'Sign In Failed',
        message: 'Incorrect email or password. Please check your details and try again.',
        isSilent: false,
      };

    case 'auth/invalid-email':
      return {
        title: baseTitle,
        message: 'Please enter a valid email address.',
        isSilent: false,
      };

    case 'auth/email-already-in-use':
      return {
        title: 'Account Creation Failed',
        message: 'An account with this email already exists. Please sign in instead.',
        isSilent: false,
      };

    case 'auth/weak-password':
      return {
        title: 'Account Creation Failed',
        message: 'Please choose a stronger password.',
        isSilent: false,
      };

    case 'auth/too-many-requests':
      return {
        title: 'Too Many Attempts',
        message: 'Too many attempts. Please wait a moment and try again.',
        isSilent: false,
      };

    case 'auth/network-request-failed':
      return {
        title: baseTitle,
        message: 'Unable to connect. Please check your internet connection and try again.',
        isSilent: false,
      };

    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { title: '', message: '', isSilent: true };

    case 'auth/popup-blocked':
      return {
        title: 'Google Sign-In Failed',
        message: 'Google Sign-In was blocked by your browser. Please allow popups and try again.',
        isSilent: false,
      };

    case 'auth/account-exists-with-different-credential':
      return {
        title: 'Google Sign-In Failed',
        message: 'An account already exists with this email. Sign in using your existing sign-in method.',
        isSilent: false,
      };

    case 'auth/operation-not-allowed':
      return {
        title: baseTitle,
        message: 'Account creation is currently unavailable.',
        isSilent: false,
      };

    case 'permission-denied':
    case 'unavailable':
    case 'failed-precondition':
      return {
        title: baseTitle,
        message: 'Account creation is currently unavailable. Please try again.',
        isSilent: false,
      };

    default:
      return {
        title: baseTitle,
        message: 'Unable to sign in right now. Please try again.',
        isSilent: false,
      };
  }
}
