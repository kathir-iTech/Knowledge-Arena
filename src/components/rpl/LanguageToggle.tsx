'use client';

import { Button } from '@/components/ui/button';
import { type Lang } from '@/lib/rpl/i18n';

interface LanguageToggleProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

export function LanguageToggle({ lang, onChange }: LanguageToggleProps) {
  return (
    <div className="flex gap-2">
      {(['en', 'hi', 'ta'] as const).map((l) => (
        <Button
          key={l}
          variant={lang === l ? 'default' : 'outline'}
          size="icon"
          aria-label={`Language: ${l}`}
          onClick={() => onChange(l)}
          className="p-1 rounded-md"
        >
          {l === 'en' ? 'EN' : l === 'hi' ? 'HI' : 'TA'}
        </Button>
      ))}
    </div>
  );
}