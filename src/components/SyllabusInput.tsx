import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
import { Topic, addTopic, deleteTopic } from "@/lib/api";
import { toast } from "sonner";

type Props = {
  topics: Topic[];
  onRefresh: () => void;
};

export default function SyllabusInput({ topics, onRefresh }: Props) {
  const [name, setName] = useState("");
  const [marks, setMarks] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error("Please enter a topic name");
      return;
    }
    setLoading(true);
    try {
      await addTopic(name.trim(), parseInt(marks) || 0, topics.length);
      setName("");
      setMarks("");
      onRefresh();
      toast.success("Topic added");
    } catch {
      toast.error("Failed to add topic");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkText.trim()) return;
    setLoading(true);
    try {
      const lines = bulkText.trim().split("\n").filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(/[,\t|–-]+/).map((s) => s.trim());
        const topicName = parts[0];
        const topicMarks = parseInt(parts[1]) || 5;
        if (topicName) {
          await addTopic(topicName, topicMarks, topics.length + i);
        }
      }
      setBulkText("");
      onRefresh();
      toast.success("Topics added");
    } catch {
      toast.error("Failed to add topics");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTopic(id);
      onRefresh();
      toast.success("Topic deleted");
    } catch {
      toast.error("Failed to delete topic");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Syllabus</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add your exam topics with their marks weightage
        </p>
      </div>

      {/* Single add */}
      <Card className="p-4">
        <p className="text-sm font-medium text-foreground mb-3">Add a topic</p>
        <div className="flex gap-2">
          <Input
            placeholder="Topic name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Input
            placeholder="Marks"
            type="number"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="w-20"
          />
          <Button onClick={handleAdd} disabled={loading} size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Bulk add */}
      <Card className="p-4">
        <p className="text-sm font-medium text-foreground mb-1">Bulk add topics</p>
        <p className="text-xs text-muted-foreground mb-3">
          One topic per line. Format: Topic Name, Marks (e.g. "Thermodynamics, 10")
        </p>
        <Textarea
          placeholder={"Kinematics, 8\nThermodynamics, 12\nOptics, 10"}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={5}
        />
        <Button onClick={handleBulkAdd} disabled={loading} className="mt-3" size="sm">
          Add All
        </Button>
      </Card>

      {/* Topic list */}
      {topics.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Your Topics ({topics.length})
          </p>
          <div className="divide-y divide-border">
            {topics.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.marks_weightage} marks
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
