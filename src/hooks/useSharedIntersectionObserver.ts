'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface IntersectionObserverEntry {
  target: Element;
  isIntersecting: boolean;
}

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

class SharedIntersectionObserver {
  private observer: IntersectionObserver | null = null;
  private targets: Map<Element, { callback: ObserverCallback; options: IntersectionObserverInit }> = new Map();
  private static instance: SharedIntersectionObserver | null = null;

  private constructor() {}

  static getInstance(): SharedIntersectionObserver {
    if (!SharedIntersectionObserver.instance) {
      SharedIntersectionObserver.instance = new SharedIntersectionObserver();
    }
    return SharedIntersectionObserver.instance;
  }

  observe(element: Element, callback: ObserverCallback, options: IntersectionObserverInit = {}): () => void {
    if (!this.observer) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const targetData = this.targets.get(entry.target);
          if (targetData) {
            targetData.callback([{ target: entry.target, isIntersecting: entry.isIntersecting }]);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px', ...options });
    }

    this.targets.set(element, { callback, options });

    if (this.observer) {
      this.observer.observe(element);
    }

    return () => this.unobserve(element);
  }

  unobserve(element: Element): void {
    this.targets.delete(element);
    if (this.observer) {
      this.observer.unobserve(element);
      if (this.targets.size === 0) {
        this.observer.disconnect();
        this.observer = null;
      }
    }
  }
}

export function useSharedIntersectionObserver(
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const observerRef = useRef(SharedIntersectionObserver.getInstance());

  const setRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const cleanup = observerRef.current.observe(
      element,
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsIntersecting(true);
          }
        });
      },
      options
    );

    return cleanup;
  }, [options.threshold, options.rootMargin, options.root]);

  return [ref, isIntersecting];
}

export function useSharedIntersectionObserverWithDelay(
  delay: number = 0,
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement | null>, boolean] {
  const [ref, isIntersecting] = useSharedIntersectionObserver(options);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isIntersecting && !visible) {
      if (delay > 0) {
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
      }
      setVisible(true);
    }
  }, [isIntersecting, delay, visible]);

  return [ref, visible];
}