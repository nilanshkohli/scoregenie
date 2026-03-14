import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTopics, Topic } from "@/lib/api";
import AppSidebar from "@/components/AppSidebar";
import SyllabusInput from "@/components/SyllabusInput";
import LearningLab from "@/components/LearningLab";
import ReviseMode from "@/components/ReviseMode";
import ExamSimulator from "@/components/ExamSimulator";
import ProgressOverview from "@/components/ProgressOverview";
import StudyPlanner from "@/components/StudyPlanner";

type View = "planner" | "syllabus" | "learn" | "revise" | "exam" | "progress";

const Index = () => {
  const [view, setView] = useState<View>("planner");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const queryClient = useQueryClient();

  const { data: topics = [] } = useQuery({
    queryKey: ["topics"],
    queryFn: fetchTopics,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["topics"] });
  }, [queryClient]);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) ?? null;

  const handleNavigate = (v: View) => {
    setView(v);
  };

  const handleSelectTopic = (id: string) => {
    setSelectedTopicId(id);
    setView("learn");
  };

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar
        topics={topics}
        selectedTopicId={selectedTopicId}
        onSelectTopic={handleSelectTopic}
        onNavigate={handleNavigate}
        currentView={view}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {view === "planner" && (
          <StudyPlanner topics={topics} onNavigate={handleNavigate} />
        )}
        {view === "syllabus" && (
          <SyllabusInput topics={topics} onRefresh={refresh} />
        )}
        {view === "learn" && selectedTopic && (
          <LearningLab
            key={selectedTopic.id}
            topic={selectedTopic}
            onTopicUpdate={refresh}
          />
        )}
        {view === "learn" && !selectedTopic && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              Select a topic from the sidebar to start learning
            </p>
          </div>
        )}
        {view === "revise" && (
          <ReviseMode topics={topics} onSelectTopic={handleSelectTopic} />
        )}
        {view === "exam" && (
          <ExamSimulator topics={topics} />
        )}
        {view === "progress" && (
          <ProgressOverview topics={topics} />
        )}
      </main>
    </div>
  );
};

export default Index;
