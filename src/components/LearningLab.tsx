import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Topic,
  ChatMessage,
  Msg,
  fetchMessages,
  saveMessage,
  updateTopic,
  streamExplanation,
} from "@/lib/api";
import { toast } from "sonner";
import { Send, CheckCircle, AlertCircle, XCircle, Loader2 } from "lucide-react";

type Props = {
  topic: Topic;
  onTopicUpdate: () => void;
};

export default function LearningLab({ topic, onTopicUpdate }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Load existing messages or generate initial explanation
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
          // Generate initial explanation
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
      // Save time spent
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 60000);
      if (elapsed > 0) {
        updateTopic(topic.id, {
          time_spent_minutes: topic.time_spent_minutes + elapsed,
        }).then(onTopicUpdate).catch(() => {});
      }
    };
  }, [topic.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
      // Save messages
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

  const handlePractice = () => {
    if (loading) return;
    const userMsg: Msg = {
      role: "user",
      content: `Generate 3-5 practice questions for "${topic.name}" with varying difficulty. Include the answers after all questions.`,
    };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    generateExplanation(newMsgs);
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

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-3 px-1">
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 px-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <Card
              className={
                m.role === "user"
                  ? "max-w-[80%] p-3 bg-primary text-primary-foreground border-0"
                  : "max-w-[90%] p-4 bg-card"
              }
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none text-card-foreground prose-headings:text-card-foreground prose-strong:text-card-foreground prose-code:text-card-foreground">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm">{m.content}</p>
              )}
            </Card>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <Card className="p-3 bg-card">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </Card>
          </div>
        )}
      </div>

      {/* Confidence Tracker */}
      <div className="border-t border-border pt-3 pb-2 px-1">
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

        {/* Input */}
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
