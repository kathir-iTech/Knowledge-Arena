'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, AlertTriangle, Building2, Clock, DownloadCloud, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PlatformSettings {
  institutionName: string;
  institutionLogo: string;
  battleDefaults: {
    questionTimerDefault: number;
    maxQuestions: number;
    defaultDifficulty: string;
  };
  exportPreferences: {
    includeStudentNames: boolean;
    includeScores: boolean;
    includeTimestamps: boolean;
  };
}

const defaultSettings: PlatformSettings = {
  institutionName: '',
  institutionLogo: '',
  battleDefaults: {
    questionTimerDefault: 30,
    maxQuestions: 50,
    defaultDifficulty: 'medium',
  },
  exportPreferences: {
    includeStudentNames: true,
    includeScores: true,
    includeTimestamps: true,
  },
};

export default function ExecutiveSettingsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDangerDialog, setShowDangerDialog] = useState(false);
  const [dangerAction, setDangerAction] = useState<'reset' | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load settings.' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) fetchSettings();
  }, [user, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/executive/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast({ title: 'Settings Saved', description: 'Platform settings have been updated.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDangerAction = async () => {
    setShowDangerDialog(false);
    try {
      const token = await auth.currentUser!.getIdToken();
      if (dangerAction === 'reset') {
        setSettings(defaultSettings);
        await fetch('/api/executive/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ settings: defaultSettings }),
        });
        toast({ title: 'Settings Reset', description: 'Platform settings have been reset to defaults.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Action failed.' });
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container animate-in space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Settings</h1>
          <p className="text-base text-muted-foreground">Platform configuration and preferences.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="w-5 h-5 text-primary" />
            Institution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="institutionName">Institution Name</Label>
            <Input
              id="institutionName"
              value={settings.institutionName}
              onChange={e => setSettings({ ...settings, institutionName: e.target.value })}
              placeholder="e.g. Springfield University"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institutionLogo">Institution Logo URL</Label>
            <Input
              id="institutionLogo"
              value={settings.institutionLogo}
              onChange={e => setSettings({ ...settings, institutionLogo: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-primary" />
            Battle Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="questionTimer">Question Timer (seconds)</Label>
              <Input
                id="questionTimer"
                type="number"
                min={5}
                max={300}
                value={settings.battleDefaults.questionTimerDefault}
                onChange={e => setSettings({
                  ...settings,
                  battleDefaults: { ...settings.battleDefaults, questionTimerDefault: parseInt(e.target.value) || 30 }
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxQuestions">Maximum Questions</Label>
              <Input
                id="maxQuestions"
                type="number"
                min={1}
                max={200}
                value={settings.battleDefaults.maxQuestions}
                onChange={e => setSettings({
                  ...settings,
                  battleDefaults: { ...settings.battleDefaults, maxQuestions: parseInt(e.target.value) || 50 }
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDifficulty">Default Difficulty</Label>
              <Select
                value={settings.battleDefaults.defaultDifficulty}
                onValueChange={v => setSettings({
                  ...settings,
                  battleDefaults: { ...settings.battleDefaults, defaultDifficulty: v }
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DownloadCloud className="w-5 h-5 text-primary" />
            Export Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="includeNames">Include Student Names</Label>
            <Switch
              id="includeNames"
              checked={settings.exportPreferences.includeStudentNames}
              onCheckedChange={(checked: boolean) => setSettings({
                ...settings,
                exportPreferences: { ...settings.exportPreferences, includeStudentNames: checked }
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="includeScores">Include Scores</Label>
            <Switch
              id="includeScores"
              checked={settings.exportPreferences.includeScores}
              onCheckedChange={(checked: boolean) => setSettings({
                ...settings,
                exportPreferences: { ...settings.exportPreferences, includeScores: checked }
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="includeTimestamps">Include Timestamps</Label>
            <Switch
              id="includeTimestamps"
              checked={settings.exportPreferences.includeTimestamps}
              onCheckedChange={(checked: boolean) => setSettings({
                ...settings,
                exportPreferences: { ...settings.exportPreferences, includeTimestamps: checked }
              })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Resetting will clear all settings back to defaults. This action cannot be undone.
          </p>
          <Button
            variant="destructive"
            onClick={() => { setDangerAction('reset'); setShowDangerDialog(true); }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Reset All Settings
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showDangerDialog} onOpenChange={setShowDangerDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {dangerAction === 'reset'
                ? 'This will reset all platform settings to their defaults. This action cannot be undone.'
                : 'This action is dangerous and cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDangerAction} className="bg-destructive hover:bg-destructive/90">
              Confirm Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
