import { Topic } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, BookOpen, Target, Zap } from "lucide-react";

type Props = {
  topics: Topic[];
  onStartRevision: () => void;
};

export default function Dashboard({ topics }: Props) {
  const totalMarks = topics.reduce((s, t) => s + t.marks_weightage, 0);
  const coveredMarks = topics
    .filter((t) => t.is_completed)
    .reduce((s, t) => s + t.marks_weightage, 0);
  const totalMinutes = topics.reduce((s, t) => s + t.time_spent_minutes, 0);
  const completedCount = topics.filter((t) => t.is_completed).length;
  const hours = totalMinutes / 60;
  const efficiency = hours > 0 ? (coveredMarks / hours).toFixed(1) : "—";
  const progressPct = totalMarks > 0 ? (coveredMarks / totalMarks) * 100 : 0;

  const confidentCount = topics.filter((t) => t.confidence === "confident").length;
  const somewhatCount = topics.filter((t) => t.confidence === "somewhat").length;
  const notConfidentCount = topics.filter((t) => t.confidence === "not_confident").length;

  const metrics = [
    {
      label: "Total Marks",
      value: totalMarks,
      icon: Target,
      accent: "text-primary",
    },
    {
      label: "Marks Covered",
      value: coveredMarks,
      icon: BookOpen,
      accent: "text-success",
    },
    {
      label: "Time Spent",
      value: totalMinutes < 60 ? `${totalMinutes}m` : `${(totalMinutes / 60).toFixed(1)}h`,
      icon: Clock,
      accent: "text-warning",
    },
    {
      label: "Completed",
      value: `${completedCount}/${topics.length}`,
      icon: BookOpen,
      accent: "text-primary",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your exam preparation at a glance
        </p>
      </div>

      {/* Efficiency Hero */}
      <Card className="p-6 metric-glow border-primary/20">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Marks per Hour
            </p>
            <p className="text-4xl font-extrabold text-primary tracking-tight">
              {efficiency}
            </p>
          </div>
        </div>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <m.icon className={`h-4 w-4 ${m.accent}`} />
              <span className="text-xs font-medium text-muted-foreground">
                {m.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{m.value}</p>
          </Card>
        ))}
      </div>

      {/* Progress */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-foreground">
            Syllabus Coverage
          </span>
          <span className="text-sm text-muted-foreground">
            {coveredMarks}/{totalMarks} marks ({progressPct.toFixed(0)}%)
          </span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </Card>

      {/* Confidence Distribution */}
      {topics.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Confidence Distribution
          </p>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-success" />
              <span className="text-sm text-muted-foreground">
                Confident: {confidentCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-warning" />
              <span className="text-sm text-muted-foreground">
                Somewhat: {somewhatCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-destructive" />
              <span className="text-sm text-muted-foreground">
                Not Confident: {notConfidentCount}
              </span>
            </div>
          </div>
        </Card>
      )}

      {topics.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            No topics yet. Add your syllabus to get started!
          </p>
        </Card>
      )}
    </div>
  );
}
