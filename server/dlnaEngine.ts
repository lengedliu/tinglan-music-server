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
  timeoutMs = 2500
): Promise<{ success: boolean; statusCode: number; responseText: string; error?: string }> {
  return new Promise((resolve) => {
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
      timeout: timeoutMs,
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
        const statusCode = res.statusCode || 200;
        const isOk = statusCode >= 200 && statusCode < 300;
        resolve({
          success: isOk,
          statusCode,
          responseText: data
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, statusCode: 408, responseText: '', error: `SOAP 请求超时 (${timeoutMs}ms)` });
    });

    req.on('error', (err) => {
      resolve({ success: false, statusCode: 500, responseText: '', error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Simple HTTP GET for XML fetching
 */
function httpGet(urlStr: string, timeoutMs = 2000): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.get({
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 80,
        path: url.pathname + url.search,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'TinglanMusic/1.0 UPnP/1.0'
        }
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          resolve({ ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300, status: res.statusCode || 200, text: body });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 408, text: '' });
      });

      req.on('error', () => {
        resolve({ ok: false, status: 500, text: '' });
      });
    } catch {
      resolve({ ok: false, status: 500, text: '' });
    }
  });
}

export class DlnaEngine {
  /**
   * Probe and find DLNA AVTransport control endpoint on a given IP
   */
  public async probeDevice(ip: string, preferredPort?: number): Promise<DlnaEndpoint | null> {
    const cleanIp = ip.trim();
    if (!cleanIp) return null;

    // Check cache first
    const cached = dlnaEndpointCache.get(cleanIp);
    if (cached) return cached;

    const portsToTry: number[] = [];
    if (preferredPort && !portsToTry.includes(preferredPort)) {
      portsToTry.push(preferredPort);
    }
    for (const p of COMMON_DLNA_PORTS) {
      if (!portsToTry.includes(p)) portsToTry.push(p);
    }

    // Try probing known description paths
    const descPaths = ['/description.xml', '/upnp/dev/0', '/MediaRenderer_desc.xml', '/rootDesc.xml', '/dd.xml'];

    for (const port of portsToTry) {
      for (const p of descPaths) {
        try {
          const res = await httpGet(`http://${cleanIp}:${port}${p}`, 1000);
          if (res.ok && res.text.includes('AVTransport')) {
            const endpoint = this.parseDeviceXml(cleanIp, port, res.text);
            if (endpoint) {
              dlnaEndpointCache.set(cleanIp, endpoint);
              console.log(`[DLNA] Found MediaRenderer on ${cleanIp}:${port} (${endpoint.friendlyName || 'Speaker'})`);
              return endpoint;
            }
          }
        } catch {}
      }
    }

    // Fallback: Test direct SOAP AVTransport ping on common paths without full description.xml
    const commonControlPaths = [
      '/upnp/control/AVTransport',
      '/upnp/control/AVTransport1',
      '/AVTransport/control',
      '/AVTransport/control.xml',
      '/MediaRenderer/AVTransport/control'
    ];

    for (const port of portsToTry.slice(0, 4)) {
      for (const ctrlPath of commonControlPaths) {
        try {
          const probe = await sendSoapRequest(
            cleanIp,
            port,
            ctrlPath,
            'urn:schemas-upnp-org:service:AVTransport:1',
            'GetTransportInfo',
            '<InstanceID>0</InstanceID>',
            800
          );
          // If the endpoint returned 200 or 500 SOAP Fault with UPnP error code, it IS a valid AVTransport endpoint!
          if (probe.statusCode === 200 || (probe.responseText && probe.responseText.includes('UPnPError'))) {
            const endpoint: DlnaEndpoint = {
              ip: cleanIp,
              port,
              controlUrl: ctrlPath,
              renderingControlUrl: '/upnp/control/RenderingControl',
              friendlyName: `小爱音箱 (${cleanIp})`
            };
            dlnaEndpointCache.set(cleanIp, endpoint);
            console.log(`[DLNA] Direct SOAP probe confirmed AVTransport on ${cleanIp}:${port}${ctrlPath}`);
            return endpoint;
          }
        } catch {}
      }
    }

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
    const endpoint = await this.probeDevice(ip);

    if (!endpoint) {
      return {
        success: false,
        error: `未能发现设备 ${ip} 的 DLNA 影音渲染服务（请确认小爱音箱 App 中已开启【DLNA】投屏开关，且处于同局域网）`
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
        1000
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

      if (!simpleSetUri.success) {
        return {
          success: false,
          port: endpoint.port,
          controlUrl: endpoint.controlUrl,
          error: `DLNA SetAVTransportURI 拒绝: ${simpleSetUri.error || simpleSetUri.responseText || '音箱拒绝解析串流地址'}`
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

    return {
      success: retryPlay.success || retryPlay.statusCode === 200,
      port: endpoint.port,
      controlUrl: endpoint.controlUrl,
      error: retryPlay.success ? undefined : (retryPlay.error || 'DLNA Play 指令未获响应'),
      latency: Date.now() - t0
    };
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
