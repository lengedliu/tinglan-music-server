import http from 'http';
import dgram from 'dgram';

export interface DlnaEndpoint {
  ip: string;
  port: number;
  controlUrl: string;
  renderingControlUrl?: string;
  friendlyName?: string;
  modelName?: string;
}

// In-memory cache for discovered DLNA endpoints: ip -> DlnaEndpoint
const dlnaEndpointCache = new Map<string, DlnaEndpoint>();

// Standard DLNA ports used by XiaoAi speakers and UPnP MediaRenderers
const COMMON_DLNA_PORTS = [1420, 49152, 49153, 49154, 8008, 1900, 52235, 38400, 8080];

/**
 * Escapes XML special characters
 */
function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Perform a raw HTTP POST with SOAP envelope
 */
function sendSoapRequest(
  ip: string,
  port: number,
  path: string,
  serviceType: string,
  action: string,
  bodyXml: string,
  timeoutMs = 1500
): Promise<{ success: boolean; statusCode: number; responseText: string; error?: string }> {
  return new Promise((resolve) => {
    let finished = false;
    const postData = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}">
      ${bodyXml}
    </u:${action}>
  </s:Body>
</s:Envelope>`;

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const options: http.RequestOptions = {
      hostname: ip,
      port,
      path: normalizedPath,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': Buffer.byteLength(postData, 'utf8'),
        'SOAPAction': `"${serviceType}#${action}"`,
        'User-Agent': 'TinglanMusic/1.0 DLNA/1.5 UPnP/1.0',
        'Connection': 'close'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        const statusCode = res.statusCode || 200;
        const isOk = statusCode >= 200 && statusCode < 300;
        resolve({
          success: isOk,
          statusCode,
          responseText: data
        });
      });
    });

    // Hard timeout timer to break through stalled TCP SYN handshakes
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { req.destroy(new Error('Connect timeout')); } catch {}
      resolve({ success: false, statusCode: 408, responseText: '', error: `SOAP 请求超时 (${timeoutMs}ms)` });
    }, timeoutMs);

    req.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ success: false, statusCode: 500, responseText: '', error: err.message });
    });

    try {
      req.write(postData);
      req.end();
    } catch (e: any) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ success: false, statusCode: 500, responseText: '', error: e.message });
      }
    }
  });
}

/**
 * Simple HTTP GET for XML fetching with strict connection timeout
 */
function httpGet(urlStr: string, timeoutMs = 800): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve) => {
    let finished = false;
    let timer: NodeJS.Timeout | null = null;
    try {
      const url = new URL(urlStr);
      const req = http.get({
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 80,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'TinglanMusic/1.0 UPnP/1.0',
          'Connection': 'close'
        }
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (finished) return;
          finished = true;
          if (timer) clearTimeout(timer);
          resolve({ ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300, status: res.statusCode || 200, text: body });
        });
      });

      timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        try { req.destroy(new Error('Connect timeout')); } catch {}
        resolve({ ok: false, status: 408, text: '' });
      }, timeoutMs);

      req.on('error', () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        resolve({ ok: false, status: 500, text: '' });
      });
    } catch {
      resolve({ ok: false, status: 500, text: '' });
    }
  });
}

export class DlnaEngine {
  /**
   * Fast, non-blocking probe for DLNA AVTransport control endpoint on a given IP
   * XiaoAi speakers (Pro, Sound, Sound Pro, Art, Touchscreen) listen on port 1420 or 49152/49153/49154.
   */
  public async probeDevice(ip: string, preferredPort?: number): Promise<DlnaEndpoint | null> {
    const cleanIp = ip.trim();
    if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === 'localhost') return null;

    // Check cache first
    const cached = dlnaEndpointCache.get(cleanIp);
    if (cached) return cached;

    // Standard XiaoAi ports: 1420 (primary XiaoAi DLNA), 49152/49153/49154 (secondary UPnP), 8008 (Cast)
    const portsToTry = preferredPort ? [preferredPort, 1420, 49152, 49153, 49154, 8008] : [1420, 49152, 49153, 49154, 8008];
    const uniquePorts = Array.from(new Set(portsToTry));

    console.log(`[DLNA Probe] 正在探测音箱 ${cleanIp} 候选端口 [${uniquePorts.join(', ')}]...`);

    const xmlPaths = ['/description.xml', '/rootDesc.xml', '/upnp/description.xml'];
    const probeTasks: Promise<DlnaEndpoint | null>[] = [];

    for (const port of uniquePorts) {
      // 1. Try XML descriptor endpoints
      for (const xmlPath of xmlPaths) {
        probeTasks.push(
          httpGet(`http://${cleanIp}:${port}${xmlPath}`, 1500).then(res => {
            if (res.ok && (res.text.includes('AVTransport') || res.text.includes('MediaRenderer') || res.text.includes('RenderingControl'))) {
              const ep = this.parseDeviceXml(cleanIp, port, res.text);
              if (ep) {
                console.log(`[DLNA Probe] ✅ 发现设备描述文件: http://${cleanIp}:${port}${xmlPath} (${ep.friendlyName || 'Speaker'})`);
                return ep;
              }
            }
            return null;
          }).catch(() => null)
        );
      }

      // 2. Direct SOAP GetTransportInfo on /upnp/control/AVTransport (for speakers with hidden XML descriptors)
      probeTasks.push(
        sendSoapRequest(
          cleanIp,
          port,
          '/upnp/control/AVTransport',
          'urn:schemas-upnp-org:service:AVTransport:1',
          'GetTransportInfo',
          '<InstanceID>0</InstanceID>',
          1500
        ).then(soapRes => {
          if (soapRes.statusCode === 200 || (soapRes.responseText && (soapRes.responseText.includes('UPnPError') || soapRes.responseText.includes('TransportInfo') || soapRes.responseText.includes('CurrentTransportState')))) {
            console.log(`[DLNA Probe] ✅ 发现活动 AVTransport SOAP 端口: ${cleanIp}:${port}`);
            return {
              ip: cleanIp,
              port,
              controlUrl: '/upnp/control/AVTransport',
              renderingControlUrl: '/upnp/control/RenderingControl',
              friendlyName: `小爱音箱 (${cleanIp})`
            } as DlnaEndpoint;
          }
          return null;
        }).catch(() => null)
      );
    }

    try {
      const results = await Promise.allSettled(probeTasks);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          dlnaEndpointCache.set(cleanIp, r.value);
          console.log(`[DLNA] 成功识别并锁定 MediaRenderer 端点: ${cleanIp}:${r.value.port}${r.value.controlUrl}`);
          return r.value;
        }
      }
    } catch {}

    console.warn(`[DLNA Probe] ⚠️ 未能在端口 [${uniquePorts.join(', ')}] 自动捕获到活动 DLNA 服务`);
    return null;
  }

  /**
   * Parse UPnP Device Description XML
   */
  private parseDeviceXml(ip: string, port: number, xmlText: string): DlnaEndpoint | null {
    try {
      // Find AVTransport service
      const avMatch = xmlText.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:1<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      if (!avMatch) return null;

      let controlUrl = avMatch[1].trim();
      if (!controlUrl.startsWith('/')) controlUrl = `/${controlUrl}`;

      // Rendering control for volume
      let renderingControlUrl: string | undefined;
      const rcMatch = xmlText.match(/<serviceType>urn:schemas-upnp-org:service:RenderingControl:1<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      if (rcMatch) {
        renderingControlUrl = rcMatch[1].trim();
        if (!renderingControlUrl.startsWith('/')) renderingControlUrl = `/${renderingControlUrl}`;
      }

      // Friendly Name
      const nameMatch = xmlText.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1].trim() : undefined;

      // Model Name
      const modelMatch = xmlText.match(/<modelName>(.*?)<\/modelName>/i);
      const modelName = modelMatch ? modelMatch[1].trim() : undefined;

      return {
        ip,
        port,
        controlUrl,
        renderingControlUrl,
        friendlyName,
        modelName
      };
    } catch {
      return null;
    }
  }

  /**
   * Cast song audio stream to speaker via standard DLNA AVTransport
   */
  public async castSong(
    ip: string,
    streamUrl: string,
    metadata: {
      title?: string;
      artist?: string;
      album?: string;
      duration?: number;
    } = {}
  ): Promise<{ success: boolean; port?: number; controlUrl?: string; error?: string; latency?: number }> {
    const t0 = Date.now();
    console.log(`[DLNA] 准备向音箱 ${ip} 发送 DLNA 媒体流: ${streamUrl}`);

    let endpoint = await this.probeDevice(ip);

    // If probing description XML failed, try direct XiaoAi default port 1420 & 49152
    if (!endpoint) {
      console.log(`[DLNA] 正在尝试小爱标准直接端点 fallback (${ip}:1420 & ${ip}:49152)...`);
      const fallbackPorts = [1420, 49152];
      for (const fPort of fallbackPorts) {
        const testRes = await sendSoapRequest(
          ip,
          fPort,
          '/upnp/control/AVTransport',
          'urn:schemas-upnp-org:service:AVTransport:1',
          'GetTransportInfo',
          '<InstanceID>0</InstanceID>',
          1200
        );
        if (testRes.statusCode === 200 || (testRes.responseText && (testRes.responseText.includes('UPnPError') || testRes.responseText.includes('TransportInfo')))) {
          endpoint = {
            ip,
            port: fPort,
            controlUrl: '/upnp/control/AVTransport',
            renderingControlUrl: '/upnp/control/RenderingControl',
            friendlyName: `小爱音箱 (${ip})`
          };
          dlnaEndpointCache.set(ip, endpoint);
          console.log(`[DLNA] ✅ 直接端点命中: ${ip}:${fPort}/upnp/control/AVTransport`);
          break;
        }
      }
    }

    if (!endpoint) {
      const err = `未能发现设备 ${ip} 的 DLNA 影音渲染服务（请在小爱音箱 App 中开启【DLNA】支持，并确保与服务端处于同局域网）`;
      console.warn(`[DLNA] ❌ ${err}`);
      return {
        success: false,
        error: err
      };
    }

    const title = escapeXml(metadata.title || '未知曲目');
    const artist = escapeXml(metadata.artist || '未知歌手');
    const album = escapeXml(metadata.album || 'Tinglan Music');
    const escapedUrl = escapeXml(streamUrl);

    // DIDL-Lite metadata compliant with XiaoAi and standard DLNA renderers
    const didlMeta = `&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;item id="0" parentID="-1" restricted="1"&gt;&lt;dc:title&gt;${title}&lt;/dc:title&gt;&lt;dc:creator&gt;${artist}&lt;/dc:creator&gt;&lt;upnp:album&gt;${album}&lt;/upnp:album&gt;&lt;upnp:class&gt;object.item.audioItem.musicTrack&lt;/upnp:class&gt;&lt;res protocolInfo="http-get:*:audio/mpeg:*"&gt;${escapedUrl}&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`;

    // 1. Try Stop first (silently ignore failure)
    try {
      await sendSoapRequest(
        endpoint.ip,
        endpoint.port,
        endpoint.controlUrl,
        'urn:schemas-upnp-org:service:AVTransport:1',
        'Stop',
        '<InstanceID>0</InstanceID>',
        800
      );
    } catch {}

    // 2. Send SetAVTransportURI
    const setUriBody = `<InstanceID>0</InstanceID>
<CurrentURI>${escapedUrl}</CurrentURI>
<CurrentURIMetaData>${didlMeta}</CurrentURIMetaData>`;

    const setUriRes = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      endpoint.controlUrl,
      'urn:schemas-upnp-org:service:AVTransport:1',
      'SetAVTransportURI',
      setUriBody,
      2500
    );

    console.log(`[DLNA] [${endpoint.ip}:${endpoint.port}] SetAVTransportURI 响应: status=${setUriRes.statusCode}, success=${setUriRes.success}`);

    if (!setUriRes.success && setUriRes.statusCode !== 200) {
      // Retry SetAVTransportURI with empty metadata (some lightweight UPnP renderers fail on long DIDL metadata)
      const simpleSetUri = await sendSoapRequest(
        endpoint.ip,
        endpoint.port,
        endpoint.controlUrl,
        'urn:schemas-upnp-org:service:AVTransport:1',
        'SetAVTransportURI',
        `<InstanceID>0</InstanceID><CurrentURI>${escapedUrl}</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`,
        2000
      );

      console.log(`[DLNA] [${endpoint.ip}:${endpoint.port}] SetAVTransportURI 简化重试: status=${simpleSetUri.statusCode}, success=${simpleSetUri.success}`);

      if (!simpleSetUri.success) {
        const err = `DLNA SetAVTransportURI 拒绝: ${simpleSetUri.error || simpleSetUri.responseText || '音箱拒绝解析串流地址'}`;
        console.warn(`[DLNA] ❌ ${err}`);
        return {
          success: false,
          port: endpoint.port,
          controlUrl: endpoint.controlUrl,
          error: err
        };
      }
    }

    // 3. Send Play
    const playRes = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      endpoint.controlUrl,
      'urn:schemas-upnp-org:service:AVTransport:1',
      'Play',
      '<InstanceID>0</InstanceID><Speed>1</Speed>',
      2000
    );

    console.log(`[DLNA] [${endpoint.ip}:${endpoint.port}] Play 响应: status=${playRes.statusCode}, success=${playRes.success}`);

    const elapsed = Date.now() - t0;

    if (playRes.success || playRes.statusCode === 200) {
      return {
        success: true,
        port: endpoint.port,
        controlUrl: endpoint.controlUrl,
        latency: elapsed
      };
    }

    // Some devices require brief delay before Play command
    await new Promise((r) => setTimeout(r, 300));
    const retryPlay = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      endpoint.controlUrl,
      'urn:schemas-upnp-org:service:AVTransport:1',
      'Play',
      '<InstanceID>0</InstanceID><Speed>1</Speed>',
      2000
    );

    console.log(`[DLNA] [${endpoint.ip}:${endpoint.port}] Play 延迟重试: status=${retryPlay.statusCode}, success=${retryPlay.success}`);

    return {
      success: retryPlay.success || retryPlay.statusCode === 200,
      port: endpoint.port,
      controlUrl: endpoint.controlUrl,
      error: retryPlay.success ? undefined : (retryPlay.error || 'DLNA Play 指令未获响应'),
      latency: Date.now() - t0
    };
  }

  /**
   * Resume/Play playback via DLNA
   */
  public async play(ip: string): Promise<{ success: boolean; error?: string }> {
    const endpoint = await this.probeDevice(ip);
    if (!endpoint) return { success: false, error: '未找到 DLNA 设备' };

    const res = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      endpoint.controlUrl,
      'urn:schemas-upnp-org:service:AVTransport:1',
      'Play',
      '<InstanceID>0</InstanceID><Speed>1</Speed>',
      2000
    );
    return { success: res.success, error: res.error };
  }

  /**
   * Pause playback via DLNA
   */
  public async pause(ip: string): Promise<{ success: boolean; error?: string }> {
    const endpoint = await this.probeDevice(ip);
    if (!endpoint) return { success: false, error: '未找到 DLNA 设备' };

    const res = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      endpoint.controlUrl,
      'urn:schemas-upnp-org:service:AVTransport:1',
      'Pause',
      '<InstanceID>0</InstanceID>',
      2000
    );
    return { success: res.success, error: res.error };
  }

  /**
   * Stop playback via DLNA
   */
  public async stop(ip: string): Promise<{ success: boolean; error?: string }> {
    const endpoint = await this.probeDevice(ip);
    if (!endpoint) return { success: false, error: '未找到 DLNA 设备' };

    const res = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      endpoint.controlUrl,
      'urn:schemas-upnp-org:service:AVTransport:1',
      'Stop',
      '<InstanceID>0</InstanceID>',
      2000
    );
    return { success: res.success, error: res.error };
  }

  /**
   * Set speaker volume via UPnP RenderingControl
   */
  public async setVolume(ip: string, volume: number): Promise<{ success: boolean; error?: string }> {
    const endpoint = await this.probeDevice(ip);
    if (!endpoint) return { success: false, error: '未找到 DLNA 设备' };

    const ctrlUrl = endpoint.renderingControlUrl || '/upnp/control/RenderingControl';
    const vol = Math.max(0, Math.min(100, Math.round(volume)));

    const res = await sendSoapRequest(
      endpoint.ip,
      endpoint.port,
      ctrlUrl,
      'urn:schemas-upnp-org:service:RenderingControl:1',
      'SetVolume',
      `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${vol}</DesiredVolume>`,
      2000
    );
    return { success: res.success, error: res.error };
  }

  /**
   * Test DLNA connectivity and response time
   */
  public async testConnection(ip: string): Promise<{ reachable: boolean; port?: number; friendlyName?: string; latency: number; message: string }> {
    const t0 = Date.now();
    const endpoint = await this.probeDevice(ip);
    const latency = Date.now() - t0;

    if (endpoint) {
      return {
        reachable: true,
        port: endpoint.port,
        friendlyName: endpoint.friendlyName,
        latency,
        message: `✓ DLNA 局域网影音服务连通 (端口: ${endpoint.port}, 延迟: ${latency}ms, ${endpoint.friendlyName || '小爱音箱'})`
      };
    }

    return {
      reachable: false,
      latency,
      message: `设备 ${ip} 未响应 DLNA (端口 1420/49152/8008 无 UPnP 服务，请在小爱音箱 App 开启 DLNA)`
    };
  }
}

export const dlnaEngine = new DlnaEngine();
