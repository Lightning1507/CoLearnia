import { createContext, useContext } from 'react';
import { createStore } from 'zustand/vanilla';
import type { OutgoingText } from './text-intent';

type ConversationDraft = { draft: string; outbox: OutgoingText[] };
export const emptyConversation: ConversationDraft = { draft: '', outbox: [] };

export function createTextMemory() {
  const store = createStore(() => new Map<string, ConversationDraft>());
  return {
    store,
    update(key: string, apply: (current: ConversationDraft) => ConversationDraft) {
      store.setState((current) => {
        const previous = current.get(key) ?? emptyConversation;
        const next = apply(previous);
        if (previous === next) return current;
        const records = new Map(current);
        if (next.draft || next.outbox.length) records.set(key, next);
        else records.delete(key);
        return records;
      }, true);
    },
    forget(workspaceId: string, channelId?: string) {
      store.setState((current) => {
        const records = new Map(current);
        for (const key of current.keys()) {
          if (channelId ? key === workspaceId + ':' + channelId : key.startsWith(workspaceId + ':'))
            records.delete(key);
        }
        return records.size === current.size ? current : records;
      }, true);
    },
  };
}

export const TextMemoryContext = createContext<ReturnType<typeof createTextMemory> | undefined>(
  undefined,
);
export const useTextMemory = () => useContext(TextMemoryContext);
