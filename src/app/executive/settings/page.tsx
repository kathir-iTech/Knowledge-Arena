'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, AlertTriangle, Building2, Clock, DownloadCloud, Trash2, Shield, BrainCircuit, MessageSquare, Palette } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PlatformSettings {
  institutionName: string;
  institutionLogo: string;
  theme: string;
  workspaceName: string;
  auth: {
    allowCommanderSelfRegistration: boolean;
    allowGladiatorRegistration: boolean;
  };
  battle: {
    questionTimerDefault: number;
    maxQuestions: number;
    defaultDifficulty: string;
    autoEndBattle: boolean;
    leaderboardVisibility: string;
  };
  ai: {
    enabled: boolean;
    defaultModel: string;
    maxPdfSize: number;
  };
  messaging: {
    enableAnnouncements: boolean;
    enableChat: boolean;
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
  theme: 'system',
  workspaceName: 'Knowledge Arena',
  auth: {
    allowCommanderSelfRegistration: false,
    allowGladiatorRegistration: true,
  },
  battle: {
    questionTimerDefault: 30,
    maxQuestions: 50,
    defaultDifficulty: 'medium',
    autoEndBattle: false,
    leaderboardVisibility: 'public',
  },
  ai: {
    enabled: true,
    defaultModel: 'gemini-2.0-flash',
    maxPdfSize: 10,
  },
  messaging: {
    enableAnnouncements: true,
    enableChat: true,
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
  const [activeTab, setActiveTab] = useState('general');

  const getToken = async (): Promise<string> => {
    const firebaseAuth = auth as any;
    if (firebaseAuth?.currentUser) {
      return await firebaseAuth.currentUser.getIdToken();
    }
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (firebaseAuth?.currentUser) {
        return await firebaseAuth.currentUser.getIdToken();
      }
    }
    throw new Error('Not authenticated');
  };

  const fetchSettings = useCallback(async () => {
    try {
      const token = await getToken();
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
  }, [auth, toast]);

  useEffect(() => {
    if (user) fetchSettings();
  }, [user, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
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

  const handleReset = async () => {
    setShowDangerDialog(false);
    try {
      const token = await getToken();
      setSettings(defaultSettings);
      await fetch('/api/executive/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings: defaultSettings }),
      });
      toast({ title: 'Settings Reset', description: 'Platform settings have been reset to defaults.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Reset failed.' });
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
    <div className="page-container animate-in space-y-6 safe-bottom">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex gap-0">
          <TabsTrigger value="general" className="gap-1.5"><Palette className="w-4 h-4" /> General</TabsTrigger>
          <TabsTrigger value="auth" className="gap-1.5"><Shield className="w-4 h-4" /> Authentication</TabsTrigger>
          <TabsTrigger value="battle" className="gap-1.5"><Clock className="w-4 h-4" /> Battle</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><BrainCircuit className="w-4 h-4" /> AI</TabsTrigger>
          <TabsTrigger value="messaging" className="gap-1.5"><MessageSquare className="w-4 h-4" /> Messaging</TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5"><DownloadCloud className="w-4 h-4" /> Export</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-primary" />
                Institution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspaceName">Workspace Name</Label>
                <Input id="workspaceName" value={settings.workspaceName} onChange={e => setSettings({ ...settings, workspaceName: e.target.value })} placeholder="Knowledge Arena" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="institutionName">Institution Name</Label>
                <Input id="institutionName" value={settings.institutionName} onChange={e => setSettings({ ...settings, institutionName: e.target.value })} placeholder="e.g. Springfield University" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="institutionLogo">Institution Logo URL</Label>
                <Input id="institutionLogo" value={settings.institutionLogo} onChange={e => setSettings({ ...settings, institutionLogo: e.target.value })} placeholder="https://example.com/logo.png" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select value={settings.theme} onValueChange={v => setSettings({ ...settings, theme: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="w-5 h-5 text-primary" />
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Allow Commander Self-Registration</Label><p className="text-xs text-muted-foreground">Commanders can create their own accounts.</p></div>
                <Switch checked={settings.auth.allowCommanderSelfRegistration} onCheckedChange={c => setSettings({ ...settings, auth: { ...settings.auth, allowCommanderSelfRegistration: c } })} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Allow Gladiator Registration</Label><p className="text-xs text-muted-foreground">Students can sign up with Google.</p></div>
                <Switch checked={settings.auth.allowGladiatorRegistration} onCheckedChange={c => setSettings({ ...settings, auth: { ...settings.auth, allowGladiatorRegistration: c } })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="battle" className="space-y-6 mt-6">
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
                  <Input id="questionTimer" type="number" min={5} max={300} value={settings.battle.questionTimerDefault} onChange={e => setSettings({ ...settings, battle: { ...settings.battle, questionTimerDefault: parseInt(e.target.value) || 30 } })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxQuestions">Maximum Questions</Label>
                  <Input id="maxQuestions" type="number" min={1} max={200} value={settings.battle.maxQuestions} onChange={e => setSettings({ ...settings, battle: { ...settings.battle, maxQuestions: parseInt(e.target.value) || 50 } })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultDifficulty">Default Difficulty</Label>
                  <Select value={settings.battle.defaultDifficulty} onValueChange={v => setSettings({ ...settings, battle: { ...settings.battle, defaultDifficulty: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Auto-End Battle</Label><p className="text-xs text-muted-foreground">Automatically end battles when all participants finish.</p></div>
                <Switch checked={settings.battle.autoEndBattle} onCheckedChange={c => setSettings({ ...settings, battle: { ...settings.battle, autoEndBattle: c } })} />
              </div>
              <div className="space-y-2">
                <Label>Leaderboard Visibility</Label>
                <Select value={settings.battle.leaderboardVisibility} onValueChange={v => setSettings({ ...settings, battle: { ...settings.battle, leaderboardVisibility: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="commanders">Commanders Only</SelectItem>
                    <SelectItem value="executives">Executives Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BrainCircuit className="w-5 h-5 text-primary" />
                AI Services
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Enable AI</Label><p className="text-xs text-muted-foreground">Allow AI-powered question generation and analysis.</p></div>
                <Switch checked={settings.ai.enabled} onCheckedChange={c => setSettings({ ...settings, ai: { ...settings.ai, enabled: c } })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiModel">Default AI Model</Label>
                <Select value={settings.ai.defaultModel} onValueChange={v => setSettings({ ...settings, ai: { ...settings.ai, defaultModel: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                    <SelectItem value="gemini-2.0-pro">Gemini 2.0 Pro</SelectItem>
                    <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxPdfSize">Max PDF Size (MB)</Label>
                <Input id="maxPdfSize" type="number" min={1} max={50} value={settings.ai.maxPdfSize} onChange={e => setSettings({ ...settings, ai: { ...settings.ai, maxPdfSize: parseInt(e.target.value) || 10 } })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messaging" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="w-5 h-5 text-primary" />
                Messaging
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Enable Announcements</Label><p className="text-xs text-muted-foreground">Allow sending broadcast announcements.</p></div>
                <Switch checked={settings.messaging.enableAnnouncements} onCheckedChange={c => setSettings({ ...settings, messaging: { ...settings.messaging, enableAnnouncements: c } })} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Enable Chat</Label><p className="text-xs text-muted-foreground">Allow commanders and gladiators to send messages.</p></div>
                <Switch checked={settings.messaging.enableChat} onCheckedChange={c => setSettings({ ...settings, messaging: { ...settings.messaging, enableChat: c } })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DownloadCloud className="w-5 h-5 text-primary" />
                Export Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Include Student Names</Label><p className="text-xs text-muted-foreground">Include student names in exported reports.</p></div>
                <Switch checked={settings.exportPreferences.includeStudentNames} onCheckedChange={c => setSettings({ ...settings, exportPreferences: { ...settings.exportPreferences, includeStudentNames: c } })} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Include Scores</Label></div>
                <Switch checked={settings.exportPreferences.includeScores} onCheckedChange={c => setSettings({ ...settings, exportPreferences: { ...settings.exportPreferences, includeScores: c } })} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Include Timestamps</Label></div>
                <Switch checked={settings.exportPreferences.includeTimestamps} onCheckedChange={c => setSettings({ ...settings, exportPreferences: { ...settings.exportPreferences, includeTimestamps: c } })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Resetting will clear all settings back to defaults. This action cannot be undone.</p>
          <Button variant="destructive" onClick={() => setShowDangerDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Reset All Settings
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showDangerDialog} onOpenChange={setShowDangerDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This will reset all platform settings to their defaults. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-destructive hover:bg-destructive/90">Confirm Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
