import { Users, MessageCircle, Video, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function GroupStudy() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Group Study</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Collaborate with peers and study together
        </p>
      </div>

      <Card className="p-10 text-center space-y-6 border-dashed border-2 border-primary/20">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-10 w-10 text-primary" />
          </div>
        </div>

        <div>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-4">
            Coming Soon
          </span>
          <h2 className="text-xl font-bold text-foreground">
            Study Better Together
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Create or join study groups, share notes, discuss topics, and prepare for exams with your classmates — all in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-accent/50">
            <MessageCircle className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Group Chat</p>
            <p className="text-xs text-muted-foreground mt-1">Discuss doubts in real time</p>
          </div>
          <div className="p-4 rounded-lg bg-accent/50">
            <Video className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Live Sessions</p>
            <p className="text-xs text-muted-foreground mt-1">Study together on video</p>
          </div>
          <div className="p-4 rounded-lg bg-accent/50">
            <BookOpen className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Shared Notes</p>
            <p className="text-xs text-muted-foreground mt-1">Collaborate on study material</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
