import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Topic, Note, fetchNote, upsertNote, fetchAllNotes } from "@/lib/api";
import { toast } from "sonner";
import {
  Save,
  Bookmark,
  BookmarkCheck,
  FileText,
  Loader2,
} from "lucide-react";

type Props = {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
};

export default function NotesBookmarks({ topics, selectedTopicId, onSelectTopic }: Props) {
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [currentContent, setCurrentContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all notes on mount
  useEffect(() => {
    setLoading(true);
    fetchAllNotes()
      .then((all) => {
        const map: Record<string, Note> = {};
        all.forEach((n) => { map[n.topic_id] = n; });
        setNotes(map);
        setAllNotes(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load content when topic changes
  useEffect(() => {
    if (selectedTopicId && notes[selectedTopicId]) {
      setCurrentContent(notes[selectedTopicId].content);
    } else {
      setCurrentContent("");
    }
  }, [selectedTopicId, notes]);

  const handleSave = async () => {
    if (!selectedTopicId) return;
    setSaving(true);
    try {
      const saved = await upsertNote(selectedTopicId, currentContent, notes[selectedTopicId]?.is_bookmarked);
      setNotes((prev) => ({ ...prev, [selectedTopicId]: saved }));
      setAllNotes((prev) => {
        const filtered = prev.filter((n) => n.topic_id !== selectedTopicId);
        return [saved, ...filtered];
      });
      toast.success("Note saved!");
    } catch {
      toast.error("Failed to save note");
    }
    setSaving(false);
  };

  const toggleBookmark = async () => {
    if (!selectedTopicId) return;
    const current = notes[selectedTopicId];
    const newBookmark = !(current?.is_bookmarked ?? false);
    try {
      const saved = await upsertNote(selectedTopicId, currentContent || current?.content || "", newBookmark);
      setNotes((prev) => ({ ...prev, [selectedTopicId]: saved }));
      setAllNotes((prev) => {
        const filtered = prev.filter((n) => n.topic_id !== selectedTopicId);
        return [saved, ...filtered];
      });
      toast.success(newBookmark ? "Bookmarked!" : "Bookmark removed");
    } catch {
      toast.error("Failed to update bookmark");
    }
  };

  const selectedTopic = topics.find((t) => t.id === selectedTopicId);
  const bookmarkedTopics = topics.filter((t) => notes[t.id]?.is_bookmarked);
  const topicsWithNotes = topics.filter((t) => notes[t.id]?.content?.trim());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notes & Bookmarks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Save personal notes and bookmark important topics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Topic list */}
        <div className="md:col-span-1 space-y-3">
          {/* Bookmarked */}
          {bookmarkedTopics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BookmarkCheck className="h-3.5 w-3.5" /> Bookmarked
              </p>
              <div className="space-y-1">
                {bookmarkedTopics.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTopic(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedTopicId === t.id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BookmarkCheck className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All topics */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              All Topics
            </p>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelectTopic(t.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedTopicId === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {notes[t.id]?.content?.trim() ? (
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
                    )}
                    <span className="truncate">{t.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Note editor */}
        <div className="md:col-span-2">
          {selectedTopic ? (
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{selectedTopic.name}</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={toggleBookmark}
                  >
                    {notes[selectedTopicId!]?.is_bookmarked ? (
                      <BookmarkCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Bookmark className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[300px] resize-none"
                placeholder="Write your personal notes here... Key concepts, formulas, mnemonics, etc."
                value={currentContent}
                onChange={(e) => setCurrentContent(e.target.value)}
              />
              {notes[selectedTopicId!]?.updated_at && (
                <p className="text-xs text-muted-foreground">
                  Last saved: {new Date(notes[selectedTopicId!].updated_at).toLocaleString()}
                </p>
              )}
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Select a topic to write notes</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}