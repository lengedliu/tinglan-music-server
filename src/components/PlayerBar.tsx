import React, { memo } from 'react';
import { Song, XiaomiDevice, DeviceCommandState, SleepTimerConfig, ABLoopConfig } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ProgressBar } from './player/ProgressBar';
import { TrackInfo } from './player/TrackInfo';
import { PlaybackControls } from './player/PlaybackControls';
import { VolumeController } from './player/VolumeController';
import { PlayerActions } from './player/PlayerActions';
import { MobileMiniPlayer } from './player/MobileMiniPlayer';

export interface PlayerBarProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  activeDevice: XiaomiDevice | undefined;
  isCasting: boolean;
  commandState?: DeviceCommandState;
  onToggleCast: () => void;
  onOpenLyrics: () => void;
  onOpenXiaomiPanel: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: 'off' | 'all' | 'one';
  onCycleRepeat: () => void;
  onOpenEQ?: () => void;
  onOpenQueue?: () => void;
  onOpenSubsonic?: () => void;
  queueCount?: number;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number) => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  sleepTimer?: SleepTimerConfig;
  onOpenSleepTimer?: () => void;
  onOpenShortcuts?: () => void;
  onOpenVinyl?: () => void;
  onOpenMultiRoom?: () => void;
  onOpenInspector?: () => void;
  abLoop?: ABLoopConfig;
  onToggleABLoop?: () => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = memo(({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  volume,
  onVolumeChange,
  activeDevice,
  isCasting,
  commandState,
  onToggleCast,
  onOpenLyrics,
  onOpenXiaomiPanel: _onOpenXiaomiPanel,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  onOpenEQ,
  onOpenQueue,
  onOpenSubsonic,
  queueCount,
  speakerVolume = 40,
  onSpeakerVolumeChange,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  sleepTimer,
  onOpenSleepTimer,
  onOpenShortcuts,
  onOpenVinyl,
  onOpenMultiRoom,
  onOpenInspector,
  abLoop = { a: null, b: null, enabled: false },
  onToggleABLoop
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  return (
    <>
      {/* 1. Mobile Mini Player Bar (< 768px) - Docked cleanly right above bottom tab bar */}
      <MobileMiniPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={onPlayPause}
        onNext={onNext}
        onPrev={onPrev}
        onSeek={onSeek}
        volume={volume}
        onVolumeChange={onVolumeChange}
        activeDevice={activeDevice}
        isCasting={isCasting}
        commandState={commandState}
        onToggleCast={onToggleCast}
        onOpenLyrics={onOpenLyrics}
        isShuffle={isShuffle}
        onToggleShuffle={onToggleShuffle}
        repeatMode={repeatMode}
        onCycleRepeat={onCycleRepeat}
        onOpenEQ={onOpenEQ}
        onOpenQueue={onOpenQueue}
        queueCount={queueCount}
        speakerVolume={speakerVolume}
        onSpeakerVolumeChange={onSpeakerVolumeChange}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={onPlaybackSpeedChange}
        sleepTimer={sleepTimer}
        onOpenSleepTimer={onOpenSleepTimer}
        onOpenVinyl={onOpenVinyl}
        onOpenMultiRoom={onOpenMultiRoom}
        onOpenInspector={onOpenInspector}
        abLoop={abLoop}
        onToggleABLoop={onToggleABLoop}
      />

      {/* 2. Desktop Full Studio Player Bar (>= 768px) */}
      <div className={`hidden md:flex fixed bottom-0 left-0 right-0 z-50 h-24 playerbar-container backdrop-blur-2xl border-t flex-col justify-between transition-colors duration-300 ${
        isLight
          ? 'bg-white/95 border-zinc-200 text-zinc-900 shadow-[0_-6px_28px_rgba(0,0,0,0.08)]'
          : 'bg-black/85 border-white/10 text-zinc-100 shadow-[0_-8px_32px_rgba(0,0,0,0.7)]'
      }`}>
        {/* Micro Seek & Scrubbing Progress Bar */}
        <ProgressBar
          currentSong={currentSong}
          currentTime={currentTime}
          duration={duration}
          abLoop={abLoop}
          onSeek={onSeek}
        />

        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2 sm:gap-4 flex-1">
          
          {/* Left: Track Info & ID3 Audio Spec Badge */}
          <TrackInfo
            currentSong={currentSong}
            isPlaying={isPlaying}
            isCasting={isCasting}
            onOpenLyrics={onOpenLyrics}
            onOpenQueue={onOpenQueue}
            onOpenInspector={onOpenInspector}
          />

          {/* Center: Core Playback Controls & Time Display */}
          <PlaybackControls
            currentSong={currentSong}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            isShuffle={isShuffle}
            repeatMode={repeatMode}
            onPlayPause={onPlayPause}
            onNext={onNext}
            onPrev={onPrev}
            onToggleShuffle={onToggleShuffle}
            onCycleRepeat={onCycleRepeat}
          />

          {/* Right: Action Buttons (Cast, EQ, Queue, Speed, Sleep, Shortcuts, Vinyl, Multiroom) & Volume Slider */}
          <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0 min-w-0">
            <PlayerActions
              activeDevice={activeDevice}
              isCasting={isCasting}
              commandState={commandState}
              onToggleCast={onToggleCast}
              onOpenEQ={onOpenEQ}
              onOpenQueue={onOpenQueue}
              queueCount={queueCount}
              onOpenSubsonic={onOpenSubsonic}
              onOpenLyrics={onOpenLyrics}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={onPlaybackSpeedChange}
              sleepTimer={sleepTimer}
              onOpenSleepTimer={onOpenSleepTimer}
              onOpenVinyl={onOpenVinyl}
              onOpenMultiRoom={onOpenMultiRoom}
              abLoop={abLoop}
              onToggleABLoop={onToggleABLoop}
              onOpenShortcuts={onOpenShortcuts}
              isLight={isLight}
            />

            <VolumeController
              volume={volume}
              onVolumeChange={onVolumeChange}
              speakerVolume={speakerVolume}
              onSpeakerVolumeChange={onSpeakerVolumeChange}
              isCasting={isCasting}
              isLight={isLight}
            />
          </div>

        </div>
      </div>
    </>
  );
});

PlayerBar.displayName = 'PlayerBar';
