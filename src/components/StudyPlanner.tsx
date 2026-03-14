import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import {
  CalendarIcon, Loader2, Sparkles, Clock, BookOpen, Brain, ClipboardList,
  Target, Trophy, Zap, TrendingUp, Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  fetchExamResults,
  addTopic,
  deleteTopic,
  StudyPlan,
  ExamResult,
} from "@/lib/api";
import { toast } from "sonner";

type View = "planner" | "learn" | "revise" | "exam";

type Props = {
  topics: Topic[];
  onNavigate: (view: View) => void;
  onRefresh: () => void;
  subjectName: string;
  onSubjectNameChange: (name: string) => void;
};

export default function StudyPlanner({ topics, onNavigate, onRefresh, subjectName, onSubjectNameChange }: Props) {
  const [examDate, setExamDate] = useState<Date>();
  const [hoursPerDay, setHoursPerDay] = useState("3");
  const [targetScore, setTargetScore] = useState("80");
  const [loading, setLoading] = useState(false);
  const [planContent, setPlanContent] = useState("");
  const [savedPlans, setSavedPlans] = useState<StudyPlan[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);

  // Add topics state
  const [topicName, setTopicName] = useState("");
  const [topicMarks, setTopicMarks] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [addingTopics, setAddingTopics] = useState(false);
  const [showAddTopics, setShowAddTopics] = useState(false);

  useEffect(() => {
    fetchStudyPlans().then((plans) => {
      setSavedPlans(plans);
      if (plans.length > 0 && !planContent) {
        setPlanContent(plans[0].plan_content);
        setExamDate(new Date(plans[0].exam_date));
        setHoursPerDay(String(plans[0].hours_per_day));
      }
    }).catch(() => {});
    fetchExamResults().then(setExamResults).catch(() => {});
  }, []);

  // Progress calculations
  const totalMarks = topics.reduce((s, t) => s + t.marks_weightage, 0);
  const coveredMarks = topics.filter((t) => t.is_completed).reduce((s, t) => s + t.marks_weightage, 0);
  const totalMinutes = topics.reduce((s, t) => s + t.time_spent_minutes, 0);
  const completedCount = topics.filter((t) => t.is_completed).length;
  const hours = totalMinutes / 60;
  const efficiency = hours > 0 ? (coveredMarks / hours).toFixed(1) : "—";
  const progressPct = totalMarks > 0 ? (coveredMarks / totalMarks) * 100 : 0;
  const confidentCount = topics.filter((t) => t.confidence === "confident").length;
  const somewhatCount = topics.filter((t) => t.confidence === "somewhat").length;
  const notConfidentCount = topics.filter((t) => t.confidence === "not_confident").length;
  const unratedCount = topics.filter((t) => !t.confidence).length;
  const confidentPct = topics.length ? Math.round((confidentCount / topics.length) * 100) : 0;
  const somewhatPct = topics.length ? Math.round((somewhatCount / topics.length) * 100) : 0;
  const notConfidentPct = topics.length ? Math.round((notConfidentCount / topics.length) * 100) : 0;
  const unratedPct = topics.length ? Math.round((unratedCount / topics.length) * 100) : 0;
  const avgExamScore = examResults.length
    ? Math.round(examResults.reduce((s, r) => s + r.score_percentage, 0) / examResults.length)
    : null;
  const weakTopics = topics.filter((t) => t.confidence === "not_confident" || t.confidence === "somewhat");
  const topByTime = [...topics].sort((a, b) => b.time_spent_minutes - a.time_spent_minutes).slice(0, 5);
  const maxTime = topByTime[0]?.time_spent_minutes || 1;

  const handleAddTopic = async () => {
    if (!topicName.trim()) { toast.error("Enter a topic name"); return; }
    setAddingTopics(true);
    try {
      await addTopic(topicName.trim(), parseInt(topicMarks) || 0, topics.length);
      setTopicName(""); setTopicMarks("");
      onRefresh();
      toast.success("Topic added");
    } catch { toast.error("Failed to add topic"); }
    finally { setAddingTopics(false); }
  };

  const handleBulkAdd = async () => {
    if (!bulkText.trim()) return;
    setAddingTopics(true);
    try {
      const lines = bulkText.trim().split("\n").filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(/[,\t|–-]+/).map((s) => s.trim());
        const name = parts[0];
        const marks = parseInt(parts[1]) || 5;
        if (name) await addTopic(name, marks, topics.length + i);
      }
      setBulkText("");
      onRefresh();
      toast.success("Topics added");
    } catch { toast.error("Failed to add topics"); }
    finally { setAddingTopics(false); }
  };

  const handleDeleteTopic = async (id: string) => {
    try { await deleteTopic(id); onRefresh(); toast.success("Deleted"); }
    catch { toast.error("Failed"); }
  };

  const generatePlan = async () => {
    if (!examDate) { toast.error("Please select an exam date"); return; }
    if (topics.length === 0) { toast.error("Add topics first"); return; }

    setLoading(true);
    setPlanContent("");

    const daysLeft = Math.max(1, Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const hrs = parseFloat(hoursPerDay) || 3;
    const topicSummary = topics
      .map((t) => `- ${t.name} (${t.marks_weightage} marks, confidence: ${t.confidence || "unrated"}, time spent: ${t.time_spent_minutes}m)`)
      .join("\n");

    const msg: Msg = {
      role: "user",
      content: `Create a detailed study plan for ${subjectName ? `the subject "${subjectName}"` : "an exam"} on ${format(examDate, "PPP")} (${daysLeft} days away).
The student can study ${hrs} hours per day.
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
        onDelta: (chunk) => { fullResponse += chunk; setPlanContent(fullResponse); },
        onDone: () => { setLoading(false); },
      });
      const saved = await saveStudyPlan({ exam_date: format(examDate, "yyyy-MM-dd"), hours_per_day: hrs, plan_content: fullResponse });
      setSavedPlans((prev) => [saved, ...prev]);
      toast.success("Study plan saved!");
    } catch (e: any) {
      setLoading(false);
      toast.error(e.message || "Failed to generate plan");
    }
  };

  const hasPlan = !!planContent;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prep Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your preparation hub — plan, track progress, and jump into study modes
        </p>
      </div>

      {/* Quick actions */}
      {topics.length > 0 && (
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
                <p className="font-semibold text-foreground text-sm">Test Mode</p>
                <p className="text-xs text-muted-foreground">Take a mock exam</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Progress stats (only when topics exist) */}
      {topics.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Score Potential</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {totalMarks > 0 ? Math.round(progressPct) : 0}%
              </p>
              <p className="text-xs text-muted-foreground">{coveredMarks}/{totalMarks} covered</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-warning" />
                <span className="text-xs font-medium text-muted-foreground">Time</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {totalMinutes < 60 ? `${totalMinutes}m` : `${(totalMinutes / 60).toFixed(1)}h`}
              </p>
              <p className="text-xs text-muted-foreground">{topics.length} topics</p>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-foreground">Score Potential</span>
              <span className="text-sm text-muted-foreground">{progressPct.toFixed(0)}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </Card>
        </>
      )}

      {/* Add Topics Section */}
      <Card className="p-5">
        <button
          onClick={() => setShowAddTopics(!showAddTopics)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {topics.length > 0 ? `Topics (${topics.length})` : "Add Topics to Get Started"}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {showAddTopics ? "Hide" : "Show"}
          </span>
        </button>

        {(showAddTopics || topics.length === 0) && (
          <div className="mt-4 space-y-4">
            {/* Single add */}
            <div className="flex gap-2">
              <Input
                placeholder="Topic name"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
                className="flex-1"
              />
              <Input
                placeholder="Marks"
                type="number"
                value={topicMarks}
                onChange={(e) => setTopicMarks(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
                className="w-20"
              />
              <Button onClick={handleAddTopic} disabled={addingTopics} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Bulk add */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Bulk add — one per line: Topic Name, Marks (e.g. "Thermodynamics, 10")
              </p>
              <Textarea
                placeholder={"Kinematics, 8\nThermodynamics, 12\nOptics, 10"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={4}
              />
              <Button onClick={handleBulkAdd} disabled={addingTopics} className="mt-2" size="sm">
                Add All
              </Button>
            </div>

            {/* Topic list */}
            {topics.length > 0 && (
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {topics.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.marks_weightage}m</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteTopic(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Plan Configuration */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Generate Study Plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Subject</label>
            <Input
              placeholder="e.g. Mathematics, Physics, History"
              value={subjectName}
              onChange={(e) => onSubjectNameChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Target Score (%)</label>
            <Input
              type="number"
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              min={1}
              max={100}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Exam Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !examDate && "text-muted-foreground")}
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

      {/* Confidence & detailed progress (collapsible) */}
      {topics.length > 0 && (
        <>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Confidence Distribution</h3>
            <div className="space-y-3">
              <ConfidenceBar label="Confident" count={confidentCount} pct={confidentPct} color="bg-success" />
              <ConfidenceBar label="Somewhat" count={somewhatCount} pct={somewhatPct} color="bg-warning" />
              <ConfidenceBar label="Not Confident" count={notConfidentCount} pct={notConfidentPct} color="bg-destructive" />
              <ConfidenceBar label="Unrated" count={unratedCount} pct={unratedPct} color="bg-muted-foreground/30" />
            </div>
          </Card>

          {topByTime.some((t) => t.time_spent_minutes > 0) && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Time Spent (Top 5)</h3>
              <div className="space-y-3">
                {topByTime.map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-xs text-foreground w-32 truncate">{t.name}</span>
                    <div className="flex-1 h-5 bg-border/50 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${(t.time_spent_minutes / maxTime) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">{t.time_spent_minutes}m</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {examResults.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Test History</h3>
              <div className="space-y-2">
                {examResults.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm text-foreground">{r.correct_answers}/{r.total_questions} correct</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} · {Math.round(r.duration_seconds / 60)}m</p>
                    </div>
                    <span className={`text-lg font-bold ${r.score_percentage >= 70 ? "text-success" : r.score_percentage >= 40 ? "text-warning" : "text-destructive"}`}>
                      {Math.round(r.score_percentage)}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {weakTopics.length > 0 && (
            <Card className="p-5 border-destructive/20">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-destructive" />
                Areas Needing Improvement
              </h3>
              <div className="space-y-2">
                {weakTopics.map((t) => (
                  <div key={t.id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{t.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      t.confidence === "not_confident" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                    }`}>
                      {t.confidence === "not_confident" ? "Weak" : "Moderate"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Saved plans */}
      {savedPlans.length > 1 && (
        <div>
          <button onClick={() => setShowSaved(!showSaved)} className="text-sm font-medium text-primary hover:underline mb-3 block">
            {showSaved ? "Hide" : "Show"} previous plans ({savedPlans.length - 1})
          </button>
          {showSaved && (
            <div className="space-y-3">
              {savedPlans.slice(1).map((plan) => (
                <Card key={plan.id} className="p-4 cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setPlanContent(plan.plan_content)}>
                  <p className="text-sm font-medium text-foreground">Exam: {new Date(plan.exam_date).toLocaleDateString()}</p>
                  <p className="text-xs text-muted-foreground">{plan.hours_per_day}h/day · Created {new Date(plan.created_at).toLocaleDateString()}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28">{label} ({count})</span>
      <div className="flex-1 h-4 bg-border/50 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-10 text-right">{pct}%</span>
    </div>
  );
}
