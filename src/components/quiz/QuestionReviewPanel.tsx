"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2, Edit3, ChevronDown, ChevronUp, Save, X, Sparkles, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn, generateRoomCode } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { questionService } from '@/services/game.service';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  timer: number;
}

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface QuestionReviewPanelProps {
  initialQuestions: GeneratedQuestion[];
  difficulty: string;
  onRegenerate: () => void;
  onEditSettings: () => void;
}

export function QuestionReviewPanel({ initialQuestions, difficulty, onRegenerate, onEditSettings }: QuestionReviewPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions.map(q => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
      timer: 30
    }))
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Question | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State
  const [quizTitle, setQuizTitle] = useState('');
  const [globalTimer, setGlobalTimer] = useState(30);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  const handleDelete = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const startEditing = (q: Question) => {
    setEditingId(q.id);
    setEditForm({ ...q });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEditing = () => {
    if (!editForm) return;
    setQuestions(questions.map(q => q.id === editForm.id ? editForm : q));
    setEditingId(null);
    setEditForm(null);
  };

  const handleCreateRoom = async () => {
    if (!user || !quizTitle) return;
    if (user.role !== 'teacher') {
        toast({ variant: 'destructive', title: "Deployment Error", description: "Only teachers can deploy arenas. Sign up with an email ending in @staffs.com to create a teacher account." });
        return;
    }
    setIsSubmitting(true);
    
    try {
        const roomCode = generateRoomCode();

        await quizService.createQuiz({
            id: roomCode,
            title: quizTitle,
            status: 'waiting',
            current_question_index: -1,
            question_count: questions.length,
            created_by: user.id,
        });

        await participantService.joinQuiz(roomCode, user.id);

        const questionPayload = questions.map((q, idx) => ({
            quiz_id: roomCode,
            text: q.text,
            options: q.options,
            timer: globalTimer,
            sort_index: idx
        }));

        const savedQuestions = await questionService.createQuestions(questionPayload);

        const answerKeys = savedQuestions.map((sq, idx) => ({
            question_id: sq.id,
            quiz_id: roomCode,
            correct_option_index: questions[idx].correctAnswerIndex
        }));

        await questionService.createAnswerKeys(answerKeys);

        toast({ title: "Arena Constructed", description: `Mission Code: ${roomCode}` });
        router.push(`/battle/${roomCode}`);
    } catch (e: unknown) {
        toast({ variant: 'destructive', title: "Deployment Error", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-secondary/20 border border-primary/20 rounded-2xl gap-4 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-headline font-bold text-lg">{questions.length} Rounds Prepared</h2>
            <Badge variant="outline" className="uppercase tracking-widest text-[10px] bg-background">Level: {difficulty}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onEditSettings}>Edit Parameters</Button>
            <Button variant="outline" size="sm" onClick={onRegenerate} className="border-primary/20 text-primary">Regenerate Intel</Button>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, index) => (
          <Card key={q.id} className="border-border/50 bg-background/50 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary/50 transition-all" />
            
            {editingId === q.id && editForm ? (
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Tactical Objective (Question)</Label>
                  <Textarea 
                    value={editForm.text} 
                    onChange={e => setEditForm({...editForm, text: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {editForm.options.map((opt, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-50">Option {String.fromCharCode(65 + i)}</Label>
                      <Input 
                        value={opt} 
                        onChange={e => {
                          const newOpts = [...editForm.options];
                          newOpts[i] = e.target.value;
                          setEditForm({...editForm, options: newOpts});
                        }} 
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-col md:flex-row gap-6 p-4 bg-secondary/20 rounded-xl">
                  <div className="space-y-2 flex-1">
                    <Label>Valid Solution</Label>
                    <RadioGroup 
                      value={String(editForm.correctAnswerIndex)} 
                      onValueChange={val => setEditForm({...editForm, correctAnswerIndex: parseInt(val)})}
                      className="flex gap-4"
                    >
                      {[0,1,2,3].map(i => (
                        <div key={i} className="flex items-center space-x-2">
                          <RadioGroupItem value={String(i)} id={`edit-q-${q.id}-opt-${i}`} />
                          <Label htmlFor={`edit-q-${q.id}-opt-${i}`}>{String.fromCharCode(65 + i)}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={cancelEditing}><X className="mr-2 h-4 w-4" /> Cancel</Button>
                  <Button onClick={saveEditing} className="bg-primary text-primary-foreground"><Save className="mr-2 h-4 w-4" /> Commit Changes</Button>
                </div>
              </CardContent>
            ) : (
              <>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-primary font-bold">R{index + 1}</span>
                    <CardTitle className="text-lg font-medium">{q.text}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEditing(q)}><Edit3 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {q.options.map((opt, i) => (
                      <div key={i} className={cn(
                        "p-3 rounded-lg border text-sm flex items-center gap-3",
                        q.correctAnswerIndex === i ? "bg-primary/10 border-primary text-primary font-bold" : "bg-secondary/20 border-border/50"
                      )}>
                        <span className="opacity-50 font-mono">{String.fromCharCode(65 + i)}</span>
                        {opt}
                        {q.correctAnswerIndex === i && <CheckCircle2 className="ml-auto w-4 h-4" />}
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {expandedId === q.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expandedId === q.id ? "Hide tactical notes" : "Show tactical notes"}
                  </button>
                  {expandedId === q.id && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 text-xs text-muted-foreground italic leading-relaxed">
                      {q.explanation}
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        ))}
      </div>

      <div className="question-review-fixed-bar fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-background/80 backdrop-blur-xl border-t border-border/50 z-50 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
        <div className="flex items-center gap-3 text-sm">
           <div className={cn(
               "w-3 h-3 rounded-full animate-pulse",
               questions.length < 3 ? "bg-destructive" : "bg-primary"
           )} />
           <span className="font-bold">{questions.length} Rounds Ready</span>
           {questions.length < 3 && (
               <div className="flex items-center gap-2 text-destructive font-bold text-xs">
                   <AlertTriangle className="w-4 h-4" /> Insufficient rounds. (Min 3)
               </div>
           )}
        </div>
        <Button 
            disabled={questions.length < 3} 
            size="lg" 
            onClick={() => setIsModalOpen(true)}
            className="h-16 px-12 text-xl font-headline shadow-2xl shadow-primary/30 rounded-full"
        >
          DEPLOY ARENA <ChevronUp className="ml-2" />
        </Button>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-primary/20">
            <DialogHeader>
                <DialogTitle className="text-2xl font-headline text-primary uppercase">Arena Mission Profile</DialogTitle>
                <DialogDescription>Finalize the parameters for this combat deployment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
                <div className="space-y-2">
                    <Label htmlFor="quiz-title">Arena Designation (Title)</Label>
                    <Input 
                        id="quiz-title" 
                        placeholder="Tactical Operations Audit" 
                        maxLength={60}
                        value={quizTitle}
                        onChange={e => setQuizTitle(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="global-timer">Round Engagement Window (Seconds)</Label>
                    <Input 
                        id="global-timer" 
                        type="number" 
                        min={10} 
                        max={120} 
                        value={globalTimer}
                        onChange={e => setGlobalTimer(parseInt(e.target.value))}
                    />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Standard window: 30s</p>
                </div>
                <div className="space-y-4 pt-2">
                    <div className="flex items-center space-x-3">
                        <Checkbox id="shuffle-q" checked={shuffleQuestions} onCheckedChange={(val) => setShuffleQuestions(!!val)} />
                        <label htmlFor="shuffle-q" className="text-sm font-medium leading-none cursor-pointer">Randomize Round Sequence</label>
                    </div>
                </div>
            </div>
            <DialogFooter className="sm:justify-start">
                <Button 
                    className="w-full h-12 text-lg font-headline" 
                    disabled={!quizTitle || isSubmitting}
                    onClick={handleCreateRoom}
                >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Sparkles className="mr-2" />}
                    INITIATE DEPLOYMENT
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}