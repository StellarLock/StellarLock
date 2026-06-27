import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AnnouncerContextValue {
  message:  string;
  announce: (msg: string, priority?: 'polite' | 'assertive') => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue>({
  message:  '',
  announce: () => {},
});

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite,    setPolite]    = useState('');
  const [assertive, setAssertive] = useState('');

  const announce = useCallback((msg: string, priority: 'polite' | 'assertive' = 'polite') => {
    // Clear then set — forces screen reader to re-announce even if same message
    if (priority === 'assertive') {
      setAssertive(''); setTimeout(() => setAssertive(msg), 50);
    } else {
      setPolite('');    setTimeout(() => setPolite(msg), 50);
    }
  }, []);

  return (
    <AnnouncerContext.Provider value={{ message: polite, announce }}>
      {children}
      {/* Polite: waits for user to finish current action */}
      <div role="status" aria-live="polite" aria-atomic="true"
           className="sr-only">{polite}</div>
      {/* Assertive: interrupts — use for errors only */}
      <div role="alert"  aria-live="assertive" aria-atomic="true"
           className="sr-only">{assertive}</div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer() {
  return useContext(AnnouncerContext);
}