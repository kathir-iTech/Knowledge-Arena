"use client";

import { useEffect, useCallback } from 'react';

export const useVisibilityChange = (onHidden: () => void) => {
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      onHidden();
    }
  }, [onHidden]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);
};
