import { QuizCreatorForm } from "@/components/quiz/QuizCreatorForm";

export default function CreateQuizPage() {
  return (
    <div className="p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-headline tracking-tight text-primary">Create New Quiz</h1>
        <p className="text-muted-foreground">Design your challenge. Add questions, set timers, and prepare for battle.</p>
      </header>
      <QuizCreatorForm />
    </div>
  );
}
