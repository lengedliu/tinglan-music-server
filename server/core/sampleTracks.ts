import fs from 'fs';
import path from 'path';

// Helper to generate gentle musical acoustic tones as genuine WAV files
export function generateHarmonicWav(durationSeconds = 25, chordFreqs: number[] = [261.63, 329.63, 392.00, 523.25]): Buffer {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat PCM
  buffer.writeUInt16LE(1, 22); // NumChannels = 1
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const noteDuration = 0.6; // note changes every 0.6s
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor(t / noteDuration) % chordFreqs.length;
    const freq = chordFreqs[noteIdx];
    const notePhase = (t % noteDuration) / noteDuration;
    const env = Math.exp(-notePhase * 3.5) * Math.sin(Math.min(1, notePhase * 40) * Math.PI / 2);

    // Warm harmonics
    const sampleVal = (
      Math.sin(2 * Math.PI * freq * t) * 0.6 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
      Math.sin(2 * Math.PI * freq * 3 * t) * 0.15
    ) * env * 0.45;

    const intSample = Math.floor(Math.max(-32768, Math.min(32767, sampleVal * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

export const sampleTracksConfig = [
  { id: 'song-1', freqs: [220, 261.63, 329.63, 440, 523.25] },
  { id: 'song-2', freqs: [293.66, 329.63, 392.00, 440, 587.33] },
  { id: 'song-3', freqs: [174.61, 220.00, 261.63, 349.23, 440] },
  { id: 'song-4', freqs: [196.00, 246.94, 293.66, 392.00, 493.88] },
  { id: 'song-5', freqs: [130.81, 164.81, 196.00, 261.63, 329.63] },
  { id: 'song-6', freqs: [146.83, 220.00, 293.66, 370.00, 440] },
];

export function ensureSampleTracksSeeded(musicDir: string): void {
  for (const track of sampleTracksConfig) {
    const filePath = path.join(musicDir, `${track.id}.wav`);
    if (!fs.existsSync(filePath)) {
      try {
        const wavBuffer = generateHarmonicWav(30, track.freqs);
        fs.writeFileSync(filePath, wavBuffer);
      } catch (err) {
        console.error(`Failed to pre-seed ${track.id}.wav`, err);
      }
    }
  }
}
