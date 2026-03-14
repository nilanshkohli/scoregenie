import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Sparkles, Clock, BookOpen, Brain, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Topic,
  Msg,
  streamExplanation,
  saveStudyPlan,
  fetchStudyPlans,
  StudyPlan,
} from "@/lib/api";
import { toast } from "sonner";

type View = "planner" | "syllabus" | "learn" | "revise" | "exam" | "progress";

type Props = {
  topics: Topic[];
  onNavigate: (view: View) => void;
};

export default function StudyPlanner({ topics, onNavigate }: Props) {
  const [examDate, setExamDate] = useState<Date>();
  const [hoursPerDay, setHoursPerDay] = useState("3");
  const [subjectName, setSubjectName] = useState("");
  const [targetScore, setTargetScore] = useState("80");
  const [loading, setLoading] = useState(false);
  const [planContent, setPlanContent] = useState("");
  const [savedPlans, setSavedPlans] = useState<StudyPlan[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    fetchStudyPlans().then((plans) => {
      setSavedPlans(plans);
      // Auto-load latest plan
      if (plans.length > 0 && !planContent) {
        setPlanContent(plans[0].plan_content);
        setExamDate(new Date(plans[0].exam_date));
        setHoursPerDay(String(plans[0].hours_per_day));
      }
    }).catch(() => {});
  }, []);

  const generatePlan = async () => {
    if (!examDate) {
      toast.error("Please select an exam date");
      return;
    }
    if (topics.length === 0) {
      toast.error("Add topics first");
      return;
    }

    setLoading(true);
    setPlanContent("");

    const daysLeft = Math.max(1, Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const hours = parseFloat(hoursPerDay) || 3;

    const topicSummary = topics
      .map((t) => `- ${t.name} (${t.marks_weightage} marks, confidence: ${t.confidence || "unrated"}, time spent: ${t.time_spent_minutes}m)`)
      .join("\n");

    const msg: Msg = {
      role: "user",
      content: `Create a detailed study plan for ${subjectName ? `the subject "${subjectName}"` : "an exam"} on ${format(examDate, "PPP")} (${daysLeft} days away).
The student can study ${hours} hours per day.
The student is aiming to score ${targetScore}% in this exam.

Topics:
${topicSummary}

Create a day-by-day study schedule that:
1. Prioritizes weak/unrated topics first
2. Allocates more time to high-marks topics to help reach the ${targetScore}% target
3. Includes revision days before the exam
4. Balances study sessions with breaks
5. Includes specific actions for each day (study, practice, revise)
6. Schedules mock exams at regular intervals
7. Suggests which topics to focus on vs skip if time is limited, given the target score

Format as a clear, actionable markdown schedule with days, topics, and time allocations.`,
    };

    let fullResponse = "";

    try {
      await streamExplanation({
        messages: [msg],
        topicName: "Study Plan",
        onDelta: (chunk) => {
          fullResponse += chunk;
          setPlanContent(fullResponse);
        },
        onDone: () => {
          setLoading(false);
        },
      });

      const saved = await saveStudyPlan({
        exam_date: format(examDate, "yyyy-MM-dd"),
        hours_per_day: hours,
        plan_content: fullResponse,
      });
      setSavedPlans((prev) => [saved, ...prev]);
      toast.success("Study plan saved!");
    } catch (e: any) {
      setLoading(false);
      toast.error(e.message || "Failed to generate plan");
    }
  };

  const hasPlan = !!planContent;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Study Plan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your personalized study schedule — the hub for all your preparation
        </p>
      </div>

      {/* Quick actions when plan exists */}
      {hasPlan && topics.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-shadow border-primary/20 hover:border-primary/40"
            onClick={() => onNavigate("learn")}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Learn</p>
                <p className="text-xs text-muted-foreground">Study a topic</p>
              </div>
            </div>
          </Card>
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-shadow border-warning/20 hover:border-warning/40"
            onClick={() => onNavigate("revise")}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center">
                <Brain className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Revise</p>
                <p className="text-xs text-muted-foreground">Flashcard review</p>
              </div>
            </div>
          </Card>
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-shadow border-destructive/20 hover:border-destructive/40"
            onClick={() => onNavigate("exam")}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Mock Exam</p>
                <p className="text-xs text-muted-foreground">Test yourself</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Configuration */}
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Exam Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !examDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {examDate ? format(examDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={examDate}
                  onSelect={setExamDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Hours per Day</label>
            <Input
              type="number"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
              min={1}
              max={12}
            />
          </div>
        </div>

        <Button onClick={generatePlan} disabled={loading || !examDate} className="w-full" size="lg">
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Generating Plan...</>
          ) : hasPlan ? (
            <><Sparkles className="h-5 w-5 mr-2" /> Regenerate Study Plan</>
          ) : (
            <><Sparkles className="h-5 w-5 mr-2" /> Generate Study Plan</>
          )}
        </Button>
      </Card>

      {/* Generated plan */}
      {planContent && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Your Study Plan
          </h3>
          <div className="prose prose-sm max-w-none text-foreground [&>*:first-child]:mt-0">
            <ReactMarkdown>{planContent}</ReactMarkdown>
          </div>
        </Card>
      )}

      {/* Saved plans */}
      {savedPlans.length > 1 && (
        <div>
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="text-sm font-medium text-primary hover:underline mb-3 block"
          >
            {showSaved ? "Hide" : "Show"} previous plans ({savedPlans.length - 1})
          </button>
          {showSaved && (
            <div className="space-y-3">
              {savedPlans.slice(1).map((plan) => (
                <Card
                  key={plan.id}
                  className="p-4 cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => setPlanContent(plan.plan_content)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Exam: {new Date(plan.exam_date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {plan.hours_per_day}h/day · Created {new Date(plan.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
