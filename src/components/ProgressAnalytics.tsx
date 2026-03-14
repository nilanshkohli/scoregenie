import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Topic, fetchExamResults, ExamResult } from "@/lib/api";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Target,
  BookOpen,
  Trophy,
} from "lucide-react";

type Props = {
  topics: Topic[];
};

export default function ProgressAnalytics({ topics }: Props) {
  const [examResults, setExamResults] = useState<ExamResult[]>([]);

  useEffect(() => {
    fetchExamResults().then(setExamResults).catch(() => {});
  }, []);

  const totalMarks = topics.reduce((s, t) => s + t.marks_weightage, 0);
  const coveredMarks = topics.filter((t) => t.is_completed).reduce((s, t) => s + t.marks_weightage, 0);
  const totalMinutes = topics.reduce((s, t) => s + t.time_spent_minutes, 0);
  const completedCount = topics.filter((t) => t.is_completed).length;

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

  // Top 5 topics by time spent
  const topByTime = [...topics].sort((a, b) => b.time_spent_minutes - a.time_spent_minutes).slice(0, 5);
  const maxTime = topByTime[0]?.time_spent_minutes || 1;

  // Weak topics
  const weakTopics = topics.filter((t) => t.confidence === "not_confident" || t.confidence === "somewhat");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Progress Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detailed insights into your exam preparation
        </p>
      </div>

      {topics.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Start studying to see your analytics!</p>
        </Card>
      ) : (
        <>
          {/* Overview stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Coverage</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {totalMarks > 0 ? Math.round((coveredMarks / totalMarks) * 100) : 0}%
              </p>
              <p className="text-xs text-muted-foreground">{coveredMarks}/{totalMarks} marks</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-warning" />
                <span className="text-xs font-medium text-muted-foreground">Total Time</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {totalMinutes < 60 ? `${totalMinutes}m` : `${(totalMinutes / 60).toFixed(1)}h`}
              </p>
              <p className="text-xs text-muted-foreground">across {topics.length} topics</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-success" />
                <span className="text-xs font-medium text-muted-foreground">Completed</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{completedCount}/{topics.length}</p>
              <p className="text-xs text-muted-foreground">topics done</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Avg Exam Score</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{avgExamScore !== null ? `${avgExamScore}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">{examResults.length} exam{examResults.length !== 1 ? "s" : ""} taken</p>
            </Card>
          </div>

          {/* Confidence Distribution */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Confidence Distribution</h3>
            <div className="space-y-3">
              <ConfidenceBar label="Confident" count={confidentCount} pct={confidentPct} color="bg-success" />
              <ConfidenceBar label="Somewhat" count={somewhatCount} pct={somewhatPct} color="bg-warning" />
              <ConfidenceBar label="Not Confident" count={notConfidentCount} pct={notConfidentPct} color="bg-destructive" />
              <ConfidenceBar label="Unrated" count={unratedCount} pct={unratedPct} color="bg-muted-foreground/30" />
            </div>
          </Card>

          {/* Time spent by topic */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Time Spent by Topic (Top 5)</h3>
            {topByTime.length > 0 ? (
              <div className="space-y-3">
                {topByTime.map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-xs text-foreground w-32 truncate">{t.name}</span>
                    <div className="flex-1 h-5 bg-border/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all"
                        style={{ width: `${(t.time_spent_minutes / maxTime) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">{t.time_spent_minutes}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No study time recorded yet</p>
            )}
          </Card>

          {/* Exam history */}
          {examResults.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Exam History</h3>
              <div className="space-y-2">
                {examResults.slice(0, 10).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm text-foreground">
                        {r.correct_answers}/{r.total_questions} correct
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()} · {Math.round(r.duration_seconds / 60)}m
                      </p>
                    </div>
                    <span className={`text-lg font-bold ${
                      r.score_percentage >= 70 ? "text-success" :
                      r.score_percentage >= 40 ? "text-warning" : "text-destructive"
                    }`}>
                      {Math.round(r.score_percentage)}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Weak areas */}
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