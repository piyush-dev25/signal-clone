import { AlertIcon, DeliveredIcon, ReadIcon, SendingIcon, SentIcon } from "@/components/icons";
import type { MessageStatus as Status } from "@/lib/receipts";

const LABELS: Record<Status, string> = {
  sending: "Sending",
  failed: "Not sent",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

export function MessageStatus({ status }: { status: Status }) {
  const common = { role: "img", "aria-label": LABELS[status] } as const;
  switch (status) {
    case "sending":
      return <SendingIcon {...common} className="size-receipt" />;
    case "sent":
      return <SentIcon {...common} className="size-receipt" />;
    case "delivered":
      return <DeliveredIcon {...common} className="h-receipt w-[calc(var(--spacing-receipt)*1.375)]" />;
    case "read":
      return (
        <ReadIcon {...common} className="h-receipt w-[calc(var(--spacing-receipt)*1.375)] text-receipt-read" />
      );
    case "failed":
      return <AlertIcon {...common} className="size-receipt text-danger" />;
  }
}
