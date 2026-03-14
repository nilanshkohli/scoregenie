import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Topic,
  Msg,
  fetchMessages,
  saveMessage,
  updateTopic,
  streamExplanation,
} from "@/lib/api";
import { toast } from "sonner";
import { Send, CheckCircle, AlertCircle, XCircle, Loader2, ChevronRight, RotateCcw } from "lucide-react";

type Props = {
  topic: Topic;
  onTopicUpdate: () => void;
};

type PracticeQuestion = {
  question: string;
  answer: string;
};

export default function LearningLab({ topic, onTopicUpdate }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    let cancelled = false;

    (async () => {
      setInitialLoading(true);
      try {
        const saved = await fetchMessages(topic.id);
        if (cancelled) return;

        if (saved.length > 0) {
          setMessages(
            saved
              .filter((m) => m.role !== "system")
              .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
          );
          setInitialLoading(false);
        } else {
          setMessages([]);
          setInitialLoading(false);
          await generateExplanation([
            { role: "user", content: `Explain the concept "${topic.name}" clearly with key points and examples. Make it exam-focused.` },
          ]);
        }
      } catch {
        if (!cancelled) setInitialLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 60000);
      if (elapsed > 0) {
        updateTopic(topic.id, {
          time_spent_minutes: topic.time_spent_minutes + elapsed,
        }).then(onTopicUpdate).catch(() => {});
      }
    };
  }, [topic.id]);

  useEffect(() => {
    if (!practiceMode) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, practiceMode]);

  const generateExplanation = async (msgs: Msg[]) => {
    setLoading(true);
    let assistantSoFar = "";

    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamExplanation({
        messages: msgs,
        topicName: topic.name,
        onDelta: upsert,
        onDone: () => setLoading(false),
      });
      for (const m of msgs) {
        await saveMessage(topic.id, m.role, m.content);
      }
      await saveMessage(topic.id, "assistant", assistantSoFar);
    } catch (e: any) {
      setLoading(false);
      toast.error(e.message || "AI error");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    await generateExplanation(newMsgs);
  };

  const handlePractice = async () => {
    if (loading || practiceLoading) return;
    setPracticeLoading(true);
    setPracticeMode(true);
    setPracticeQuestions([]);
    setCurrentQIndex(0);
    setShowAnswer(false);

    let fullResponse = "";

    const userMsg: Msg = {
      role: "user",
      content: `Generate exactly 5 practice questions for "${topic.name}" with varying difficulty.

IMPORTANT: Return ONLY in this exact format, no other text:

Q1: [question text]
A1: [answer text]

Q2: [question text]
A2: [answer text]

Q3: [question text]
A3: [answer text]

Q4: [question text]
A4: [answer text]

Q5: [question text]
A5: [answer text]`,
    };

    try {
      await streamExplanation({
        messages: [...messages, userMsg],
        topicName: topic.name,
        onDelta: (chunk) => {
          fullResponse += chunk;
        },
        onDone: () => {
          // Parse questions
          const parsed = parseQuestions(fullResponse);
          setPracticeQuestions(parsed);
          setPracticeLoading(false);
        },
      });
      await saveMessage(topic.id, "user", userMsg.content);
      await saveMessage(topic.id, "assistant", fullResponse);
    } catch (e: any) {
      setPracticeLoading(false);
      setPracticeMode(false);
      toast.error(e.message || "Failed to generate questions");
    }
  };

  const parseQuestions = (text: string): PracticeQuestion[] => {
    const questions: PracticeQuestion[] = [];
    const qRegex = /Q(\d+):\s*([\s\S]*?)(?=A\1:)/g;
    const aRegex = /A(\d+):\s*([\s\S]*?)(?=Q\d+:|$)/g;

    const qMatches = [...text.matchAll(/Q\d+:\s*([\s\S]*?)(?=\nA\d+:)/g)];
    const aMatches = [...text.matchAll(/A\d+:\s*([\s\S]*?)(?=\n\nQ\d+:|$)/g)];

    for (let i = 0; i < Math.min(qMatches.length, aMatches.length); i++) {
      questions.push({
        question: qMatches[i][1].trim(),
        answer: aMatches[i][1].trim(),
      });
    }

    // Fallback: simple split
    if (questions.length === 0) {
      const lines = text.split("\n").filter(Boolean);
      let currentQ = "";
      let currentA = "";
      for (const line of lines) {
        if (/^Q\d+:/i.test(line)) {
          if (currentQ && currentA) {
            questions.push({ question: currentQ, answer: currentA });
          }
          currentQ = line.replace(/^Q\d+:\s*/i, "").trim();
          currentA = "";
        } else if (/^A\d+:/i.test(line)) {
          currentA = line.replace(/^A\d+:\s*/i, "").trim();
        }
      }
      if (currentQ && currentA) {
        questions.push({ question: currentQ, answer: currentA });
      }
    }

    return questions.length > 0 ? questions : [{ question: text, answer: "See explanation above." }];
  };

  const handleConfidence = async (level: "confident" | "somewhat" | "not_confident") => {
    try {
      await updateTopic(topic.id, {
        confidence: level,
        is_completed: level === "confident" || level === "somewhat",
      });
      onTopicUpdate();
      toast.success("Confidence saved!");
    } catch {
      toast.error("Failed to save confidence");
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Practice mode UI
  if (practiceMode) {
    const currentQ = practiceQuestions[currentQIndex];

    return (
      <div className="flex flex-col h-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between py-3 px-1">
          <div>
            <h2 className="text-lg font-bold text-foreground">Practice: {topic.name}</h2>
            <p className="text-xs text-muted-foreground">
              Question {currentQIndex + 1} of {practiceQuestions.length || "..."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPracticeMode(false); setShowAnswer(false); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Back to Learning
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center px-1">
          {practiceLoading ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Generating questions...</p>
            </div>
          ) : currentQ ? (
            <div className="w-full space-y-4">
              {/* Progress dots */}
              <div className="flex justify-center gap-1.5">
                {practiceQuestions.map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      i === currentQIndex ? "bg-primary" : i < currentQIndex ? "bg-success" : "bg-border"
                    }`}
                  />
                ))}
              </div>

              {/* Question card */}
              <Card className="p-6">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">
                  Question {currentQIndex + 1}
                </p>
                <div className="text-foreground leading-relaxed">
                  <ReactMarkdown>{currentQ.question}</ReactMarkdown>
                </div>
              </Card>

              {/* Your answer + Correct answer */}
              {!showAnswer && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Your Answer</p>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
                      placeholder="Type your answer here..."
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowAnswer(true)}
                  >
                    Reveal Correct Answer
                  </Button>
                </div>
              )}

              {showAnswer && (
                <>
                  {userAnswer.trim() && (
                    <Card className="p-4 border-primary/20 bg-primary/5">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                        Your Answer
                      </p>
                      <p className="text-sm text-foreground">{userAnswer}</p>
                    </Card>
                  )}
                  <Card className="p-6 border-success/30 bg-success/5">
                    <p className="text-xs font-semibold text-success uppercase tracking-wider mb-3">
                      Correct Answer
                    </p>
                    <div className="text-foreground leading-relaxed">
                      <ReactMarkdown>{currentQ.answer}</ReactMarkdown>
                    </div>
                  </Card>
                </>
              )}

              {/* Navigation */}
              {showAnswer && (
                <div className="flex justify-end">
                  {currentQIndex < practiceQuestions.length - 1 ? (
                    <Button
                      onClick={() => {
                        setCurrentQIndex((i) => i + 1);
                        setShowAnswer(false);
                      }}
                    >
                      Next Question <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={() => { setPracticeMode(false); setShowAnswer(false); }}>
                      Done — Back to Learning
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

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-3 px-1 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-foreground">{topic.name}</h2>
          <p className="text-xs text-muted-foreground">
            {topic.marks_weightage} marks weightage
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePractice} disabled={loading}>
          Practice Questions
        </Button>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 px-1 min-h-0">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            {m.role === "user" ? (
              <div className="max-w-[80%] rounded-lg p-3 bg-primary text-primary-foreground">
                <p className="text-sm">{m.content}</p>
              </div>
            ) : (
              <Card className="max-w-[90%] p-4">
                <div className="prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </Card>
            )}
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <Card className="p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </Card>
          </div>
        )}
      </div>

      {/* Confidence Tracker + Input */}
      <div className="border-t border-border pt-3 pb-2 px-1 shrink-0">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          How confident are you with this topic?
        </p>
        <div className="flex gap-2 mb-3">
          <Button
            size="sm"
            variant={topic.confidence === "confident" ? "default" : "outline"}
            className={topic.confidence === "confident" ? "bg-success hover:bg-success/90 border-0" : ""}
            onClick={() => handleConfidence("confident")}
          >
            <CheckCircle className="h-4 w-4 mr-1" /> Confident
          </Button>
          <Button
            size="sm"
            variant={topic.confidence === "somewhat" ? "default" : "outline"}
            className={topic.confidence === "somewhat" ? "bg-warning hover:bg-warning/90 border-0" : ""}
            onClick={() => handleConfidence("somewhat")}
          >
            <AlertCircle className="h-4 w-4 mr-1" /> Somewhat
          </Button>
          <Button
            size="sm"
            variant={topic.confidence === "not_confident" ? "default" : "outline"}
            className={topic.confidence === "not_confident" ? "bg-destructive hover:bg-destructive/90 border-0" : ""}
            onClick={() => handleConfidence("not_confident")}
          >
            <XCircle className="h-4 w-4 mr-1" /> Not Confident
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Ask a follow-up question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
