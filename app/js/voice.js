// 语音搜索（0.4.8）：订阅 homegrab 的本机状态流 http://127.0.0.1:8792/s（长连接）。
//   listening → 底部显示「正在听…」；thinking → 「识别中…」；result → 显示识别文字，并在 B 站里直接跳到搜索结果（播放页也一样）。
// 页面重载后会立刻收到最新状态，所以带时间戳：超过 4 秒的旧状态一律忽略，避免重复触发。
(function () {
  var BASE = 'http://127.0.0.1:8792/s', seq = 0, fails = 0, hideT = null, el = null, lastTs = 0;
  function ensure() {
    if (el) return el;
    var st = document.createElement('style');
    st.textContent = '#voice{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:99999;display:none;max-width:70%;padding:18px 36px;border-radius:40px;' +
      'background:rgba(20,20,28,.88);color:#fff;font-size:32px;line-height:1.3;box-shadow:0 8px 40px rgba(0,0,0,.5);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#voice .dot{display:inline-block;width:18px;height:18px;border-radius:50%;background:#ff4d6d;margin-right:16px;vertical-align:middle;animation:vp 1s infinite}' +
      '@keyframes vp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}';
    document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'voice'; document.body.appendChild(el);
    return el;
  }
  function show(html, ms) {
    var e = ensure(); e.innerHTML = html; e.style.display = 'block';
    clearTimeout(hideT); if (ms) hideT = setTimeout(function () { e.style.display = 'none'; }, ms);
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function onState(d) {
    if (!d) return;
    if (d.state === 'listening') show('<span class="dot"></span>正在听…');
    else if (d.state === 'thinking') show('识别中…');
    else if (d.state === 'error') show('没听清，再按住说一次', 2000);
    else if (d.state === 'idle') { clearTimeout(hideT); if (el) el.style.display = 'none'; }
    else if (d.state === 'result') {
      var shown = d.query || d.text || '';
      if (d.inPage && d.kind === 'Bili' && d.query) {
        show('搜索：' + esc(shown));
        if (window.U && U.diag) U.diag('voice.page', d.query);
        setTimeout(function () { location.href = location.pathname + '?voice=' + encodeURIComponent(d.query); }, 250);   // 与冷启动同一条路径：回到首页再进搜索页
      } else if (d.inPage && d.kind === 'BiliHome') {
        show('回到 B 站首页'); setTimeout(function () { location.href = location.pathname; }, 250);
      } else show(shown ? esc(shown) : '没听清，再按住说一次', 2200);
    }
  }
  function loop() {
    var x = new XMLHttpRequest();
    x.open('GET', BASE + '?seq=' + seq, true); x.timeout = 30000;
    x.onload = function () {
      fails = 0;
      try {
        var r = JSON.parse(x.responseText);
        if (r.seq > seq) {
          seq = r.seq;
          var done = 0; try { done = parseInt(localStorage.getItem('voice.ts'), 10) || 0; } catch (e) {}
          if (r.data && r.ts && Date.now() - r.ts < 4000 && r.ts > done) {      // 只处理没处理过的新状态（页面重载后会重新收到最近一条）
            try { localStorage.setItem('voice.ts', String(r.ts)); } catch (e) {}
            onState(r.data);
          }
        }
      } catch (e) {}
      loop();
    };
    var bad = function () { fails++; setTimeout(loop, Math.min(1000 * fails, 5000)); };
    x.onerror = bad; x.ontimeout = bad;
    x.send();
  }
  loop();
})();
