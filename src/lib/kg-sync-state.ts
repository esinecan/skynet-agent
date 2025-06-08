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
}
