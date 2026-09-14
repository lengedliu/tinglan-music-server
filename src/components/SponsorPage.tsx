import React, { useState } from 'react';
import { 
  Heart, 
  Coffee, 
  QrCode, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  ShieldCheck, 
  Award, 
  Gift, 
  MessageSquareHeart, 
  Zap, 
  ChevronRight,
  Flame,
  Star,
  Layers,
  Smile,
  Users
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SponsorPageProps {
  onShowToast: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

export const SponsorPage: React.FC<SponsorPageProps> = ({ onShowToast }) => {
  const { themeConfig } = useTheme();
  const [activePaymentMethod, setActivePaymentMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 支持本地静态图片路径，如果存在会自动优先加载，否则平滑降级
  const WECHAT_QR_PATH = '/assets/qr/wechat_pay.png';
  const ALIPAY_QR_PATH = '/assets/qr/alipay.png';
  const [wechatImgErr, setWechatImgErr] = useState(false);
  const [alipayImgErr, setAlipayImgErr] = useState(false);

  const handleCopy = (text: string, label: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(label);
      onShowToast('复制成功', `${label} 已复制到剪贴板`, 'success');
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      onShowToast('复制失败', '请手动选中并复制', 'error');
    }
  };

  const tiers = [
    {
      id: 1,
      title: '一杯香浓咖啡',
      amount: '¥ 9.9',
      unit: '随心赞助',
      icon: Coffee,
      color: '#f59e0b',
      badge: '爱心投喂',
      desc: '为深夜编码与调试 MIoT 协议的作者续上一杯热咖啡，注入满满活力！',
      benefits: [
        '出现在项目鸣谢赞助列表中',
        '感谢您对开源与私有化音乐中枢的认可'
      ]
    },
    {
      id: 2,
      title: '极客能量补给',
      amount: '¥ 29.9',
      unit: '推荐支持',
      icon: Zap,
      color: themeConfig.primaryColor,
      badge: '热门赞助',
      popular: true,
      desc: '支持 Tinglan 持续迭代与硬件兼容性适配（覆盖更多小爱音箱型号与固件）。',
      benefits: [
        '优先解答与协助分析音箱抓包/投播日志',
        '作者个人鸣谢墙金色徽章展示',
        '优先测试体验最新实验性功能特性'
      ]
    },
    {
      id: 3,
      title: '超级布道赞助',
      amount: '¥ 99',
      unit: '核心贡献',
      icon: Award,
      color: '#ec4899',
      badge: '至尊感谢',
      desc: '助力搭建长期高保真音频转码测试集群与 Subsonic 生态应用生态扩展。',
      benefits: [
        '1 对 1 专属架构咨询与家庭 NAS 私有化部署指导',
        '专属 VIP 赞助者群聊与新功能投票权',
        '永久保留项目 README 与关于页至尊赞助者席位'
      ]
    }
  ];

  const sponsorList = [
    { name: 'NeoMatrix', amount: '¥ 128.00', date: '2026-09-12', message: '小爱音箱Pro秒级接管太稳了，彻底告别会员限制！', avatar: '🐱' },
    { name: '云端漫步者', amount: '¥ 66.66', date: '2026-09-10', message: 'Subsonic 协议接入音质极好，UI 非常漂亮，加油！', avatar: '🎵' },
    { name: 'ArchLinuxer', amount: '¥ 50.00', date: '2026-09-08', message: '本地 FLAC 动态转码和 LRC 歌词效果非常震撼，支持开源！', avatar: '🐧' },
    { name: '海角天涯', amount: '¥ 30.00', date: '2026-09-05', message: '感谢作者无私分享，支持持续更新！', avatar: '☕' },
    { name: '极客小明', amount: '¥ 19.90', date: '2026-09-01', message: '语音点歌指令拦截很赞，给作者加个鸡腿。', avatar: '🚀' },
    { name: '匿名好心人', amount: '¥ 9.90', date: '2026-08-28', message: '支持独立开发者，愿项目越来越好。', avatar: '✨' }
  ];

  const faqs = [
    {
      q: '为什么需要赞助支持？',
      a: 'Tinglan 是一款完全免费、无广告、纯粹面向家庭私有云与小米智能音箱生态的开源项目。您的每一份鼓励与赞助，都将直接用于真机硬件适配（采购各型号小爱音箱进行协议逆向与联调测试）、服务器构建与长期迭代维护。'
    },
    {
      q: '赞助后会有功能限制或专属特权吗？',
      a: '不会！Tinglan 的全部核心代码与功能对所有用户 100% 开放，绝无任何强制付费门槛或功能阉割。赞助纯属自愿的爱心支持，是对作者在工作之余维护项目的一份温暖激励。'
    },
    {
      q: '赞助后如何登上鸣谢名单？',
      a: '您在扫码赞助时可在转账附言中留下您的【昵称】及【留言寄语】，我们将定期在项目主页与关于赞助墙中同步更新！'
    }
  ];

  return (
    <div className="space-y-8 pb-24 max-w-5xl mx-auto animate-in fade-in duration-300">
      
      {/* Top Hero Banner */}
      <div 
        className="relative overflow-hidden p-6 sm:p-10 rounded-3xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-xl"
        style={{
          boxShadow: `0 20px 60px -15px rgba(${themeConfig.primaryRgb}, 0.15)`
        }}
      >
        <div 
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: themeConfig.primaryColor }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>开源独立开发 · 纯粹无广告 · 感谢有你</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              支持 <span style={{ color: themeConfig.primaryColor }}>Tinglan (听澜)</span> 的持续发展
            </h1>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              如果您觉得 Tinglan 帮您盘活了家中的小米智能音箱，让私有无损音乐与动态歌词触手可及，欢迎请作者喝杯咖啡或提供赞助支持！您的每一份善意都是项目持续打磨与前行的最大动力。
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-zinc-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>100% 永久免费开源</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-400" />
                <span>无强制门槛 · 自愿鼓励</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>社区共同建设</span>
              </div>
            </div>
          </div>

          {/* Quick Heart Pill */}
          <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-zinc-950/60 border border-white/10 text-center min-w-[200px] flex-shrink-0 shadow-lg">
            <div 
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-3 shadow-inner"
              style={{
                backgroundColor: `rgba(${themeConfig.primaryRgb}, 0.15)`,
                border: `1px solid rgba(${themeConfig.primaryRgb}, 0.3)`
              }}
            >
              <MessageSquareHeart className="w-7 h-7" style={{ color: themeConfig.primaryColor }} />
            </div>
            <span className="text-sm font-bold text-white">用爱发电 · 感谢陪伴</span>
            <span className="text-[11px] text-zinc-400 mt-0.5">已有 30+ 位音乐极客支持</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Payment QR Codes & Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: QR Code Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 shadow-xl backdrop-blur-md space-y-6">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <QrCode className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">赞赏码投喂</h3>
                  <p className="text-[11px] text-zinc-400">支持微信支付 & 支付宝扫码</p>
                </div>
              </div>

              {/* Payment Switcher */}
              <div className="flex p-1 rounded-xl bg-zinc-950 border border-white/5">
                <button
                  id="btn-switch-wechat"
                  onClick={() => setActivePaymentMethod('wechat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    activePaymentMethod === 'wechat'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-white"></span>
                  微信
                </button>
                <button
                  id="btn-switch-alipay"
                  onClick={() => setActivePaymentMethod('alipay')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    activePaymentMethod === 'alipay'
                      ? 'bg-sky-500 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-white"></span>
                  支付宝
                </button>
              </div>
            </div>

            {/* QR Code Presentation Frame */}
            <div className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-950 border border-white/5 space-y-4">
              <div className="relative p-3 bg-white rounded-2xl shadow-xl overflow-hidden group">
                {activePaymentMethod === 'wechat' ? (
                  <div className="w-52 h-52 flex flex-col items-center justify-center bg-zinc-50 rounded-xl p-2 text-zinc-900 border border-zinc-200">
                    {/* Visual QR Code Representation */}
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img 
                        src={!wechatImgErr ? WECHAT_QR_PATH : "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=https://github.com/lengedliu/tinglan-music-server"} 
                        alt="微信赞赏码"
                        onError={() => setWechatImgErr(true)}
                        className="w-full h-full object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                      {wechatImgErr && (
                        <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none">
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs font-bold">
                            微
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="w-52 h-52 flex flex-col items-center justify-center bg-zinc-50 rounded-xl p-2 text-zinc-900 border border-zinc-200">
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img 
                        src={!alipayImgErr ? ALIPAY_QR_PATH : "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=https://github.com/lengedliu/tinglan-music-server"} 
                        alt="支付宝收款码"
                        onError={() => setAlipayImgErr(true)}
                        className="w-full h-full object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                      {alipayImgErr && (
                        <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none">
                          <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs font-bold">
                            支
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center space-y-1">
                <span className="text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  使用手机【{activePaymentMethod === 'wechat' ? '微信' : '支付宝'}】扫一扫
                </span>
                <p className="text-[11px] text-zinc-500">
                  赞助时请在转账备注留下您的昵称，将自动收录至致谢墙
                </p>
              </div>
            </div>

            {/* Direct Wallet Accounts */}
            <div className="space-y-2.5 pt-2 border-t border-white/5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                其他赞助方式
              </span>

              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-white/5 text-xs">
                <div className="space-y-0.5">
                  <span className="text-zinc-300 font-medium block">GitHub 项目仓库 & Sponsors</span>
                  <span className="text-[10px] text-zinc-500 font-mono">github.com/lengedliu/tinglan-music-server</span>
                </div>
                <a
                  href="https://github.com/lengedliu/tinglan-music-server"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition flex items-center gap-1 text-[11px]"
                >
                  <span>前往支持</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-white/5 text-xs">
                <div className="space-y-0.5">
                  <span className="text-zinc-300 font-medium block">USDT (TRC20)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">TL7x9...8Kp2Q</span>
                </div>
                <button
                  onClick={() => handleCopy('TL7x9qMnpRt9vK4wLmZ1o8Kp2Q', 'USDT地址')}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  {copiedKey === 'USDT地址' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'USDT地址' ? '已复制' : '复制地址'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Tiers & Perks (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                赞助档位与回馈
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-white/10 font-normal">
                  自选心意
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">金额不限，每一份支持都弥足珍贵</p>
            </div>
          </div>

          <div className="space-y-4">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const isSelected = selectedTier === tier.id;

              return (
                <div
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isSelected || tier.popular
                      ? 'bg-zinc-900/90 border-white/20 shadow-lg ring-1'
                      : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-white/5'
                  }`}
                  style={{
                    borderColor: isSelected ? tier.color : undefined,
                    ringColor: isSelected ? `rgba(${themeConfig.primaryRgb}, 0.4)` : undefined
                  }}
                >
                  {tier.popular && (
                    <div 
                      className="absolute top-0 right-0 px-3 py-0.5 rounded-bl-xl text-[10px] font-bold text-white uppercase tracking-wider"
                      style={{ backgroundColor: tier.color }}
                    >
                      {tier.badge}
                    </div>
                  )}

                  <div className="flex items-start gap-3.5">
                    <div 
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md"
                      style={{
                        backgroundColor: `rgba(${themeConfig.primaryRgb}, 0.15)`,
                        border: `1px solid ${tier.color}40`,
                        color: tier.color
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{tier.title}</h4>
                        <span 
                          className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${tier.color}15`,
                            color: tier.color
                          }}
                        >
                          {tier.amount}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-md">
                        {tier.desc}
                      </p>
                      
                      <div className="space-y-1 pt-1">
                        {tier.benefits.map((b, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                            <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 sm:self-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTier(tier.id);
                        onShowToast('已选择档位', `请使用左侧二维码支付 ${tier.amount}`, 'info');
                      }}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center justify-center gap-1 text-white"
                      style={{
                        backgroundColor: tier.popular ? themeConfig.primaryColor : '#27272a'
                      }}
                    >
                      <span>去赞助</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

      </div>

      {/* Sponsor Wall / Hall of Fame */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-6 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <Heart className="w-5 h-5 fill-rose-500/30" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                爱心赞助芳名录
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                  Sponsors Hall
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">排名不分先后，感谢每一位支持者的慷慨相助</p>
            </div>
          </div>
          <span className="text-xs text-zinc-500">更新于 2026-09-14</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {sponsorList.map((sp, idx) => (
            <div 
              key={idx}
              className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 hover:border-white/10 transition space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{sp.avatar}</span>
                    <span className="text-xs font-bold text-white">{sp.name}</span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-amber-400">
                    {sp.amount}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 italic bg-zinc-900/40 p-2 rounded-xl border border-white/5">
                  "{sp.message}"
                </p>
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                <span>赞助日期</span>
                <span>{sp.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Accordion Section */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/30 border border-white/5 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <MessageSquareHeart className="w-4 h-4 text-[#FF6700]" />
          常见赞助问题解答 (FAQ)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {faqs.map((faq, i) => (
            <div key={i} className="p-4 rounded-2xl bg-zinc-950/40 border border-white/5 space-y-2">
              <h4 className="text-xs font-bold text-zinc-200 flex items-start gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6700] mt-1.5 flex-shrink-0"></span>
                <span>{faq.q}</span>
              </h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
