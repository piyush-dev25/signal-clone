import { ChatIcon } from "@/components/icons";

export default function EmptyChatPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <ChatIcon className="size-16 text-fg-tertiary" />
      <p className="text-title text-fg">Signal</p>
      <p className="text-body-sm text-fg-secondary">Select a chat to start messaging</p>
    </div>
  );
}
