import fs from 'fs';
import path from 'path';

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  backupUrls?: string[];
  category: 'national' | 'music' | 'lofi' | 'news' | 'classical' | 'custom';
  logoUrl?: string;
  description?: string;
  bitrate?: string;
  isCustom?: boolean;
  createdAt?: number;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  audioUrl: string;
  pubDate: string;
  duration?: string;
  description?: string;
  coverUrl?: string;
}

export interface PodcastSubscription {
  id: string;
  title: string;
  rssUrl: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  link?: string;
  lastUpdated?: number;
  episodesCount?: number;
  createdAt: number;
}

const STATIONS_FILE = path.join(process.cwd(), 'data', 'radio-stations.json');
const PODCASTS_FILE = path.join(process.cwd(), 'data', 'podcasts.json');

const PRESET_STATIONS: RadioStation[] = [
  {
    id: 'station_cnr_voice',
    name: 'CNR 中国之声',
    url: 'http://ngcdn001.cnr.cn/live/zgzs/index.m3u8',
    backupUrls: ['http://ngcdn002.cnr.cn/live/zgzs/index.m3u8'],
    category: 'national',
    logoUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80',
    description: '中央人民广播电台中国之声 - 权威国家新闻与专题广播',
    bitrate: '128kbps AAC (HLS)',
    isCustom: false
  },
  {
    id: 'station_cnr_economy',
    name: 'CNR 经济之声',
    url: 'http://ngcdn002.cnr.cn/live/jjzs/index.m3u8',
    category: 'national',
    logoUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=150&auto=format&fit=crop&q=80',
    description: '中央人民广播电台经济之声 - 财富、商业与民生经济观察',
    bitrate: '128kbps AAC (HLS)',
    isCustom: false
  },
  {
    id: 'station_groove_salad',
    name: 'SomaFM Groove Salad (Lofi/Chill)',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    backupUrls: ['https://ice2.somafm.com/groovesalad-128-mp3', 'https://ice4.somafm.com/groovesalad-128-mp3'],
    category: 'lofi',
    logoUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=150&auto=format&fit=crop&q=80',
    description: '24/7 经典 Low-Fi / Ambient 节拍 - 适合工作、专注、编程与深夜放松',
    bitrate: '128kbps MP3 直连',
    isCustom: false
  },
  {
    id: 'station_linn_jazz',
    name: 'Linn Jazz 发烧爵士台',
    url: 'http://radio.linn.co.uk:8000/stream',
    category: 'music',
    logoUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=150&auto=format&fit=crop&q=80',
    description: '英国 Linn Hi-Fi 顶级发烧爵士乐典藏 - 柔和醇厚咖啡馆氛围',
    bitrate: '320kbps MP3 高清',
    isCustom: false
  },
  {
    id: 'station_linn_classical',
    name: 'Linn Classical 顶级古典交响',
    url: 'http://radio.linn.co.uk:8004/stream',
    category: 'classical',
    logoUrl: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop&q=80',
    description: '莫扎特、贝多芬与肖邦 - 英国顶级古典交响乐发烧现场',
    bitrate: '320kbps MP3 高清',
    isCustom: false
  },
  {
    id: 'station_secret_agent',
    name: 'SomaFM Secret Agent (复古爵士)',
    url: 'https://ice1.somafm.com/secretagent-128-mp3',
    backupUrls: ['https://ice2.somafm.com/secretagent-128-mp3'],
    category: 'music',
    logoUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
    description: '谍战与复古黑胶金曲 - 充满神秘感与律动的经典 Spy Jazz',
    bitrate: '128kbps MP3',
    isCustom: false
  },
  {
    id: 'station_deep_space',
    name: 'Deep Space One (深空冥想)',
    url: 'https://ice1.somafm.com/deepspaceone-128-mp3',
    backupUrls: ['https://ice2.somafm.com/deepspaceone-128-mp3'],
    category: 'lofi',
    logoUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=150&auto=format&fit=crop&q=80',
    description: '深空氛围电子与纯净白噪音 - 助眠、冥想与深层专注',
    bitrate: '128kbps MP3',
    isCustom: false
  }
];

export class RadioService {
  private static instance: RadioService;

  private customStations: RadioStation[] = [];
  private podcasts: PodcastSubscription[] = [];

  private constructor() {
    this.loadData();
  }

  public static getInstance(): RadioService {
    if (!RadioService.instance) {
      RadioService.instance = new RadioService();
    }
    return RadioService.instance;
  }

  private loadData() {
    try {
      if (fs.existsSync(STATIONS_FILE)) {
        const raw = fs.readFileSync(STATIONS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.customStations = parsed;
        }
      }
    } catch (e: any) {
      console.warn('[RadioService] Failed to load radio-stations.json:', e.message);
    }

    try {
      if (fs.existsSync(PODCASTS_FILE)) {
        const raw = fs.readFileSync(PODCASTS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.podcasts = parsed;
        }
      }
    } catch (e: any) {
      console.warn('[RadioService] Failed to load podcasts.json:', e.message);
    }
  }

  private saveData() {
    try {
      const dir = path.dirname(STATIONS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STATIONS_FILE, JSON.stringify(this.customStations, null, 2), 'utf8');
      fs.writeFileSync(PODCASTS_FILE, JSON.stringify(this.podcasts, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('[RadioService] Failed to save radio/podcast data:', e.message);
    }
  }

  public getAllStations(): RadioStation[] {
    return [...PRESET_STATIONS, ...this.customStations];
  }

  public getStationById(id: string): RadioStation | undefined {
    return this.getAllStations().find(s => s.id === id);
  }

  public addCustomStation(station: Omit<RadioStation, 'id' | 'isCustom' | 'createdAt'>): RadioStation {
    const newStation: RadioStation = {
      ...station,
      id: `station_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      isCustom: true,
      createdAt: Date.now()
    };
    this.customStations.unshift(newStation);
    this.saveData();
    return newStation;
  }

  public deleteCustomStation(id: string): boolean {
    const initialLen = this.customStations.length;
    this.customStations = this.customStations.filter(s => s.id !== id);
    if (this.customStations.length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  public getPodcasts(): PodcastSubscription[] {
    return [...this.podcasts];
  }

  public addPodcastSubscription(pod: Omit<PodcastSubscription, 'id' | 'createdAt'>): PodcastSubscription {
    const existing = this.podcasts.find(p => p.rssUrl === pod.rssUrl);
    if (existing) {
      return existing;
    }
    const newPod: PodcastSubscription = {
      ...pod,
      id: `pod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now()
    };
    this.podcasts.unshift(newPod);
    this.saveData();
    return newPod;
  }

  public deletePodcastSubscription(id: string): boolean {
    const initialLen = this.podcasts.length;
    this.podcasts = this.podcasts.filter(p => p.id !== id);
    if (this.podcasts.length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  /**
   * Fetch and parse RSS XML feed into structured Podcast metadata & episode list
   */
  public async parseRssFeed(rssUrl: string): Promise<{
    title: string;
    author: string;
    description: string;
    coverUrl: string;
    link: string;
    episodes: PodcastEpisode[];
  }> {
    if (!rssUrl || !rssUrl.startsWith('http')) {
      throw new Error('无效的 RSS Feed URL 地址');
    }

    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TinglanRadioRSS/2.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`抓取 RSS 失败 (HTTP ${res.status}): ${res.statusText}`);
    }

    const xmlText = await res.text();
    return this.parseXmlText(xmlText, rssUrl);
  }

  private parseXmlText(xml: string, rssUrl: string) {
    // Helper regex extractors
    const extractTag = (str: string, tagName: string): string => {
      const match = str.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
      if (!match) return '';
      let text = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
      return text.replace(/<[^>]+>/g, '').trim(); // strip html
    };

    const extractAttribute = (str: string, tagName: string, attrName: string): string => {
      const match = str.match(new RegExp(`<${tagName}[^>]*\\b${attrName}=["']([^"']+)["']`, 'i'));
      return match ? match[1] : '';
    };

    // Channel metadata
    const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
    const channelXml = channelMatch ? channelMatch[1] : xml;

    const title = extractTag(channelXml, 'title') || '未知播客';
    const author = extractTag(channelXml, 'itunes:author') || extractTag(channelXml, 'author') || extractTag(channelXml, 'dc:creator') || '播客创作者';
    const description = extractTag(channelXml, 'description') || extractTag(channelXml, 'itunes:summary') || '暂无播客简介';
    const link = extractTag(channelXml, 'link') || rssUrl;

    let coverUrl = extractAttribute(channelXml, 'itunes:image', 'href') || extractAttribute(channelXml, 'image', 'href');
    if (!coverUrl) {
      const imageTagMatch = channelXml.match(/<image[^>]*>([\s\S]*?)<\/image>/i);
      if (imageTagMatch) {
        coverUrl = extractTag(imageTagMatch[1], 'url');
      }
    }
    if (!coverUrl) {
      coverUrl = 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80';
    }

    // Parse items (episodes)
    const episodes: PodcastEpisode[] = [];
    const itemMatches = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];

    for (let i = 0; i < Math.min(itemMatches.length, 60); i++) {
      const itemXml = itemMatches[i];

      const epTitle = extractTag(itemXml, 'title') || `第 ${i + 1} 集`;
      const pubDateRaw = extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date');
      const duration = extractTag(itemXml, 'itunes:duration') || '';
      const epDesc = extractTag(itemXml, 'description') || extractTag(itemXml, 'itunes:summary') || '';

      let epCover = extractAttribute(itemXml, 'itunes:image', 'href') || coverUrl;

      // Extract audio enclosure URL
      let audioUrl = extractAttribute(itemXml, 'enclosure', 'url');
      if (!audioUrl) {
        // Fallback: search for media:content
        audioUrl = extractAttribute(itemXml, 'media:content', 'url');
      }

      if (audioUrl) {
        episodes.push({
          id: `ep_${i}_${Math.random().toString(36).slice(2, 6)}`,
          title: epTitle,
          audioUrl,
          pubDate: pubDateRaw ? new Date(pubDateRaw).toLocaleDateString('zh-CN') : '近期更新',
          duration,
          description: epDesc.slice(0, 300),
          coverUrl: epCover
        });
      }
    }

    return {
      title,
      author,
      description: description.slice(0, 500),
      coverUrl,
      link,
      episodes
    };
  }
}

export const radioService = RadioService.getInstance();
