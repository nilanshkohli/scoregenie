import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Topic,
  Msg,
  streamExplanation,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  ChevronRight,
  RotateCcw,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";

type Props = {
  topics: Topic[];
  onSelectTopic: (id: string) => void;
  onRevisionComplete?: () => void;
};

type Flashcard = {
  front: string;
  back: string;
};

type RevisionState = "queue" | "session";

export default function ReviseMode({ topics, onSelectTopic }: Props) {
  const [state, setState] = useState<RevisionState>("queue");
  const [sessionTopics, setSessionTopics] = useState<Topic[]>([]);
  const [currentTopicIdx, setCurrentTopicIdx] = useState(0);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cardsReviewed, setCardsReviewed] = useState(0);
  const [topicsCompleted, setTopicsCompleted] = useState(0);

  // Smart revision queue: prioritize by confidence (weak first), then oldest updated, then highest marks
  const revisionQueue = useMemo(() => {
    const scoreTopic = (t: Topic) => {
      let score = 0;
      // Confidence priority (higher score = review first)
      if (t.confidence === "not_confident") score += 300;
      else if (t.confidence === "somewhat") score += 200;
      else if (t.confidence === "confident") score += 50;
      else score += 100; // never rated

      // Marks weightage bonus
      score += t.marks_weightage * 2;

      // Older = higher priority (days since last update)
      const daysSinceUpdate = (Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.min(daysSinceUpdate * 10, 100);

      return score;
    };

    return [...topics].sort((a, b) => scoreTopic(b) - scoreTopic(a));
  }, [topics]);

  const weakTopics = revisionQueue.filter(
    (t) => t.confidence === "not_confident" || t.confidence === "somewhat" || !t.confidence
  );
  const confidentTopics = revisionQueue.filter((t) => t.confidence === "confident");

  const startSession = async (selectedTopics: Topic[]) => {
    if (selectedTopics.length === 0) {
      toast.error("No topics to revise");
      return;
    }
    setSessionTopics(selectedTopics);
    setCurrentTopicIdx(0);
    setCardsReviewed(0);
    setTopicsCompleted(0);
    setState("session");
    await generateFlashcards(selectedTopics[0]);
  };

  const generateFlashcards = async (topic: Topic) => {
    setLoading(true);
    setFlashcards([]);
    setCurrentCardIdx(0);
    setFlipped(false);

    let fullResponse = "";

    const userMsg: Msg = {
      role: "user",
      content: `Generate exactly 6 flashcards for quick revision of "${topic.name}". These should test key concepts, definitions, formulas, and important facts.

IMPORTANT: Return ONLY in this exact format, no other text:

FRONT1: [question/prompt on front of card]
BACK1: [answer/explanation on back of card]

FRONT2: [question/prompt]
BACK2: [answer/explanation]

FRONT3: [question/prompt]
BACK3: [answer/explanation]

FRONT4: [question/prompt]
BACK4: [answer/explanation]

FRONT5: [question/prompt]
BACK5: [answer/explanation]

FRONT6: [question/prompt]
BACK6: [answer/explanation]`,
    };

    try {
      await streamExplanation({
        messages: [userMsg],
        topicName: topic.name,
        onDelta: (chunk) => {
          fullResponse += chunk;
        },
        onDone: () => {
          const parsed = parseFlashcards(fullResponse);
          setFlashcards(parsed);
          setLoading(false);
        },
      });
    } catch (e: any) {
      setLoading(false);
      toast.error(e.message || "Failed to generate flashcards");
    }
  };

  const parseFlashcards = (text: string): Flashcard[] => {
    const cards: Flashcard[] = [];
    const frontMatches = [...text.matchAll(/FRONT\d+:\s*([\s\S]*?)(?=\nBACK\d+:)/g)];
    const backMatches = [...text.matchAll(/BACK\d+:\s*([\s\S]*?)(?=\n\nFRONT\d+:|$)/g)];

    for (let i = 0; i < Math.min(frontMatches.length, backMatches.length); i++) {
      cards.push({
        front: frontMatches[i][1].trim(),
        back: backMatches[i][1].trim(),
      });
    }

    // Fallback
    if (cards.length === 0) {
      const lines = text.split("\n").filter(Boolean);
      let front = "";
      for (const line of lines) {
        if (/^FRONT\d+:/i.test(line)) {
          front = line.replace(/^FRONT\d+:\s*/i, "").trim();
        } else if (/^BACK\d+:/i.test(line) && front) {
          cards.push({ front, back: line.replace(/^BACK\d+:\s*/i, "").trim() });
          front = "";
        }
      }
    }

    return cards.length > 0 ? cards : [{ front: "Review this topic", back: text.slice(0, 200) }];
  };

  const handleNextCard = () => {
    setCardsReviewed((c) => c + 1);
    if (currentCardIdx < flashcards.length - 1) {
      setCurrentCardIdx((i) => i + 1);
      setFlipped(false);
    } else {
      // Move to next topic
      handleNextTopic();
    }
  };

  const handleNextTopic = async () => {
    setTopicsCompleted((c) => c + 1);
    if (currentTopicIdx < sessionTopics.length - 1) {
      const nextIdx = currentTopicIdx + 1;
      setCurrentTopicIdx(nextIdx);
      await generateFlashcards(sessionTopics[nextIdx]);
    } else {
      // Session complete
      setState("queue");
      toast.success(`Revision complete! Reviewed ${cardsReviewed + 1} cards across ${topicsCompleted + 1} topics.`);
    }
  };

  const confidenceIcon = (c: string | null) => {
    if (c === "not_confident") return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (c === "somewhat") return <Zap className="h-4 w-4 text-warning" />;
    if (c === "confident") return <CheckCircle className="h-4 w-4 text-success" />;
    return <Brain className="h-4 w-4 text-muted-foreground" />;
  };

  const confidenceLabel = (c: string | null) => {
    if (c === "not_confident") return "Weak";
    if (c === "somewhat") return "Moderate";
    if (c === "confident") return "Strong";
    return "Unrated";
  };

  const confidenceBadgeClass = (c: string | null) => {
    if (c === "not_confident") return "bg-destructive/10 text-destructive";
    if (c === "somewhat") return "bg-warning/10 text-warning";
    if (c === "confident") return "bg-success/10 text-success";
    return "bg-muted text-muted-foreground";
  };

  // SESSION VIEW: Flashcard review
  if (state === "session") {
    const currentTopic = sessionTopics[currentTopicIdx];
    const currentCard = flashcards[currentCardIdx];

    return (
      <div className="flex flex-col h-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between py-3 px-1 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground">Revise: {currentTopic?.name}</h2>
            <p className="text-xs text-muted-foreground">
              Topic {currentTopicIdx + 1}/{sessionTopics.length} · Card {currentCardIdx + 1}/{flashcards.length || "..."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setState("queue")}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Exit
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center px-1 pb-4">
          {loading ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Generating flashcards...</p>
            </div>
          ) : currentCard ? (
            <div className="w-full space-y-4">
              {/* Progress dots */}
              <div className="flex justify-center gap-1.5">
                {flashcards.map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      i === currentCardIdx ? "bg-primary" : i < currentCardIdx ? "bg-success" : "bg-border"
                    }`}
                  />
                ))}
              </div>

              {/* Flashcard */}
              <button
                onClick={() => setFlipped(!flipped)}
                className="w-full focus:outline-none"
              >
                <Card className={`p-8 min-h-[220px] flex flex-col items-center justify-center text-center transition-all cursor-pointer hover:shadow-md ${
                  flipped ? "border-success/30 bg-success/5" : "border-primary/20"
                }`}>
                  <div className="flex items-center gap-2 mb-4">
                    {flipped ? (
                      <Eye className="h-4 w-4 text-success" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-primary" />
                    )}
                    <span className={`text-xs font-semibold uppercase tracking-wider ${
                      flipped ? "text-success" : "text-primary"
                    }`}>
                      {flipped ? "Answer" : "Question"}
                    </span>
                  </div>
                  <div className="prose prose-sm max-w-none text-foreground">
                    <ReactMarkdown>
                      {flipped ? currentCard.back : currentCard.front}
                    </ReactMarkdown>
                  </div>
                  {!flipped && (
                    <p className="text-xs text-muted-foreground mt-4">Tap to reveal answer</p>
                  )}
                </Card>
              </button>

              {/* Actions */}
              {flipped && (
                <div className="flex justify-center gap-3">
                  {currentCardIdx < flashcards.length - 1 ? (
                    <Button onClick={handleNextCard}>
                      Next Card <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : currentTopicIdx < sessionTopics.length - 1 ? (
                    <Button onClick={handleNextTopic}>
                      Next Topic <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={() => handleNextTopic()}>
                      Finish Session <CheckCircle className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // QUEUE VIEW: Smart revision queue
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revise Mode</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Smart revision prioritized by weak areas, marks weightage, and recency
        </p>
      </div>

      {topics.length === 0 ? (
        <Card className="p-8 text-center">
          <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No topics yet. Add your syllabus first!</p>
        </Card>
      ) : (
        <>
          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              className="p-5 cursor-pointer hover:shadow-md transition-shadow border-destructive/20 hover:border-destructive/40"
              onClick={() => startSession(weakTopics)}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">Weak Topics Drill</p>
                  <p className="text-xs text-muted-foreground">
                    {weakTopics.length} topic{weakTopics.length !== 1 ? "s" : ""} need attention
                  </p>
                </div>
              </div>
            </Card>
            <Card
              className="p-5 cursor-pointer hover:shadow-md transition-shadow border-primary/20 hover:border-primary/40"
              onClick={() => startSession(revisionQueue)}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">Full Revision</p>
                  <p className="text-xs text-muted-foreground">
                    All {revisionQueue.length} topics in smart order
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Revision queue */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">
              Revision Priority Queue
            </p>
            <div className="space-y-2">
              {revisionQueue.map((topic, idx) => (
                <Card
                  key={topic.id}
                  className="p-4 flex items-center gap-3 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => startSession([topic])}
                >
                  <span className="text-xs font-bold text-muted-foreground w-6 text-center">
                    {idx + 1}
                  </span>
                  {confidenceIcon(topic.confidence)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{topic.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {topic.marks_weightage} marks · {topic.time_spent_minutes}m studied
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${confidenceBadgeClass(topic.confidence)}`}>
                    {confidenceLabel(topic.confidence)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}