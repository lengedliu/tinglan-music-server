import React, { useState } from 'react';
import { 
  X, 
  UploadCloud, 
  Music, 
  FileAudio, 
  Check, 
  Sparkles,
  Link2,
  FileText
} from 'lucide-react';
import { Song } from '../types';

interface UploadSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (newSong: Partial<Song> & { fileBase64?: string; fileName?: string }) => void;
}

export const UploadSongModal: React.FC<UploadSongModalProps> = ({
  isOpen,
  onClose,
  onAddSong
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('流行 Pop');
  const [url, setUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [audioDuration, setAudioDuration] = useState(215);
  const [bitrateTag, setBitrateTag] = useState('320kbps MP3');
  const [fileBase64, setFileBase64] = useState<string | undefined>(undefined);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setFileSize(`${sizeMb} MB`);

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (ext === '.flac') setBitrateTag('FLAC 24bit/96kHz');
    else if (ext === '.wav') setBitrateTag('WAV 16bit/44.1kHz');
    else if (ext === '.m4a') setBitrateTag('AAC 256kbps');
    else if (ext === '.ogg') setBitrateTag('OGG Vorbis');
    else setBitrateTag('320kbps MP3');

    // Auto populate title and artist from file name
    const rawName = file.name.replace(/\.[^/.]+$/, "");
    if (!title) {
      if (rawName.includes(' - ')) {
        const parts = rawName.split(' - ');
        setArtist(parts[0].trim());
        setTitle(parts[1].trim());
      } else {
        setTitle(rawName);
      }
    }

    // Create object url for immediate local playback and duration probe
    const blobUrl = URL.createObjectURL(file);
    setUrl(blobUrl);

    try {
      const probeAudio = new Audio(blobUrl);
      probeAudio.onloadedmetadata = () => {
        if (probeAudio.duration && !isNaN(probeAudio.duration) && probeAudio.duration > 0) {
          setAudioDuration(Math.round(probeAudio.duration));
        }
      };
    } catch {}

    // Read binary as base64 for persistent backend storage
    setIsReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setFileBase64(base64Data);
      setIsReadingFile(false);
    };
    reader.onerror = () => {
      setIsReadingFile(false);
    };
    reader.readAsDataURL(file);

    if (!coverUrl) {
      setCoverUrl('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isReadingFile) return;

    setIsProcessing(true);
    onAddSong({
      title: title.trim(),
      artist: artist.trim() || '本地音乐人',
      album: album.trim() || '自制音频专辑',
      genre: genre.trim(),
      duration: audioDuration,
      url,
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      lyrics: lyrics || `[00:00.00]${title.trim()} - ${artist.trim() || '本地'}\n[00:10.00]Tinglan 听澜 本地高保真音频已就绪\n[00:20.00]支持通过 MIoT 协议推送到小米音箱播放`,
      bitrate: bitrateTag,
      fileSize: fileSize || '8.5 MB',
      source: 'uploaded',
      isFavorite: false,
      fileBase64,
      fileName
    });
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-xl shadow-2xl backdrop-blur-xl space-y-6 max-h-[90vh] overflow-y-auto">
        
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.25)]">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">导入音乐文件至私有曲库</h3>
              <p className="text-xs text-zinc-400">将音频持久化存入服务端 /music，支持一键投送到小米音箱</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* File selector zone */}
          <div className="border-2 border-dashed border-white/10 hover:border-[#FF6700]/60 rounded-2xl p-6 text-center bg-zinc-950/60 transition cursor-pointer relative group">
            <input
              type="file"
              accept="audio/*,.mp3,.flac,.wav,.m4a,.ogg"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <FileAudio className="w-10 h-10 mx-auto mb-2 text-zinc-500 group-hover:text-[#FF6700] transition" />
            <p className="text-sm font-semibold text-zinc-200">
              {fileName ? fileName : '拖拽音频文件至此，或点击本地选择'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              支持 FLAC, MP3, WAV, M4A, OGG 等高保真无损格式 (自动持久化到 /music)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">歌曲标题 *</label>
              <input
                type="text"
                required
                placeholder="例如：平凡之路"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">歌手 / 艺术家</label>
              <input
                type="text"
                placeholder="例如：朴树"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">专辑名称</label>
              <input
                type="text"
                placeholder="例如：猎户星座"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">音乐流派 / 标签</label>
              <input
                type="text"
                placeholder="例如：民谣 / 流行"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">封面图片 URL (可选)</label>
            <input
              type="text"
              placeholder="https://..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">LRC 动态歌词 (可选，支持带时间戳 [00:00.00])</label>
            <textarea
              rows={3}
              placeholder="[00:00.00] 歌曲名&#10;[00:05.00] 第一句歌词..."
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.35)] transition active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? '正在保存至服务端...' : '入库并就绪播放'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

