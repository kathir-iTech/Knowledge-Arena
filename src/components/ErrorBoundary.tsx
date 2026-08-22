'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  variant?: 'arena' | 'livequiz';
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
    else window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      if (this.props.variant === 'livequiz') {
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center gap-4 bg-card border border-destructive/10 rounded-[16px] shadow-elevation-small max-w-lg mx-auto mt-8" role="alert">
            <div className="flex items-center justify-center w-14 h-14 rounded-[14px] bg-destructive/10">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-headline font-semibold">Battle UI Crashed</h2>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                The quiz display hit an unexpected error. Your progress is still saved — please rejoin your battle to continue.
              </p>
              {this.state.error?.message && (
                <p className="text-xs text-muted-foreground/60 font-mono break-all">{this.state.error.message.slice(0, 200)}</p>
              )}
            </div>
            <div className="flex gap-3 mt-2">
              <Button onClick={this.handleReset}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Arena
              </Button>
              <Button variant="outline" onClick={() => (window.location.href = '/')}>
                <Swords className="w-4 h-4 mr-2" />
                Rejoin Battle
              </Button>
            </div>
          </div>
        );
      }

      // default arena variant
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-6 safe-top safe-bottom" role="alert">
          <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10 ring-1 ring-destructive/10">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h1 className="text-page-title font-headline tracking-tight">Something went wrong in the arena</h1>
            <p className="text-base text-muted-foreground">
              An unexpected error occurred. Your data is safe — please reload to continue.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/50 font-mono mt-1 break-all">{this.state.error.message.slice(0, 200)}</p>
            )}
          </div>
          <Button onClick={this.handleReset} className="min-w-[140px]">
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload Arena
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
