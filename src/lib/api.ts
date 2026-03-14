import { supabase } from "@/integrations/supabase/client";

export type Topic = {
  id: string;
  name: string;
  marks_weightage: number;
  is_completed: boolean;
  confidence: "confident" | "somewhat" | "not_confident" | null;
  time_spent_minutes: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  topic_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export async function fetchTopics(): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Topic[];
}

export async function addTopic(name: string, marks: number, sortOrder: number): Promise<Topic> {
  const { data, error } = await supabase
    .from("topics")
    .insert({ name, marks_weightage: marks, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data as Topic;
}

export async function updateTopic(id: string, updates: Partial<Pick<Topic, "confidence" | "is_completed" | "time_spent_minutes">>): Promise<Topic> {
  const { data, error } = await supabase
    .from("topics")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Topic;
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchMessages(topicId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function saveMessage(topicId: string, role: string, content: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ topic_id: topicId, role, content })
    .select()
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export type Msg = { role: "user" | "assistant"; content: string };

export async function streamExplanation({
  messages,
  topicName,
  onDelta,
  onDone,
}: {
  messages: Msg[];
  topicName: string;
  onDelta: (text: string) => void;
  onDone: () => void;
}) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-topic`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, topicName }),
    }
  );

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) throw new Error("Rate limit exceeded. Please wait a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted.");
    throw new Error("Failed to start stream");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Final flush
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}
