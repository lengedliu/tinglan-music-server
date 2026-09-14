# Tinglan (听澜) - 小米智能音箱音乐中枢与私有流媒体服务

[![Version](https://img.shields.io/badge/version-2.5.0-007ec6?style=flat-square)](https://github.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-2c8ebb?style=flat-square&logo=node.js&logoColor=white&color=2e7d32)](https://nodejs.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Realtime-black?style=flat-square&logo=socketdotio&logoColor=white)](https://github.com/)
[![MCP](https://img.shields.io/badge/MCP-22_Tools-7b1fa2?style=flat-square&logo=anthropic&logoColor=white)](https://github.com/)
[![Git](https://img.shields.io/badge/Git-Auto_Backup-d84315?style=flat-square&logo=git&logoColor=white)](https://github.com/)
[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-424242?style=flat-square&logo=obsidian&logoColor=white)](https://obsidian.md/)
[![Database](https://img.shields.io/badge/Database-JSON_%7C_SQLite_%7C_Postgres_%7C_MySQL-0277bd?style=flat-square&logo=sqlite&logoColor=white)](https://github.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-0288d1?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![i18n](https://img.shields.io/badge/i18n-5_Languages-00897b?style=flat-square)](https://github.com/)
[![License](https://img.shields.io/badge/License-MIT-f57c00?style=flat-square&logo=open-source-initiative&logoColor=white)](LICENSE)

> 专为**小米智能音箱全系列**（小爱音箱 Pro、Xiaomi Sound Pro、小爱触屏音箱、小爱音箱 Play 等）及家庭私有 NAS 打造的本地音乐流媒体中枢、MIoT 协议播控中心、OpenSubsonic 兼容服务与 LRC 动态动效歌词平台。

---

## 🌟 核心功能特性

1. **私有无损音乐库**：
   - 支持 FLAC 24bit/96kHz、320kbps MP3、WAV、M4A、OGG、AAC、APE、OPUS 等多种无损与高码率音频格式。
   - 自动扫描挂载的本地音乐目录，实时读取歌曲元数据、专辑封面与 ID3 标签。
   - 内置 LRC 同步时间轴歌词引擎与黑胶唱片律动视觉呈现。
   - 音频上传白名单安全过滤机制，杜绝恶意非音频文件注入。

2. **小米音箱全协议直连与投播 (MIoT / Mina / miIO)**：
   - **真实云端 Mina 指令通道**：集成 Xiaomi Passport STS 鉴权与 Mina UBUS 通信接口，下发 `player_play_url` 播放指令。
   - **局域网 Token / IP 直连通道**：支持直接输入 32 位局域网 Device Token 绕过云端 2FA 风控，实现毫秒级局域网播控。
   - **标准 HTTP 206 Partial Content 分片流媒体**：全面支持 `Accept-Ranges: bytes` 分块拉流与严格的边界 Range 校验，保障小爱音箱硬件 DSP 解码器流畅解码。
   - **小爱同学原声 TTS 播报**：支持投播前自动语音播报歌名、问候语或自定义广播。
   - **设备管理与网络探测**：支持多音箱切换、设备编辑、添加自定义音箱、一键清空与实时 TCP Ping 端口握手探测。

3. **智能语音口令与点歌中枢**：
   - **多通道捕获与幂等去重**：结合 Mina WebSocket 实时推送与云端对话轮询通道，内置 5 秒滑动窗口防抖去重引擎，杜绝并发导致的重复切歌。
   - **全场景自然语言匹配**：支持搜歌、随机播放、自建歌单指定播放、上一曲、下一曲、暂停及音量调节。
   - **免开嗓模拟器**：支持在 Web 控制台进行语音指令模拟匹配与即时测试。

4. **OpenSubsonic / Subsonic 标准 API 服务**：
   - 完全兼容 Subsonic 客户端生态（DSub、Symfonium、Substreamer、Amperfy、音响系统等）。
   - **安全凭证鉴权体系**：支持 OpenSubsonic 标准的用户名密码（`u` / `p`）与 MD5 加盐签名（`t` / `s`）认证，保护私有曲库免受外网未授权访问。
   - 暴露标准端点：`getIndexes`, `getMusicFolders`, `search3`, `getPlaylists`, `getLyrics`, `stream`。

5. **企业级安全与缓存自治 (Security & Auto-LRU Storage)**：
   - **凭据深度脱敏防护**：对 MIoT、Mina、Passport 等所有敏感令牌（`micoServiceToken`, `miotServiceToken`, `passToken` 等）进行脱敏掩码下发，防止前台抓包泄漏。
   - **转码缓存 LRU 自动淘汰**：内置 FFmpeg 转码缓存生命周期管理器（默认最大容量 500MB，超限自动淘汰最旧缓存至 400MB），保障容器磁盘永不爆满。
   - **防暴力破解保护**：具备 IP 级别的连续失败登录锁定机制与滑动窗口自动垃圾清理。

---

## 🏛️ 高可靠投播三层架构标准 (音频层 + 控制层 + 兼容层)

为了确保小米智能音箱全系列（包括无屏音箱、触屏音箱、Sound Pro 等）能够 100% 稳定接收并顺畅拉取私有流媒体，Tinglan 建立了高可靠投播三层架构标准：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Tinglan 智能投播中枢                             │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 音频层 (Audio Layer)                                                │
│    • FFmpeg 实时转码引擎：输出标准 44.1kHz CBR 320k MP3 流              │
│    • HTTP 206 Partial Content：严格响应 Range 分片与 HEAD 探测         │
│    • 格式自适应：秒级转码 FLAC / WAV / AAC / M4A / OGG / APE             │
│    • 缓存自愈引擎：LRU 动态淘汰 (/data/cache)，防止存储空间耗尽         │
├────────────────────────────────────────────────────────────────────────┤
│ 2. 控制层 (Control Layer)                                              │
│    • 官方 Mina UBUS 协议通道：精准下发 player_play_url (media: app_ios) │
│    • 多媒体与音量统一控制：player_play_operation (play/pause/volume)   │
│    • 双通道语音防抖：WebSocket + 轮询 5秒窗口去重，解决双重切歌问题    │
│    • 服务端智能队列引擎：全歌单自动连续播放与状态切歌调度               │
├────────────────────────────────────────────────────────────────────────┤
│ 3. 兼容与扩展层 (Compatibility & Extension Layer)                       │
│    • 触屏音箱适配：LX04 / X08 / X10 等型号专属 type: 0 模式             │
│    • 无屏旗舰适配：Pro / Sound / Art 等型号专属 type: 1 模式            │
│    • OpenSubsonic 协议栈：支持 DSub/Symfonium 第三方客户端多端串流      │
│    • 局域网离线后备：miIO UDP 54321 协议直接发包 fallback              │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. 音频层 (Audio Layer)
- **转码输出**：标准 44.1kHz CBR 320kbps MP3，消除不同嵌入式 DSP 芯片对无损码率或采样率（如 96kHz/24bit）不兼容的问题。
- **传输协议**：HTTP 206 Partial Content，严格支持 `Accept-Ranges: bytes` 及 `Content-Range`，支持 HEAD 探测优化与连接断开（`close`）时文件描述符即时回收。
- **格式自适应**：无缝支持 FLAC/WAV/APE/AAC/OGG/M4A/OPUS 格式。
- **转码缓存**：二次播放直接命中本地转码缓存，配合 LRU 自动清理，实现即点即播且免除维护顾虑。

### 2. 控制层 (Control Layer)
- **指令下发**：基于官方 Mina UBUS 接口，使用 `player_play_url` 并指定 `media: "app_ios"`，具备最高投播优先级与兼容性。
- **多媒体操作**：统一调度播放、暂停、上一曲、下一曲以及 0~100 阶梯音量调节。
- **连续播放调度**：服务端维护队列与音箱拉流监听（`notifyStreamConsumed`），实现全歌单无需人工干预的自动化连播。

### 3. 兼容与扩展层 (Compatibility Layer)
- **硬件形态自动适配**：针对小爱触屏音箱（使用 `type: 0`）与传统无屏音箱（使用 `type: 1`）分发差异化控制载荷。
- **OpenSubsonic 集成**：支持以标准 Subsonic 服务接入移动端和车载客户端，实现全屋与出行多场景打通。
- **双通道容灾**：当云端接口遇到网络风控或离线时，自动切换至局域网 miIO UDP 54321 直发模式与 DLNA 协议，保证播放指令必达。

---

## 🐳 Docker 部署说明

### 一、快速开始：Docker Compose 部署（推荐）

在您的服务器、软路由或 NAS（如群晖 Synology、威联通 QNAP、Unraid、TrueNAS）上创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  tinglan-xiaomi:
    image: tinglan-xiaomi:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: tinglan-xiaomi
    restart: unless-stopped
    # 强烈推荐 host 网络模式：使小爱音箱与服务处于同一局域网广播域，免除 NAT 转换导致的音频握手失败
    network_mode: host
    environment:
      - NODE_ENV=production
      - PORT=3000
      # 必填：请修改为您宿主机的真实局域网 IP（不可填写 localhost 或 127.0.0.1）
      - SERVER_HOST=http://192.168.31.100:3000
      - MUSIC_DIR=/app/music
      - DATA_DIR=/app/data
      # 小米账号（可选，也可在网页控制台动态登录绑定）
      - MI_USER=
    volumes:
      # 挂载宿主机存放无损音乐的物理目录（只读）
      - /volume1/music:/app/music:ro
      # 挂载容器持久化数据目录（存储歌单、设备列表与播控配置）
      - /volume1/docker/tinglan/data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

启动容器：
```bash
docker compose up -d
```

查看实时运行日志：
```bash
docker compose logs -f
```

---

### 二、Docker Run 命令行一键部署

若习惯使用单行命令，可直接执行：

```bash
docker run -d \
  --name tinglan-xiaomi \
  --restart unless-stopped \
  --network host \
  -e NODE_ENV=production \
  -e SERVER_HOST="http://192.168.31.100:3000" \
  -v /volume1/music:/app/music:ro \
  -v /volume1/docker/tinglan/data:/app/data \
  tinglan-xiaomi:latest
```

> **参数说明**：
> - `--network host`：共享宿主机网络命名空间（小爱音箱能直接访问宿主机的 3000 端口拉流）。
> - `-v /volume1/music:/app/music:ro`：将您的 NAS 或硬盘音乐目录挂载至容器内部 `/app/music`。
> - `-v /volume1/docker/tinglan/data:/app/data`：持久化保存设备配置、歌单及日志。

---

### 三、环境变量详细说明

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SERVER_HOST` | `http://192.168.31.100:3000` | **核心配置**。小爱音箱拉取音频流的 HTTP 基础地址，必须是音箱能够访问到的宿主机真实局域网 IP 或公网域名。 |
| `PORT` | `3000` | 服务端监听的端口号。 |
| `NODE_ENV` | `production` | 生产环境标识。 |
| `MUSIC_DIR` | `/app/music` | 本地音频文件的扫描与存储路径。 |
| `DATA_DIR` | `/app/data` | JSON 配置文件与持久化数据存储路径。 |
| `MI_USER` | 空 | 小米账号（可选预设）。 |

---

### 四、家庭 NAS 平台部署指引

#### 1. 群晖 Synology DSM (Container Manager / Docker)
1. 打开 **Container Manager** -> **注册表/映像**，导入或构建 `tinglan-xiaomi` 镜像。
2. 创建容器时：
   - 网络选择 **“使用与 Docker Host 相同的网络 (Host)”**。
   - 卷映射：选择 File Station 中的音乐文件夹挂载到 `/app/music`（只读），选择一个 docker 目录挂载到 `/app/data`。
   - 环境中添加 `SERVER_HOST` 为您的群晖内网 IP（例如 `http://192.168.1.100:3000`）。
3. 启动容器后，通过浏览器访问 `http://<群晖IP>:3000`。

#### 2. 威联通 QNAP (Container Station) / Unraid
- 在应用市场或模板中新建容器，配置网络为 `Host` 模式，并添加上述两个文件夹路径映射及 `SERVER_HOST` 变量即可。

---

### 五、本地直接源码运行（开发与调试）

若不想使用 Docker，也可直接通过 Node.js 运行：

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **启动全栈服务**（自动绑定 `0.0.0.0:3000` 并挂载 Vite 前端中间件）：
   ```bash
   npm run dev
   ```

3. **构建生产版本**：
   ```bash
   npm run build
   npm start
   ```

---

### 六、小米音箱连接与串流常见问题 (FAQ)

1. **为什么必须正确配置 `SERVER_HOST`？**
   - 小爱音箱是独立运行 Linux/RTOS 的嵌入式硬件，当系统下发投播指令后，音箱会主动通过 Wi-Fi 发起 HTTP 请求去下载这首歌。如果配置成 `127.0.0.1` 或 `localhost`，音箱会在它自己芯片内部找文件，导致报错无法播放。

2. **绑定小米账号后为什么没有自动出现设备？**
   - 小米云端针对机房 IP / 异地登录有严格的 **2FA 安全风控 (87001)**。
   - 若自动同步受阻，您只需点击页面上的 **【编辑配置】** 或 **【+ 手动添加音箱】**，输入您音箱的局域网 IP（在米家 App 中点击音箱设置 -> 设备信息即可查看 IP），即可实现秒级局域网投播。

3. **如何获取小爱音箱的局域网 Token（免密直连）？**
   - 可使用开源工具 `xiaomi-cloud-tokens-extractor` 或通过 Home Assistant 的 Xiaomi MIIO 集成自动提取 32 位 Hex Token，填入面板后即可完全脱离小米云端直连播控。

---

## 🎙️ 语音口令与点歌功能使用指南

Tinglan 内置了小爱同学语音口令拦截与智能点歌中枢。您无需每次都打开手机或电脑网页，只需对着小爱音箱说话，系统即可毫秒级截获并自动检索本地私有无损曲库进行投播。

### 一、默认内置口令与触发词

| 口令类型 | 默认触发词示例 | 执行动作说明 |
| :--- | :--- | :--- |
| 🔍 **智能搜歌点歌** | “点歌 [歌名/歌手]”<br>“来一首 [歌名]”<br>“放一首 [歌名]”<br>“我想听 [歌名]”<br>“播放 [歌名]” | 自动提取关键词，使用多维度模糊匹配算法检索本地歌库并即刻投播，支持 TTS 应答确认。 |
| 🎲 **随机播放全部** | “随便放点歌”<br>“随机播放”<br>“随心听”<br>“来点音乐”<br>“随便放首歌” | 从本地全部音乐库中随机抽取曲目起播，并自动建立随机播放队列。 |
| 📋 **指定歌单投播** | “播放本地歌单”<br>“放本地歌”<br>“播放私房歌”<br>“播放我的歌单” | 投播指定的自建歌单（默认投播主歌单全部曲目并循环播放）。 |
| ⏭️ **下一曲 / 切歌** | “切歌”<br>“换一首”<br>“下一首”<br>“不要这首”<br>“下一曲” | 控制当前音箱无缝切换至下一首曲目（内置 5s 防抖去重）。 |
| ⏮️ **上一曲 / 重播** | “上一首”<br>“上一曲”<br>“重播上一首” | 控制当前音箱切换至上一首曲目。 |
| ⏸️ **暂停 / 停止** | “暂停音乐”<br>“别放了”<br>“停止播放”<br>“闭嘴”<br>“暂停” | 立即暂停或停止音箱当前的私有音乐流播放。 |

---

### 二、快速上手流程

1. **开启语音监听**：
   - 登录 Tinglan 网页端，点击顶部导航 **【音箱中枢】** ➔ 进入 **【语音口令与点歌】** 子标签。
   - 点击 **【启动语音监听】** 按钮（状态变为 `● 正在自适应捕获中`）。
   - 在下拉菜单中可选择 **指定监听音箱** 或默认监听全部音箱。

2. **开启/关闭 TTS 语音应答反馈**：
   - 点击 **【语音应答 (TTS)】** 开关。开启后，小爱音箱在命中点歌口令时会语音确认（如：“好的，为您播放 稻香”），随后秒级起播。

3. **免开嗓模拟测试与调试**：
   - 在页面中部的 **【语音口令调试与模拟测试器】** 输入框中输入测试文本（例如输入 `点歌 晴天` 或 `随便放首歌`），点击 **【测试指令匹配与执行】**。
   - 系统将立即展示匹配规则、关键词提取结果并实时触发音箱投播，便于调试规则。

4. **自定义规则与触发词库**：
   - 点击 **【+ 添加口令规则】** 或规则卡片上的 **【编辑】** 按钮。
   - 支持自定义触发词库（多个词逗号分隔）、动作类型（搜歌/随机/歌单/播控）、绑定指定歌单以及个性化 TTS 应答文本。

---

### 三、进阶技巧：配置「小爱训练计划」彻底解决官方抢断问题（可选）

> 💡 **原理提示**：
> 默认情况下，Tinglan 通过 Mina 云端对话通道**开箱即用**。但由于小米官方小爱音箱在听到“播放xxx”时，会默认去官方 QQ音乐/小米音乐搜索。若您的音箱未开通官方绿钻会员，小爱可能会同时报出“正在为您播放试听版”或“没有找到该歌曲”。

如果您希望实现媲美原生官方体验的无缝拦截，推荐在手机 **小爱音箱 App** 或 **米家 App** 中配置小爱训练计划：

1. 打开手机 **【小爱音箱 App】**（或米家 App ➔ 点击对应音箱卡片）。
2. 进入 **【技能中心】** ➔ **【小爱训练计划】** ➔ 点击 **【创建训练】**（或【+ 个人训练】）。
3. **设置触发词**：
   - 填写：“播放私房歌”、“点歌”、“播放本地歌”或“放点好听的”。
4. **设置执行动作**：
   - 选择 **【设备控制】** 或 **【文字回答】**。
   - 填写文字回复内容：“好的，正在为您唤醒私有音乐库”。
5. **保存生效**：
   - 配置完成后，当您对音箱说出该口令时，小爱将不再去官方音乐库搜索报错，Tinglan 服务端将在 1-2 秒内自动截获指令并秒级无缝接管无损音频串流！
