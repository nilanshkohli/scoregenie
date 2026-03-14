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
import { Send, CheckCircle, AlertCircle, XCircle, Loader2, ChevronRight, RotateCcw, Check, X, ArrowRight } from "lucide-react";

type Props = {
  topic: Topic;
  onTopicUpdate: () => void;
  onNextTopic?: () => void;
  hasNextTopic?: boolean;
};

type PracticeQuestion = {
  type: "objective" | "subjective";
  question: string;
  answer: string;
  options?: string[]; // For objective questions
};

export default function LearningLab({ topic, onTopicUpdate, onNextTopic, hasNextTopic }: Props) {
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
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerLocked, setIsAnswerLocked] = useState(false);
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
    setUserAnswer("");
    setSelectedOption(null);
    setIsAnswerLocked(false);

    let fullResponse = "";

    const userMsg: Msg = {
      role: "user",
      content: `Generate exactly 5 practice questions for "${topic.name}" with varying difficulty. Include a mix of objective (multiple choice) and subjective (descriptive) questions.

IMPORTANT: Return ONLY in this exact format, no other text:

Q1: [OBJECTIVE]
[question text]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
CORRECT: [A/B/C/D]

Q2: [SUBJECTIVE]
[question text]
ANSWER: [detailed answer text]

Q3: [OBJECTIVE]
[question text]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
CORRECT: [A/B/C/D]

Q4: [SUBJECTIVE]
[question text]
ANSWER: [detailed answer text]

Q5: [OBJECTIVE]
[question text]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
CORRECT: [A/B/C/D]`,
    };

    try {
      await streamExplanation({
        messages: [...messages, userMsg],
        topicName: topic.name,
        onDelta: (chunk) => {
          fullResponse += chunk;
        },
        onDone: () => {
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
    // Split by Q followed by number
    const qBlocks = text.split(/(?=Q\d+:)/g).filter((b) => /^Q\d+:/.test(b.trim()));

    for (const block of qBlocks) {
      const isObjective = /\[OBJECTIVE\]/i.test(block);
      const isSubjective = /\[SUBJECTIVE\]/i.test(block);

      if (isObjective) {
        // Parse objective question
        const questionMatch = block.match(/Q\d+:\s*\[OBJECTIVE\]\s*\n([\s\S]*?)(?=\nA\))/);
        const optionAMatch = block.match(/A\)\s*(.*)/);
        const optionBMatch = block.match(/B\)\s*(.*)/);
        const optionCMatch = block.match(/C\)\s*(.*)/);
        const optionDMatch = block.match(/D\)\s*(.*)/);
        const correctMatch = block.match(/CORRECT:\s*([A-D])/i);

        if (questionMatch && optionAMatch && optionBMatch && optionCMatch && optionDMatch && correctMatch) {
          const correctLetter = correctMatch[1].toUpperCase();
          const options = [
            optionAMatch[1].trim(),
            optionBMatch[1].trim(),
            optionCMatch[1].trim(),
            optionDMatch[1].trim(),
          ];
          const correctIndex = "ABCD".indexOf(correctLetter);
          questions.push({
            type: "objective",
            question: questionMatch[1].trim(),
            answer: options[correctIndex] || options[0],
            options,
          });
        }
      } else if (isSubjective) {
        const questionMatch = block.match(/Q\d+:\s*\[SUBJECTIVE\]\s*\n([\s\S]*?)(?=\nANSWER:)/);
        const answerMatch = block.match(/ANSWER:\s*([\s\S]*?)$/);

        if (questionMatch && answerMatch) {
          questions.push({
            type: "subjective",
            question: questionMatch[1].trim(),
            answer: answerMatch[1].trim(),
          });
        }
      } else {
        // Fallback: try to detect options
        const hasOptions = /\nA\)/.test(block);
        if (hasOptions) {
          const questionMatch = block.match(/Q\d+:\s*([\s\S]*?)(?=\nA\))/);
          const optionAMatch = block.match(/A\)\s*(.*)/);
          const optionBMatch = block.match(/B\)\s*(.*)/);
          const optionCMatch = block.match(/C\)\s*(.*)/);
          const optionDMatch = block.match(/D\)\s*(.*)/);
          const correctMatch = block.match(/CORRECT:\s*([A-D])/i);

          if (questionMatch && optionAMatch && optionBMatch && optionCMatch && optionDMatch) {
            const options = [
              optionAMatch[1].trim(),
              optionBMatch[1].trim(),
              optionCMatch[1].trim(),
              optionDMatch[1].trim(),
            ];
            const correctLetter = correctMatch?.[1]?.toUpperCase() || "A";
            const correctIndex = "ABCD".indexOf(correctLetter);
            questions.push({
              type: "objective",
              question: questionMatch[1].trim(),
              answer: options[correctIndex] || options[0],
              options,
            });
          }
        } else {
          // Treat as subjective
          const questionMatch = block.match(/Q\d+:\s*([\s\S]*?)(?=\nANSWER:|A\d+:)/);
          const answerMatch = block.match(/(?:ANSWER:|A\d+:)\s*([\s\S]*?)$/);
          if (questionMatch && answerMatch) {
            questions.push({
              type: "subjective",
              question: questionMatch[1].trim(),
              answer: answerMatch[1].trim(),
            });
          }
        }
      }
    }

    if (questions.length === 0) {
      return [{ type: "subjective", question: text, answer: "See explanation above." }];
    }

    return questions;
  };

  const handleSelectOption = (optionIndex: number) => {
    if (isAnswerLocked) return;
    setSelectedOption(optionIndex);
    setIsAnswerLocked(true);
  };

  const handleSubjectiveSubmit = () => {
    if (!userAnswer.trim() || isAnswerLocked) return;
    setIsAnswerLocked(true);
  };

  const getCorrectOptionIndex = (q: PracticeQuestion): number => {
    if (!q.options) return -1;
    return q.options.findIndex((opt) => opt === q.answer);
  };

  const goToNextQuestion = () => {
    setCurrentQIndex((i) => i + 1);
    setShowAnswer(false);
    setUserAnswer("");
    setSelectedOption(null);
    setIsAnswerLocked(false);
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
            onClick={() => { setPracticeMode(false); setShowAnswer(false); setIsAnswerLocked(false); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Back to Learning
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-1 pb-4">
          {practiceLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Generating questions...</p>
              </div>
            </div>
          ) : currentQ ? (
            <div className="w-full space-y-4 pt-2">
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
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Question {currentQIndex + 1}
                  </p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    currentQ.type === "objective"
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}>
                    {currentQ.type === "objective" ? "MCQ" : "Descriptive"}
                  </span>
                </div>
                <div className="text-foreground leading-relaxed">
                  <ReactMarkdown>{currentQ.question}</ReactMarkdown>
                </div>
              </Card>

              {/* OBJECTIVE: MCQ Options */}
              {currentQ.type === "objective" && currentQ.options && (
                <div className="space-y-2">
                  {currentQ.options.map((option, i) => {
                    const correctIdx = getCorrectOptionIndex(currentQ);
                    const isSelected = selectedOption === i;
                    const isCorrect = i === correctIdx;
                    const isLocked = isAnswerLocked;

                    let optionClasses = "w-full text-left p-4 rounded-lg border-2 transition-all text-sm ";

                    if (!isLocked) {
                      optionClasses += "border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer";
                    } else if (isSelected && isCorrect) {
                      optionClasses += "border-success bg-success/10 text-foreground";
                    } else if (isSelected && !isCorrect) {
                      optionClasses += "border-destructive bg-destructive/10 text-foreground";
                    } else if (isCorrect && showAnswer) {
                      optionClasses += "border-success bg-success/10 text-foreground";
                    } else {
                      optionClasses += "border-border opacity-60";
                    }

                    return (
                      <button
                        key={i}
                        className={optionClasses}
                        onClick={() => handleSelectOption(i)}
                        disabled={isLocked}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                            isLocked && isSelected && isCorrect
                              ? "bg-success text-success-foreground border-success"
                              : isLocked && isSelected && !isCorrect
                              ? "bg-destructive text-destructive-foreground border-destructive"
                              : isLocked && isCorrect && showAnswer
                              ? "bg-success text-success-foreground border-success"
                              : "border-muted-foreground/30 text-muted-foreground"
                          }`}>
                            {"ABCD"[i]}
                          </span>
                          <span className="flex-1">{option}</span>
                          {isLocked && isSelected && isCorrect && (
                            <Check className="h-5 w-5 text-success flex-shrink-0" />
                          )}
                          {isLocked && isSelected && !isCorrect && (
                            <X className="h-5 w-5 text-destructive flex-shrink-0" />
                          )}
                          {isLocked && !isSelected && isCorrect && showAnswer && (
                            <Check className="h-5 w-5 text-success flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Result feedback after selection */}
                  {isAnswerLocked && selectedOption !== null && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
                      selectedOption === getCorrectOptionIndex(currentQ)
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {selectedOption === getCorrectOptionIndex(currentQ) ? (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Correct! Well done.
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          Incorrect. Reveal the answer to see the correct option.
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SUBJECTIVE: Text answer */}
              {currentQ.type === "subjective" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Your Answer</p>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px] resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="Type your answer here..."
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      disabled={isAnswerLocked}
                    />
                  </div>
                  {!isAnswerLocked && (
                    <Button
                      className="w-full"
                      onClick={handleSubjectiveSubmit}
                      disabled={!userAnswer.trim()}
                    >
                      Submit Answer
                    </Button>
                  )}
                  {isAnswerLocked && !showAnswer && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                      <CheckCircle className="h-4 w-4" />
                      Answer submitted! Reveal to compare with the correct answer.
                    </div>
                  )}
                </div>
              )}

              {/* Reveal Answer button — only after attempting */}
              {isAnswerLocked && !showAnswer && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAnswer(true)}
                >
                  Reveal Correct Answer
                </Button>
              )}

              {/* Revealed answer for subjective */}
              {showAnswer && currentQ.type === "subjective" && (
                <>
                  {userAnswer.trim() && (
                    <Card className="p-4 border-primary/20 bg-primary/5">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                        Your Answer
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{userAnswer}</p>
                    </Card>
                  )}
                  <Card className="p-6 border-success/30 bg-success/5">
                    <p className="text-xs font-semibold text-success uppercase tracking-wider mb-3">
                      Correct Answer
                    </p>
                    <div className="prose prose-sm max-w-none text-foreground">
                      <ReactMarkdown>{currentQ.answer}</ReactMarkdown>
                    </div>
                  </Card>
                </>
              )}

              {/* Navigation */}
              {showAnswer && (
                <div className="flex justify-end pt-2">
                  {currentQIndex < practiceQuestions.length - 1 ? (
                    <Button onClick={goToNextQuestion}>
                      Next Question <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={() => { setPracticeMode(false); setShowAnswer(false); setIsAnswerLocked(false); }}>
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
            {topic.marks_weightage} score potential
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePractice} disabled={loading}>
            Practice Questions
          </Button>
          {hasNextTopic && onNextTopic && (
            <Button variant="default" size="sm" onClick={onNextTopic}>
              Next Topic <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
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
