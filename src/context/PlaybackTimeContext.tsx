import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useMemo } from 'react';

export interface PlaybackTimeState {
  currentTime: number;
  duration: number;
}

export interface PlaybackTimeActions {
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  registerSeekHandler: (handler: (time: number) => void) => () => void;
}

const PlaybackTimeStateContext = createContext<PlaybackTimeState | null>(null);
const PlaybackTimeActionsContext = createContext<PlaybackTimeActions | null>(null);

export const PlaybackTimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [timeState, setTimeState] = useState<PlaybackTimeState>({
    currentTime: 0,
    duration: 200,
  });

  const currentTimeRef = useRef(0);
  const durationRef = useRef(200);
  const seekHandlerRef = useRef<((time: number) => void) | null>(null);

  const setCurrentTime = useCallback((time: number) => {
    currentTimeRef.current = time;
    setTimeState(prev => {
      // Throttle micro-changes under 0.05s to minimize unnecessary renders
      if (Math.abs(prev.currentTime - time) < 0.05) return prev;
      return { ...prev, currentTime: time };
    });
  }, []);

  const setDuration = useCallback((duration: number) => {
    durationRef.current = duration;
    setTimeState(prev => {
      if (prev.duration === duration) return prev;
      return { ...prev, duration };
    });
  }, []);

  const seekTo = useCallback((time: number) => {
    currentTimeRef.current = time;
    setTimeState(prev => ({ ...prev, currentTime: time }));
    if (seekHandlerRef.current) {
      seekHandlerRef.current(time);
    }
  }, []);

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);
  const getDuration = useCallback(() => durationRef.current, []);

  const registerSeekHandler = useCallback((handler: (time: number) => void) => {
    seekHandlerRef.current = handler;
    return () => {
      if (seekHandlerRef.current === handler) {
        seekHandlerRef.current = null;
      }
    };
  }, []);

  const actions = useMemo<PlaybackTimeActions>(() => ({
    setCurrentTime,
    setDuration,
    seekTo,
    getCurrentTime,
    getDuration,
    registerSeekHandler,
  }), [setCurrentTime, setDuration, seekTo, getCurrentTime, getDuration, registerSeekHandler]);

  return (
    <PlaybackTimeActionsContext.Provider value={actions}>
      <PlaybackTimeStateContext.Provider value={timeState}>
        {children}
      </PlaybackTimeStateContext.Provider>
    </PlaybackTimeActionsContext.Provider>
  );
};

/**
 * Subscribes to reactive time updates (fires ~4 times/sec during playback).
 * Use only in leaf components that visually render playback time (e.g., ProgressBar, TimeDisplay, LyricsView, Vinyl).
 */
export const usePlaybackTime = (): PlaybackTimeState => {
  const ctx = useContext(PlaybackTimeStateContext);
  if (!ctx) {
    return { currentTime: 0, duration: 200 };
  }
  return ctx;
};

/**
 * Provides time actions and getters without subscribing to high-frequency tick re-renders.
 * Safe for use in App, Navbar, PlayerBar containers, and keyboard handlers.
 */
export const usePlaybackTimeActions = (): PlaybackTimeActions => {
  const ctx = useContext(PlaybackTimeActionsContext);
  if (!ctx) {
    return {
      setCurrentTime: () => {},
      setDuration: () => {},
      seekTo: () => {},
      getCurrentTime: () => 0,
      getDuration: () => 200,
      registerSeekHandler: () => () => {},
    };
  }
  return ctx;
};
