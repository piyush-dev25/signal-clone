import Link from "next/link";

export default function EmptyChatPane() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <p className="text-sm opacity-70">No chat selected</p>
      <Link href="/status" className="text-sm text-blue-600 underline">
        Phase 0 connectivity check
      </Link>
    </main>
  );
}
