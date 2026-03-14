import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { format, differenceInDays } from "date-fns";
import {
  CalendarIcon, Loader2, Sparkles, Clock,
  Target, Plus, Trash2, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  addTopic,
  deleteTopic,
  StudyPlan,
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
  const [targetScore, setTargetScore] = useState("80");
  const [loading, setLoading] = useState(false);
  const [planContent, setPlanContent] = useState("");
  const [savedPlans, setSavedPlans] = useState<StudyPlan[]>([]);
  const [showSaved, setShowSaved] = useState(false);

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
  }, []);

  // Progress calculations
  const totalMarks = topics.reduce((s, t) => s + t.marks_weightage, 0);
  const coveredMarks = topics.filter((t) => t.is_completed).reduce((s, t) => s + t.marks_weightage, 0);
  const totalMinutes = topics.reduce((s, t) => s + t.time_spent_minutes, 0);
  const progressPct = totalMarks > 0 ? (coveredMarks / totalMarks) * 100 : 0;

  // Smart hours/day suggestion
  const daysLeft = examDate ? Math.max(1, differenceInDays(examDate, new Date())) : null;
  const target = Math.min(100, Math.max(1, parseInt(targetScore) || 80));
  // Estimate total hours needed: ~40min per topic base, scaled by target score, minus time already invested
  const estimatedTotalHours = Math.max(1, (topics.length * 0.67 * (target / 70)) - hoursInvested);
  const hoursInvested = totalMinutes / 60;
  const suggestedHoursPerDay = daysLeft !== null
    ? Math.min(8, Math.max(1, Math.round(estimatedTotalHours / daysLeft * 10) / 10))
    : 3;
  const hoursPerDay = suggestedHoursPerDay;

  // Time remaining calculation
  const totalHoursAvailable = daysLeft !== null ? daysLeft * hoursPerDay : null;
  const hoursRemaining = totalHoursAvailable !== null ? Math.max(0, totalHoursAvailable - hoursInvested) : null;

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
          Track your progress and manage your study plan
        </p>
      </div>

      {/* Current Study Plan (shown at top if exists) */}
      {planContent && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Current Study Plan
          </h3>
          <div className="prose prose-sm max-w-none text-foreground [&>*:first-child]:mt-0 border border-border rounded-lg p-4 max-h-72 overflow-y-auto">
            <ReactMarkdown>{planContent}</ReactMarkdown>
          </div>
        </Card>
      )}

      {/* Progress stats */}
      {topics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
              <span className="text-xs font-medium text-muted-foreground">Time Invested</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {totalMinutes < 60 ? `${totalMinutes}m` : `${hoursInvested.toFixed(1)}h`}
            </p>
            <p className="text-xs text-muted-foreground">{topics.length} topics</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Time Remaining</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {hoursRemaining !== null ? `${hoursRemaining.toFixed(0)}h` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left` : "Set exam date"}
            </p>
          </Card>
        </div>
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

      {/* Generate Study Plan */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          {hasPlan ? "Regenerate Study Plan" : "Generate Study Plan"}
        </h3>
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
