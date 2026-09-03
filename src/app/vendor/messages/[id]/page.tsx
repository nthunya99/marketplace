"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import ConversationThread from "@/components/ConversationThread";

export default function VendorMessageThreadPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();

  if (!session?.user) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Conversation</h1>
      <ConversationThread conversationId={params.id} currentUserId={session.user.id} />
    </div>
  );
}
