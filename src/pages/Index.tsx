import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTopics, Topic } from "@/lib/api";
import AppSidebar from "@/components/AppSidebar";
import LearningLab from "@/components/LearningLab";
import ReviseMode from "@/components/ReviseMode";
import ExamSimulator from "@/components/ExamSimulator";
import StudyPlanner from "@/components/StudyPlanner";
import GroupStudy from "@/components/GroupStudy";

type View = "planner" | "learn" | "revise" | "exam" | "group";

function getNextTopic(topics: Topic[]): Topic | null {
  if (topics.length === 0) return null;

  // Priority: incomplete first, then by confidence (weak → unrated → somewhat → confident), then by marks
  const score = (t: Topic) => {
    let s = 0;
    if (!t.is_completed) s += 1000;
    if (t.confidence === "not_confident") s += 400;
    else if (!t.confidence) s += 300;
    else if (t.confidence === "somewhat") s += 200;
    else s += 50;
    s += t.marks_weightage * 2;
    return s;
  };

  return [...topics].sort((a, b) => score(b) - score(a))[0];
}

const Index = () => {
  const [view, setView] = useState<View>("planner");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const queryClient = useQueryClient();

  const { data: topics = [] } = useQuery({
    queryKey: ["topics"],
    queryFn: fetchTopics,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["topics"] });
  }, [queryClient]);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) ?? null;
  const nextRecommended = useMemo(() => getNextTopic(topics), [topics]);

  // Auto-select next topic when navigating to Learn without a selection
  useEffect(() => {
    if (view === "learn" && !selectedTopic && nextRecommended) {
      setSelectedTopicId(nextRecommended.id);
    }
  }, [view, selectedTopic, nextRecommended]);

  const handleNavigate = useCallback((v: View) => {
    if (v === "learn" && !selectedTopicId && nextRecommended) {
      setSelectedTopicId(nextRecommended.id);
    }
    setView(v);
  }, [selectedTopicId, nextRecommended]);

  const handleNextTopic = useCallback(() => {
    if (!selectedTopic || topics.length <= 1) return;
    // Find current index, go to next in priority order
    const sorted = [...topics].sort((a, b) => {
      const score = (t: Topic) => {
        let s = 0;
        if (!t.is_completed) s += 1000;
        if (t.confidence === "not_confident") s += 400;
        else if (!t.confidence) s += 300;
        else if (t.confidence === "somewhat") s += 200;
        else s += 50;
        s += t.marks_weightage * 2;
        return s;
      };
      return score(b) - score(a);
    });
    const currentIdx = sorted.findIndex((t) => t.id === selectedTopic.id);
    const nextIdx = (currentIdx + 1) % sorted.length;
    setSelectedTopicId(sorted[nextIdx].id);
  }, [selectedTopic, topics]);

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar
        onNavigate={handleNavigate}
        currentView={view}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        subjectName={subjectName}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {view === "planner" && (
          <StudyPlanner
            topics={topics}
            onNavigate={handleNavigate}
            onRefresh={refresh}
            subjectName={subjectName}
            onSubjectNameChange={setSubjectName}
          />
        )}
        {view === "learn" && selectedTopic && (
          <LearningLab
            key={selectedTopic.id}
            topic={selectedTopic}
            topics={topics}
            onTopicUpdate={refresh}
            onNextTopic={handleNextTopic}
            hasNextTopic={topics.length > 1}
            onSelectTopic={(id) => setSelectedTopicId(id)}
            onAllCompleted={() => { refresh(); setView("revise"); }}
          />
        )}
        {view === "learn" && !selectedTopic && topics.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Add topics in the Prep Dashboard to start learning</p>
          </div>
        )}
        {view === "revise" && (
          <ReviseMode
            topics={topics}
            onSelectTopic={(id) => { setSelectedTopicId(id); setView("learn"); }}
            onRevisionComplete={() => setView("exam")}
          />
        )}
        {view === "exam" && <ExamSimulator topics={topics} />}
      </main>
    </div>
  );
};

export default Index;
