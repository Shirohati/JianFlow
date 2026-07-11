type Listener = () => void;

class Store {
  private state: Map<string, unknown> = new Map();
  private listeners: Map<string, Set<Listener>> = new Map();

  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.state.set(key, value);
    this.notify(key);
  }

  subscribe(key: string, listener: Listener): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener);
    return () => {
      this.listeners.get(key)!.delete(listener);
    };
  }

  private notify(key: string): void {
    this.listeners.get(key)?.forEach(fn => fn());
  }
}

export const store = new Store();
