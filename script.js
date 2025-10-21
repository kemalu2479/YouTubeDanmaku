// ==UserScript==
// @name         YouTube Danmaku
// @namespace    https://ytdmk.astrarails.org
// @version      1.6.2-dev
// @description  YouTube 弹幕 (早期开发版本)
// @author       TianmuTNT
// @license      GPL-3.0
// @match        https://www.youtube.com/watch*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const log = (...a) => console.log('[YTDanmaku]', ...a);
  const LS_KEY = 'yt_danmaku_settings_v154';

  const defaultSettings = {
    enabled: true,
    maxOnScreen: 100,
    speedScale: 1.0,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 1.0,
    areaPercent: 100,
    trackCount: 8
  };

  function loadSettings() {
    try { return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; }
    catch { return { ...defaultSettings }; }
  }
  function saveSettings(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  let SETTINGS = loadSettings();

  const TS_RE_GLOBAL = /(\b\d{1,2}:\d{1,2}:\d{2}\b|\b\d{1,2}:\d{2}\b)/g;
  function timeStrToSec(str) {
    const m3 = str.match(/^(\d{1,2}):(\d{1,2}):(\d{2})$/);
    if (m3) { const [, h, m, s] = m3; const hh=+h, mm=+m, ss=+s; if (mm<60&&ss<60) return hh*3600+mm*60+ss; return null; }
    const m2 = str.match(/^(\d{1,2}):(\d{2})$/);
    if (m2) { const [, m, s] = m2; const mm=+m, ss=+s; if (mm<60&&ss<60) return mm*60+ss; }
    return null;
  }

  function extractFromYTDanmaku(text){
    const raw = (text||'').replace(/\r\n/g, '\n').trim();
    const lines = raw.split('\n').map(s=>s.trim());
    if (!lines[0] || !/^\[youtube\s*danmaku\]$/i.test(lines[0])) return null;
    for (let i=1;i<lines.length;i++){
      const line = lines[i];
      if (line.startsWith('*')) continue;
      const m = line.match(/^(\d{1,2}:\d{1,2}:\d{2}|\d{1,2}:\d{2})\s+(.+)$/);
      if (!m) continue;
      const sec = timeStrToSec(m[1]);
      if (sec==null) continue;
      const textOnly = m[2].trim();
      if (!textOnly) continue;
      return { time: sec, text: textOnly, isYD: true };
    }
    return null;
  }

  function extractSingleTimestampEntry(text) {
    const ytd = extractFromYTDanmaku(text);
    if (ytd) return ytd;
    text = (text || '').trim();
    if (!text) return null;
    const hits = [...text.matchAll(TS_RE_GLOBAL)].map(m => m[0]);
    if (hits.length !== 1) return null;
    const t = timeStrToSec(hits[0]);
    if (t == null) return null;
    const content = text.replace(hits[0], '').trim().replace(/^[\-\–\—:：\s]+/, '');
    if (/^\[youtube\s*danmaku\]$/i.test(content)) return null;
    if (/^(\*|This is a Youtube Danmaku)/i.test(content)) return null;
    return { time: t, text: content || hits[0], isYD: false };
  }

  function getCurrentTimeSeconds() {
    const video = document.querySelector('video.video-stream.html5-main-video');
    if (video && typeof video.currentTime === 'number') return video.currentTime;
    const bar = document.querySelector('.ytp-progress-bar');
    if (bar) {
      const v = bar.getAttribute('aria-valuenow');
      if (v != null && v !== '' && !Number.isNaN(+v)) return +v;
    }
    return 0;
  }

  function secToClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad2 = (n)=> String(n).padStart(2,'0');
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }

  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const e2 = document.querySelector(selector);
        if (e2) { obs.disconnect(); resolve(e2); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      if (timeout) setTimeout(() => { obs.disconnect(); reject(new Error(`Wait for ${selector} timeout`)); }, timeout);
    });
  }

  function updateLoadedCount(n) {
    if (!countLine) return;
    n = Number(n) || 0;
    countLine.textContent = `已加载 ${n} 条弹幕`;
  }

  function toast(msg, ok=false){
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position:'fixed', left:'50%', top:'12%', transform:'translateX(-50%)',
      background: ok ? 'rgba(0,160,80,.9)' : 'rgba(0,0,0,.85)',
      color:'#fff', padding:'8px 12px', borderRadius:'8px', zIndex:2147483647
    });
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), 1600);
  }

  let settingsBtn = null;
  let sendBox = null;
  let sendBtn = null;
  let settingsPanel = null;
  let controlsWrap = null;
  let countLine = null;

  function svgIcon() {
    return `
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="white" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.5 3.5A1 1 0 0 1 3 19V6a2 2 0 0 1 1-2z" opacity="0.28"/>
        <rect x="6" y="7" width="12" height="2" rx="1" fill="white"/>
        <rect x="6" y="11" width="10" height="2" rx="1" fill="white"/>
        <rect x="6" y="15" width="8" height="2" rx="1" fill="white"/>
      </svg>
    `;
  }
  function svgSend() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  }

  function injectControlsUnderTitle() {
    const titleRoot = document.querySelector('ytd-watch-metadata #title.style-scope.ytd-watch-metadata');
    const h1 = titleRoot?.querySelector('h1.style-scope.ytd-watch-metadata');
    if (!titleRoot || !h1) return false;
    if (!controlsWrap || !controlsWrap.isConnected) {
      controlsWrap = document.createElement('div');
      controlsWrap.className = 'yd-controls-wrap';
      controlsWrap.style.cssText = `
        display:flex; flex-wrap:wrap; align-items:center; gap:10px;
        margin-top:8px;
      `;
      h1.insertAdjacentElement('afterend', controlsWrap);
    }
    if (!settingsBtn || !settingsBtn.isConnected || settingsBtn.parentElement !== controlsWrap) {
      if (settingsBtn?.isConnected) settingsBtn.remove();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yd-settings-btn';
      btn.setAttribute('aria-label', '弹幕设置');
      btn.title = '弹幕设置';
      btn.innerHTML = svgIcon();
      btn.style.cssText = `
        display:inline-flex;align-items:center;justify-content:center;
        height:36px;width:36px;border:1px solid rgba(255,255,255,0.25);
        border-radius:10px;background:rgba(255,255,255,0.08);
        cursor:pointer;flex:0 0 auto;
      `;
      btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.14)';
      btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.08)';
      btn.addEventListener('click', () => toggleSettingsPanel(btn));
      controlsWrap.appendChild(btn);
      settingsBtn = btn;
    }
    if (!sendBox || !sendBox.isConnected || sendBox.parentElement !== controlsWrap) {
      if (sendBox?.isConnected) sendBox.remove();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'yd-send-input';
      input.placeholder = '发送弹幕…（回车发送）';
      Object.assign(input.style, {
        height: '36px', flex: '1 1 380px', minWidth: '200px', maxWidth: '560px',
        padding: '0 12px', color: '#fff',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.20)',
        borderRadius: '10px', outline: 'none'
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); trySendComment(); }
      });
      controlsWrap.appendChild(input);
      sendBox = input;
    }
    if (!sendBtn || !sendBtn.isConnected || sendBtn.parentElement !== controlsWrap) {
      if (sendBtn?.isConnected) sendBtn.remove();
      const sbtn = document.createElement('button');
      sbtn.type = 'button';
      sbtn.className = 'yd-send-btn';
      sbtn.title = '发送弹幕';
      sbtn.innerHTML = svgSend();
      Object.assign(sbtn.style, {
        height: '36px', width: '40px', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#fff', background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.20)', borderRadius: '10px',
        cursor: 'pointer', flex: '0 0 auto'
      });
      sbtn.onmouseenter = () => sbtn.style.background = 'rgba(255,255,255,0.18)';
      sbtn.onmouseleave = () => sbtn.style.background = 'rgba(255,255,255,0.12)';
      sbtn.addEventListener('click', trySendComment);
      controlsWrap.appendChild(sbtn);
      sendBtn = sbtn;
    }
    if (!countLine || !countLine.isConnected) {
      countLine = document.createElement('div');
      countLine.className = 'yd-count-line';
      countLine.style.cssText = `margin-top:6px;color:#aaa;font-size:12px;`;
      controlsWrap.insertAdjacentElement('afterend', countLine);
    }
    updateLoadedCount(collected.length);
    return true;
  }

  function toggleSettingsPanel(anchorBtn) {
    if (settingsPanel && settingsPanel.isConnected) {
      teardownPanelPositioning(); settingsPanel.remove(); settingsPanel = null; return;
    }
    const panel = document.createElement('div');
    panel.style.cssText = `
      position:fixed;left:0;top:0;min-width:320px;max-width:400px;
      background:rgba(20,20,20,0.96);border:1px solid rgba(255,255,255,0.12);
      border-radius:12px;padding:12px 12px 10px;color:#fff;
      font:400 13px/1.5 system-ui,-apple-system, Segoe UI, Roboto, Arial;
      box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:2147483647;pointer-events:auto;
    `;
    const baseCSS = `
      .yd-row{margin:10px 0;}
      .yd-row>.yd-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#ddd}
      .yd-row input[type="range"]{width:100%}
      .yd-input, .yd-select{
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.20);
        border-radius: 8px;color: #fff;padding: 6px 12px;width: 100%;outline: none;
      }
      .yd-select{
        appearance: none;-webkit-appearance: none;padding-right: 40px;
        background-image:
          linear-gradient(45deg, transparent 50%, #ccc 50%),
          linear-gradient(135deg, #ccc 50%, transparent 50%);
        background-position: right 16px center, right 10px center;
        background-size: 6px 6px, 6px 6px;background-repeat: no-repeat;
      }
      .yd-input:focus, .yd-select:focus{border-color: rgba(255,255,255,0.38);box-shadow: 0 0 0 2px rgba(255,255,255,0.10) inset;}
      .yd-select option{color: #000;background: #fff;}
      .yd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .yd-switch{display:flex;align-items:center;gap:8px}
      .yd-muted{color:#aaa}
      .yd-footer{display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:#bbb}
      .yd-btn{background:transparent;border:1px solid rgba(255,255,255,0.25);color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;}
      .yd-btn:hover{background:rgba(255,255,255,0.08);}
      .yd-close{background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;padding:4px 8px;}
    `;
    const FONT_OPTIONS = [
      'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'Segoe UI, Arial, sans-serif',
      'Roboto, Arial, sans-serif',
      'Inter, Roboto, Arial, sans-serif',
      'Arial, Helvetica, sans-serif',
      '"PingFang SC", "Microsoft YaHei", SimHei, Arial, sans-serif',
      '"Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif',
      '"Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
      '"Source Han Sans SC", "Microsoft YaHei", Arial, sans-serif',
      'Menlo, Consolas, "SF Mono", monospace'
    ];
    const fontOptionsHTML = FONT_OPTIONS.map(f =>
      `<option value="${f.replace(/"/g, '&quot;')}" ${SETTINGS.fontFamily === f ? 'selected' : ''}>${f}</option>`
    ).join('');
    panel.innerHTML = `
      <style>${baseCSS}</style>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-weight:600;">弹幕设置</div>
        <button class="yd-close" aria-label="Close">✕</button>
      </div>
      <div class="yd-row yd-switch">
        <input type="checkbox" id="yd-enabled"${SETTINGS.enabled ? ' checked' : ''}>
        <label for="yd-enabled">启用弹幕</label>
      </div>
      <div class="yd-row yd-grid">
        <div>
          <div class="yd-label"><span>速度倍率</span><span id="yd-speedScale-val" class="yd-muted">${SETTINGS.speedScale.toFixed(2)}</span></div>
          <input id="yd-speedScale" type="range" min="0.5" max="2" step="0.05" value="${SETTINGS.speedScale}">
        </div>
        <div>
          <div class="yd-label"><span>字号(px)</span><span id="yd-fontSize-val" class="yd-muted">${SETTINGS.fontSize}</span></div>
          <input id="yd-fontSize" type="range" min="10" max="36" step="1" value="${SETTINGS.fontSize}">
        </div>
      </div>
      <div class="yd-row yd-grid" style="align-items:end;">
        <div>
          <div class="yd-label"><span>字体</span></div>
          <select id="yd-fontFamily" class="yd-select">${fontOptionsHTML}</select>
        </div>
        <div>
          <div class="yd-label"><span>颜色</span></div>
          <input id="yd-color" type="color" value="${SETTINGS.color}">
        </div>
      </div>
      <div class="yd-row">
        <div class="yd-label"><span>不透明度</span><span id="yd-opacity-val" class="yd-muted">${SETTINGS.opacity.toFixed(2)}</span></div>
        <input id="yd-opacity" type="range" min="0.2" max="1" step="0.05" value="${SETTINGS.opacity}">
      </div>
      <div class="yd-row">
        <div class="yd-label"><span>显示区域（% 高度，自上而下）</span><span id="yd-areaPct-val" class="yd-muted">${SETTINGS.areaPercent}</span></div>
        <input id="yd-areaPct" type="range" min="10" max="100" step="1" value="${SETTINGS.areaPercent}">
      </div>
      <div class="yd-row">
        <div class="yd-label"><span>轨道数</span><span id="yd-track-val" class="yd-muted">${SETTINGS.trackCount}</span></div>
        <input id="yd-track" type="range" min="4" max="20" step="1" value="${SETTINGS.trackCount}">
      </div>
      <div class="yd-row">
        <div class="yd-label"><span>同屏最大数量</span><span id="yd-maxOnScreen-val" class="yd-muted">${SETTINGS.maxOnScreen}</span></div>
        <input id="yd-maxOnScreen" type="range" min="10" max="300" step="10" value="${SETTINGS.maxOnScreen}">
      </div>
      <div class="yd-footer">
        <span class="yd-muted">设置自动保存</span>
        <button class="yd-btn yd-close">关闭</button>
      </div>
    `;
    document.body.appendChild(panel);
    settingsPanel = panel;
    panel.querySelectorAll('.yd-close').forEach(el => el.addEventListener('click', () => toggleSettingsPanel(anchorBtn)));
    const bindRange = (id, key, valId, post = () => {}) => {
      const el = panel.querySelector(`#${id}`);
      const val = valId ? panel.querySelector(`#${valId}`) : null;
      if (!el) return;
      el.addEventListener('input', () => {
        let v = parseFloat(el.value);
        SETTINGS[key] = v;
        if (val) val.textContent = (Number.isInteger(v) ? v : v.toFixed(2));
        saveSettings(SETTINGS);
        if (key === 'fontSize' || key === 'opacity' || key === 'color' || key === 'fontFamily') Danmaku.applyRuntimeStyles();
        if (key === 'trackCount' || key === 'areaPercent') Danmaku.calculateTrack();
        post();
      });
    };
    panel.querySelector('#yd-enabled')?.addEventListener('change', e => { SETTINGS.enabled = !!e.target.checked; saveSettings(SETTINGS); });
    panel.querySelector('#yd-fontFamily')?.addEventListener('change', e => { SETTINGS.fontFamily = e.target.value; saveSettings(SETTINGS); Danmaku.applyRuntimeStyles(); });
    panel.querySelector('#yd-color')?.addEventListener('input', e => { SETTINGS.color = e.target.value || '#FFFFFF'; saveSettings(SETTINGS); Danmaku.applyRuntimeStyles(); });
    bindRange('yd-speedScale', 'speedScale', 'yd-speedScale-val');
    bindRange('yd-fontSize', 'fontSize', 'yd-fontSize-val');
    bindRange('yd-opacity', 'opacity', 'yd-opacity-val');
    bindRange('yd-areaPct', 'areaPercent', 'yd-areaPct-val');
    bindRange('yd-track', 'trackCount', 'yd-track-val');
    bindRange('yd-maxOnScreen', 'maxOnScreen', 'yd-maxOnScreen-val');

    function positionPanel() {
      if (!settingsPanel || !anchorBtn) return;
      const r = anchorBtn.getBoundingClientRect();
      const pW = settingsPanel.offsetWidth, pH = settingsPanel.offsetHeight, gap = 10;
      let left = r.right + gap, top = r.bottom + gap;
      const vw = window.innerWidth, vh = window.innerHeight;
      if (left + pW + 8 > vw) left = Math.max(8, vw - pW - 8);
      if (top + pH + 8 > vh)  top  = Math.max(8, r.top - pH - gap);
      settingsPanel.style.left = `${Math.round(left)}px`;
      settingsPanel.style.top  = `${Math.round(top)}px`;
    }
    function onScrollOrResize() { positionPanel(); }
    function setupPanelPositioning() {
      positionPanel();
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize, true);
    }
    function teardownPanelPositioning() {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize, true);
    }
    panel._teardown = teardownPanelPositioning;
    setupPanelPositioning();
  }

  const Danmaku = (() => {
    let container = null;
    let trackHeights = 0;
    let activeShots = new Set();
    let scheduled = [];
    let emitTick = null, cullTick = null, lastSecond = -1, prevTime = 0;

    function createContainer(videoEl) {
      destroy();
      const wrapper = videoEl.closest('.html5-video-player') || videoEl.parentElement || document.body;
      const c = document.createElement('div');
      c.id = 'yt-danmaku-container';
      Object.assign(c.style, {
        position:'absolute', left:'0', top:'0', width:'100%', height:'100%',
        pointerEvents:'none', overflow:'hidden', zIndex:'2147483647',
      });
      const parent = wrapper;
      const prevPos = getComputedStyle(parent).position;
      if (!['relative','absolute','fixed'].includes(prevPos)) parent.style.position = 'relative';
      parent.appendChild(c);
      container = c;
      calculateTrack();
      setupPlayPauseSeekSync();
      applyRuntimeStyles();
      startCullLoop();
    }

    function calculateTrack() {
      if (!container) return;
      const h = container.clientHeight || 360;
      const vTop = 0;
      const vBottom = clamp(SETTINGS.areaPercent, 10, 100) / 100 * h;
      const usableHeight = Math.max(20, vBottom - vTop);
      const tracks = clamp(Math.round(SETTINGS.trackCount || 8), 1, 40);
      trackHeights = Math.max(16, Math.floor(usableHeight / tracks));
      container._visibleTop = vTop; container._visibleBottom = vBottom; container._tracks = tracks;
    }

    function chooseTrack() {
      const counts = new Array(container._tracks).fill(0);
      activeShots.forEach(d => { counts[d._track] = (counts[d._track] || 0) + 1; });
      let best = 0; for (let i = 1; i < counts.length; i++) if (counts[i] < counts[best]) best = i;
      return best;
    }

    function pxTranslate(el) {
      const tr = getComputedStyle(el).transform;
      if (!tr || tr === 'none') return 0;
      const m = new DOMMatrixReadOnly(tr);
      return m.m41;
    }

    function applyRuntimeStyles() {
      activeShots.forEach(div => {
        div.style.fontFamily = SETTINGS.fontFamily;
        div.style.fontSize = `${SETTINGS.fontSize}px`;
        div.style.color = SETTINGS.color;
        div.style.opacity = `${SETTINGS.opacity}`;
        div.style.textShadow = '0 1px 2px rgba(0,0,0,.55)';
      });
    }

    function makeShot(entry) {
      if (!container || !SETTINGS.enabled) return;
      if (!entry || !entry.text) return;
      if (activeShots.size >= clamp(SETTINGS.maxOnScreen, 10, 300)) return;

      const div = document.createElement('div');
      div.className = 'yt-danmaku-shot';
      Object.assign(div.style, {
        position: 'absolute', whiteSpace: 'nowrap', lineHeight: '1.2', fontWeight: '500',
        padding: '2px 6px', borderRadius: '12px',
        background: 'rgba(0,0,0,0.0)', willChange: 'transform', pointerEvents: 'none',
        fontFamily: SETTINGS.fontFamily, fontSize: `${SETTINGS.fontSize}px`,
        color: SETTINGS.color, opacity: `${SETTINGS.opacity}`,
        textShadow: '0 1px 2px rgba(0,0,0,.55)',
        display: 'inline-flex', alignItems: 'center', gap: '6px'
      });

      if (entry.isYD) {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '14');
        icon.setAttribute('height', '14');
        icon.setAttribute('aria-hidden', 'true');
        const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p1.setAttribute('fill', 'currentColor');
        p1.setAttribute('opacity', '0.5');
        p1.setAttribute('d', 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.5 3.5A1 1 0 0 1 3 19V6a2 2 0 0 1 1-2z');
        const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r1.setAttribute('x','6'); r1.setAttribute('y','7'); r1.setAttribute('width','12'); r1.setAttribute('height','2'); r1.setAttribute('rx','1'); r1.setAttribute('fill','currentColor');
        const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r2.setAttribute('x','6'); r2.setAttribute('y','11'); r2.setAttribute('width','10'); r2.setAttribute('height','2'); r2.setAttribute('rx','1'); r2.setAttribute('fill','currentColor');
        const r3 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r3.setAttribute('x','6'); r3.setAttribute('y','15'); r3.setAttribute('width','8'); r3.setAttribute('height','2'); r3.setAttribute('rx','1'); r3.setAttribute('fill','currentColor');
        icon.appendChild(p1); icon.appendChild(r1); icon.appendChild(r2); icon.appendChild(r3);
        icon.style.opacity = '0.9';
        div.appendChild(icon);
      }

      const span = document.createElement('span');
      span.textContent = entry.text;
      div.appendChild(span);

      const track = chooseTrack();
      div._track = track;
      const top = container._visibleTop + Math.max(0, track * trackHeights + 4);
      div.style.top = `${Math.round(top)}px`;
      div.style.left = 'calc(100% + 20px)';
      div.style.transform = 'translateX(0)';
      container.appendChild(div);
      void div.offsetHeight;

      const width = div.clientWidth || 200;
      const distance = (container.clientWidth || 640) + width + 40;
      const baseSpeed = 110;
      const speedText = Math.max(70, baseSpeed - Math.min(40, entry.text.length));
      const speed = clamp(speedText * clamp(SETTINGS.speedScale, 0.5, 2), 30, 400);
      const duration = distance / speed;
      div._distance = distance; div._speed = speed; div._duration = duration; div._timer = null;

      const startMove = (remain = duration, fromX = 0) => {
        div.style.transition = 'none';
        div.style.transform = `translateX(${fromX}px)`;
        void div.offsetHeight;
        div.style.transition = `transform ${remain}s linear`;
        div.style.transform = `translateX(${-distance}px)`;
        if (div._timer) clearTimeout(div._timer);
        div._timer = setTimeout(() => { activeShots.delete(div); div.remove(); }, remain * 1000 + 120);
      };

      activeShots.add(div);
      if (isPaused()) {
        div.style.transition = 'none';
        div.style.transform = 'translateX(0px)';
      } else {
        startMove(duration, 0);
      }

      div._freeze = () => {
        const curX = pxTranslate(div);
        div.style.transition = 'none';
        div.style.transform = `translateX(${curX}px)`;
        if (div._timer) clearTimeout(div._timer);
        const remainingDistance = Math.max(0, div._distance + curX);
        div._remaining = remainingDistance;
        div._remainingDuration = remainingDistance / div._speed;
      };
      div._resume = () => {
        const curX = pxTranslate(div);
        const remainingDistance = Math.max(0, div._distance + curX);
        const remain = remainingDistance / div._speed;
        if (remain <= 0.02) { activeShots.delete(div); div.remove(); return; }
        div.style.transition = 'none';
        div.style.transform = `translateX(${curX}px)`;
        void div.offsetHeight;
        div.style.transition = `transform ${remain}s linear`;
        div.style.transform = `translateX(${-div._distance}px)`;
        if (div._timer) clearTimeout(div._timer);
        div._timer = setTimeout(() => { activeShots.delete(div); div.remove(); }, remain * 1000 + 120);
      };
    }

    function schedule(comments) {
      scheduled = comments
        .filter(c => typeof c.time === 'number' && c.time >= 0 && c.text)
        .sort((a, b) => a.time - b.time);
    }

    function clearActiveShots() {
      activeShots.forEach(el => { if (el._timer) clearTimeout(el._timer); el.remove(); });
      activeShots.clear();
    }

    function tickEmit() {
      const now = getCurrentTimeSeconds();
      const nowSec = Math.floor(now);
      if (Math.abs(now - prevTime) >= 2) { clearActiveShots(); lastSecond = -1; }
      prevTime = now;
      if (nowSec === lastSecond) return;
      lastSecond = nowSec;
      if (isPaused() || !SETTINGS.enabled) return;
      if (!scheduled || scheduled.length === 0) return;

      const maxNow = clamp(SETTINGS.maxOnScreen, 10, 300);
      let i = 0;
      while (i < scheduled.length && scheduled[i].time <= nowSec) {
        if (scheduled[i].time === nowSec && activeShots.size < maxNow) {
          makeShot(scheduled[i]);
        }
        i++;
      }
    }

    function startCullLoop() {
      stopCullLoop();
      cullTick = setInterval(() => {
        if (!container) return;
        const cr = container.getBoundingClientRect();
        activeShots.forEach(div => {
          const dr = div.getBoundingClientRect();
          const rightEdge = dr.right - cr.left;
          if (rightEdge < 0) { if (div._timer) clearTimeout(div._timer); activeShots.delete(div); div.remove(); }
        });
      }, 250);
    }
    function stopCullLoop() { if (cullTick) clearInterval(cullTick); cullTick = null; }

    function start() {
      stop();
      lastSecond = -1;
      prevTime = getCurrentTimeSeconds();
      emitTick = setInterval(tickEmit, 250);
      if (isPaused()) pauseAll();
    }
    function stop() {
      if (emitTick) clearInterval(emitTick); emitTick = null;
      stopCullLoop();
      clearActiveShots();
    }
    function destroy() { stop(); if (container && container.parentNode) container.parentNode.removeChild(container); container = null; }

    function isPaused() {
      const v = document.querySelector('video.video-stream.html5-main-video');
      return v ? v.paused : false;
    }
    function pauseAll() { activeShots.forEach(el => el._freeze && el._freeze()); }
    function resumeAll() { activeShots.forEach(el => el._resume && el._resume()); }

    function setupPlayPauseSeekSync() {
      waitForElement('video.video-stream.html5-main-video', 15000).then(v => {
        v.addEventListener('pause', () => pauseAll(), { passive: true });
        v.addEventListener('play',  () => resumeAll(), { passive: true });
        const onSeekReset = () => { clearActiveShots(); lastSecond = -1; prevTime = v.currentTime || 0; };
        v.addEventListener('seeking', onSeekReset, { passive: true });
        v.addEventListener('seeked', onSeekReset, { passive: true });
      }).catch(() => {});
    }

    function instant(entry){ makeShot(entry); }

    return { createContainer, calculateTrack, schedule, start, stop, destroy, applyRuntimeStyles, instant };
  })();

  function utf8Bytes(str){ return new TextEncoder().encode(str); }
  function varint(n){ const out=[]; while(n>127){ out.push((n & 0x7f) | 0x80); n >>>= 7; } out.push(n); return out; }
  function b64urlFromBytes(bytes){
    let bin=''; const CHUNK=0x8000;
    for(let i=0;i<bytes.length;i+=CHUNK){ bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+CHUNK)); }
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function buildCreateCommentParams_videoOnly(videoId){
    const vid = utf8Bytes(videoId);
    const parts = [0x12, ...varint(vid.length), ...vid];
    return b64urlFromBytes(Uint8Array.from(parts));
  }
  function getCookie(name){
    return document.cookie.split('; ').find(s=>s.startsWith(name+'='))?.split('=').slice(1).join('=') || '';
  }
  async function buildSapisiHashHeader(){
    const origin = 'https://www.youtube.com';
    const ts = Math.floor(Date.now()/1000).toString();
    const sid = getCookie('SAPISID') || getCookie('__Secure-1PSID') || getCookie('__Secure-3PSID') || '';
    if (!sid) return null;
    const data = new TextEncoder().encode(`${ts} ${sid} ${origin}`);
    const digest = await crypto.subtle.digest('SHA-1', data);
    const hex = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }
  function getYTEnv() {
    const y = (window.ytcfg && (window.ytcfg.data_ || {})) || {};
    const context = y.INNERTUBE_CONTEXT || {
      client:  y.INNERTUBE_CONTEXT_CLIENT || y.CLIENT || {},
      user:    y.INNERTUBE_CONTEXT_USER   || y.USER   || {},
      request: y.INNERTUBE_CONTEXT_REQUEST|| y.REQUEST|| {}
    };
    if (context?.client) {
      context.client.originalUrl = location.href;
      context.client.platform = context.client.platform || 'DESKTOP';
      context.client.screenPixelDensity = window.devicePixelRatio || 1;
      context.client.screenDensityFloat  = window.devicePixelRatio || 1;
    }
    return { context };
  }

  async function sendYouTubeComment(videoId, commentText) {
    const env = getYTEnv();
    const auth = await buildSapisiHashHeader();
    if (!auth) throw new Error('Not logged in or cannot build SAPISIDHASH');
    const payload = {
      context: env.context,
      createCommentParams: buildCreateCommentParams_videoOnly(videoId),
      commentText
    };
    const res = await fetch('https://www.youtube.com/youtubei/v1/comment/create_comment?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
      body: JSON.stringify(payload),
      credentials: 'include',
      mode: 'same-origin'
    });
    return res.json();
  }

  let sendCooldown = false;
  function trySendComment() {
    if (sendCooldown) return;
    const input = sendBox;
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) { toast('请输入弹幕内容'); input.focus(); return; }
    const videoId = getVideoIdFromURL();
    if (!videoId) { toast('未获取到视频 ID'); return; }
    const ts = secToClock(getCurrentTimeSeconds());
    const composed = `[YouTubeDanmaku]\n${ts} ${text}\n* This is a YouTube Danmaku, go to https://ytdmk.astrarails.org for details.`;
    sendCooldown = true;
    if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '.7'; sendBtn.style.cursor = 'not-allowed'; }
    sendYouTubeComment(videoId, composed)
      .then(resp => {
        if (resp && resp.actions) {
          const nowSec = Math.floor(getCurrentTimeSeconds());
          const entry = { time: nowSec, text, isYD: true };
          collected.push(entry);
          Danmaku.schedule(collected);
          updateLoadedCount(collected.length);
          Danmaku.instant(entry);
          toast('已发送弹幕', true);
          input.value = '';
        } else {
          console.error('发送失败响应：', resp);
          toast('发送失败：可能未登录/权限不足/频率受限');
        }
      })
      .catch(err => {
        console.error('发送异常：', err);
        toast('发送异常：' + (err?.message || '未知错误'));
      })
      .finally(() => {
        setTimeout(()=>{ sendCooldown = false; if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; sendBtn.style.cursor = 'pointer'; } }, 1200);
      });
  }

  let currentVideoId = null;
  let collected = [];
  let seenCommentIds = new Set();

  function resetForNewVideo() {
    collected = [];
    seenCommentIds.clear();
    Danmaku.destroy();
    updateLoadedCount(0);
  }

  function isWatchPage() { return location.pathname === '/watch'; }

  function tryInitDanmaku() {
    const video = document.querySelector('video.video-stream.html5-main-video');
    if (video) {
      Danmaku.createContainer(video);
      Danmaku.schedule(collected);
      Danmaku.start();
      injectControlsUnderTitle();
      updateLoadedCount(collected.length);
    }
  }

  function extractCommentsFromNextJSON(json) {
    try {
      const muts = json?.frameworkUpdates?.entityBatchUpdate?.mutations;
      if (!Array.isArray(muts)) return;
      for (const m of muts) {
        const payload = m?.payload?.commentEntityPayload;
        if (!payload) continue;
        const id = payload?.id || payload?.key || JSON.stringify(payload).slice(0, 64);
        if (id && seenCommentIds.has(id)) continue;
        const content = payload?.properties?.content?.content;
        if (typeof content !== 'string' || !content.trim()) continue;
        const entry = extractSingleTimestampEntry(content);
        if (entry) {
          collected.push(entry);
          updateLoadedCount(collected.length);
        }
        if (id) seenCommentIds.add(id);
      }
    } catch (e) { log('extract error:', e); }
  }

  function getVideoIdFromURL() { const url = new URL(location.href); return url.searchParams.get('v'); }

  function handlePossiblyNewVideo() {
    const vid = getVideoIdFromURL();
    if (vid && vid !== currentVideoId) {
      currentVideoId = vid;
      resetForNewVideo();
      waitForElement('video.video-stream.html5-main-video', 15000).then(() => tryInitDanmaku()).catch(() => {});
    } else {
      injectControlsUnderTitle();
    }
  }

  function installInterceptors() {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args).catch(e => { throw e; });
      try {
        const req = args[0];
        const url = (typeof req === 'string') ? req : (req?.url || '');
        if (url.includes('/youtubei/v1/next')) {
          const clone = res.clone();
          clone.json().then(json => {
            handlePossiblyNewVideo();
            extractCommentsFromNextJSON(json);
            Danmaku.schedule(collected);
            updateLoadedCount(collected.length);
          }).catch(() => {});
        }
      } catch {}
      return res;
    };

    const OrigXHR = window.XMLHttpRequest;
    function WrappedXHR() {
      const xhr = new OrigXHR(); let url = '';
      const open = xhr.open;
      xhr.open = function (method, u, ...rest) { url = u || ''; return open.call(xhr, method, u, ...rest); };
      xhr.addEventListener('load', function () {
        try {
          if (url.includes('/youtubei/v1/next') && xhr.responseType !== 'blob') {
            if (xhr.responseType === 'json') {
              handlePossiblyNewVideo(); extractCommentsFromNextJSON(xhr.response); Danmaku.schedule(collected); updateLoadedCount(collected.length); return;
            }
            const txt = xhr.responseText || ''; if (!txt) return;
            const j = JSON.parse(txt); handlePossiblyNewVideo(); extractCommentsFromNextJSON(j); Danmaku.schedule(collected); updateLoadedCount(collected.length);
          }
        } catch {}
      });
      return xhr;
    }
    window.XMLHttpRequest = WrappedXHR;

    window.addEventListener('yt-navigate-finish', () => {
      handlePossiblyNewVideo();
      waitForElement('video.video-stream.html5-main-video', 15000).then(() => tryInitDanmaku()).catch(() => {});
    });

    handlePossiblyNewVideo();
    waitForElement('video.video-stream.html5-main-video', 15000).then(() => tryInitDanmaku()).catch(() => {});
  }

  function installResizeObserver() {
    const ro = new ResizeObserver(() => Danmaku.calculateTrack());
    waitForElement('.html5-video-player, #movie_player', 15000).then(el => ro.observe(el)).catch(() => {});
  }

  if (isWatchPage()) {
    installInterceptors();
    installResizeObserver();
  }
})();
