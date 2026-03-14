import { BookOpen, ChevronLeft, ChevronRight, Brain, ClipboardList, LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type View = "planner" | "learn" | "revise" | "exam" | "group";

type Props = {
  onNavigate: (view: View) => void;
  currentView: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  subjectName: string;
};

const navItems: { view: View; label: string; icon: typeof BookOpen }[] = [
  { view: "planner", label: "Prep Dashboard", icon: LayoutDashboard },
  { view: "learn", label: "Learn", icon: BookOpen },
  { view: "revise", label: "Revise", icon: Brain },
  { view: "exam", label: "Test Mode", icon: ClipboardList },
  { view: "group", label: "Group Study", icon: Users },
];

export default function AppSidebar({
  onNavigate,
  currentView,
  collapsed,
  onToggleCollapse,
  subjectName,
}: Props) {
  return (
    <aside
      className={cn(
        "h-screen border-r border-border bg-card flex flex-col transition-all duration-200",
        collapsed ? "w-14" : "w-56"
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
            {!collapsed && (
              <span className="flex items-center gap-1.5">
                {item.label}
                {item.view === "group" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full leading-none">Soon</span>
                )}
              </span>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && subjectName && (
        <div className="px-2 mt-auto pb-3">
          <div className="mx-1 px-3 py-2 rounded-md bg-accent/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preparing for</p>
            <p className="text-sm font-medium text-foreground truncate">{subjectName}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
