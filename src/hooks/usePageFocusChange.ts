"use client";

import { useEffect, useCallback } from 'react';

/**
 * A hook that triggers a callback when the page loses visibility or focus.
 * This is used to detect when a user might be switching tabs, minimizing the browser,
 * or invoking mobile-specific UIs like "pull-to-search".
 * @param onFocusLoss The callback function to execute when focus is lost.
 */
export const usePageFocusChange = (onFocusLoss: () => void) => {
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      onFocusLoss();
    }
  }, [onFocusLoss]);

  const handleBlur = useCallback(() => {
    // We check document.hidden because some browsers might fire both blur and visibilitychange.
    // This ensures the callback is only triggered once.
    if (!document.hidden) {
        onFocusLoss();
    }
  }, [onFocusLoss]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleVisibilityChange, handleBlur]);
};
