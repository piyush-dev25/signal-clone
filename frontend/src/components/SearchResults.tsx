"use client";

import { useEffect, useState } from "react";
import { ContactListItem } from "@/components/ContactListItem";
import { ConversationListItem } from "@/components/ConversationListItem";
import { useOpenDirect } from "@/components/useOpenDirect";
import { ApiError, type SearchResult, search } from "@/lib/api";
import { useAppStore } from "@/store/app";

const DEBOUNCE_MS = 250;

type Props = {
  query: string;
  meId: number;
  /** Called once a result has been opened (the sidebar clears the search). */
  onOpened: () => void;
};

type Outcome = { query: string; result: SearchResult | null; error: string | null };

export function SearchResults({ query, meId, onOpened }: Props) {
  const q = query.trim();
  const activeId = useAppStore((s) => s.activeConversationId);
  const [outcome, setOutcome] = useState<Outcome>({ query: "", result: null, error: null });
  const { open, pending, error: openError } = useOpenDirect();

  useEffect(() => {
    if (!q) return;
    let cancelled = false; // ignore responses for queries the user has typed past
    const timer = setTimeout(() => {
      search(q)
        .then((result) => !cancelled && setOutcome({ query: q, result, error: null }))
        .catch((err: unknown) => {
          if (cancelled) return;
          setOutcome({ query: q, result: null, error: err instanceof ApiError ? err.message : "Search failed" });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (outcome.query !== q) return <p className="px-pane-x py-3 text-body-sm text-fg-tertiary">Searching…</p>;
  if (outcome.error) return <p className="px-pane-x py-3 text-body-sm text-danger">{outcome.error}</p>;

  const { contacts = [], conversations = [] } = outcome.result ?? {};
  if (contacts.length === 0 && conversations.length === 0) {
    return <p className="px-pane-x py-6 text-center text-body-sm text-fg-secondary">No results for “{q}”</p>;
  }

  return (
    <div className="pb-2">
      {openError && <p className="px-pane-x py-2 text-body-sm text-danger">{openError}</p>}
      {conversations.length > 0 && (
        <section>
          <h2 className="px-pane-x pt-3 pb-1 text-body-sm font-semibold text-fg">Conversations</h2>
          {conversations.map((c) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              meId={meId}
              selected={c.id === activeId}
              onSelect={onOpened}
            />
          ))}
        </section>
      )}
      {contacts.length > 0 && (
        <section>
          <h2 className="px-pane-x pt-3 pb-1 text-body-sm font-semibold text-fg">Contacts</h2>
          {contacts.map((contact) => (
            <ContactListItem
              key={contact.id}
              contact={contact}
              disabled={pending}
              onSelect={async () => {
                if (await open(contact.user_id)) onOpened();
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}
