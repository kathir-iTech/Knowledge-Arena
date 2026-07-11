"use client";

import { useEffect, useRef } from 'react';

/**
 * A hook that triggers a callback when the page loses visibility or window focus.
 * Uses refs internally so listeners are registered once and always call the latest
 * callback — no stale closures, no listener re-attachment on callback change.
 */
export const usePageFocusChange = (onFocusLoss: () => void, enabled: boolean = true) => {
  const callbackRef = useRef(onFocusLoss);
  const enabledRef = useRef(enabled);

  callbackRef.current = onFocusLoss;
  enabledRef.current = enabled;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && enabledRef.current) {
        callbackRef.current();
      }
    };

    const handleBlur = () => {
      if (enabledRef.current) {
        callbackRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
};
