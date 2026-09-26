// The server answers "Not allowed" when the account was disabled (or lost its role) while a tab was
// open. The API layer emits this; the auth layer listens, re-checks the account and signs it out.
type Listener = () => void;

const listeners = new Set<Listener>();

export const notAllowed = {
  emit(): void {
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
