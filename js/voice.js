/* =====================================================================
   语音模块 —— 全项目唯一碰「朗读」的地方
   ---------------------------------------------------------------------
   为什么单独拆出来：
     现在用的是浏览器自带的 speechSynthesis，声音偏机械、偏平，而且各家
     实现差异大。将来想换成更自然的日语 TTS（云端接口或本地模型），
     **只改这个文件内部**，app.js 一行都不用动 —— 对外只认下面这几个方法。

   === 换 TTS 时改哪里 ===
     只改 speak() 里「new SpeechSynthesisUtterance(...) + speechSynthesis.speak(u)」
     那一段，换成你自己的播放器。唯一必须遵守的语义是：
         播放结束（或出错、或被打断）时调用一次传入的 cb
     其余方法（play / chain / stop / setRelease…）都不用动。

   对外契约（app.js 只允许用这些）：
     refresh()              重新挑一次日语语音（系统语音包是异步加载的，要反复调）
     available()            现在有没有可用的日语语音
     updateUI()             把「有没有语音」反映到 body.noVoice 与 #voiceState
     setRate(r)             语速（0.5–1.5 左右）
     speak(text, cb)        念一句；念完 / 出错 / 超时都会回调 cb
     play(node, text, cb)   念一句，并给 node 加 .speaking 高亮（同一时刻只亮一个）
     chain(seq, done)       按顺序念一串 [{node, text, show?}]，读完调 done
     stop()                 立刻打断：停声 + 去高亮 + 作废这条链剩下的句子
     busy()                 此刻是否正在自动朗读（自动朗读时手动点读要让路）
     gate                   返回 bool 的函数；为 false 时 chain 直接结束。
                            由 app.js 覆盖（现在是「店员声音开关 + 有语音包」）
     setRelease(fn)         登记「被打断时该执行的放行动作」（比如把选项放出来）
     clearRelease()         取消登记
     release()              立刻打断并执行登记的放行动作
   ===================================================================== */
window.RIYU_VOICE = (function () {
  "use strict";

  var api = {};

  var jaVoice = null;      // 挑中的日语语音
  var rate = 0.95;         // 默认 0.95：比正常慢一点，方便跟读，不赶

  /* 候选自然度加分名单（按偏好从高到低，仅用于挑选，不强制） */
  var JA_VOICE_PREF = [
    "Google 日本語", "Google Japanese", "Haruka", "Nanami",
    "Ayumi", "Sayaka", "Ichiro", "Keita", "Kyoko"
  ];

  /* ---- 自动朗读链的状态 ---- */
  var chainTok = 0;        // 每次 开始/打断 递增，用来作废上一次链的迟到回调
  var chainBusy = false;   // 此刻是否有自动朗读在跑
  var autoRelease = null;  // 被打断时要执行的「放行」动作
  var pending = null;      // 「等一会儿再开口」的定时器 —— 打断时必须清掉

  /* 全局「正在朗读」的那一句 —— 高亮只保持一个，换句自动清除 */
  var sayingEl = null;

  /* ---------------- 挑语音 ---------------- */
  function voiceScore(v) {
    var s = 0;
    var lang = (v.lang || "").toLowerCase();
    if (lang === "ja-jp") s += 10;
    else if (lang.indexOf("ja") === 0) s += 6;
    var name = v.name || "";
    if (/neural|onnx|natural/i.test(name)) s += 3;
    for (var i = 0; i < JA_VOICE_PREF.length; i++) {
      if (name.toLowerCase().indexOf(JA_VOICE_PREF[i].toLowerCase()) >= 0) { s += (9 - i); break; }
    }
    return s;
  }

  function refresh() {
    var vs = (window.speechSynthesis && window.speechSynthesis.getVoices) ? window.speechSynthesis.getVoices() : [];
    jaVoice = null;
    var best = -1;
    for (var i = 0; i < vs.length; i++) {
      if (!/^ja/i.test(vs[i].lang || "")) continue;
      var sc = voiceScore(vs[i]);
      if (best < 0 || sc > best) { jaVoice = vs[i]; best = sc; }
    }
    updateUI();
  }

  function available() { return !!(window.speechSynthesis && jaVoice); }

  /* 本模块唯一碰页面的地方：没有日语语音时给 body 挂 noVoice，
     带 .voiceonly 的朗读按钮据此整体隐藏；设置抽屉里显示当前用的是哪个声音。 */
  function updateUI() {
    var ok = available();
    if (document.body) document.body.classList.toggle("noVoice", !ok);
    var box = document.getElementById("voiceState");
    if (box) {
      box.textContent = ok
        ? "已找到：" + jaVoice.name
        : "未检测到日语语音（安装系统日语语音包后自动出现）";
    }
  }

  function setRate(r) { if (typeof r === "number" && r > 0) rate = r; }

  /* ---------------- 播放 ---------------- */
  function stopHighlight() {
    if (sayingEl) {
      sayingEl.classList.remove("speaking");
      if (sayingEl.tagName === "AUDIO") { try { sayingEl.pause(); } catch (e) {} }
      sayingEl = null;
    }
  }

  /* 念一句。cb 一定会被调用一次（念完 / 出错 / 超时兜底）。 */
  function speak(text, cb) {
    var done = false;
    function fin() { if (!done) { done = true; if (typeof cb === "function") cb(); } }
    if (!available() || !text) { fin(); return; }

    /* 先打断上一句：保证任何时刻只有一个声音在响 */
    window.speechSynthesis.cancel();
    stopHighlight();

    /* === 换 TTS：替换这一段 === */
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.voice = jaVoice;
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    if (typeof cb === "function") {
      u.onend = fin;
      u.onerror = fin;
      /* 兜底：个别引擎不回调 onend，会卡住对照流程，超时自动继续 */
      setTimeout(fin, Math.max(2500, 800 + text.length * 110));
    }
    window.speechSynthesis.speak(u);
    /* === 换 TTS：替换结束 === */
  }

  /* 念一句并给 node 加轻高亮。同一时刻只高亮一句，新播放先停旧的。 */
  function play(node, text, cb) {
    if (!available() || !text) { if (typeof cb === "function") cb(); return; }
    /* speak 内部已先 cancel + stopHighlight 清掉上一句，所以高亮放在它返回之后再加。
       但个别语音引擎会「同步」回调 onend/onerror（无声设备上常见），
       那样回调会跑在挂高亮之前，这句就会永远亮着 —— 用 finished 标记补一次清理。 */
    var finished = false;
    speak(text, function () {
      finished = true;
      if (sayingEl === node) stopHighlight();
      if (typeof cb === "function") cb();
    });
    if (node) { node.classList.add("speaking"); sayingEl = node; }
    if (finished && sayingEl === node) stopHighlight();
  }

  /* ---------------- 打断 ---------------- */
  function stop() {
    chainTok++;              // 作废这条链剩下的句子
    chainBusy = false;
    /* 还没开口的那一声也要一并取消 —— 否则切走场景后它会迟到地响起来 */
    if (pending) { clearTimeout(pending); pending = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopHighlight();
  }

  function busy() { return chainBusy; }

  /* ---------------- 顺序朗读一串 ---------------- */
  function gate() { return true; }   // 由 app.js 覆盖

  /* seq: [{node, text, show?}]；念完（或被 stop / 被新链取代）后调 done。
     delayMs > 0 时先等这么久再念第一句 —— 用来让画面先站定，声音不要砸出来。
     这段等待由本模块持有，stop() 能一并取消，所以切场景绝不会留下迟到的一声。 */
  function chain(seq, done, delayMs) {
    api.stop();
    chainBusy = true;
    var tok = chainTok;
    var i = 0;
    function next() {
      if (tok !== chainTok || !chainBusy) return;   // 已被打断 / 被新链取代
      if (i < seq.length && api.gate()) {
        var it = seq[i++];
        if (typeof it.show === "function") it.show();
        play(it.node, it.text, next);
      } else {
        chainBusy = false;
        if (typeof done === "function") done();
      }
    }
    if (delayMs > 0) {
      pending = setTimeout(function () { pending = null; next(); }, delayMs);
    } else {
      next();
    }
  }

  /* ---------------- 放行动作 ---------------- */
  function setRelease(fn) { autoRelease = fn; }
  function clearRelease() { autoRelease = null; }
  function release() {
    if (autoRelease) { var f = autoRelease; autoRelease = null; stop(); f(); }
  }

  api = {
    refresh: refresh,
    available: available,
    updateUI: updateUI,
    setRate: setRate,
    speak: speak,
    play: play,
    stopHighlight: stopHighlight,
    stop: stop,
    busy: busy,
    chain: chain,
    gate: gate,
    setRelease: setRelease,
    clearRelease: clearRelease,
    release: release
  };
  return api;
})();
