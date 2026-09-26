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

export interface ScanProgressEvent {
  status: 'idle' | 'scanning' | 'completed' | 'failed';
  totalFound: number;
  processed: number;
  newAdded: number;
  updated: number;
  currentFile?: string;
  error?: string;
  durationMs?: number;
  isScanning?: boolean;
}

export interface ScanCompleteEvent {
  added: number;
  updated: number;
  total: number;
  durationMs: number;
  progress: ScanProgressEvent;
  songs?: any[];
}

export interface ResumeChangeEvent {
  action: 'save' | 'delete';
  songId: string;
  resumePoint?: any;
}

export interface TaskChangeEvent {
  action: 'upsert' | 'toggle' | 'delete' | 'executed';
  task?: any;
  taskId?: string;
}

export interface DeviceStatusEvent {
  did: string;
  isOnline?: boolean;
  isPlaying?: boolean;
  volume?: number;
  [key: string]: any;
}

export interface LibraryChangeEvent {
  action: 'scan' | 'add' | 'delete' | 'update';
  song?: any;
  songId?: string;
  total?: number;
  added?: number;
  updated?: number;
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
  const attachedEventsRef = useRef<Set<string>>(new Set());
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

      attachedEventsRef.current.clear();
      const attachListener = (eventType: string) => {
        if (attachedEventsRef.current.has(eventType)) return;
        attachedEventsRef.current.add(eventType);
        es.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data);
            if (eventType === 'queue:change' || (eventType === 'connected' && payload?.queue)) {
              setLastQueueStatus(payload?.queue || payload);
            }
            dispatchEvent(eventType, payload);
          } catch {
            dispatchEvent(eventType, e.data);
          }
        });
      };

      [
        'connected',
        'queue:change',
        'playback:tick',
        'mina:event',
        'device:change',
        'device:status',
        'scan:progress',
        'scan:complete',
        'scan:error',
        'resume:change',
        'task:executed',
        'task:change',
        'library:change'
      ].forEach(attachListener);

      // Also attach any already subscribed custom event types
      for (const eventType of listenersRef.current.keys()) {
        attachListener(eventType);
      }

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

    if (eventSourceRef.current && !attachedEventsRef.current.has(eventType)) {
      attachedEventsRef.current.add(eventType);
      eventSourceRef.current.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          dispatchEvent(eventType, payload);
        } catch {
          dispatchEvent(eventType, e.data);
        }
      });
    }

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
