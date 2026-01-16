
"use client";

import { useEffect, useCallback } from 'react';

/**
 * A hook that triggers a callback when the page loses visibility or focus.
 * This is used to detect when a user might be switching tabs, minimizing the browser,
 * or invoking mobile-specific UIs like "pull-to-search".
 * @param onFocusLoss The callback function to execute when focus is lost. It will only be called once per visibility change event.
 * @param enabled Whether the hook is active.
 */
export const usePageFocusChange = (onFocusLoss: () => void, enabled: boolean = true) => {

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden && enabled) {
      onFocusLoss();
    }
  }, [onFocusLoss, enabled]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // The 'blur' event can be too noisy, especially with devtools.
    // 'visibilitychange' is more reliable for detecting tab switches.
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);
};
