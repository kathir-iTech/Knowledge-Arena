'use client';

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkAction {
  label: string;
  icon?: React.ElementType;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  onClick: (selectedIds: string[]) => void;
  disabled?: boolean;
}

interface BulkSelectionProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  allIds: string[];
  actions: BulkAction[];
  className?: string;
}

export function BulkSelection({ selectedIds, onSelectionChange, allIds, actions, className }: BulkSelectionProps) {
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...allIds]);
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(s => s !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      <Checkbox
        checked={allSelected}
        data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
        onCheckedChange={toggleAll}
        aria-label={allSelected ? 'Deselect all' : 'Select all'}
      />
      <span className="text-sm text-muted-foreground">
        {selectedIds.length} of {allIds.length} selected
      </span>
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <Button
                key={i}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={() => action.onClick(selectedIds)}
                disabled={action.disabled}
              >
                {Icon && <Icon className="w-4 h-4 mr-1.5" />}
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BulkSelectionCheckbox({
  id,
  selectedIds,
  onSelectionChange,
}: {
  id: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const checked = selectedIds.includes(id);
  const toggle = () => {
    if (checked) {
      onSelectionChange(selectedIds.filter(s => s !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={toggle}
      aria-label={`Select item ${id}`}
      className="shrink-0"
    />
  );
}
