'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Download, Upload, Archive, AlertTriangle, CheckCircle2,
  Database, Clock, FileJson,
} from 'lucide-react';
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

export default function ExecutiveBackupPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastBackup, setLastBackup] = useState<{ id: string; exportedAt: string; collections: string[] } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/backup/export', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackup({
        id: data.metadata.id,
        exportedAt: data.metadata.exportedAt,
        collections: data.metadata.collections,
      });
      toast({ variant: 'success', title: 'Backup Exported', description: `Saved ${data.metadata.collections.length} collections.` });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to export workspace.' });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setShowImportDialog(true);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setShowImportDialog(false);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Import failed' }));
        toast({ variant: 'destructive', title: 'Error', description: err.error });
        return;
      }
      const result = await res.json();
      toast({ variant: 'success', title: 'Workspace Restored', description: `Imported ${result.totalDocs} documents across ${result.collections} collections.` });
      setImportFile(null);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Invalid backup file.' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      <div className="space-y-1.5">
        <h1 className="text-page-title font-headline tracking-tight">Backup & Restore</h1>
        <p className="text-base text-muted-foreground">Export and import your workspace data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export all workspace data including users, questions, battles, and settings as a JSON backup file.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="w-3.5 h-3.5" />
              <span>Includes: users, question bank, question sets, quizzes, audit logs, conversations, announcements, settings, requests</span>
            </div>
            <Button onClick={handleExport} disabled={exporting}>
              <Archive className="w-4 h-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export Workspace'}
            </Button>
            {lastBackup && (
              <div className="p-3 rounded-[10px] bg-muted/30 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Last backup: {new Date(lastBackup.exportedAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileJson className="w-3.5 h-3.5" />
                  <span>{lastBackup.collections.length} collections</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Restore workspace data from a previously exported backup file. Existing documents will be merged.
            </p>
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>This will merge data into existing collections. Review backup file before importing.</span>
            </div>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                id="backup-file-input"
              />
              <Button variant="outline" disabled={importing} onClick={() => document.getElementById('backup-file-input')?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {importing ? 'Importing...' : 'Select Backup File'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Backup History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastBackup ? (
            <div className="flex items-center justify-between p-3 rounded-[10px] bg-muted/30">
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Latest Backup</p>
                  <p className="text-xs text-muted-foreground">{new Date(lastBackup.exportedAt).toLocaleString()}</p>
                </div>
              </div>
              <Badge variant="outline">{lastBackup.collections.length} collections</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No backups have been created yet.</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge the backup data into your existing workspace.
              Existing documents with the same ID will be overwritten.
              This action is not reversible. Make sure you trust the backup source.
              {importFile && (
                <div className="mt-3 p-3 rounded-[8px] bg-muted/30 text-xs font-mono">
                  <p>File: {importFile.name}</p>
                  <p>Size: {(importFile.size / 1024).toFixed(1)} KB</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} className="bg-destructive hover:bg-destructive/90">
              Restore Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
