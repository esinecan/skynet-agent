import { promises as fs } from 'fs';
import path from 'path';

interface SyncState {
  lastSyncTimestamp: string;
  lastProcessedIds: {
    chatMessages: string[];
    consciousMemories: string[];
    ragMemories: string[];
  };
}

export class SyncStateManager {
  private statePath: string;
  
  constructor() {
    this.statePath = path.join(process.cwd(), 'data', 'kg-sync-state.json');
  }
  
  async read(): Promise<SyncState | null> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  
  async write(state: SyncState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }
  
  async updateTimestamp(): Promise<void> {
    const current = await this.read() || {
      lastSyncTimestamp: '',
      lastProcessedIds: { chatMessages: [], consciousMemories: [], ragMemories: [] }
    };
    
    current.lastSyncTimestamp = new Date().toISOString();
    await this.write(current);
  }

  // New method to be added:
  async updateLastProcessedIds(processedIds: {
    chatMessages?: string[],
    consciousMemories?: string[],
    ragMemories?: string[]
  }): Promise<void> {
    const current = await this.read() || {
      lastSyncTimestamp: new Date().toISOString(), // Or consider if timestamp should only be updated by updateTimestamp
      lastProcessedIds: { chatMessages: [], consciousMemories: [], ragMemories: [] }
    };

    if (processedIds.chatMessages) {
      current.lastProcessedIds.chatMessages = processedIds.chatMessages;
    }
    if (processedIds.consciousMemories) {
      current.lastProcessedIds.consciousMemories = processedIds.consciousMemories;
    }
    if (processedIds.ragMemories) {
      current.lastProcessedIds.ragMemories = processedIds.ragMemories;
    }

    // Optional: Update timestamp when IDs are updated?
    // current.lastSyncTimestamp = new Date().toISOString();
    // The user feedback for syncKnowledgeGraph shows lastSyncTimestamp is updated there explicitly.
    // So, this method should probably only focus on updating IDs.
    // If current state was null, lastSyncTimestamp will be new. If not, it will retain old one.
    // This seems fine. If the state was null, it's like the first time we're recording anything.

    await this.write(current);
  }
}
