/**
 * Lightweight, high-performance Chinese Pinyin & Phonetic Fuzzy Search Helper
 * Designed specifically for XiaoAi ASR voice query correction and song matching.
 * Zero external dependencies.
 */

// Common PinYin character map covering top Chinese song titles, artists, and common words
const PINYIN_RAW_PAIRS: Array<[string, string]> = [
  ['一', 'yi'], ['二', 'er'], ['三', 'san'], ['四', 'si'], ['五', 'wu'], ['六', 'liu'], ['七', 'qi'], ['八', 'ba'], ['九', 'jiu'], ['十', 'shi'], ['百', 'bai'], ['千', 'qian'], ['万', 'wan'],
  ['晴', 'qing'], ['天', 'tian'], ['周', 'zhou'], ['杰', 'jie'], ['伦', 'lun'], ['夜', 'ye'], ['的', 'de'], ['第', 'di'], ['章', 'zhang'], ['青', 'qing'], ['花', 'hua'], ['瓷', 'ci'],
  ['告', 'gao'], ['白', 'bai'], ['气', 'qi'], ['球', 'qiu'], ['稻', 'dao'], ['香', 'xiang'], ['爱', 'ai'], ['在', 'zai'], ['西', 'xi'], ['元', 'yuan'], ['前', 'qian'], ['枫', 'feng'],
  ['起', 'qi'], ['风', 'feng'], ['了', 'le'], ['峰', 'feng'], ['戚', 'qi'], ['年', 'nian'], ['念', 'nian'], ['陈', 'chen'], ['奕', 'yi'], ['迅', 'xun'], ['浮', 'fu'], ['夸', 'kua'],
  ['孤', 'gu'], ['勇', 'yong'], ['者', 'zhe'], ['红', 'hong'], ['豆', 'dou'], ['王', 'wang'], ['菲', 'fei'], ['传', 'chuan'], ['奇', 'qi'], ['匆', 'cong'], ['那', 'na'],
  ['林', 'lin'], ['俊', 'jun'], ['杰', 'jie'], ['江', 'jiang'], ['南', 'nan'], ['修', 'xiu'], ['炼', 'lian'], ['情', 'qing'], ['歌', 'ge'], ['不', 'bu'], ['为', 'wei'], ['谁', 'shui'],
  ['而', 'er'], ['作', 'zuo'], ['可', 'ke'], ['惜', 'xi'], ['没', 'mei'], ['如', 'ru'], ['果', 'guo'], ['学', 'xue'], ['友', 'you'], ['吻', 'wen'], ['别', 'bie'], ['遥', 'yao'],
  ['远', 'yuan'], ['她', 'ta'], ['李', 'li'], ['荣', 'rong'], ['浩', 'hao'], ['少', 'shao'], ['有', 'you'], ['克', 'ke'], ['勤', 'qin'], ['月', 'yue'],
  ['半', 'ban'], ['小', 'xiao'], ['曲', 'qu'], ['日', 'ri'], ['邓', 'deng'], ['紫', 'zi'], ['棋', 'qi'], ['泡', 'pao'], ['沫', 'mo'], ['光', 'guang'],
  ['莫', 'mo'], ['文', 'wen'], ['蔚', 'wei'], ['阴', 'yin'], ['盛', 'sheng'], ['夏', 'xia'], ['慢', 'man'], ['冷', 'leng'], ['暖', 'nuan'], ['孙', 'sun'], ['燕', 'yan'],
  ['姿', 'zi'], ['遇', 'yu'], ['见', 'jian'], ['绿', 'lv'], ['我', 'wo'], ['怀', 'huai'], ['梁', 'liang'], ['静', 'jing'], ['茹', 'ru'],
  ['宁', 'ning'], ['书', 'shu'], ['会', 'hui'], ['呼', 'hu'], ['吸', 'xi'], ['痛', 'tong'], ['张', 'zhang'],
  ['惠', 'hui'], ['妹', 'mei'], ['听', 'ting'], ['海', 'hai'], ['记', 'ji'], ['得', 'de'], ['人', 'ren'], ['质', 'zhi'], ['薛', 'xue'], ['之', 'zhi'], ['谦', 'qian'],
  ['演', 'yan'], ['员', 'yuan'], ['丑', 'chou'], ['怪', 'guai'], ['绅', 'shen'], ['士', 'shi'], ['认', 'ren'], ['真', 'zhen'], ['雪', 'xue'], ['下', 'xia'],
  ['知', 'zhi'], ['足', 'zu'], ['温', 'wen'], ['柔', 'rou'], ['倔', 'jue'], ['强', 'qiang'], ['后', 'hou'], ['来', 'lai'],
  ['刘', 'liu'], ['若', 'ruo'], ['英', 'ying'], ['很', 'hen'], ['想', 'xiang'], ['成', 'cheng'], ['全', 'quan'], ['朴', 'pu'], ['树', 'shu'], ['平', 'ping'], ['凡', 'fan'],
  ['路', 'lu'], ['生', 'sheng'], ['桦', 'hua'], ['许', 'xu'], ['巍', 'wei'], ['蓝', 'lan'], ['莲', 'lian'],
  ['曾', 'zeng'], ['经', 'jing'], ['你', 'ni'], ['故', 'gu'], ['乡', 'xiang'], ['执', 'zhi'], ['着', 'zhe'], ['汪', 'wang'], ['怒', 'nu'], ['放', 'fang'],
  ['存', 'cun'], ['飞', 'fei'], ['更', 'geng'], ['高', 'gao'], ['春', 'chun'], ['里', 'li'], ['阔', 'kuo'], ['空', 'kong'],
  ['辉', 'hui'], ['岁', 'sui'], ['喜', 'xi'], ['欢', 'huan'], ['重', 'chong'], ['庆', 'qing'], ['都', 'du'],
  ['赵', 'zhao'], ['雷', 'lei'], ['山', 'shan'], ['少年', 'shaonian'], ['消', 'xiao'], ['愁', 'chou'], ['毛', 'mao'], ['易', 'yi'], ['像', 'xiang'],
  ['借', 'jie'], ['无', 'wu'], ['问', 'wen'], ['东', 'dong'], ['体', 'ti'], ['面', 'mian'], ['于', 'yu'],
  ['说', 'shuo'], ['散', 'san'], ['就', 'jiu'], ['袁', 'yuan'], ['娅', 'ya'], ['维', 'wei'], ['芒', 'mang'], ['种', 'zhong'], ['音', 'yin'], ['乐', 'yue'], ['华', 'hua'],
  ['语', 'yu'], ['国', 'guo'], ['粤', 'yue'], ['韩', 'han'], ['损', 'sun'], ['现', 'xian'], ['场', 'chang'], ['大', 'da'],
  ['低', 'di'], ['吉', 'ji'], ['他', 'ta'], ['贝', 'bei'], ['斯', 'si'], ['鼓', 'gu'], ['电', 'dian'], ['摇', 'yao'], ['滚', 'gun'],
  ['民', 'min'], ['谣', 'yao'], ['流', 'liu'], ['行', 'xing'], ['古', 'gu'], ['纯', 'chun'], ['配', 'pei'], ['视', 'shi'], ['剧', 'ju']
];

const PINYIN_DICT: Record<string, string> = Object.fromEntries(PINYIN_RAW_PAIRS);

/**
 * Convert string to pinyin string and initials
 */
export function stringToPinyin(str: string): { pinyin: string; initials: string } {
  if (!str) return { pinyin: '', initials: '' };
  
  let pinyinArr: string[] = [];
  let initialsArr: string[] = [];
  
  // Normalize string
  const clean = str.toLowerCase().trim();
  
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    // If it's English/number/space
    if (/^[a-z0-9]$/i.test(char)) {
      pinyinArr.push(char);
      initialsArr.push(char);
      continue;
    }
    
    // Lookup in dictionary
    const py = PINYIN_DICT[char];
    if (py) {
      pinyinArr.push(py);
      initialsArr.push(py[0]);
    } else {
      // Fallback for Chinese unicode block (4e00 - 9fa5)
      const code = char.charCodeAt(0);
      if (code >= 0x4e00 && code <= 0x9fa5) {
        // Approximate fallback based on simple hash
        pinyinArr.push(char);
        initialsArr.push(char);
      }
    }
  }
  
  return {
    pinyin: pinyinArr.join(''),
    initials: initialsArr.join('')
  };
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (!a || !b) return (a || '').length + (b || '').length;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  return dp[m][n];
}

/**
 * Calculate similarity percentage [0.0 - 1.0]
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1.0 - dist / maxLen);
}

/**
 * Phonetic & Semantic match score calculation
 */
export function computeSongMatchScore(
  song: { title: string; artist?: string; album?: string },
  rawQuery: string
): number {
  if (!rawQuery) return 0;
  
  const query = rawQuery.toLowerCase().trim();
  const title = (song.title || '').toLowerCase().trim();
  const artist = (song.artist || '').toLowerCase().trim();
  const album = (song.album || '').toLowerCase().trim();
  
  // Strip common parenthetical noise: 《晴天》(Live版) -> 晴天
  const cleanTitle = title.replace(/\s*[\(\[（【].*?[\)\]）】]/g, '').trim();

  // 1. Exact direct matches
  if (cleanTitle === query || title === query) return 100;
  if (`${artist} ${cleanTitle}` === query || `${artist}${cleanTitle}` === query) return 98;
  if (`${cleanTitle} ${artist}` === query || `${cleanTitle}${artist}` === query) return 98;

  // 2. Substring matches
  if (cleanTitle.includes(query) || query.includes(cleanTitle)) {
    // Reward closer length matches
    const ratio = Math.min(cleanTitle.length, query.length) / Math.max(cleanTitle.length, query.length);
    return 85 + Math.round(ratio * 10);
  }

  // 3. Artist matches
  if (artist && (artist === query || artist.includes(query) || query.includes(artist))) {
    return 80;
  }

  // 4. Pinyin & Phonetic Homophone Matching
  const queryPy = stringToPinyin(query);
  const titlePy = stringToPinyin(cleanTitle);
  const artistPy = stringToPinyin(artist);

  if (queryPy.pinyin && titlePy.pinyin) {
    // Exact Pinyin match (e.g. "qifengle" vs "起风了" / "七峰了")
    if (queryPy.pinyin === titlePy.pinyin) return 92;
    
    // Pinyin substring match
    if (titlePy.pinyin.includes(queryPy.pinyin) || queryPy.pinyin.includes(titlePy.pinyin)) {
      return 82;
    }
    
    // Pinyin similarity
    const pySim = stringSimilarity(queryPy.pinyin, titlePy.pinyin);
    if (pySim > 0.75) {
      return Math.round(70 + pySim * 20);
    }
  }

  // 5. Initials matching (e.g. "zjl" -> "周杰伦", "qfl" -> "起风了")
  if (queryPy.initials && titlePy.initials && queryPy.initials.length >= 2) {
    if (titlePy.initials === queryPy.initials || titlePy.initials.includes(queryPy.initials)) {
      return 78;
    }
    if (artistPy.initials && (artistPy.initials === queryPy.initials || artistPy.initials.includes(queryPy.initials))) {
      return 76;
    }
  }

  // 6. Character Edit Distance similarity fallback
  const charSim = stringSimilarity(cleanTitle, query);
  if (charSim > 0.6) {
    return Math.round(50 + charSim * 30);
  }

  return 0;
}
