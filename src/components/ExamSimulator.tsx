import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Topic,
  Msg,
  streamExplanation,
  saveExamResult,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Trophy,
  Play,
  RotateCcw,
} from "lucide-react";

type Props = {
  topics: Topic[];
};

type ExamQuestion = {
  topicName: string;
  type: "objective" | "subjective";
  question: string;
  answer: string;
  options?: string[];
};

type ExamState = "setup" | "running" | "results";

export default function ExamSimulator({ topics }: Props) {
  const [state, setState] = useState<ExamState>("setup");
  const [numQuestions, setNumQuestions] = useState("10");
  const [timeLimitMin, setTimeLimitMin] = useState("15");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [lockedAnswers, setLockedAnswers] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Timer
  useEffect(() => {
    if (state !== "running" || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          finishExam();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [state]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const startExam = async () => {
    if (topics.length === 0) {
      toast.error("No topics available");
      return;
    }
    setLoading(true);
    const count = Math.min(parseInt(numQuestions) || 10, 20);
    const time = (parseInt(timeLimitMin) || 15) * 60;

    // Pick random topics for questions
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    const selectedTopics = shuffled.slice(0, Math.min(count, shuffled.length));

    // Generate questions for each topic
    const allQuestions: ExamQuestion[] = [];
    const questionsPerTopic = Math.ceil(count / selectedTopics.length);

    for (const topic of selectedTopics) {
      let fullResponse = "";
      const msg: Msg = {
        role: "user",
        content: `Generate exactly ${questionsPerTopic} exam questions for "${topic.name}". Mix objective (MCQ) and subjective types.

Return ONLY in this format:

Q1: [OBJECTIVE]
[question]
A) [option]
B) [option]
C) [option]
D) [option]
CORRECT: [A/B/C/D]

Q2: [SUBJECTIVE]
[question]
ANSWER: [answer]`,
      };

      try {
        await streamExplanation({
          messages: [msg],
          topicName: topic.name,
          onDelta: (chunk) => { fullResponse += chunk; },
          onDone: () => {},
        });

        const parsed = parseExamQuestions(fullResponse, topic.name);
        allQuestions.push(...parsed);
      } catch {
        // Skip failed topic
      }
    }

    if (allQuestions.length === 0) {
      toast.error("Failed to generate questions");
      setLoading(false);
      return;
    }

    // Shuffle and limit
    const finalQuestions = allQuestions
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    setQuestions(finalQuestions);
    setCurrentIdx(0);
    setSelectedOptions({});
    setUserAnswers({});
    setLockedAnswers(new Set());
    setTimeLeft(time);
    setStartTime(Date.now());
    setState("running");
    setLoading(false);
  };

  const parseExamQuestions = (text: string, topicName: string): ExamQuestion[] => {
    const questions: ExamQuestion[] = [];
    const qBlocks = text.split(/(?=Q\d+:)/g).filter((b) => /^Q\d+:/.test(b.trim()));

    for (const block of qBlocks) {
      const isObjective = /\[OBJECTIVE\]/i.test(block) || /\nA\)/.test(block);

      if (isObjective) {
        const questionMatch = block.match(/Q\d+:\s*(?:\[OBJECTIVE\]\s*)?\n?([\s\S]*?)(?=\nA\))/);
        const optA = block.match(/A\)\s*(.*)/);
        const optB = block.match(/B\)\s*(.*)/);
        const optC = block.match(/C\)\s*(.*)/);
        const optD = block.match(/D\)\s*(.*)/);
        const correct = block.match(/CORRECT:\s*([A-D])/i);

        if (questionMatch && optA && optB && optC && optD) {
          const options = [optA[1].trim(), optB[1].trim(), optC[1].trim(), optD[1].trim()];
          const correctIdx = "ABCD".indexOf((correct?.[1] || "A").toUpperCase());
          questions.push({
            topicName,
            type: "objective",
            question: questionMatch[1].trim(),
            answer: options[correctIdx] || options[0],
            options,
          });
        }
      } else {
        const questionMatch = block.match(/Q\d+:\s*(?:\[SUBJECTIVE\]\s*)?\n?([\s\S]*?)(?=\nANSWER:)/);
        const answerMatch = block.match(/ANSWER:\s*([\s\S]*?)$/);
        if (questionMatch && answerMatch) {
          questions.push({
            topicName,
            type: "subjective",
            question: questionMatch[1].trim(),
            answer: answerMatch[1].trim(),
          });
        }
      }
    }
    return questions;
  };

  const lockObjectiveAnswer = (qIdx: number, optIdx: number) => {
    if (lockedAnswers.has(qIdx)) return;
    setSelectedOptions((prev) => ({ ...prev, [qIdx]: optIdx }));
    setLockedAnswers((prev) => new Set(prev).add(qIdx));
  };

  const lockSubjectiveAnswer = (qIdx: number) => {
    if (lockedAnswers.has(qIdx) || !(userAnswers[qIdx]?.trim())) return;
    setLockedAnswers((prev) => new Set(prev).add(qIdx));
  };

  const finishExam = async () => {
    clearInterval(timerRef.current);
    const duration = Math.round((Date.now() - startTime) / 1000);

    let correct = 0;
    questions.forEach((q, i) => {
      if (q.type === "objective" && q.options) {
        const correctIdx = q.options.findIndex((o) => o === q.answer);
        if (selectedOptions[i] === correctIdx) correct++;
      }
    });

    const topicIds = [...new Set(questions.map((q) => {
      const t = topics.find((t) => t.name === q.topicName);
      return t?.id;
    }).filter(Boolean))] as string[];

    try {
      await saveExamResult({
        total_questions: questions.length,
        correct_answers: correct,
        score_percentage: Math.round((correct / questions.length) * 100 * 100) / 100,
        duration_seconds: duration,
        topic_ids: topicIds,
      });
    } catch { /* ignore save errors */ }

    setState("results");
  };

  const getObjectiveCorrectIdx = (q: ExamQuestion) => {
    if (!q.options) return -1;
    return q.options.findIndex((o) => o === q.answer);
  };

  // SETUP
  if (state === "setup") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exam Simulator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Take a timed mock test across your syllabus
          </p>
        </div>

        {topics.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Add topics to your syllabus first!</p>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Number of Questions</label>
              <Input
                type="number"
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
                min={3}
                max={20}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Time Limit (minutes)</label>
              <Input
                type="number"
                value={timeLimitMin}
                onChange={(e) => setTimeLimitMin(e.target.value)}
                min={5}
                max={120}
                className="mt-1.5"
              />
            </div>
            <Button onClick={startExam} disabled={loading} className="w-full" size="lg">
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Generating Questions...</>
              ) : (
                <><Play className="h-5 w-5 mr-2" /> Start Exam</>
              )}
            </Button>
          </Card>
        )}
      </div>
    );
  }

  // RESULTS
  if (state === "results") {
    let objectiveCorrect = 0;
    let objectiveTotal = 0;
    questions.forEach((q, i) => {
      if (q.type === "objective" && q.options) {
        objectiveTotal++;
        const correctIdx = q.options.findIndex((o) => o === q.answer);
        if (selectedOptions[i] === correctIdx) objectiveCorrect++;
      }
    });
    const subjectiveTotal = questions.filter((q) => q.type === "subjective").length;
    const scorePct = objectiveTotal > 0 ? Math.round((objectiveCorrect / objectiveTotal) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <Trophy className={`h-12 w-12 mx-auto mb-3 ${scorePct >= 70 ? "text-success" : scorePct >= 40 ? "text-warning" : "text-destructive"}`} />
          <h1 className="text-3xl font-bold text-foreground">{scorePct}%</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {objectiveCorrect}/{objectiveTotal} MCQs correct
            {subjectiveTotal > 0 && ` · ${subjectiveTotal} subjective (self-evaluate)`}
          </p>
        </div>

        <div className="space-y-3">
          {questions.map((q, i) => {
            const isObj = q.type === "objective";
            const correctIdx = isObj ? getObjectiveCorrectIdx(q) : -1;
            const isCorrect = isObj && selectedOptions[i] === correctIdx;
            const wasAnswered = lockedAnswers.has(i);

            return (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isObj
                      ? isCorrect ? "bg-success/10 text-success" : wasAnswered ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">{q.topicName}</p>
                    <p className="text-sm text-foreground font-medium">{q.question}</p>
                    {isObj && q.options && (
                      <div className="mt-2 space-y-1">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className={`text-xs px-2 py-1 rounded ${
                            oi === correctIdx ? "bg-success/10 text-success font-medium" :
                            oi === selectedOptions[i] ? "bg-destructive/10 text-destructive" :
                            "text-muted-foreground"
                          }`}>
                            {"ABCD"[oi]}) {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    {!isObj && (
                      <div className="mt-2 text-xs">
                        {userAnswers[i] && (
                          <div className="p-2 rounded bg-primary/5 text-foreground mb-1">
                            <span className="text-primary font-medium">You: </span>{userAnswers[i]}
                          </div>
                        )}
                        <div className="p-2 rounded bg-success/5 text-foreground">
                          <span className="text-success font-medium">Answer: </span>{q.answer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Button onClick={() => setState("setup")} className="w-full" variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" /> Take Another Exam
        </Button>
      </div>
    );
  }

  // RUNNING
  const currentQ = questions[currentIdx];

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      {/* Header with timer */}
      <div className="flex items-center justify-between py-3 px-1 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-foreground">Mock Exam</h2>
          <p className="text-xs text-muted-foreground">
            Q{currentIdx + 1}/{questions.length} · {currentQ?.topicName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-sm font-mono font-bold ${
            timeLeft < 60 ? "text-destructive" : timeLeft < 180 ? "text-warning" : "text-foreground"
          }`}>
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </div>
          <Button variant="destructive" size="sm" onClick={finishExam}>
            Submit Exam
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border rounded-full mx-1 mb-4">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-4">
        {currentQ && (
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Question {currentIdx + 1}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  currentQ.type === "objective" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
                }`}>
                  {currentQ.type === "objective" ? "MCQ" : "Descriptive"}
                </span>
              </div>
              <div className="text-foreground leading-relaxed">
                <ReactMarkdown>{currentQ.question}</ReactMarkdown>
              </div>
            </Card>

            {/* Objective options */}
            {currentQ.type === "objective" && currentQ.options && (
              <div className="space-y-2">
                {currentQ.options.map((opt, i) => {
                  const locked = lockedAnswers.has(currentIdx);
                  const selected = selectedOptions[currentIdx] === i;
                  const correctIdx = getObjectiveCorrectIdx(currentQ);
                  const isCorrect = i === correctIdx;

                  let cls = "w-full text-left p-4 rounded-lg border-2 transition-all text-sm ";
                  if (!locked) {
                    cls += "border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer";
                  } else if (selected && isCorrect) {
                    cls += "border-success bg-success/10";
                  } else if (selected && !isCorrect) {
                    cls += "border-destructive bg-destructive/10";
                  } else if (isCorrect) {
                    cls += "border-success bg-success/10";
                  } else {
                    cls += "border-border opacity-60";
                  }

                  return (
                    <button key={i} className={cls} onClick={() => lockObjectiveAnswer(currentIdx, i)} disabled={locked}>
                      <div className="flex items-center gap-3">
                        <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                          locked && selected && isCorrect ? "bg-success text-success-foreground border-success" :
                          locked && selected && !isCorrect ? "bg-destructive text-destructive-foreground border-destructive" :
                          locked && isCorrect ? "bg-success text-success-foreground border-success" :
                          "border-muted-foreground/30 text-muted-foreground"
                        }`}>{"ABCD"[i]}</span>
                        <span className="flex-1">{opt}</span>
                        {locked && selected && isCorrect && <CheckCircle className="h-5 w-5 text-success" />}
                        {locked && selected && !isCorrect && <XCircle className="h-5 w-5 text-destructive" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Subjective */}
            {currentQ.type === "subjective" && (
              <div className="space-y-3">
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px] resize-none disabled:opacity-60"
                  placeholder="Type your answer..."
                  value={userAnswers[currentIdx] || ""}
                  onChange={(e) => setUserAnswers((prev) => ({ ...prev, [currentIdx]: e.target.value }))}
                  disabled={lockedAnswers.has(currentIdx)}
                />
                {!lockedAnswers.has(currentIdx) && (
                  <Button onClick={() => lockSubjectiveAnswer(currentIdx)} disabled={!userAnswers[currentIdx]?.trim()} className="w-full">
                    Submit Answer
                  </Button>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
              >
                Previous
              </Button>
              {currentIdx < questions.length - 1 ? (
                <Button onClick={() => setCurrentIdx((i) => i + 1)}>
                  Next
                </Button>
              ) : (
                <Button variant="destructive" onClick={finishExam}>
                  Submit Exam
                </Button>
              )}
            </div>

            {/* Question navigator */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-2">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                    i === currentIdx
                      ? "bg-primary text-primary-foreground"
                      : lockedAnswers.has(i)
                      ? "bg-success/20 text-success"
                      : "bg-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}