import fs from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
import { FfmpegTranscoder } from '../streaming/ffmpegTranscoder.js';

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  url: string;
  coverUrl: string;
  genre?: string;
  year?: number;
  bitrate?: string;
  fileSize?: string;
  isFavorite: boolean;
  source?: 'local' | 'uploaded' | 'sample' | 'nas';
  localFilename?: string;
  lyrics?: string;
}

export class MusicEngine {
  private musicDir: string;
  private dataDir: string;
  private songsFile: string;
  private songs: Song[] = [];
  private transcoder: FfmpegTranscoder;

  constructor(musicDir: string, dataDir: string, transcoder: FfmpegTranscoder) {
    this.musicDir = musicDir;
    this.dataDir = dataDir;
    this.songsFile = path.join(dataDir, 'songs.json');
    this.transcoder = transcoder;

    this.ensureDirectories();
    this.loadSongs();
    this.preSeedSampleTracks();
  }

  private ensureDirectories() {
    for (const dir of [this.musicDir, this.dataDir]) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.error(`[MusicEngine] Failed to create dir ${dir}:`, err);
        }
      }
    }
  }

  private loadSongs() {
    try {
      if (fs.existsSync(this.songsFile)) {
        const raw = fs.readFileSync(this.songsFile, 'utf-8');
        this.songs = JSON.parse(raw) as Song[];
      }
    } catch (err) {
      console.warn('[MusicEngine] Could not load songs.json, using empty catalog:', err);
      this.songs = [];
    }
  }

  public saveSongs() {
    try {
      fs.writeFileSync(this.songsFile, JSON.stringify(this.songs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MusicEngine] Failed to save songs.json:', err);
    }
  }

  public getAll(): Song[] {
    return this.songs;
  }

  public getById(id: string): Song | undefined {
    const cleanId = (id || '').replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '');
    const decodedId = decodeURIComponent(id || '');
    const decodedCleanId = decodeURIComponent(cleanId);

    return this.songs.find(
      s => s.id === id || s.id === cleanId || s.id === decodedId || s.id === decodedCleanId
    );
  }

  public addSong(song: Song) {
    this.songs.unshift(song);
    this.saveSongs();

    // Trigger background warm transcode to standard MP3
    if (song.localFilename) {
      const fullPath = path.isAbsolute(song.localFilename)
        ? song.localFilename
        : path.join(this.musicDir, song.localFilename);
      setTimeout(() => {
        try {
          this.transcoder.ensureStandardMp3(fullPath, song.id);
        } catch {}
      }, 50);
    }
  }

  public deleteSong(id: string): boolean {
    const initialLen = this.songs.length;
    this.songs = this.songs.filter(s => s.id !== id);
    if (this.songs.length < initialLen) {
      this.saveSongs();
      // Remove disk files if exist
      for (const ext of ['.wav', '.mp3', '.flac', '.m4a', '.ogg', '.aac', '.ape']) {
        const p = path.join(this.musicDir, `${id}${ext}`);
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
          } catch {}
        }
      }
      return true;
    }
    return false;
  }

  public toggleFavorite(id: string): Song | null {
    const song = this.songs.find(s => s.id === id);
    if (song) {
      song.isFavorite = !song.isFavorite;
      this.saveSongs();
      return song;
    }
    return null;
  }

  public updateSong(id: string, updates: Partial<Song>): Song | null {
    const song = this.songs.find(s => s.id === id);
    if (song) {
      Object.assign(song, updates);
      this.saveSongs();
      return song;
    }
    return null;
  }

  /**
   * Generates harmonic tone audio for demo tracks
   */
  public generateHarmonicWav(
    durationSeconds = 25,
    chordFreqs: number[] = [261.63, 329.63, 392.0, 523.25]
  ): Buffer {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * 2; // 16-bit mono
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF Header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    const noteDuration = 0.6;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(t / noteDuration) % chordFreqs.length;
      const freq = chordFreqs[noteIdx];
      const notePhase = (t % noteDuration) / noteDuration;
      const env = Math.exp(-notePhase * 3.5) * Math.sin((Math.min(1, notePhase * 40) * Math.PI) / 2);

      const sampleVal =
        (Math.sin(2 * Math.PI * freq * t) * 0.6 +
          Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
          Math.sin(2 * Math.PI * freq * 3 * t) * 0.15) *
        env *
        0.45;

      const intSample = Math.floor(Math.max(-32768, Math.min(32767, sampleVal * 32767)));
      buffer.writeInt16LE(intSample, 44 + i * 2);
    }
    return buffer;
  }

  private preSeedSampleTracks() {
    const sampleTracksConfig = [
      { id: 'song-1', freqs: [220, 261.63, 329.63, 440, 523.25] },
      { id: 'song-2', freqs: [293.66, 329.63, 392.0, 440, 587.33] },
      { id: 'song-3', freqs: [174.61, 220.0, 261.63, 349.23, 440] },
      { id: 'song-4', freqs: [196.0, 246.94, 293.66, 392.0, 493.88] },
      { id: 'song-5', freqs: [130.81, 164.81, 196.0, 261.63, 329.63] },
      { id: 'song-6', freqs: [146.83, 220.0, 293.66, 370.0, 440] }
    ];

    for (const track of sampleTracksConfig) {
      const filePath = path.join(this.musicDir, `${track.id}.wav`);
      if (!fs.existsSync(filePath)) {
        try {
          const wavBuffer = this.generateHarmonicWav(30, track.freqs);
          fs.writeFileSync(filePath, wavBuffer);
        } catch (err) {
          console.error(`[MusicEngine] Failed to pre-seed ${track.id}.wav:`, err);
        }
      }
    }
  }

  /**
   * Recursively scan music directory
   */
  public scanDirectory(dir: string = this.musicDir, baseDir: string = this.musicDir): string[] {
    let fileList: string[] = [];
    if (!fs.existsSync(dir)) return fileList;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          fileList = fileList.concat(this.scanDirectory(fullPath, baseDir));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.dff'].includes(ext)) {
            const relPath = path.relative(baseDir, fullPath);
            fileList.push(relPath);
          }
        }
      }
    } catch (err) {
      console.error(`[MusicEngine] Error scanning directory ${dir}:`, err);
    }
    return fileList;
  }
}
