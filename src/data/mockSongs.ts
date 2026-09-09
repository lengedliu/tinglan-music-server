import { Song, Playlist, XiaomiDevice } from '../types';

export const INITIAL_SONGS: Song[] = [
  {
    id: 'song-1',
    title: '月半小夜曲 (Acoustic Night)',
    artist: '李克勤 / 弦乐室内乐团',
    album: '港乐经典·发烧重现',
    duration: 234,
    url: '/api/stream/song-1',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    genre: 'Classic Pop / Acoustic',
    year: 2021,
    bitrate: '320kbps MP3',
    fileSize: '9.2 MB',
    isFavorite: true,
    source: 'demo',
    lyrics: `[00:00.00]月半小夜曲 - 弦乐原声版
[00:04.00]词：向雪怀 曲：河合奈保子
[00:08.50]演奏：Tinglan 听澜 Hi-Fi 发烧工作室
[00:15.00]哪怕面对冷冰冰的墙壁
[00:22.00]深深的一声叹息
[00:29.00]仍难忘你的笑语盈盈
[00:36.00]仍难舍你的柔情似蜜
[00:44.00]月亮为何还在夜空高挂
[00:51.50]似这半月儿静听幽咽的吉他
[00:58.50]幽幽提琴在低诉我心声
[01:05.50]如泣如诉如醉如痴
[01:13.00]我的心仍在期待你的归期
[01:20.50]小爱音箱正在高保真投放此曲
[01:28.00]提琴轻诉，如风拂面
[01:36.00]夜深沉，乐声犹在耳畔
[01:50.00]（间奏·纯净吉他独奏）
[02:10.00]月半小夜曲 - Tinglan 听澜音乐流媒体`
  },
  {
    id: 'song-2',
    title: '春江花月夜 (Moonlit Spring River)',
    artist: '中央民族乐团 / 古筝与箫',
    album: '国乐大典·东方神韵',
    duration: 278,
    url: '/api/stream/song-2',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    genre: 'Traditional / Ambient',
    year: 2023,
    bitrate: 'FLAC 24bit/96kHz',
    fileSize: '28.4 MB',
    isFavorite: true,
    source: 'demo',
    lyrics: `[00:00.00]春江花月夜 - 古筝箫韵
[00:06.00]古曲改编 / 高保真无损母带
[00:14.00]春江潮水连海平，海上明月共潮生
[00:28.00]滟滟随波千万里，何处春江无月明
[00:42.00]江流宛转绕芳甸，月照花林皆似霰
[00:56.00]空里流霜不觉飞，汀上白沙看不见
[01:12.00]江天一色无纤尘，皎皎空中孤月轮
[01:26.00]江畔何人初见月？江月何年初照人？
[01:42.00]人生代代无穷已，江月年年望相似
[02:00.00]（古筝泛音如流水潺潺）
[02:25.00]此时相望不相闻，愿逐月华流照君
[02:45.00]鸿雁长飞光不度，鱼龙潜跃水成文`
  },
  {
    id: 'song-3',
    title: '夜的第七章 (Nocturne in Dim Light)',
    artist: '周杰伦 / 潘儿',
    album: '依然范特西 (Classic Hi-Res)',
    duration: 220,
    url: '/api/stream/song-3',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    genre: 'Cinematic Hip-hop',
    year: 2006,
    bitrate: '320kbps MP3',
    fileSize: '8.8 MB',
    isFavorite: false,
    source: 'demo',
    lyrics: `[00:00.00]夜的第七章 - 华丽交响编曲
[00:05.00]1983年小巷 12月晴朗
[00:10.00]夜的第七章 打字机继续推向
[00:15.00]接近事实的那下一行
[00:20.00]石楠烟斗的雾 飘向枯萎的树
[00:25.00]沉默的证人绕过贝克街旁
[00:30.00]如果邪恶 是华丽残酷的乐章
[00:35.00]它的终场 我会亲手写上
[00:41.00]晨曦的光 风干最后一行忧伤
[00:47.00]黑色的墨 染上安详`
  },
  {
    id: 'song-4',
    title: '海阔天空 (Boundless Oceans, Vast Skies)',
    artist: 'Beyond',
    album: '海阔天空 30周年纪念重置',
    duration: 326,
    url: '/api/stream/song-4',
    coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80',
    genre: 'Rock / Classical Rock',
    year: 1993,
    bitrate: 'FLAC 无损音频',
    fileSize: '34.1 MB',
    isFavorite: true,
    source: 'demo',
    lyrics: `[00:00.00]海阔天空 - Beyond
[00:06.00]词：黄家驹 曲：黄家驹
[00:18.00]今天我 寒夜里看雪飘过
[00:25.00]怀着冷却了的心窝飘远方
[00:31.00]风雨里追赶 雾里分不清影踪
[00:38.00]天空海阔你与我 可会变（谁没在变）
[00:46.00]多少次 迎着冷眼与嘲笑
[00:53.00]从没有放弃过心中的理想
[01:00.00]一刹那恍惚 若有所失的感觉
[01:07.00]不知不觉已变淡 心里爱（谁明白我）
[01:15.00]原谅我这一生不羁放纵爱自由
[01:22.50]也会怕有一天会跌倒
[01:29.50]背弃了理想 谁人都可以
[01:36.50]哪会怕有一天只你共我`
  },
  {
    id: 'song-5',
    title: 'Rainy Cafe (午后咖啡馆雨声)',
    artist: 'Lofi Coffee Roaster',
    album: 'ChillHop & Ambient Soundscapes',
    duration: 185,
    url: '/api/stream/song-5',
    coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=600&q=80',
    genre: 'Lo-Fi / Relaxing',
    year: 2024,
    bitrate: '320kbps MP3',
    fileSize: '7.1 MB',
    isFavorite: false,
    source: 'demo',
    lyrics: `[00:00.00]Rainy Cafe - 午后微雨与醇香
[00:10.00]纯音乐放空曲目
[00:25.00]雨丝敲击着木质窗棂
[00:45.00]小爱音箱伴您静享惬意午后
[01:10.00]研磨咖啡豆的沙沙声与低音贝斯共鸣
[01:35.00]放松心情，沉浸在这片安宁之中`
  },
  {
    id: 'song-6',
    title: '加州旅馆 (Hotel California Acoustic Live)',
    artist: 'Eagles (发烧试音碟)',
    album: 'Hell Freezes Over (Remastered)',
    duration: 312,
    url: '/api/stream/song-6',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    genre: 'Classic Rock / Audiophile',
    year: 1994,
    bitrate: 'DSD / DSD64 (DSF)',
    fileSize: '46.8 MB',
    isFavorite: true,
    source: 'demo',
    lyrics: `[00:00.00]Hotel California (Live Acoustic)
[00:15.00]吉他独奏前奏与现场掌声
[00:35.00]手鼓低频试音核心段落
[00:55.00]On a dark desert highway, cool wind in my hair
[01:03.00]Warm smell of colitas, rising up through the air
[01:11.00]Up ahead in the distance, I saw a shimmering light
[01:19.00]My head grew heavy and my sight grew dim
[01:23.00]I had to stop for the night`
  }
];

export const INITIAL_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-xiaomi',
    name: '小米音箱日常伴听',
    description: '早晨唤醒、睡前放松与背景伴奏优选歌曲',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    songIds: ['song-1', 'song-2', 'song-5'],
    createdAt: '2026-03-01'
  },
  {
    id: 'pl-favorites',
    name: '我喜欢的高保真音乐',
    description: '无损与发烧重制收藏单曲',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    songIds: ['song-1', 'song-2', 'song-4', 'song-6'],
    createdAt: '2026-03-02'
  },
  {
    id: 'pl-hifi',
    name: 'Hi-Fi 试音专用 (Sound Pro)',
    description: '测试小爱音箱高低频延展与人声结像',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    songIds: ['song-2', 'song-4', 'song-6'],
    createdAt: '2026-03-03'
  }
];

export const INITIAL_XIAOMI_DEVICES: XiaomiDevice[] = [];

