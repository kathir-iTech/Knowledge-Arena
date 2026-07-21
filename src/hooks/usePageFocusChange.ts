"use client";

import { useEffect, useRef } from 'react';

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

    const handlePageHide = () => {
      if (enabledRef.current) {
        callbackRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);
};
