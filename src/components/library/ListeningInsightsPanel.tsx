import React, { useMemo } from 'react';
import { 
  BarChart3, 
  Sparkles, 
  Disc, 
  Music, 
  Award, 
  Clock, 
  Zap, 
  Heart, 
  Layers, 
  X,
  TrendingUp,
  Headphones,
  Calendar
} from 'lucide-react';
import { Song } from '../../types';
import { isLosslessSong } from '../../utils/dynamicPlaylists';

interface ListeningInsightsPanelProps {
  songs: Song[];
  isLight: boolean;
  onClose?: () => void;
  onPlaySong?: (song: Song) => void;
}

export const ListeningInsightsPanel: React.FC<ListeningInsightsPanelProps> = ({
  songs,
  isLight,
  onClose,
  onPlaySong
}) => {
  // Compute analytics
  const analytics = useMemo(() => {
    let totalPlays = 0;
    let totalDuration = 0;
    let favCount = 0;
    let losslessCount = 0;

    const artistMap: Record<string, { name: string; plays: number; songCount: number; sampleCover?: string }> = {};
    const genreMap: Record<string, number> = {};

    // Time distribution buckets
    // 0: Morning (6-12), 1: Afternoon (12-18), 2: Evening (18-22), 3: Night (22-6)
    const timeBuckets = [
      { key: 'morning', label: '🌅 晨间唤醒 (06:00-12:00)', count: 0 },
      { key: 'afternoon', label: '☀️ 午后沉浸 (12:00-18:00)', count: 0 },
      { key: 'evening', label: '🌆 傍晚放松 (18:00-22:00)', count: 0 },
      { key: 'night', label: '🌙 深夜静心 (22:00-06:00)', count: 0 }
    ];

    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      const plays = s.playCount || 0;
      totalPlays += plays;
      totalDuration += (s.duration || 180) * (plays > 0 ? plays : 1);
      if (s.isFavorite) favCount++;
      if (isLosslessSong(s)) losslessCount++;

      // Artist aggregation
      const artist = (s.artist || '未知歌手').trim();
      if (!artistMap[artist]) {
        artistMap[artist] = { name: artist, plays: 0, songCount: 0, sampleCover: s.coverUrl };
      }
      artistMap[artist].plays += plays;
      artistMap[artist].songCount += 1;

      // Genre aggregation
      const genre = (s.genre || '高保真流行').trim();
      genreMap[genre] = (genreMap[genre] || 0) + (plays > 0 ? plays : 1);

      // Time distribution bucket
      if (s.lastPlayedAt && s.lastPlayedAt > 0) {
        const hour = new Date(s.lastPlayedAt).getHours();
        if (hour >= 6 && hour < 12) timeBuckets[0].count += plays || 1;
        else if (hour >= 12 && hour < 18) timeBuckets[1].count += plays || 1;
        else if (hour >= 18 && hour < 22) timeBuckets[2].count += plays || 1;
        else timeBuckets[3].count += plays || 1;
      }
    }

    // Top Artists
    const sortedArtists = Object.values(artistMap)
      .sort((a, b) => b.plays - a.plays || b.songCount - a.songCount)
      .slice(0, 5);

    // Top Tracks
    const sortedTracks = [...songs]
      .filter(s => (s.playCount || 0) > 0)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 4);

    // Top Genres
    const sortedGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const losslessPercent = songs.length > 0 ? Math.round((losslessCount / songs.length) * 100) : 0;
    const totalHours = Math.round((totalDuration / 3600) * 10) / 10;
    const totalBucketCount = timeBuckets.reduce((acc, b) => acc + b.count, 0) || 1;

    return {
      totalSongs: songs.length,
      totalPlays,
      totalHours,
      favCount,
      losslessCount,
      losslessPercent,
      topArtists: sortedArtists,
      topTracks: sortedTracks,
      topGenres: sortedGenres,
      timeBuckets,
      totalBucketCount
    };
  }, [songs]);

  const maxArtistPlays = analytics.topArtists[0]?.plays || 1;

  return (
    <div className={`p-5 sm:p-6 rounded-3xl border shadow-2xl space-y-6 transition-all duration-300 animate-fadeIn ${
      isLight ? 'bg-amber-50/70 border-amber-300/80 shadow-sm text-zinc-900' : 'bg-zinc-900/90 border-amber-500/30 text-white backdrop-blur-xl'
    }`}>
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <span>智能音乐听歌报告与数据分析</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 font-mono">
                Listening Insights
              </span>
            </h2>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
              基于全局收听频次、播放时轴与高保真元数据实时测算
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition cursor-pointer ${
              isLight ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Plays */}
        <div className={`p-4 rounded-2xl border space-y-1 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/5'
        }`}>
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            累计播放频次
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-500">
            {analytics.totalPlays} <span className="text-xs font-normal text-zinc-400">次</span>
          </p>
        </div>

        {/* Lossless Ratio */}
        <div className={`p-4 rounded-2xl border space-y-1 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/5'
        }`}>
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3" />
            无损音频占比
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-500">
            {analytics.losslessPercent}%
            <span className="text-xs font-normal text-zinc-400 ml-1">({analytics.losslessCount} 首)</span>
          </p>
        </div>

        {/* Total Duration */}
        <div className={`p-4 rounded-2xl border space-y-1 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/5'
        }`}>
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" />
            估算听歌时长
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-500">
            {analytics.totalHours} <span className="text-xs font-normal text-zinc-400">小时</span>
          </p>
        </div>

        {/* Favorites Count */}
        <div className={`p-4 rounded-2xl border space-y-1 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/5'
        }`}>
          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1">
            <Heart className="w-3 h-3 fill-current text-rose-500" />
            已收藏真爱单曲
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-rose-500">
            {analytics.favCount} <span className="text-xs font-normal text-zinc-400">首</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Top Played Artists */}
        <div className={`p-4.5 rounded-2xl border space-y-3 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/10'
        }`}>
          <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Award className="w-4 h-4" />
            <span>最常听歌手榜 Top 5</span>
          </h3>

          {analytics.topArtists.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">暂无歌手收听数据</div>
          ) : (
            <div className="space-y-3">
              {analytics.topArtists.map((art, idx) => {
                const percent = Math.min(100, Math.round((art.plays / maxArtistPlays) * 100)) || 10;
                return (
                  <div key={art.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-bold ${
                          idx === 0 ? 'bg-amber-500 text-zinc-950' :
                          idx === 1 ? 'bg-zinc-300 text-zinc-900' :
                          idx === 2 ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={isLight ? 'text-zinc-900' : 'text-zinc-100'}>{art.name}</span>
                        <span className="text-[10px] text-zinc-400">({art.songCount} 首曲目)</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                        {art.plays} 次播放
                      </span>
                    </div>

                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Listening Time Distribution */}
        <div className={`p-4.5 rounded-2xl border space-y-3 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/10'
        }`}>
          <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Calendar className="w-4 h-4" />
            <span>听歌时段偏好分布</span>
          </h3>

          <div className="space-y-3 pt-1">
            {analytics.timeBuckets.map((bucket) => {
              const bucketPct = Math.round((bucket.count / analytics.totalBucketCount) * 100);
              return (
                <div key={bucket.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
                      {bucket.label}
                    </span>
                    <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-bold">
                      {bucketPct}% ({bucket.count} 次)
                    </span>
                  </div>

                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, bucketPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Genre Chips */}
          <div className="pt-2 border-t border-dashed border-zinc-200 dark:border-white/10 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[11px] text-zinc-400 font-semibold">主听流派:</span>
            {analytics.topGenres.map(([genre, cnt]) => (
              <span
                key={genre}
                className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20 text-[11px] font-medium"
              >
                {genre} ({cnt})
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom: Top Played Tracks Showcase */}
      {analytics.topTracks.length > 0 && (
        <div className={`p-4 rounded-2xl border space-y-3 ${
          isLight ? 'bg-white border-amber-200' : 'bg-zinc-950/80 border-white/10'
        }`}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>常听金曲殿堂</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {analytics.topTracks.map((tr) => (
              <div
                key={tr.id}
                onClick={() => onPlaySong?.(tr)}
                className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center gap-3 ${
                  isLight ? 'bg-zinc-50 hover:bg-amber-100/50 border-zinc-200' : 'bg-zinc-900 hover:bg-zinc-800 border-white/5'
                }`}
              >
                <img
                  src={tr.coverUrl}
                  alt={tr.title}
                  className="w-10 h-10 rounded-lg object-cover border border-black/10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className={`text-xs font-bold truncate ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                    {tr.title}
                  </h4>
                  <p className="text-[10px] text-amber-600 font-semibold truncate">{tr.artist}</p>
                  <p className="text-[10px] text-zinc-400 font-mono">播放 {tr.playCount} 次</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
