import Dexie, { type Table } from 'dexie';
import type { ChatMessage, ProviderName } from '../types';

export interface KeyVaultRow {
  provider: ProviderName;
  key: string;
  updated_at: string;
}

export interface CompileQueueRow {
  id?: number; // auto-incremented
  raw_id: string;
  enqueued_at: string;
}

export interface ChatSessionRow {
  session_id: string;
  messages: ChatMessage[];
  updated_at: string;
}

export interface SearchIndexRow {
  id: 'singleton';
  serialized: string;
  updated_at: string;
}

export class AtlasDB extends Dexie {
  keyVault!: Table<KeyVaultRow, ProviderName>;
  compileQueue!: Table<CompileQueueRow, number>;
  chatSessions!: Table<ChatSessionRow, string>;
  searchIndex!: Table<SearchIndexRow, 'singleton'>;

  constructor(name = 'atlas') {
    super(name);
    this.version(1).stores({
      keyVault: '&provider, updated_at',
      compileQueue: '++id, raw_id, enqueued_at',
      chatSessions: '&session_id, updated_at',
      searchIndex: '&id, updated_at',
    });
  }

  async setKey(provider: ProviderName, key: string): Promise<void> {
    await this.keyVault.put({ provider, key, updated_at: new Date().toISOString() });
  }

  async getKey(provider: ProviderName): Promise<string | undefined> {
    const row = await this.keyVault.get(provider);
    return row?.key;
  }

  async enqueueCompile(
    row: Omit<CompileQueueRow, 'id'>,
  ): Promise<void> {
    await this.compileQueue.add(row as CompileQueueRow);
  }

  async dequeueCompile(): Promise<CompileQueueRow | undefined> {
    const row = await this.compileQueue.orderBy('id').first();
    if (row?.id !== undefined) {
      await this.compileQueue.delete(row.id);
    }
    return row;
  }

  async saveChatSession(session_id: string, messages: ChatMessage[]): Promise<void> {
    await this.chatSessions.put({
      session_id,
      messages,
      updated_at: new Date().toISOString(),
    });
  }

  async loadChatSession(session_id: string): Promise<ChatMessage[] | undefined> {
    const row = await this.chatSessions.get(session_id);
    return row?.messages;
  }

  async saveSearchIndex(serialized: string): Promise<void> {
    await this.searchIndex.put({
      id: 'singleton',
      serialized,
      updated_at: new Date().toISOString(),
    });
  }

  async loadSearchIndex(): Promise<string | undefined> {
    const row = await this.searchIndex.get('singleton');
    return row?.serialized;
  }
}
