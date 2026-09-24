import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getAuthToken } from '../utils/api';

export interface QueueStatusEvent {
  queue: any[];
  currentIndex: number;
  currentSong: any | null;
  isPlaying: boolean;
  loopMode: string;
  targetDid: string;
  targetDeviceName: string;
  duration: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  totalSongs: number;
}

export interface PlaybackTickEvent {
  elapsedSeconds: number;
  duration: number;
  remainingSeconds: number;
  songId?: string;
  isPlaying: boolean;
}

type EventListener<T = any> = (data: T) => void;

interface AppEventsContextType {
  isConnected: boolean;
  subscribe: <T = any>(eventType: string, listener: EventListener<T>) => () => void;
  lastQueueStatus: QueueStatusEvent | null;
}

const AppEventsContext = createContext<AppEventsContextType | null>(null);

export const AppEventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastQueueStatus, setLastQueueStatus] = useState<QueueStatusEvent | null>(null);
  const listenersRef = useRef<Map<string, Set<EventListener>>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dispatchEvent = useCallback((type: string, data: any) => {
    const listeners = listenersRef.current.get(type);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.warn(`Error in SSE listener for ${type}:`, e);
        }
      });
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const token = getAuthToken();
      const url = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.addEventListener('connected', (e: MessageEvent) => {
        setIsConnected(true);
        try {
          const payload = JSON.parse(e.data);
          if (payload?.queue) {
            setLastQueueStatus(payload.queue);
            dispatchEvent('queue:change', payload.queue);
          }
        } catch {}
      });

      es.addEventListener('queue:change', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          setLastQueueStatus(payload);
          dispatchEvent('queue:change', payload);
        } catch {}
      });

      es.addEventListener('playback:tick', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          dispatchEvent('playback:tick', payload);
        } catch {}
      });

      es.addEventListener('mina:event', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          dispatchEvent('mina:event', payload);
        } catch {}
      });

      es.addEventListener('device:change', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          dispatchEvent('device:change', payload);
        } catch {}
      });

      es.onerror = () => {
        setIsConnected(false);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Auto-reconnect with 3-second delay
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 3000);
        }
      };
    } catch {
      setIsConnected(false);
    }
  }, [dispatchEvent]);

  useEffect(() => {
    connect();

    // Optimization 4: Mobile & Tab Visibility Lifecycle Auto-resync
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // When tab is restored from background/freeze, proactively ensure SSE connection is alive
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          console.log('[AppEvents] 🔄 Tab restored to foreground, actively reconnecting SSE event stream...');
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  const subscribe = useCallback(<T = any>(eventType: string, listener: EventListener<T>) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(listener as EventListener);

    return () => {
      const set = listenersRef.current.get(eventType);
      if (set) {
        set.delete(listener as EventListener);
        if (set.size === 0) {
          listenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  return (
    <AppEventsContext.Provider value={{ isConnected, subscribe, lastQueueStatus }}>
      {children}
    </AppEventsContext.Provider>
  );
};

export const useAppEvents = () => {
  const ctx = useContext(AppEventsContext);
  if (!ctx) {
    throw new Error('useAppEvents must be used within AppEventsProvider');
  }
  return ctx;
};
