# Tinglan (听澜) - 小米智能音箱音乐中枢与高保真流媒体服务

> 专为**小米智能音箱全系列**（小爱音箱 Pro、Xiaomi Sound Pro、小爱触屏音箱、小爱音箱 Play 等）及家庭私有 NAS 打造的高保真本地音乐流媒体中枢、MIoT 协议播控中心与 LRC 动态动效歌词平台。

---

## 🌟 核心功能特性

1. **高保真私有音乐库**：
   - 支持 FLAC 24bit/96kHz、320kbps MP3、WAV、M4A、OGG 等多种无损与高码率音频格式。
   - 自动扫描挂载的本地音乐目录，实时读取歌曲元数据、专辑封面与 ID3 标签。
   - 内置 LRC 同步时间轴歌词引擎与黑胶唱片律动视觉呈现。

2. **小米音箱全协议直连与投播 (MIoT / Mina)**：
   - **真实云端 Mina 指令通道**：集成 Xiaomi Passport STS 鉴权与 Mina UBUS 通信接口，下发 `player_play_url` 播放指令。
   - **局域网 Token / IP 直连通道**：支持直接输入 32 位局域网 Device Token 绕过云端 2FA 风控，实现毫秒级局域网播控。
   - **标准 HTTP 206 Partial Content 分片流媒体**：全面支持 `Accept-Ranges: bytes` 分块拉流，保障小爱音箱硬件 DSP 解码器流畅解码。
   - **小爱同学原声 TTS 播报**：支持投播前自动语音播报歌名、问候语或自定义广播。
   - **设备管理与网络探测**：支持多音箱切换、设备编辑、添加自定义音箱、一键清空与实时 TCP Ping 端口握手探测。

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
