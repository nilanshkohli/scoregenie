import { BookOpen, ChevronLeft, ChevronRight, Brain, ClipboardList, Calendar } from "lucide-react";
import { Topic } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type View = "planner" | "learn" | "revise" | "exam";

type Props = {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
  onNavigate: (view: View) => void;
  currentView: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  subjectName: string;
};

const navItems: { view: View; label: string; icon: typeof BookOpen }[] = [
  { view: "planner", label: "Study Plan", icon: Calendar },
  { view: "revise", label: "Revise", icon: Brain },
  { view: "exam", label: "Test Mode", icon: ClipboardList },
];

export default function AppSidebar({
  topics,
  selectedTopicId,
  onSelectTopic,
  onNavigate,
  currentView,
  collapsed,
  onToggleCollapse,
  subjectName,
}: Props) {
  const confidenceColor = (c: string | null) => {
    if (c === "confident") return "bg-success";
    if (c === "somewhat") return "bg-warning";
    if (c === "not_confident") return "bg-destructive";
    return "bg-muted";
  };

  return (
    <aside
      className={cn(
        "h-screen border-r border-border bg-card flex flex-col transition-all duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        {!collapsed && (
          <span className="text-lg font-bold text-primary tracking-tight">Score Genie</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              currentView === item.view
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {!collapsed && topics.length > 0 && (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {/* Exam/Subject label */}
          {subjectName && (
            <div className="mx-3 mt-2 mb-1 px-2 py-1.5 rounded-md bg-accent/50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preparing for</p>
              <p className="text-sm font-medium text-foreground truncate">{subjectName}</p>
            </div>
          )}

          <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Learn
          </p>
          <div className="flex flex-col gap-0.5">
            {topics.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTopic(t.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left",
                  selectedTopicId === t.id && currentView === "learn"
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", confidenceColor(t.confidence))} />
                <span className="truncate flex-1">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.marks_weightage}m</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
