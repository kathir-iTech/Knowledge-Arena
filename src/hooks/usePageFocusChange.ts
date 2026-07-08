"use client";

import { useEffect, useCallback } from 'react';

/**
 * A hook that triggers a callback when the page loses visibility or window focus.
 * Uses both 'visibilitychange' (tab switches, app switches, screen lock) and
 * 'blur' (window losing focus - catches some overlay gestures on mobile, though
 * not all system-level overlays like Circle to Search are guaranteed to trigger this).
 * @param onFocusLoss The callback function to execute when focus is lost.
 * @param enabled Whether the hook is active.
 */
export const usePageFocusChange = (onFocusLoss: () => void, enabled: boolean = true) => {

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden && enabled) {
      onFocusLoss();
    }
  }, [onFocusLoss, enabled]);

  const handleBlur = useCallback(() => {
    if (enabled) {
      onFocusLoss();
    }
  }, [onFocusLoss, enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleVisibilityChange, handleBlur, enabled]);
};
