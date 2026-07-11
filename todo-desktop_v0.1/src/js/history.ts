import { taskApi, connectionApi } from './api';
import type { TaskItem } from './api';

interface TaskHistoryEntry {
  type: 'create' | 'update' | 'delete';
  taskId: string;
  before: Partial<TaskItem> | null;
  after: Partial<TaskItem> | null;
}

interface ConnectionHistoryEntry {
  type: 'connection_create' | 'connection_delete';
  connection: { from_id: string; to_id: string };
}

interface BatchHistoryEntry {
  type: 'batch';
  entries: Array<{
    taskId: string;
    before: Partial<TaskItem> | null;
    after: Partial<TaskItem> | null;
  }>;
}

type HistoryEntry = TaskHistoryEntry | ConnectionHistoryEntry | BatchHistoryEntry;

class HistoryStack {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSteps = 50;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  async undo(): Promise<void> {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(entry);
    await this.applyReverse(entry);
    this.notify();
  }

  async redo(): Promise<void> {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    await this.applyForward(entry);
    this.notify();
  }

  private async applyReverse(entry: HistoryEntry): Promise<void> {
    switch (entry.type) {
      case 'create':
        await taskApi.delete(entry.taskId);
        break;
      case 'delete':
        if (entry.before) {
          await taskApi.create(entry.before as Partial<TaskItem>);
        }
        break;
      case 'update':
        if (entry.before) {
          await taskApi.update(entry.taskId, entry.before);
        }
        break;
      case 'connection_create':
        await connectionApi.delete(entry.connection.from_id, entry.connection.to_id);
        break;
      case 'connection_delete':
        await connectionApi.create(entry.connection.from_id, entry.connection.to_id);
        break;
      case 'batch':
        for (let i = entry.entries.length - 1; i >= 0; i--) {
          const e = entry.entries[i];
          if (e.before) {
            await taskApi.update(e.taskId, e.before);
          }
        }
        break;
    }
  }

  private async applyForward(entry: HistoryEntry): Promise<void> {
    switch (entry.type) {
      case 'create':
        if (entry.after) {
          await taskApi.create(entry.after as Partial<TaskItem>);
        }
        break;
      case 'delete':
        await taskApi.delete(entry.taskId);
        break;
      case 'update':
        if (entry.after) {
          await taskApi.update(entry.taskId, entry.after);
        }
        break;
      case 'connection_create':
        await connectionApi.create(entry.connection.from_id, entry.connection.to_id);
        break;
      case 'connection_delete':
        await connectionApi.delete(entry.connection.from_id, entry.connection.to_id);
        break;
      case 'batch':
        for (const e of entry.entries) {
          if (e.after) {
            await taskApi.update(e.taskId, e.after);
          }
        }
        break;
    }
  }

  private listeners: Set<() => void> = new Set();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }
}

export const history = new HistoryStack();
