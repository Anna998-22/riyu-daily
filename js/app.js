/* =========================================================================
 * にほんの旅 · 离线版 v3 交互逻辑
 * 纯原生 JS，无依赖。公开侧数据来自 js/content/*，聚合进 js/data.js(DAILY_DATA)；
 * 主线 25 关正文在 js/paid/l1~l5.js，只有 ?preview= 会话才注入（详见 loadPaidPack）。
 * v2 功能：难度主线(关卡半解锁) / 难度筛选 / 句中名词高亮+底部词卡 /
 *         跟读录音·回放·自对比(离线) / 随堂测验通关后接下一关。
 * v3 新增：学习页顶部「情景词语热身」——词语→词语练习(选择/听音)→组句→简单对话，
 *         仅辅助降难，不计入通关判定；无日语语音时自动跳过听音题。
 * 约定：正文为纯平假名(无 kana 字段)；行对象可带遗留 kana(旧收藏)时兼容显示。
 * ========================================================================= */
(function () {
  "use strict";

  /* ---------------- 基础工具 ---------------- */
  function $(s) { return document.querySelector(s); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function range(n) { var r = []; for (var i = 0; i < n; i++) r.push(i); return r; }
  function truthyCount(arr) { var n = 0; for (var i = 0; i < arr.length; i++) if (arr[i]) n++; return n; }

  /* ---------------- 本地存储（数据仅保存在本机） ---------------- */
  var K = { settings: "riyu.settings", favs: "riyu.favs", prog: "riyu.progress" };
  function loadJson(k, def) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function saveJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私/容量异常时静默 */ } }

  var SCENARIOS = DAILY_DATA.scenarios;
  var META = DAILY_DATA.meta;
  var TOTAL = SCENARIOS.length;

  var state = {
    settings: Object.assign({ showZh: false, rate: 0.95, unlockAll: false }, loadJson(K.settings, {})),
    favs: loadJson(K.favs, []),
    prog: loadJson(K.prog, {}),
    curSid: null,       // 当前打开的情景 id
    stab: "learn",      // 情景内标签：learn / shadow / quiz
    sr: { role: "A", idx: 0, open: false },  // 跟读状态
    q: null,            // 测验状态
    filter: null,       // 首页难度筛选：null=全部, 1~5
    warmStep: null      // 学习页热身的展开步骤：w1~w4 / "none"（null 时回到第一个未完成步骤）
  };

  function saveSettings() { saveJson(K.settings, state.settings); }
  function saveFavs() { saveJson(K.favs, state.favs); }
  function saveProg() { saveJson(K.prog, state.prog); }

  /* ---------------- 付费正文包（不进公开仓库，按需注入） ----------------
   * 主线 25 关的正文在 js/paid/l1~l5.js，那个目录被 .gitignore 排除，
   * 公开仓库和 GitHub Pages 上都取不到。
   *
   * 只有带 ?preview= 的会话才会去请求它们：
   *   · 本机预览（文件在）  → 注入成功，DAILY_DATA 有内容，主线可玩
   *   · 线上公开访客（文件不在）→ 根本不发这个请求，无 404、无泄露
   *
   * ⚠️ 这不是安全机制，只保证「公开仓库里没有」。文件一旦被转发出去，
   *    前端拦不住 —— 真正的权限将来由后端判定。
   *
   * ⚠️ 这也意味着 js/paid/ 不在版本控制里、没有备份，删了就没了。
   */
  /* 后两个目前**还没写**（文件不存在），列在这里是为了：一旦放进去，
     本机 ?preview= 就能直接看到付费救命句和付费单词，不用再改代码。
     不存在时 onerror 兜住，只是拿不到 → 页面如实显示「还没下发」。 */
  var PAID_PACK = ["js/paid/l1.js", "js/paid/l2.js", "js/paid/l3.js",
                   "js/paid/l4.js", "js/paid/l5.js",
                   "js/paid/phrases-paid.js", "js/paid/words-paid.js"];

  /* 付费包到货后重跑聚合器，刷新 SCENARIOS / TOTAL 这两个缓存值 */
  function refreshScenarios() {
    if (typeof window.RIYU_REBUILD_DATA === "function") window.RIYU_REBUILD_DATA();
    if (typeof DAILY_DATA === "undefined" || !DAILY_DATA.scenarios) return false;
    SCENARIOS = DAILY_DATA.scenarios;
    TOTAL = SCENARIOS.length;
    return TOTAL > 0;
  }

  /* 返回 true 表示「确实发起了注入」，false 表示未购买/非预览，一个字都没请求 */
  function loadPaidPack(done) {
    var ent = window.Entitlement;
    if (!ent || typeof ent.isPreview !== "function" || !ent.isPreview()) return false;

    var left = PAID_PACK.length, got = false;
    function step() {
      if (--left > 0) return;
      if (got) refreshScenarios();
      if (typeof done === "function") done(got);
    }
    PAID_PACK.forEach(function (src) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { got = true; step(); };
      s.onerror = function () { step(); };   /* 本地没这个文件也不算错 */
      document.head.appendChild(s);
    });
    return true;
  }

  /* ---------------- 付费正文的唯一取用口 ----------------
   * 优先级：后端下发 > 本机预览包 > 没有。
   * 现在 Entitlement.fetchSceneContent() 恒返回 null（没有后端），
   * 所以实际走的是 js/paid/ 里那份本机预览包；等接了数据库，
   * 后端返回的 words/phrases 会顺着同一个口子进来，下面两个函数本体不用改。
   * 返回 null 就是「拿不到」——调用方必须渲染锁定/未下发态，不要编假内容。 */
  function paidContentOf(sceneId) {
    var E = window.Entitlement;
    var fromBackend = (E && typeof E.fetchSceneContent === "function")
      ? E.fetchSceneContent(sceneId) : null;
    if (fromBackend) return fromBackend;
    return null;
  }
  function paidWordsOf(sceneId) {
    var b = paidContentOf(sceneId);
    if (b && b.words && b.words.length) return b.words;
    return (window.RIYU_PAID_WORDS || {})[sceneId] || null;
  }
  function paidPhrasesOf(catId) {
    var b = paidContentOf(catId);
    if (b && b.phrases && b.phrases.length) return b.phrases;
    return (window.RIYU_PAID_PHRASES || {})[catId] || null;
  }

  function scenarioById(id) {
    for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].id === id) return SCENARIOS[i];
    return null;
  }

  /* 确保某情景的进度对象存在，返回它 */
  function ensureProg(sid) {
    var sc = scenarioById(sid);
    if (!state.prog[sid]) state.prog[sid] = { seen: [], quizBest: null };
    var p = state.prog[sid];
    if (sc && p.seen.length < sc.lines.length) {
      while (p.seen.length < sc.lines.length) p.seen.push(false);
    }
    return p;
  }
  function markSeen(sid, idx) { var p = ensureProg(sid); if (p.seen[idx] === false) { p.seen[idx] = true; saveProg(); } }
  function seenCount(sid) { return truthyCount(ensureProg(sid).seen); }
  function favIndexOf(key) {
    for (var i = 0; i < state.favs.length; i++) if (state.favs[i].key === key) return i;
    return -1;
  }
  function keyOf(sid, idx) { return sid + "::" + idx; }

  /* ---------------- 难度与主线 ---------------- */
  var LVNAME = { 1: "入门", 2: "初级", 3: "中级", 4: "中高级", 5: "高级" };
  function lvName(v) { return LVNAME[v] || ("L" + v); }
  function lvChip(sc) { return el("span", "lv lv" + sc.level, "L" + sc.level + " · " + lvName(sc.level)); }

  /* 主线顺序 = data.js 已按 level 升序 + 同级稳定排序后的 SCENARIOS */
  function mainIndex(sid) {
    for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].id === sid) return i;
    return -1;
  }

  /* 通关判定：测验最佳分 ≥60 且 已学习(seen)句数 ≥60% */
  function scPass(sc) {
    if (!sc) return false;
    var p = state.prog[sc.id];
    if (!p || typeof p.quizBest !== "number") return false;
    if (p.quizBest < 60) return false;
    var n = sc.lines ? sc.lines.length : 0;
    if (!n) return true;
    return truthyCount(p.seen || []) / n >= 0.6;
  }
  function scPassedById(sid) { return scPass(scenarioById(sid)); }

  /* 是否可进入(解锁)。第 0 关恒开；其后需前一关通关；设置解锁全部则全开。 */
  function isOpen(sid) {
    if (state.settings.unlockAll) return true;
    var i = mainIndex(sid);
    if (i <= 0) return true;
    var prev = SCENARIOS[i - 1];
    return !!prev && scPass(prev);
  }

  /* 当前“进行中”的主线关卡下标：第一个未通关的；全部通关则 -1 */
  function nextIdxOf() {
    for (var i = 0; i < SCENARIOS.length; i++) if (!scPass(SCENARIOS[i])) return i;
    return -1;
  }
  function passedCount() {
    var n = 0;
    for (var i = 0; i < SCENARIOS.length; i++) if (scPass(SCENARIOS[i])) n++;
    return n;
  }

  /* ---------------- 轻提示 ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  /* ---------------- 日语朗读（浏览器本地语音，无需联网） ----------------
   * 优先挑选更自然的日语语音（neural / 系统自带日语女声等），找不到时回退到
   * 第一个日语语音，再找不到则整体降级（隐藏朗读按钮）。
   * speak(text, cb)：可选完成后回调(用于“先标准音、后自己的录音”对照)。
   * playSentence(node, text, cb)：整句播放入口——先打断上句、只高亮“正在读的一句”。
   * --------------------------------------------------------------------- */
  var jaVoice = null;
  /* 候选自然度加分名单（按偏好从高到低，仅用于挑选，不强制） */
  var JA_VOICE_PREF = ["Google 日本語", "Google Japanese", "Haruka", "Nanami", "Ayumi", "Sayaka", "Ichiro", "Keita", "Kyoko"];
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
  function refreshVoice() {
    var vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    jaVoice = null;
    var best = -1;
    for (var i = 0; i < vs.length; i++) {
      if (!/^ja/i.test(vs[i].lang || "")) continue;
      var sc = voiceScore(vs[i]);
      if (best < 0 || sc > best) { jaVoice = vs[i]; best = sc; }
    }
    updateVoiceUI();
  }
  function updateVoiceUI() {
    var ok = !!(window.speechSynthesis && jaVoice);
    document.body.classList.toggle("noVoice", !ok);
    var box = $("#voiceState");
    if (box) box.textContent = ok ? "已找到：" + jaVoice.name : "未检测到日语语音（安装系统日语语音包后自动出现）";
  }
  function ttsAvailable() { return !!(window.speechSynthesis && jaVoice); }

  /* 全局“正在朗读”的那一句（视觉高亮只保持一个，换句自动清除） */
  var sayingEl = null;
  function stopSay() {
    if (sayingEl) {
      sayingEl.classList.remove("speaking");
      if (sayingEl.tagName === "AUDIO") { try { sayingEl.pause(); } catch (e) {} }
      sayingEl = null;
    }
  }
  /* 播放 text 并给 node 加“speaking”轻高亮；同一时刻只高亮一句，新播放先停旧的 */
  function playSentence(node, text, cb) {
    if (!ttsAvailable() || !text) { if (typeof cb === "function") cb(); return; }
    /* speak 内部已先 cancel + stopSay 清掉上一句，所以高亮放在它返回之后再加。
       但个别语音引擎会「同步」回调 onend/onerror（无声设备上常见），
       那样回调会跑在挂高亮之前，这句就会永远亮着——用 finished 标记补一次清理。 */
    var finished = false;
    speak(text, function () {
      finished = true;
      if (sayingEl === node) stopSay();
      if (typeof cb === "function") cb();
    });
    if (node) { node.classList.add("speaking"); sayingEl = node; }
    if (finished && sayingEl === node) stopSay();
  }
  function speak(text, cb) {
    var done = false;
    function fin() { if (!done) { done = true; if (typeof cb === "function") cb(); } }
    if (!ttsAvailable() || !text) { fin(); return; }
    speechSynthesis.cancel();
    stopSay();               // 打断上一句朗读并去掉它的高亮
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.voice = jaVoice;
    u.rate = state.settings.rate;   // 默认 0.95，更适合跟读，不赶
    u.pitch = 1;
    u.volume = 1;
    if (typeof cb === "function") {
      u.onend = fin;
      u.onerror = fin;
      /* 兜底：个别语音引擎不回调 onend 时自动继续，避免卡住对照流程 */
      setTimeout(fin, Math.max(2500, 800 + text.length * 110));
    }
    speechSynthesis.speak(u);
  }

  /* ---------------- 视图切换（v4：支持手机返回键） ----------------
   * 为什么用 location.hash 而不是 history.pushState：
   *   本项目必须支持 file:// 双击打开，而 pushState 在 file:// 下会被
   *   浏览器以 origin 为 null 为由拒绝。hash 两种环境都能用。
   * hash 故意写成 #/home 这种形式，不匹配任何元素的 id，
   * 这样改 hash 不会触发浏览器“跳到锚点”的滚动行为。
   * ------------------------------------------------------------ */
  var VIEWS = {
    home: "viewHome", scenario: "viewScenario", story: "viewStory", favs: "viewFavs",
    map: "viewMap", travel: "viewTravel", study: "viewStudy", scene: "viewScene",
    phrases: "viewPhrases", words: "viewWords", memo: "viewMemo",
    me: "viewMe", shop: "viewShop"
  };

  /* 视图 → 该点亮哪个导航项。底部 tab 与桌面左栏共用这一份，
     避免两边各写一套映射、改一边忘一边。
     注意：words / memo / shop 是从「我的」进去的子页，没有自己的 tab，
     以前它们一个 tab 都点不亮（bug），现在统一归到「我的」。 */
  var TAB_OF = {
    home: "home", scenario: "home", story: "home", favs: "home",
    map: "map", travel: "map", study: "map", scene: "map",
    phrases: "phrases",
    me: "me", words: "me", memo: "me", shop: "me"
  };
  var hashSuppress = null;   // 自己设置 hash 时，忽略随之而来的那一次 hashchange

  function viewFromHash() {
    var m = /^#\/([a-z-]+)/.exec(String(window.location.hash || ""));
    return (m && VIEWS[m[1]]) ? m[1] : null;
  }

  function nav(view, opts) {
    opts = opts || {};
    if (!VIEWS[view]) return;

    for (var k in VIEWS) {
      var s = $("#" + VIEWS[k]);
      if (s) s.hidden = k !== view;
    }
    if (view !== "scenario") closeVocab();   // 离开情景时收起词卡栏
    if (view !== "story") { chainStop(); autoRelease = null; }   // 离开沉浸页即打断自动朗读
    if (view === "home") renderHome();
    if (view === "favs") renderFavs();
    if (view === "map") renderMap();
    if (view === "travel") renderPackPage("travel");
    if (view === "study") renderPackPage("study");
    if (view === "scene") renderSceneDetail();
    if (view === "phrases") renderPhrases();
    if (view === "words") renderWords();
    if (view === "memo") renderMemo();
    if (view === "me") renderMe();
    if (view === "shop") renderShop();

    /* 浏览器前进/后退回来时，补渲染带内存状态的子页 */
    if (opts.restore) {
      if (view === "scenario" && state.curSid) renderScenario();
      if (view === "story" && story.id) renderStory();
    }

    /* 顶部导航激活态（仅样式）——情景/沉浸页都点亮“情景” */
    var act = (view === "scenario" || view === "story") ? "home" : view;
    document.querySelectorAll(".mainnav .navbtn").forEach(function (b) {
      b.classList.toggle("on", b.dataset.nav === act);
    });
    /* 底部 tab / 桌面左栏激活态：两边共用一份映射，见 TAB_OF */
    var tabAct = TAB_OF[view] || "home";
    document.querySelectorAll("#tabBar .tb, #sideNav .sidebtn").forEach(function (b) {
      var on = b.dataset.nav === tabAct;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });

    /* 桌面右栏（手机端被 CSS 隐藏，重画成本可以忽略） */
    renderRail();

    /* 同步地址栏，让返回键有历史可退 */
    if (!opts.silent) {
      var want = "#/" + view;
      if (window.location.hash !== want) {
        hashSuppress = want;
        try { window.location.hash = want; } catch (e) { hashSuppress = null; }
      }
    }
    window.scrollTo(0, 0);
  }

  /* 用户按了返回键/侧滑返回，或前进 */
  function onHashChange() {
    if (hashSuppress && window.location.hash === hashSuppress) { hashSuppress = null; return; }
    hashSuppress = null;
    nav(viewFromHash() || "home", { silent: true, restore: true });
  }
  function updateFavCount() { $("#favCount").textContent = state.favs.length; }

  /* ---------------- 场景地图 / 我的（阶段 0 先占位，阶段 3、5 填充） ---------------- */
  function scaffoldNote(host, text) {
    if (!host) return;
    host.innerHTML = "";
    var box = el("div", "empty");
    box.appendChild(el("p", "big", "🚧"));
    box.appendChild(el("p", "", text));
    host.appendChild(box);
  }
  /* ================= v4：场景地图 / 篇目页 / 场景详情（阶段 3） =================
   * 全部只渲染 registry 里的「货架信息」（标题/一句话/编号/分组）。
   * 具体对话、选项、词汇属于付费正文，未解锁时**前端根本没有这份数据**，
   * 所以这里只能显示占位，不会也不可能把正文漏出去。
   * ---------------------------------------------------------------------- */
  /* 场景地图 v5 起改成「旅行篇 / 求学篇」两张入口卡，不再需要筛选状态 */
  var curSceneId = null;     // 当前场景详情页看的是哪个场景
  var sceneFrom = "map";     // 场景详情页的返回目标

  function groupNameOf(pack, gid) {
    var gs = (reg() && reg().groups[pack]) || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].id === gid) return gs[i].emoji + " " + gs[i].name;
    return "";
  }

  /* 单张场景行：编号 + 图标 + 标题/假名 + 一句话 + 状态角标 */
  function sceneRow(s) {
    var st = sceneState(s);
    var row = el("button", "scenerow" + (st === "lock" ? " locked" : st === "soon" ? " soon" : ""));
    row.type = "button";
    row.appendChild(el("span", "sr-no", s.no));
    row.appendChild(el("span", "sr-emoji", s.emoji));
    var mid = el("div", "sr-mid");
    var tr = el("div", "sr-titlerow");
    tr.appendChild(el("span", "sr-title", s.titleZh));
    tr.appendChild(el("span", "sr-ja", s.titleJa));
    if (s.badge) tr.appendChild(el("span", "sr-badge", s.badge));
    mid.appendChild(tr);
    mid.appendChild(el("p", "sr-desc", s.desc));
    row.appendChild(mid);
    var right = el("span", "sr-right");
    if (st === "done") { right.textContent = "✅"; right.classList.add("ok"); }
    else if (st === "open") right.textContent = "▶";
    else if (st === "lock") right.textContent = "🔒";
    else right.textContent = "🚧";
    row.appendChild(right);
    row.addEventListener("click", function () { openScene(s.id, sceneFromOf()); });
    return row;
  }

  /* 点场景行时，返回目标 = 当前所在页 */
  function sceneFromOf() {
    if (window.location.hash.indexOf("#/travel") === 0) return "travel";
    if (window.location.hash.indexOf("#/study") === 0) return "study";
    if (window.location.hash.indexOf("#/home") === 0) return "home";
    return "map";
  }

  /* 篇目页当前显示哪一栏：'route'（推荐路线）| 'scenes'（全部场景）。 */
  var packTab = {};

  /* 推荐路线的公开清单 —— 只有任务名，没有正文。
     旅行篇 25 条来自 mainline-manifest.js，求学篇 20 条来自 studyroute-manifest.js。
     正文在 js/paid/ 里，公开访客的浏览器根本不会请求它。 */
  function routeList(pack) {
    return pack === "study" ? (window.RIYU_STUDYROUTE || []) : (window.RIYU_MAINLINE || []);
  }

  /* 推荐路线的一行：编号 + 任务名 + 状态。
     未解锁时**不出现任何课程正文**，只有名字和一把锁。 */
  function routeRow(pack, it) {
    var E = window.Entitlement;
    var unlocked = !E || E.isUnlocked(pack);
    var row = el("div", "routerow");
    row.appendChild(el("span", "rr-no", it.no < 10 ? "0" + it.no : String(it.no)));
    row.appendChild(el("span", "rr-emoji", it.emoji));
    row.appendChild(el("span", "rr-name", it.titleZh));

    var right = el("span", "rr-right");
    /* 旅行篇的正文可能真的在（预览会话注入过 js/paid/），求学篇则一律还没有 */
    var idx = (unlocked && pack === "travel") ? mainIndex(it.id) : -1;
    var passed = idx >= 0 && scPass(SCENARIOS[idx]);
    var open = idx >= 0 && isOpen(it.id);

    if (!unlocked) { right.textContent = "🔒"; row.classList.add("locked"); }
    else if (pack === "study") { right.textContent = "🚧"; row.classList.add("locked"); }
    else if (passed) { right.textContent = "✅"; right.classList.add("ok"); }
    else if (open) { right.textContent = "▶"; }
    else { right.textContent = "🔒"; row.classList.add("locked"); }
    row.appendChild(right);

    row.addEventListener("click", function () {
      if (!unlocked) { toast("🔒 「" + it.titleZh + "」购买" + packNameOf(pack) + "后解锁。"); return; }
      if (pack === "study" || idx < 0) { toast("「" + it.titleZh + "」正在制作中，下个版本见。"); return; }
      if (open) { openScenario(it.id, false); return; }
      toast("🔒 需先通过上一关才能进入本关。");
    });
    return row;
  }

  function routeBlock(pack, list) {
    var D = el("div", "routeblock");
    var doneN = pack === "travel" ? passedCount() : 0;
    var total = list.length;
    var sub = el("p", "rb-sub");
    sub.textContent = pack === "travel"
      ? "按真实顺序排的 " + total + " 个任务，一关一关往下走。已通关 " + doneN + " / " + total + "。"
      : "按到日本之后的顺序排的 " + total + " 个任务，正文正在做。";
    D.appendChild(sub);
    var rows = el("div", "routelist");
    list.forEach(function (it) { rows.appendChild(routeRow(pack, it)); });
    D.appendChild(rows);
    return D;
  }

  /* 一个篇目 = 标题区 + [推荐路线 | 全部场景] 两栏 + 若干分组 */
  function packSection(pack, opts) {
    opts = opts || {};
    var R = reg(), pk = R.packs[pack];
    var sec = el("div", "packsect");

    var head = el("div", "ps-head");
    head.appendChild(el("span", "ps-emoji", pk.emoji));
    var tb = el("div", "ps-tb");
    tb.appendChild(el("h3", "ps-title", pk.name));
    if (pk.tagline) tb.appendChild(el("p", "ps-sub", pk.tagline));
    var total = R.packScenes(pack).length;
    var done = 0;
    R.packScenes(pack).forEach(function (s) { if (s.story && storyDone[s.story]) done++; });
    tb.appendChild(el("p", "ps-count", "共 " + total + " 个场景 · 已完成 " + done));
    head.appendChild(tb);
    sec.appendChild(head);

    /* --- 推荐路线 / 全部场景 两栏切换 --- */
    var route = routeList(pack);
    var tab = packTab[pack] || (pack === "travel" ? "route" : "scenes");
    if (route.length) {
      var tabs = el("div", "ps-tabs");
      [
        { k: "route",  n: "🚩 推荐路线", c: route.length },
        { k: "scenes", n: "🗾 全部场景", c: total }
      ].forEach(function (t) {
        var b = el("button", "ps-tab" + (tab === t.k ? " on" : ""));
        b.type = "button";
        b.appendChild(el("span", "", t.n));
        b.appendChild(el("span", "cnt", t.c));
        b.addEventListener("click", function () {
          packTab[pack] = t.k;
          if (pack === "study") renderPackPage("study"); else renderPackPage("travel");
        });
        tabs.appendChild(b);
      });
      sec.appendChild(tabs);
    }

    if (route.length && tab === "route") {
      sec.appendChild(routeBlock(pack, route));
      sec.appendChild(el("p", "ps-note",
        "「推荐路线」是按顺序排的任务，「全部场景」是完整货架 —— 两者条数不同，进度也分开算。"));
      return sec;
    }

    R.groupsOf(pack).forEach(function (g) {
      var gb = el("div", "gblock");
      var gh = el("div", "g-head");
      gh.appendChild(el("span", "g-no", g.no));
      gh.appendChild(el("span", "g-name", g.emoji + " " + g.name));
      var gd = 0;
      g.scenes.forEach(function (s) { if (s.story && storyDone[s.story]) gd++; });
      gh.appendChild(el("span", "g-count", gd + " / " + g.scenes.length));
      gb.appendChild(gh);
      var list = el("div", "scenelist");
      g.scenes.forEach(function (s) { list.appendChild(sceneRow(s)); });
      gb.appendChild(list);
      sec.appendChild(gb);
    });
    return sec;
  }

  /* 篇目入口卡：场景地图和首页共用同一个渲染函数，
     免得两处各写一份、改一边忘一边。
     未购买时这里一个课程正文都没有 —— 只有分类、总数和一把锁。 */
  var PACK_META = {
    travel: { emoji: "🧳", title: "旅行篇", sub: "去日本之前，先把真实生活场景走一遍。" },
    study:  { emoji: "🎓", title: "求学篇", sub: "从落地到上课、打工、办手续，一路能开口。" }
  };

  function packEntryCard(pack) {
    var m = PACK_META[pack];
    var E = window.Entitlement;
    var st = packStat(pack);
    var route = routeList(pack);
    var unlocked = !E || E.isUnlocked(pack);
    /* 推荐路线的分母来自公开清单；完成数只有旅行篇算得出来（求学篇还没有正文） */
    var routeDone = (pack === "travel" && TOTAL) ? passedCount() : 0;

    var card = el("button", "mapcard" + (unlocked ? "" : " locked"));
    card.type = "button";

    var top = el("div", "mc-top");
    top.appendChild(el("span", "mc-emoji", m.emoji));
    var tb = el("div", "mc-tb");
    tb.appendChild(el("span", "mc-title", m.title));
    tb.appendChild(el("span", "mc-sub", m.sub));
    top.appendChild(tb);
    top.appendChild(el("span", "mc-lock", unlocked ? "🔓" : "🔒"));
    card.appendChild(top);

    [["🚩 推荐路线", routeDone, route.length],
     ["🗾 全部场景", st.done, st.total]].forEach(function (r) {
      var line = el("div", "mc-line");
      line.appendChild(el("span", "mc-lname", r[0]));
      /* 分母为 0 = 这份清单不在公开前端（求学篇推荐路线还没做） */
      line.appendChild(el("span", "mc-lval", r[2] ? (r[1] + " / " + r[2]) : "🔒"));
      card.appendChild(line);
    });

    card.appendChild(el("div", "mc-go", unlocked ? "进入 →" : "🔒 购买" + m.title + "后解锁"));
    card.addEventListener("click", function () { nav(pack); });
    return card;
  }

  function renderMap() {
    var host = $("#mapBody");
    if (!host) return;
    var R = reg();
    if (!R) { scaffoldNote(host, "场景目录还没加载。"); return; }
    host.innerHTML = "";

    /* 场景地图 = 两张入口卡：旅行篇 / 求学篇。
       每张卡只说「两栏各有多少、解锁没解锁」，点进去才是完整列表。 */
    ["travel", "study"].forEach(function (p) { host.appendChild(packEntryCard(p)); });

    host.appendChild(el("p", "ps-note",
      "共 " + ((R.DISPLAY && R.DISPLAY.scenesTotal) || 56) + " 个场景。免费体验是咖啡店，其余随篇目解锁。"));
  }

  /* 首页的篇目入口：同一张卡，只是换个容器 */
  function renderPackEntry() {
    var host = $("#packEntry");
    if (!host) return;
    host.innerHTML = "";
    ["travel", "study"].forEach(function (p) { host.appendChild(packEntryCard(p)); });
  }

  function renderPackPage(pack) {
    var host = $("#" + (pack === "study" ? "studyBody" : "travelBody"));
    if (!host) return;
    if (!reg()) { scaffoldNote(host, "场景目录还没加载。"); return; }
    host.innerHTML = "";
    host.appendChild(packSection(pack));
  }

  /* 「听不懂怎么办？」——场景详情页和剧情页共用同一个出口。
     真的卡住的时候，用户想的不是「我要去学句子」，而是「这句我没听懂」，
     所以入口按那个说法写，落到语言急救包的「日常生活」类（重复/语速那几句就在那儿）。 */
  function listenHelpBtn() {
    var b = el("button", "btn ghost", "🆘 听不懂怎么办？");
    b.addEventListener("click", function () { nav("phrases"); });
    return b;
  }

  /* ---------------- 场景详情 ---------------- */
  function renderSceneDetail() {
    var host = $("#sceneBody");
    if (!host) return;
    var R = reg();
    if (!R || !curSceneId) { scaffoldNote(host, "找不到这个场景。"); return; }
    var s = R.sceneById(curSceneId);
    if (!s) { scaffoldNote(host, "找不到这个场景。"); return; }
    host.innerHTML = "";

    var E = window.Entitlement;
    var unlocked = !E || E.isSceneUnlocked(s.id);
    var st = sceneState(s);
    var storyObj = (s.story && STORIES[s.story]) ? STORIES[s.story] : null;

    /* 头部 */
    var head = el("div", "sd-head");
    head.appendChild(el("div", "sd-emoji", s.emoji));
    var hb = el("div", "sd-hb");
    hb.appendChild(el("h2", "sd-title", s.titleZh));
    hb.appendChild(el("div", "sd-ja", s.titleJa));
    hb.appendChild(el("p", "sd-desc", s.desc));

    var tags = el("div", "sd-tags");
    var seenTag = {};
    function addTag(text, cls) {
      if (!text || seenTag[text]) return;
      seenTag[text] = 1;
      tags.appendChild(el("span", "tag" + (cls ? " " + cls : ""), text));
    }
    /* 免费场景的 pack 名恰好也叫「免费体验」，会跟 badge 撞车，所以改写成它实际所在的篇目 */
    addTag(s.pack === "free" ? "🧳 旅行篇" : packNameOf(s.pack), "accent");
    addTag(groupNameOf(s.pack, s.group));
    addTag(s.badge, "pass");
    if (st === "done") addTag("✅ 已完成", "pass");
    hb.appendChild(tags);
    head.appendChild(hb);
    host.appendChild(head);

    /* 场景流程 */
    var flow = el("div", "sd-block");
    flow.appendChild(el("h3", "sd-h3", "📋 场景流程"));
    if (storyObj) {
      var ol = el("ol", "sd-flow");
      storyObj.scenes.forEach(function (sc, i) {
        var n = i + 1;
        var li = el("li", "sd-flowitem");
        li.appendChild(el("span", "sf-no", n < 10 ? "0" + n : "" + n));
        var m = el("div", "sf-mid");
        /* name 形如「Scene 01」，是给正文页用的；这里用中文标题，不重复编号 */
        m.appendChild(el("span", "sf-name", sc.zh || sc.name || ""));
        li.appendChild(m);
        ol.appendChild(li);
      });
      flow.appendChild(ol);
    } else {
      flow.appendChild(el("p", "sd-ph",
        unlocked ? "这个场景的流程还在制作中，做好就会出现在这里。"
                 : "🔒 共 3–4 幕完整对话流程，解锁后可见。"));
    }
    host.appendChild(flow);

    /* 必备词汇 */
    var voc = el("div", "sd-block");
    voc.appendChild(el("h3", "sd-h3", "📖 必备词汇"));
    voc.appendChild(el("p", "sd-ph",
      storyObj ? "学的时候，重点名词会带色标注，点一下弹出中文词卡并朗读。"
               : (unlocked ? "词汇表随场景正文一起上线。" : "🔒 解锁后可见本场景的必备词汇表。")));
    host.appendChild(voc);

    /* 底部行动区 */
    var cta = el("div", "sd-cta");
    if (st === "open" || st === "done") {
      var b1 = el("button", "bigbtn", st === "done" ? "🔁 再走一遍" : "🎬 开始学习");
      b1.addEventListener("click", function () { playScene(s.id); });
      cta.appendChild(b1);
    } else if (st === "lock") {
      var note = el("p", "sd-locknote",
        "「" + s.titleZh + "」属于" + packNameOf(s.pack) + "，购买后可解锁全部内容。");
      cta.appendChild(note);
      var b2 = el("button", "bigbtn", "🔓 查看解锁方式");
      b2.addEventListener("click", function () { nav("shop"); });
      cta.appendChild(b2);
      var b3 = el("button", "btn ghost", "先免费体验咖啡店");
      b3.addEventListener("click", function () { playScene("cafe"); });
      cta.appendChild(b3);
    } else {
      var b4 = el("button", "bigbtn", "☕ 先去体验咖啡店");
      b4.addEventListener("click", function () { playScene("cafe"); });
      cta.appendChild(b4);
      cta.appendChild(el("p", "sd-ph", "「" + s.titleZh + "」正在制作中，下个版本见。"));
    }
    cta.appendChild(listenHelpBtn());

    host.appendChild(cta);
  }

  /* ================= v4：救命句 / 必要单词 / 我的备忘录（阶段 4） =================
   * 收藏分两套，**绝不共用**：
   *   riyu.favs  —— 生词本（主线句子），全站免费；本次改动一个字节都没碰
   *   riyu.memo  —— 救命句收藏，属于救命句模块
   * 这是用户定的红线：两者是不同的东西，不能共用同一个开关。
   * ---------------------------------------------------------------------- */
  K.memo = "riyu.memo";
  K.profile = "riyu.profile";
  var memo = loadJson(K.memo, []);
  var wordsSid = null;                 // 「必要单词」当前选中的情景
  function saveMemo() { saveJson(K.memo, memo); }
  function memoIndexOf(id) {
    for (var i = 0; i < memo.length; i++) if (memo[i].id === id) return i;
    return -1;
  }

  /* 一行「日文 + 读法 + 中文 + 🔊 (+ ☆)」，救命句和必要单词共用 */
  function phraseRow(item, id, opts) {
    opts = opts || {};
    var row = el("div", "prow");

    var main = el("div", "p-main");
    var jaBtn = el("button", "p-ja", item.ja);
    jaBtn.type = "button";
    jaBtn.title = "点一下朗读";
    jaBtn.addEventListener("click", function () { playSentence(jaBtn, item.rd || item.ja); });
    main.appendChild(jaBtn);
    if (item.rd && item.rd !== item.ja) main.appendChild(el("div", "p-rd", item.rd));
    if (item.zh) main.appendChild(el("div", "p-zh", item.zh));
    row.appendChild(main);

    var acts = el("div", "p-acts");
    var sp = el("button", "p-btn", "🔊");
    sp.type = "button"; sp.title = "朗读";
    sp.addEventListener("click", function () { playSentence(sp, item.rd || item.ja); });
    acts.appendChild(sp);

    if (opts.fav) {
      var on = memoIndexOf(id) >= 0;
      var fb = el("button", "p-btn" + (on ? " on" : ""), on ? "⭐" : "☆");
      fb.type = "button"; fb.title = "收藏到我的备忘录";
      fb.addEventListener("click", function () {
        var i = memoIndexOf(id);
        if (i >= 0) {
          memo.splice(i, 1);
          fb.textContent = "☆"; fb.classList.remove("on");
          toast("已取消收藏。");
        } else {
          memo.push({ id: id, ja: item.ja, rd: item.rd || "", zh: item.zh || "", cat: opts.cat || "" });
          fb.textContent = "⭐"; fb.classList.add("on");
          toast("已收进我的备忘录。");
        }
        saveMemo();
        if (typeof opts.onChange === "function") opts.onChange();
      });
      acts.appendChild(fb);
    }
    row.appendChild(acts);
    return row;
  }

  /* ---------------- 救命句（半开放） ---------------- */
  function renderPhrases() {
    var host = $("#phrBody");
    if (!host) return;
    host.innerHTML = "";
    var P = window.RIYU_PHRASES;
    if (!P) { scaffoldNote(host, "语言急救包数据还没加载。"); return; }
    var E = window.Entitlement;
    var got = (E && E.get) ? E.get() : { travel: false, study: false };

    host.appendChild(el("p", "phr-intro",
      "遇到不会说的情况，马上找到能用的表达。其中 " + P.freeCount +
      " 句人人可看可听；全站共 " + (P.freeCount + P.paidCount) + " 句。"));

    /* 每类一张卡，先铺 2×2 的类目格子，点进去再看句子 ——
       四类平铺会把几十行句子一次性倒出来，找不快。 */
    var grid = el("div", "phrgrid");
    var detail = el("div", "phrdetail");
    var cur = null;

    function pick(c) {
      cur = c;
      Array.prototype.forEach.call(grid.children, function (b) {
        b.classList.toggle("on", b.dataset.cat === c.id);
      });
      renderCat();
    }

    function renderCat() {
      detail.innerHTML = "";
      if (!cur) return;
      var packGot = cur.pack === "study" ? got.study : got.travel;

      var block = el("div", "sd-block");
      var h = el("div", "phr-head");
      h.appendChild(el("span", "phr-emoji", cur.emoji));
      var tb = el("div", "phr-tb");
      tb.appendChild(el("h3", "phr-name", cur.name));
      tb.appendChild(el("p", "phr-sub", cur.zh));
      h.appendChild(tb);
      h.appendChild(el("span", "phr-n", cur.base.length + " 句"));
      block.appendChild(h);

      if (!cur.base.length) {
        block.appendChild(el("p", "muted",
          "这一类没有通用句 —— 都是" + packNameOf(cur.pack) + "里才会用到的场景句。"));
      }
      cur.base.forEach(function (it, i) {
        block.appendChild(phraseRow(it, cur.id + "-" + i, { fav: true, cat: cur.name }));
      });

      /* 付费部分。
         正文默认不在前端（公开仓库里搜不到），所以这里分三种情况：
           ① 真拿到了（本机预览，js/paid/phrases-paid.js 在）→ 照常渲染成句子
           ② 已解锁但正文没下发 → 如实说「还没下发」，**不能**说「在你的XX里」——
              那会让预览的人对着一个永远不出现的空档干等
           ③ 没解锁 → 说清楚有几句、随哪一篇解锁 */
      var paid = paidPhrasesOf(cur.id);
      if (paid && paid.length) {
        paid.forEach(function (it, i) {
          block.appendChild(phraseRow(it, cur.id + "-p" + i, { fav: true, cat: cur.name }));
        });
        if (cur.paidCount > paid.length) {
          block.appendChild(el("p", "muted",
            "这一类一共 " + cur.paidCount + " 句，当前设备上只带了 " + paid.length + " 句。"));
        }
      } else if (cur.paidCount) {
        var lock = el("div", "phr-lock");
        if (packGot) {
          lock.appendChild(el("span", "pl-ic", "🔓"));
          lock.appendChild(el("span", "pl-tx",
            "这一类还有 " + cur.paidCount + " 句，属于" + packNameOf(cur.pack) +
            " —— 正文还没下发到这台设备。"));
        } else {
          lock.appendChild(el("span", "pl-ic", "🔒"));
          lock.appendChild(el("span", "pl-tx",
            "另有 " + cur.paidCount + " 句" + cur.name + "专用句，随" + packNameOf(cur.pack) + "解锁"));
          var lb = el("button", "linkbtn", "查看解锁方式 →");
          lb.addEventListener("click", function () { nav("shop"); });
          lock.appendChild(lb);
        }
        block.appendChild(lock);
      }
      detail.appendChild(block);
    }

    P.cats.forEach(function (c) {
      var got2 = c.pack === "study" ? got.study : got.travel;
      var b = el("button", "phrcat" + (got2 ? "" : " locked"));
      b.type = "button";
      b.dataset.cat = c.id;
      b.appendChild(el("span", "pc-emoji", c.emoji));
      b.appendChild(el("span", "pc-name", c.name));
      b.appendChild(el("span", "pc-sub", c.zh));
      var n = el("span", "pc-n");
      n.textContent = got2
        ? (c.base.length + c.paidCount) + " 句"
        : c.base.length + " 句 + 🔒" + c.paidCount;
      b.appendChild(n);
      b.addEventListener("click", function () { pick(c); });
      grid.appendChild(b);
    });

    host.appendChild(grid);
    host.appendChild(detail);
    pick(P.cats[0]);
  }

  /* ---------------- 必要单词（按场景取词） ----------------
   * 单词跟对话正文同级，都属于付费内容：公开前端只有免费咖啡店那 4 个词，
   * 其余场景只给「有几个词」这个销售数字（见 registry.js 的 WORDS）。
   * 所以这里**拿不到词表就画锁定行，绝不编假词**。 */
  function renderWords() {
    var host = $("#wordBody");
    if (!host) return;
    host.innerHTML = "";
    var R = reg();
    if (!R) { scaffoldNote(host, "场景目录还没加载。"); return; }
    var E = window.Entitlement;

    /* 没选过、或选中的场景已不存在 → 默认落在免费咖啡店，
       别默认到一个锁着的场景，第一眼就是🔒 */
    if (!wordsSid || !R.sceneById(wordsSid)) {
      var firstOpen = R.scenes.filter(function (s) { return !!R.wordsOf(s.id); })[0];
      wordsSid = firstOpen ? firstOpen.id : R.scenes[0].id;
    }

    /* 56 个场景铺成 chips 会占掉半屏，用原生 select 更省地方也更好找；
       按篇目分 optgroup，不然 56 个选项一条长龙找不到东西 */
    var row = el("div", "wordbar");
    row.appendChild(el("label", "wb-lbl", "选择场景"));
    var sel = el("select", "wordsel");
    sel.setAttribute("aria-label", "选择场景");
    [["travel", "🧳 旅行篇"], ["study", "🎓 求学篇"]].forEach(function (pk) {
      var list = R.packScenes(pk[0]);
      if (!list.length) return;
      var og = document.createElement("optgroup");
      og.label = pk[1];
      list.forEach(function (s) {
        var o = el("option", "", s.emoji + " " + s.titleZh + "（" + R.wordCountOf(s.id) + " 词）");
        o.value = s.id;
        if (s.id === wordsSid) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.addEventListener("change", function () { wordsSid = sel.value; renderWords(); });
    row.appendChild(sel);
    host.appendChild(row);

    var sc = R.sceneById(wordsSid);
    var list = R.wordsOf(sc.id);          /* 前端有的词表；没有就是 null */
    var n = R.wordCountOf(sc.id);

    var card = el("div", "sd-block");
    var h = el("div", "phr-head");
    h.appendChild(el("span", "phr-emoji", sc.emoji));
    var tb = el("div", "phr-tb");
    tb.appendChild(el("h3", "phr-name", sc.titleZh));
    tb.appendChild(el("p", "phr-sub", sc.titleJa));
    h.appendChild(tb);
    h.appendChild(el("span", "phr-n", n + " 词"));
    card.appendChild(h);

    if (list) {
      list.forEach(function (v, i) {
        card.appendChild(phraseRow({ ja: v.ja, rd: v.rd, zh: v.zh }, sc.id + "-v" + i, { fav: false }));
      });
      /* 只有能进的场景才给入口，锁着的不给假按钮 */
      var canPlay = !E || E.isSceneUnlocked(sc.id);
      if (canPlay && sc.story) {
        var go = el("button", "bigbtn", "🎬 进入这一课");
        go.addEventListener("click", function () { playScene(sc.id); });
        card.appendChild(go);
      }
    } else {
      /* 正文不在公开前端 —— 如实说，不摆灰色假单词。
         跟语言急救包同一套三分法：拿到了就渲染，已解锁但没下发就说没下发，
         没解锁才让人去解锁。对已经买过的人喊「解锁后可查看」是说不通的。 */
      var paidW = paidWordsOf(sc.id);
      if (paidW && paidW.length) {
        paidW.forEach(function (v, i) {
          card.appendChild(phraseRow({ ja: v.ja, rd: v.rd, zh: v.zh }, sc.id + "-vp" + i, { fav: false }));
        });
      } else {
        var lock = el("div", "phr-lock");
        if (E && E.isSceneUnlocked(sc.id)) {
          lock.appendChild(el("span", "pl-ic", "🔓"));
          lock.appendChild(el("span", "pl-tx",
            "这 " + n + " 个词属于" + packNameOf(sc.pack) + " —— 正文还没下发到这台设备。"));
        } else {
          lock.appendChild(el("span", "pl-ic", "🔒"));
          lock.appendChild(el("span", "pl-tx",
            "解锁" + packNameOf(sc.pack) + "后可查看这 " + n + " 个词"));
          var lb = el("button", "linkbtn", "查看解锁方式 →");
          lb.addEventListener("click", function () { nav("shop"); });
          lock.appendChild(lb);
        }
        card.appendChild(lock);
      }
    }
    host.appendChild(card);
  }

  /* ---------------- 我的备忘录（救命句收藏） ---------------- */
  function renderMemo() {
    var host = $("#memoBody");
    if (!host) return;
    host.innerHTML = "";

    if (!memo.length) {
      scaffoldNote(host, "还没有收藏任何句子。去「语言急救包」点 ☆ 把用得上的存进来。");
      var g = el("button", "bigbtn", "🆘 去语言急救包看看");
      g.addEventListener("click", function () { nav("phrases"); });
      host.appendChild(g);
      return;
    }

    var card = el("div", "sd-block");
    var h = el("div", "phr-head");
    var tb = el("div", "phr-tb");
    tb.appendChild(el("h3", "phr-name", "收藏了 " + memo.length + " 句"));
    tb.appendChild(el("p", "phr-sub", "收的是整句（带读法），不是单词。点句子朗读；点 ⭐ 取消收藏。"));
    h.appendChild(tb);
    card.appendChild(h);

    memo.forEach(function (m) {
      card.appendChild(phraseRow(m, m.id, {
        fav: true, cat: m.cat,
        onChange: function () { renderMemo(); }
      }));
    });

    var clr = el("button", "btn ghost danger", "清空备忘录");
    clr.addEventListener("click", function () {
      if (!window.confirm("确定清空我的备忘录？此操作不可撤销。")) return;
      memo = []; saveMemo(); renderMemo(); toast("备忘录已清空。");
    });
    card.appendChild(clr);
    host.appendChild(card);
  }

  /* ================= v4：我的 / 购买页（阶段 5） =================
   * 重要：购买状态一律问 window.Entitlement，本文件**从不读 localStorage 判断**。
   * 这里的 profile 只是本地资料（昵称/出发日期），跟权限毫无关系。
   * 支付接口按计划不做，按钮只给「即将开放」的说明。
   * ------------------------------------------------------------ */
  var profile = loadJson(K.profile, { nick: "", phone: "", depart: "" });
  function saveProfile() { saveJson(K.profile, profile); }

  /* 手机号脱敏：本地只存占位串，真号永远不进前端 */
  function maskPhone(p) {
    p = String(p || "");
    if (p.length < 7) return p || "未绑定";
    return p.slice(0, 3) + "****" + p.slice(-4);
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return null;
    var target = new Date(+m[1], +m[2] - 1, +m[3]);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  /* ------------------------------------------------------------------
   * 桌面端外壳：左栏 / 右栏
   * ------------------------------------------------------------------
   * 手机端这两块都被 CSS 隐藏（.sidebar/.rail 只在 min-width:1000px 显示），
   * 所以它们多花的那点 DOM 不影响移动端首屏。
   * ------------------------------------------------------------------ */

  /* 把底部 tab 的每个 .tb 克隆进左栏。导航项因此只有 index.html 里那一份来源，
     加一项/改一项只改那里，两边同时生效。 */
  function buildSidebar() {
    var host = $("#sideNav");
    var bar = $("#tabBar");
    if (!host || !bar) return;
    host.innerHTML = "";
    bar.querySelectorAll(".tb").forEach(function (src) {
      var b = el("button", "sidebtn");
      b.dataset.nav = src.dataset.nav;
      var svg = src.querySelector(".tb-ic");
      if (svg) b.appendChild(svg.cloneNode(true));
      var tx = src.querySelector(".tb-tx");
      b.appendChild(el("span", "sb-tx", tx ? tx.textContent : ""));
      b.addEventListener("click", function () { nav(b.dataset.nav); });
      host.appendChild(b);
    });
  }

  /* 右栏：倒计时 / 今日建议 / 最近学习。三块都基于本机已有的数据，
     没有新数据源，也不联网。 */
  function renderRail() {
    var host = $("#rail");
    if (!host) return;
    host.innerHTML = "";

    /* ---- ① 出发倒计时 ---- */
    var days = daysUntil(profile.depart);
    var c1 = el("div", "rail-card");
    if (days === null) {
      c1.appendChild(el("div", "rc-h", "📅 日本之旅"));
      /* 左栏没有输入框，这里只当入口，设日期仍然去「我的」页 */
      c1.appendChild(el("p", "rc-sub", "还没设置出发日期。设好之后，这里会一直显示还有几天。"));
      var go = el("button", "rc-btn", "去设置出发日期");
      go.addEventListener("click", function () { nav("me"); });
      c1.appendChild(go);
    } else if (days > 0) {
      c1.appendChild(el("div", "rc-num", String(days)));
      c1.appendChild(el("p", "rc-sub", "天后出发 · " + profile.depart));
      c1.appendChild(el("p", "rc-sub", "每天走一个场景，走完正好用得上。"));
    } else if (days === 0) {
      c1.appendChild(el("div", "rc-num", "今天"));
      c1.appendChild(el("p", "rc-sub", "🎌 就是今天出发，一路顺利。"));
    } else {
      c1.appendChild(el("div", "rc-num", String(Math.abs(days))));
      c1.appendChild(el("p", "rc-sub", "天前出发 · 回来复习一下也不错。"));
    }
    host.appendChild(c1);

    /* ---- ② 今日建议 ---- */
    var c2 = el("div", "rail-card");
    c2.appendChild(el("div", "rc-h", "💡 今日建议"));
    var doneN = passedCount();
    var tipTitle, tipSub, tipGo;
    if (!doneN) {
      tipTitle = "咖啡店点单";
      tipSub = "免费的体验课，先走一遍，看看自己卡在哪一句。";
      tipGo = "scene";
    } else if (TOTAL && doneN < TOTAL) {
      var nx = (SCENARIOS[doneN] || {});
      tipTitle = "第 " + (doneN + 1) + " 关 · " + (nx.titleZh || "下一关");
      tipSub = "接着上次往下走，一关大概三五分钟。";
      tipGo = "home";
    } else {
      tipTitle = "复习今天学过的";
      tipSub = "回「我的备忘录」把收藏过的句子再念两遍，比学新的管用。";
      tipGo = "memo";
    }
    c2.appendChild(el("div", "rc-tip", tipTitle));
    c2.appendChild(el("p", "rc-sub", tipSub));
    var bt = el("button", "rc-btn", tipGo === "scene" ? "开始体验" : (tipGo === "memo" ? "打开备忘录" : "继续学习"));
    bt.addEventListener("click", function () {
      /* 免费体验课不走「继续闯关」，而是进咖啡店的场景详情页（openScene 内部会 nav） */
      if (tipGo === "scene") { openScene("cafe", "home"); return; }
      nav(tipGo);
    });
    c2.appendChild(bt);
    host.appendChild(c2);

    /* ---- ③ 最近学习 ---- */
    var c3 = el("div", "rail-card");
    c3.appendChild(el("div", "rc-h", "🕒 最近学习"));
    var ts = packStat("travel");
    var ss = packStat("study");
    var rows = [
      ["🧳 旅行篇", ts.done, ts.total],
      ["🎓 求学篇", ss.done, ss.total]
    ];
    rows.forEach(function (r) {
      var line = el("div", "rc-line");
      line.appendChild(el("span", "rc-name", r[0]));
      line.appendChild(el("span", "rc-val", r[2] ? (r[1] + " / " + r[2]) : "🔒 未解锁"));
      c3.appendChild(line);
    });
    if (memo.length) {
      var mline = el("div", "rc-line");
      mline.appendChild(el("span", "rc-name", "⭐ 备忘录"));
      mline.appendChild(el("span", "rc-val", memo.length + " 句"));
      c3.appendChild(mline);
    } else {
      c3.appendChild(el("p", "rc-sub", "还没收藏句子。听到想记住的，点一下 ☆ 就会存到这里。"));
    }
    host.appendChild(c3);
  }

  function renderMe() {
    var host = $("#meBody");
    if (!host) return;
    host.innerHTML = "";
    var R = reg();
    var E = window.Entitlement;
    var got = (E && E.get) ? E.get() : { travel: false, study: false, full: false };

    /* ---- 资料卡 ---- */
    var card = el("div", "me-card");
    card.appendChild(el("div", "me-avatar", profile.nick ? profile.nick.slice(0, 1) : "🙂"));
    var info = el("div", "me-info");
    var nickRow = el("div", "me-nickrow");
    var nickInput = el("input", "me-nick");
    nickInput.type = "text";
    nickInput.maxLength = 12;
    nickInput.placeholder = "点这里起个昵称";
    nickInput.value = profile.nick || "";
    nickInput.addEventListener("change", function () {
      profile.nick = nickInput.value.trim();
      saveProfile(); renderMe();
    });
    nickRow.appendChild(nickInput);
    info.appendChild(nickRow);
    info.appendChild(el("div", "me-phone", "📱 " + maskPhone(profile.phone)));
    card.appendChild(info);
    host.appendChild(card);

    /* ---- 登录入口（占位，明确说还没开放） ---- */
    /* 用 me-loginrow 而不是 me-row：me-row 是卡片内部的列表行（透明底、虚线下划线），
     * 直接放在顶层会变成两张白卡之间的「孤儿」，所以这里套卡片外观。 */
    var loginRow = el("div", "me-card me-loginrow");
    loginRow.appendChild(el("span", "mr-ic", "🔑"));
    var lt = el("div", "mr-tb");
    lt.appendChild(el("span", "mr-name", "登录账号"));
    lt.appendChild(el("span", "mr-sub", "登录后可跨设备同步学习记录与购买内容"));
    loginRow.appendChild(lt);
    var logBtn = el("button", "minibtn", "即将开放");
    logBtn.disabled = true;
    loginRow.appendChild(logBtn);
    host.appendChild(loginRow);

    /* ---- 出发倒计时 ---- */
    var trip = el("div", "me-card me-trip");
    var days = daysUntil(profile.depart);
    if (days === null) {
      trip.appendChild(el("div", "mt-big", "📅 还没设置出发日期"));
      trip.appendChild(el("p", "mt-sub", "设好日期，首页就能看到还有几天，心里有数。"));
    } else if (days > 0) {
      trip.appendChild(el("div", "mt-big", "距出发还有 " + days + " 天"));
      trip.appendChild(el("p", "mt-sub", profile.depart + " 出发 · 每天走一个场景，走完正好用得上。"));
    } else if (days === 0) {
      trip.appendChild(el("div", "mt-big", "🎌 就是今天出发！"));
      trip.appendChild(el("p", "mt-sub", "一路顺利。到日本后这里随时能翻。"));
    } else {
      trip.appendChild(el("div", "mt-big", "旅行已过去 " + Math.abs(days) + " 天"));
      trip.appendChild(el("p", "mt-sub", "回来复习一下也不错。"));
    }
    var dateRow = el("div", "me-daterow");
    var di = el("input", "me-date");
    di.type = "date";
    di.value = profile.depart || "";
    di.setAttribute("aria-label", "出发日期");
    di.addEventListener("change", function () {
      profile.depart = di.value; saveProfile(); renderMe();
    });
    dateRow.appendChild(di);
    if (profile.depart) {
      var cd = el("button", "minibtn", "清除");
      cd.addEventListener("click", function () { profile.depart = ""; saveProfile(); renderMe(); });
      dateRow.appendChild(cd);
    }
    trip.appendChild(dateRow);
    host.appendChild(trip);

    /* ---- 学习进度 ---- */
    var prog = el("div", "me-card");
    prog.appendChild(el("div", "me-h", "📊 我的进度"));
    var D = (R && R.DISPLAY) || {};
    var doneN = passedCount();
    var ts = packStat("travel");
    var ss = packStat("study");
    [
      ["🧳 旅行篇 · 全部场景", ts.done, ts.total],
      ["🎓 求学篇 · 全部场景", ss.done, ss.total],
      ["🆘 语言急救包",       0,      D.phrases],
      ["📖 必要单词",         0,      D.words]
    ].forEach(function (row) {
      var line = el("div", "me-progline");
      line.appendChild(el("span", "mp-name", row[0]));
      /* 分母为 0 = 这部分正文没解锁（不在公开前端），别显示「0 / 0」 */
      line.appendChild(el("span", "mp-val", row[2] ? (row[1] + " / " + row[2]) : "🔒 未解锁"));
      prog.appendChild(line);
    });
    /* 推荐路线是任务数，和上面的场景数是两个口径，单独一行说清楚 */
    var tline = el("div", "me-progline");
    tline.appendChild(el("span", "mp-name", "🚩 旅行篇 · 推荐路线"));
    tline.appendChild(el("span", "mp-val", TOTAL ? (doneN + " / " + TOTAL) : "🔒 未解锁"));
    prog.appendChild(tline);
    host.appendChild(prog);

    /* ---- 功能入口 ---- */
    var links = [
      { ic: "⭐", name: "我的备忘录", sub: memo.length ? "已收藏 " + memo.length + " 句" : "还没收藏句子", go: "memo" },
      { ic: "🆘", name: "语言急救包", sub: "开不了口时递屏幕也能用", go: "phrases" },
      { ic: "📖", name: "必要单词", sub: "每个场景真正用得上的 3~4 个词", go: "words" },
      { ic: "🗾", name: "场景地图", sub: "旅行篇 + 求学篇全部场景", go: "map" }
    ];
    var linkBox = el("div", "me-card");
    linkBox.appendChild(el("div", "me-h", "🧰 常用"));
    links.forEach(function (l) {
      var r = el("button", "me-row");
      r.type = "button";
      r.appendChild(el("span", "mr-ic", l.ic));
      var tb = el("div", "mr-tb");
      tb.appendChild(el("span", "mr-name", l.name));
      tb.appendChild(el("span", "mr-sub", l.sub));
      r.appendChild(tb);
      r.appendChild(el("span", "mr-go", "›"));
      r.addEventListener("click", function () { nav(l.go); });
      linkBox.appendChild(r);
    });
    var rSet = el("button", "me-row");
    rSet.type = "button";
    rSet.appendChild(el("span", "mr-ic", "⚙"));
    var stb = el("div", "mr-tb");
    stb.appendChild(el("span", "mr-name", "设置"));
    stb.appendChild(el("span", "mr-sub", "语速、中文显示、重置数据"));
    rSet.appendChild(stb);
    rSet.appendChild(el("span", "mr-go", "›"));
    rSet.addEventListener("click", function () { openSettings(); });
    linkBox.appendChild(rSet);
    host.appendChild(linkBox);

    /* ---- 解锁状态 ---- */
    var own = el("div", "me-card me-own");
    /* 这一块该推哪个包：已买齐就不推；买了单篇推另一篇；都没有就推完整版
       （完整版这时确实最划算 —— 和购买页置顶那张卡是同一个结论，不是话术）。 */
    var pickId = null;
    if (got.full) {
      own.appendChild(el("div", "mo-big", "✅ 已解锁完整版"));
      own.appendChild(el("p", "mo-sub", "旅行篇 + 求学篇全部内容都已开放。"));
    } else if (got.travel) {
      pickId = "study";
      own.appendChild(el("div", "mo-big", "🔓 已解锁旅行篇"));
      own.appendChild(el("p", "mo-sub", "求学篇还没解锁，补齐就能上课、打工、办手续都用得上。"));
    } else if (got.study) {
      pickId = "travel";
      own.appendChild(el("div", "mo-big", "🔓 已解锁求学篇"));
      own.appendChild(el("p", "mo-sub", "旅行篇还没解锁，去日本前后的吃住行都在里面。"));
    } else {
      pickId = "bundle";
      own.appendChild(el("div", "mo-big", "🔒 当前是免费体验"));
      own.appendChild(el("p", "mo-sub", "咖啡店场景完整免费，其余场景需要解锁。"));
    }

    var pickPack = (pickId && R) ? R.packs[pickId] : null;
    if (pickPack) {
      /* 价格只在这里亮一次：首发价大、正式价划掉。
         不写「限时」「仅剩」—— 本轮只是价格展示，没有任何真实促销。 */
      var priceRow = el("div", "mo-price");
      priceRow.appendChild(el("span", "mo-pk", pickPack.emoji + " " + pickPack.name));
      var now = el("span", "mo-now");
      now.appendChild(el("span", "mo-num", pickPack.price));
      if (pickPack.listPrice) now.appendChild(el("span", "sc-was", pickPack.listPrice));
      priceRow.appendChild(now);
      own.appendChild(priceRow);
      if (pickPack.saveText) own.appendChild(el("p", "mo-save", pickPack.saveText));
    }

    /* 按钮用 unit（旅行篇/求学篇/完整版）而不是 name ——
       bundle 的 name 是「旅行 + 求学 完整版」，塞进按钮太长。 */
    var sb = el("button", "bigbtn", got.full ? "查看已购内容"
      : (pickPack ? "🔓 解锁" + (pickPack.unit || pickPack.name) : "🔓 解锁全部场景"));
    sb.addEventListener("click", function () { nav("shop"); });
    own.appendChild(sb);
    host.appendChild(own);

    /* 出发日期是在本页改的，改完顺手刷新桌面右栏，否则要切页才更新 */
    renderRail();
  }

  /* ---------------- 购买页（纯 UI） ---------------- */
  function renderShop() {
    var host = $("#shopBody");
    if (!host) return;
    host.innerHTML = "";
    var R = reg();
    if (!R) { scaffoldNote(host, "商品信息还没加载。"); return; }
    var E = window.Entitlement;
    var got = (E && E.get) ? E.get() : { travel: false, study: false, full: false };

    var order = ["bundle", "travel", "study"];
    order.forEach(function (pid, idx) {
      var pk = R.packs[pid];
      var owned = pid === "bundle" ? got.full : (pid === "travel" ? got.travel : got.study);
      var card = el("div", "shopcard" + (idx === 0 ? " best" : ""));

      if (idx === 0) card.appendChild(el("span", "shop-badge", "最划算 · " + pk.saveText));
      var head = el("div", "sc-head");
      head.appendChild(el("span", "sc-emoji", pk.emoji));
      var hb = el("div", "sc-hb");
      hb.appendChild(el("h3", "sc-name", pk.name));
      if (pk.tagline) hb.appendChild(el("p", "sc-tag", pk.tagline));
      head.appendChild(hb);
      /* 价格：首发价在左、划掉的正式价在右，外加一行小字说清哪个是哪个。
         不写「限时」「仅剩」这类话 —— 只是价格展示，促销话术等真有活动时再加。 */
      var price = el("div", "sc-price");
      price.appendChild(el("span", "sc-kicker", "首发体验价"));
      var pnow = el("div", "sc-now");
      pnow.appendChild(el("span", "sc-num", pk.price));
      if (pk.listPrice) pnow.appendChild(el("span", "sc-was", pk.listPrice));
      price.appendChild(pnow);
      price.appendChild(el("span", "sc-unit", "买断"));
      head.appendChild(price);
      card.appendChild(head);

      /* 权益清单：只说「买到什么结构」，不列任何场景正文的名字。
         这里不再单独写「共 N 个场景」—— features 里第一条就是场景总数，
         再算一次只会算出「共 4 个场景」这种把标签条数当场景数的怪话。 */
      if (pk.features) {
        var fl = el("div", "sc-feats");
        pk.features.forEach(function (f) { fl.appendChild(el("span", "sc-feat", f)); });
        card.appendChild(fl);
      }

      var btn = el("button", "bigbtn" + (owned ? " ghost" : ""), owned ? "✅ 已拥有" : "购买 " + pk.name);
      btn.disabled = owned;
      if (!owned) {
        btn.addEventListener("click", function () {
          toast("支付功能即将开放。开放前可以先免费体验咖啡店。");
        });
      }
      card.appendChild(btn);
      host.appendChild(card);
    });

    var freeCard = el("div", "shopnote");
    freeCard.appendChild(el("span", "sn-ic", "☕"));
    var snb = el("div", "sn-tb");
    snb.appendChild(el("span", "sn-name", "免费体验区"));
    /* 只列真的免费的东西。主线 25 关和其余场景的正文属于付费内容，
       写进这张卡就是虚假宣传（v4 那句「主线 25 关…全部免费」就是这么错的）。 */
    snb.appendChild(el("span", "sn-sub",
      "咖啡店完整 6 幕 · 16 句基础急救句 · 咖啡店的 4 个词。全部免费，不用注册。"));
    freeCard.appendChild(snb);
    var fb = el("button", "minibtn", "去体验");
    fb.addEventListener("click", function () { playScene("cafe"); });
    freeCard.appendChild(fb);
    host.appendChild(freeCard);

    host.appendChild(el("p", "shop-foot",
      "本页只是界面演示，还没有接入支付。所有价格与内容以正式上线时为准。"));
  }

  /* ================= 真实情景 · 沉浸式（v3.3） =================
   * 情景内容数据在 js/story/*.js（window.RIYU_STORY），本引擎不关心具体是哪个
   * 情景，只要数据符合 schema 就能跑。与主线 25 关完全解耦：
   * 不进 unlock / scPass / seen / warm，进度只记“是否完整走过一次”（本地），
   * 用来在首页入口打 ✓。所有日语句子整块可点朗读（复用 playSentence）。
   * ------------------------------------------------------------ */
  K.storyDone = "riyu.storyDone";
  var STORIES = window.RIYU_STORY || {};
  var story = { id: null, si: 0, j: 0, zhOn: true };
  var storyDone = loadJson(K.storyDone, {});
  function saveStoryDone() { saveJson(K.storyDone, storyDone); }
  function firstStory() { for (var k in STORIES) return STORIES[k]; return null; }
  function curStory() { return (story.id && STORIES[story.id]) ? STORIES[story.id] : null; }
  function sceneNoText(i) { var n = i + 1; return "Scene " + (n < 10 ? "0" + n : "" + n); }

  /* 场景进度条（顶部小胶囊：已过 ✓ / 当前点亮 / 未到置灰） */
  var progressPills = [];
  function buildProgressBar(st) {
    var bar = el("div", "story-progress");
    progressPills = [];
    (st.scenes || []).forEach(function (sc, i) {
      var p = el("span", "sp");
      p.setAttribute("aria-label", "第 " + (i + 1) + " 幕：" + (sc.short || sc.zh));
      p.appendChild(el("span", "spn", (i < 9 ? "0" : "") + (i + 1)));
      p.appendChild(el("span", "spt", sc.short || sc.zh));
      bar.appendChild(p);
      progressPills.push(p);
    });
    return bar;
  }
  function refreshStoryProgress() {
    var st = curStory(); if (!st) return;
    progressPills.forEach(function (p, i) {
      p.classList.remove("on", "done");
      if (i < story.si) p.classList.add("done");
      else if (i === story.si) p.classList.add("on");
    });
  }

  /* 首页入口：从数据填封面/标题/开场，已完成则打 ✓ */
  function refreshStoryGate() {
    var g = $("#storyGate"); if (!g) return;
    var st = firstStory();
    if (!st) { g.hidden = true; return; }
    g.hidden = false;
    var cv = $("#sgCover"); if (cv && st.cover) cv.src = st.cover;
    var ti = $("#sgTitle");
    if (ti && ti.firstChild) ti.firstChild.textContent = st.themeZh + "　";
    var tj = $("#sgTitleJa"); if (tj) tj.textContent = st.themeJa;
    var stx = $("#sgStart"); if (stx && st.startZh) stx.textContent = st.startZh;
    var done = $("#sgDone"); if (done) done.hidden = !storyDone[st.id];
  }

  /* v4：支持按故事 id 打开（原来只能开第一个）；不传参或传事件对象时退回第一个 */
  function openStory(id) {
    var st = (typeof id === "string" && STORIES[id]) ? STORIES[id] : firstStory();
    if (!st) { toast("还没有真实情景内容。"); return; }
    story.id = st.id; story.si = 0; story.j = 0; story.zhOn = true; story.voiceOn = true;
    story.usedRepeat = false;    // 完成页的「请再说一遍」那一项按本次走的结果算
    nav("story");
    renderStory();
  }
  /* 顺序要紧：先 refreshStoryGate() 填内容，再 nav("home")。
     nav 里的 renderToday() 才是决定这块显示不显示的人 —— 反过来会被
     refreshStoryGate 无条件 hidden=false 盖掉。 */
  function storyGoHome() { refreshStoryGate(); nav("home"); }

  /* ---- 段落构建小工具（全部复用全局 $ / el / playSentence） ---- */
  function stagePush(node) {
    var stage = $("#storyStage"); if (!stage) return;
    stage.appendChild(node);
  }
  /* 整句可点朗读的句子块 */
  function sSay(ja) {
    var s = el("div", "say");
    s.setAttribute("role", "button");
    s.setAttribute("tabindex", "0");
    s.setAttribute("aria-label", "朗读：" + (ja || ""));
    s.appendChild(document.createTextNode(ja || ""));
    s.appendChild(el("span", "say-ic", "🔊"));
    s.addEventListener("click", function () { if (chainBusy) return; playSentence(s, ja); });
    s.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (chainBusy) return; playSentence(s, ja); }
    });
    return s;
  }
  function sRd(t) { return el("div", "s-rd", t); }
  function sZh(t) { return el("div", "s-zh", t); }
  function sFigure(src, alt) {
    var f = el("figure", "sceneimg");
    var im = el("img");
    im.src = src; im.alt = alt || "场景插画"; im.loading = "lazy";
    im.onerror = function () { f.classList.add("imgmiss"); };
    f.appendChild(im);
    return f;
  }
  /* 一个“说话人”句行：头像标签(店员/你) + 日语整句(可点) + 读法 + 中文 */
  function sLine(who, txt) {
    var row = el("div", "sline " + who);
    var chip = el("span", "chip", who === "you" ? "あなた" : "店員");
    row.appendChild(chip);
    var main = el("div", "sline-main");
    main.appendChild(sSay(txt.ja));
    if (txt.rd) main.appendChild(sRd(txt.rd));
    if (txt.zh) main.appendChild(sZh(txt.zh));
    row.appendChild(main);
    return row;
  }
  function clearStageWarns() {
    var stg = $("#storyStage"); if (!stg) return;
    var ws = stg.querySelectorAll(".sbeat.warn");
    for (var i = 0; i < ws.length; i++) if (ws[i].parentNode) ws[i].parentNode.removeChild(ws[i]);
  }

  /* ================= v3.5 店员自动开口 + 对话节奏 =================
   * 开：story.voiceOn（沉浸页顶部“店员声音”可切）；无日语语音(noVoice)时等同关。
   * NPC 开场句：逐句自动朗读，朗读中 .saying 门控选项，工具条可“↺ 重听 / 跳过”。
   * 你的回应：送出气泡 → 短暂思考“…” → 店员回应句逐句朗读 → 才进下一步。
   * 自动朗读进行中，手动点读句子被忽略，避免互相打断时序。
   * ------------------------------------------------------------ */
  var chainTok = 0;      // 每次 开始/打断 递增，作废上一次链的迟到回调
  var chainBusy = false; // 此刻是否有自动朗读在跑（点读期间保护时序）
  var autoRelease = null; // 当前自动朗读被打断时应执行的“放行”动作
  function autoOn() { return !!(story.voiceOn && !document.body.classList.contains("noVoice")); }
  function chainStop() {
    chainTok++; chainBusy = false;
    if (window.speechSynthesis) speechSynthesis.cancel();
    stopSay();
  }
  /* seq: [{node,text,show?}]；播完(或被新链/打断取代)后调 done */
  function chainPlay(seq, done) {
    chainStop();
    chainBusy = true;
    var tok = chainTok;
    var i = 0;
    function next() {
      if (tok !== chainTok || !chainBusy) return;      // 已被打断/替换
      if (i < seq.length && autoOn()) {
        var it = seq[i++];
        if (typeof it.show === "function") it.show();
        playSentence(it.node, it.text, next);
      } else {
        chainBusy = false;
        if (typeof done === "function") done();
      }
    }
    next();
  }
  function killAuto() {
    if (autoRelease) { var f = autoRelease; autoRelease = null; chainStop(); f(); }
  }

  /* ---- 主流程 ---- */
  function renderStory() {
    chainStop(); autoRelease = null;                 // 重绘前打断任何进行中的自动朗读
    story.gen = (story.gen || 0) + 1;                // 世代号：作废迟到的异步节拍
    var stage = $("#storyStage"); if (!stage) return;
    stage.innerHTML = "";
    stage.classList.toggle("zhoff", !story.zhOn);
    /* 顶部：情景标题 + 中文开关 + 重来 */
    var st = curStory(); if (!st) return;
    var bar = el("div", "story-top");
    var left = el("div", "story-top-l");
    left.appendChild(el("div", "story-ja", st.themeJa));
    left.appendChild(el("h2", "", st.themeZh));
    bar.appendChild(left);
    var right = el("div", "story-top-r");
    var vOff = !document.body.classList.contains("noVoice");
    var zhB = el("button", "minibtn on", "中文：开");
    zhB.addEventListener("click", function () {
      story.zhOn = !story.zhOn;
      stage.classList.toggle("zhoff", !story.zhOn);
      zhB.textContent = story.zhOn ? "中文：开" : "中文：关";
      zhB.classList.toggle("on", story.zhOn);
    });
    var voiceOn = !!(story.voiceOn && vOff);
    var vdB = el("button", "minibtn" + (voiceOn ? " on" : ""), voiceOn ? "店员声音：开" : "店员声音：关");
    if (!vOff) { vdB.disabled = true; vdB.title = "未检测到日语语音，无法自动朗读"; }
    vdB.addEventListener("click", function () {
      if (!vOff) { toast("未检测到日语语音，无法自动朗读。"); return; }
      story.voiceOn = !story.voiceOn;
      vdB.textContent = story.voiceOn ? "店员声音：开" : "店员声音：关";
      vdB.classList.toggle("on", story.voiceOn);
      if (!story.voiceOn) killAuto();   // 关声音即打断正在进行的自动朗读并放行
    });
    var againB = el("button", "minibtn", "↺ 重来");
    againB.addEventListener("click", function () {
      if (window.confirm("从第一个 Scene 重新开始这个情景？")) {
        story.si = 0; story.j = 0; story.usedRepeat = false;   // 重来 = 重开一轮
        renderStory();
      }
    });
    /* 听不懂时的出口。顶栏已经挤了三个按钮，所以这里只放图标，
       完整说法挂在 title/aria-label 上。 */
    var helpB = el("button", "minibtn", "🆘");
    helpB.type = "button";
    helpB.title = "听不懂怎么办？";
    helpB.setAttribute("aria-label", "听不懂怎么办？打开语言急救包");
    helpB.addEventListener("click", function () { nav("phrases"); });
    right.appendChild(zhB); right.appendChild(vdB); right.appendChild(againB); right.appendChild(helpB);
    bar.appendChild(right);
    stagePush(bar);
    /* 场景进度：标记这杯咖啡走到哪一步了 */
    stagePush(buildProgressBar(st));
    sceneBegin(0);
  }

  function sceneBegin(i) {
    var st = curStory(); if (!st) return;
    var sc = st.scenes[i]; if (!sc) return;
    story.si = i; story.j = 0;
    refreshStoryProgress();
    var sec = el("div", "scene-head");
    var scno = el("div", "scene-no");
    scno.appendChild(el("span", "scene-no-tag", sceneNoText(i)));
    scno.appendChild(el("span", "scene-no-name", sc.zh));
    sec.appendChild(scno);
    if (sc.img) sec.appendChild(sFigure(sc.img, sc.zh + " 场景"));
    if (sc.intro) sec.appendChild(el("p", "scene-intro", sc.intro));
    stagePush(sec);
    stepBegin(i, 0);
  }

  function stepBegin(i, j) {
    var st = curStory(); if (!st) return;
    var sc = st.scenes[i]; if (!sc) return;
    var step = sc.steps[j]; if (!step) return;
    story.si = i; story.j = j;
    var block = el("div", "sstep");
    stagePush(block);
    var npcLines = step.npc || [];
    var npcBox = null;
    if (npcLines.length) {
      npcBox = el("div", "snpc");
      npcLines.forEach(function (l) { npcBox.appendChild(sLine("staff", l)); });
      block.appendChild(npcBox);
    }
    var ask = el("div", "sask");
    ask.appendChild(el("div", "sask-text", step.ask || "…"));
    block.appendChild(ask);
    var box = el("div", "sopts");
    (step.opts || []).forEach(function (o) { box.appendChild(sOpt(o)); });
    block.appendChild(box);
    var stg = $("#storyStage"); if (stg) stg.scrollTop = stg.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    /* v3.5：店员开场句自动逐句朗读，读完(或被跳过)才放行你的选项 */
    playNpc(block, npcBox, npcLines, ask, function () {
      ask.classList.add("go"); box.classList.add("go");
    });
  }

  /* 店员句的逐句朗读：说一句亮一句，读完（或被跳过）后放行。
     stepBegin 首次进这一步时用它，「我没听懂」让店员重说时也用它 ——
     两处行为必须一模一样，所以只留这一份实现。

     anchor    「重听 / 跳过」条插到哪个子节点前面（必须是 block 的孩子；没有就贴到底）
     onRelease 播放结束或被跳过之后调用。首次进步骤时传的是「把选项区放行」；
               重说时不需要 —— 选项本来就没锁。 */
  function playNpc(block, npcBox, npcLines, anchor, onRelease) {
    if (!block || !npcBox || !autoOn()) return;
    var rows = npcBox.querySelectorAll(".sline");
    for (var q = 0; q < rows.length; q++) rows[q].classList.add("sayrow");   // 说一句亮一句
    var seq = [];
    for (var r = 0; r < rows.length; r++) (function (idx) {
      seq.push({
        node: rows[idx].querySelector(".say"),
        text: (npcLines[idx] && npcLines[idx].ja) || "",
        show: function () {
          rows[idx].classList.add("on");
          window.scrollTo(0, document.body.scrollHeight);
        }
      });
    })(r);
    block.classList.add("saying");
    var bar = el("div", "saybar");
    bar.appendChild(el("span", "saybar-t", "🔊 店员正在说…"));
    var reB = el("button", "saybar-b", "↺ 重听");
    var skB = el("button", "saybar-b go", "跳过 →");
    bar.appendChild(reB); bar.appendChild(skB);
    /* 紧贴开场句下方（选项区留位在它下面） */
    if (anchor && anchor.parentNode === block) block.insertBefore(bar, anchor);
    else block.appendChild(bar);
    var released = false;
    function releaseStep() {
      if (released) return; released = true;
      autoRelease = null;
      block.classList.remove("saying");
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      for (var a = 0; a < rows.length; a++) rows[a].classList.add("on");
      if (onRelease) onRelease();
      window.scrollTo(0, document.body.scrollHeight);
    }
    autoRelease = releaseStep;
    reB.addEventListener("click", function () { chainPlay(seq, releaseStep); });   // 重听：重头再来
    skB.addEventListener("click", function () { killAuto(); });                    // 跳过：打断并放行
    chainPlay(seq, releaseStep);
  }

  /* 「我没听懂」回合：你说一句请对方再说一遍 → 店员原样重说一遍 →
     你还停在**同一步**，其它选项照样能点。
     关键约定：不动 story.si / story.j、不换步、不算通关进度 ——
     这是下台阶，不是捷径。 */
  function repeatTurn(o, row) {
    var i = story.si, j = story.j;
    var st = curStory(); if (!st) return;
    var sc = st.scenes[i]; if (!sc) return;
    var step = sc.steps[j]; if (!step) return;

    clearStageWarns();
    story.usedRepeat = true;      // 完成页据此决定这一项画 ✓ 还是 ○
    /* 只废掉「我没听懂」这一句，别的选项一个都不动 —— 这正是它存在的意义 */
    row.classList.add("copt-picked");
    var pb = row.querySelector(".copt-pick");
    if (pb) { pb.disabled = true; pb.textContent = "已说 ✓"; }

    var you = sLine("you", { ja: o.ja, rd: o.rd, zh: o.zh });
    you.classList.add("you-commit");
    stagePush(you);
    window.scrollTo(0, document.body.scrollHeight);

    /* 店员重说：单开一块，保留前面的对话记录。不像「重来」那样清屏 ——
       用户要看见「我说了 → 他又说了一遍」这个因果。 */
    var block = el("div", "sstep repeat");
    var again = el("div", "snpc");
    (step.npc || []).forEach(function (l) { again.appendChild(sLine("staff", l)); });
    block.appendChild(again);
    var tip = el("p", "srepeat-tip", "店员放慢又说了一遍。这次听清了吗？");
    block.appendChild(tip);
    stagePush(block);
    window.scrollTo(0, document.body.scrollHeight);

    playNpc(block, again, step.npc || [], tip, null);
  }

  function sOpt(o) {
    var row = el("div", "copt");
    var main = el("div", "copt-main");
    var top = el("div", "copt-top");
    top.appendChild(el("span", "chip you", "あなた"));
    main.appendChild(top);
    var jp = sSay(o.ja); jp.classList.add("copt-jp");
    main.appendChild(jp);
    if (o.rd) main.appendChild(sRd(o.rd));
    if (o.zh) main.appendChild(sZh(o.zh));
    row.appendChild(main);
    var go = el("button", "copt-pick", "就这样说");
    go.addEventListener("click", function () { chooseAnswer(o, row); });
    row.appendChild(go);
    return row;
  }

  function chooseAnswer(o, row) {
    if (row.classList.contains("copt-off") || row.classList.contains("copt-picked")) return;   // 这句回合已结束
    var st = curStory(); if (!st) return;
    /* 「我没听懂」：不是答错，是真实对话里最常见的一步。
       必须排在 !o.ok 之前判 —— 这类选项的 ok 是 false，否则会被当成「不自然的说法」劝退。 */
    if (o.kind === "repeat") { repeatTurn(o, row); return; }
    /* 不自然但可理解的说法：温和提示，不强判“错误”，允许再挑一句 */
    if (!o.ok) {
      clearStageWarns();
      row.classList.add("copt-soft");
      var w = el("div", "sbeat warn");
      var p = el("p", "");
      p.appendChild(el("span", "warn-ic", "△ "));
      p.appendChild(document.createTextNode(o.note || "意思能懂，不过在这个场景里不太自然。再挑一句更顺口的说法吧。"));
      w.appendChild(p);
      stagePush(w);
      return;
    }
    /* 自然回应：选项收起，把“你说的话”作为气泡接进对话流 */
    clearStageWarns();
    row.classList.add("copt-picked");
    var box = row.parentNode;
    if (box) {
      var opts = box.querySelectorAll(".copt");
      for (var i = 0; i < opts.length; i++) {
        var c = opts[i];
        if (c === row) continue;
        c.classList.add("copt-off");
        var pb = c.querySelector(".copt-pick"); if (pb) pb.disabled = true;
      }
    }
    var mypb = row.querySelector(".copt-pick");
    if (mypb) { mypb.disabled = true; mypb.textContent = "已说 ✓"; }   // 已说出口：原句已转成对话气泡，不再可点
    var you = sLine("you", { ja: o.ja, rd: o.rd, zh: o.zh });
    you.classList.add("you-commit");
    stagePush(you);
    window.scrollTo(0, document.body.scrollHeight);
    /* 店员回应（图/店员句/旁白）随后登场：先给一个“思考”节拍 */
    var beat = el("div", "sbeat ok");
    if (o.img) beat.appendChild(sFigure(o.img, ""));
    var replyRows = [];
    (o.say || []).forEach(function (l) {
      var rw = sLine("staff", l);
      replyRows.push(rw);
      beat.appendChild(rw);
    });
    if (o.fb) beat.appendChild(el("p", "sfb", o.fb));
    var hasBeat = !!beat.childNodes.length;
    var gen = story.gen;                 // 记录世代：中途点“重来”则作废后续节拍
    var moved = false;
    function goNext() {
      if (moved || gen !== story.gen) return; moved = true;
      autoRelease = null;
      chainStop();
      var scn = st.scenes[story.si];
      if (story.j + 1 < scn.steps.length) stepBegin(story.si, story.j + 1);
      else sceneEnd(story.si);
      window.scrollTo(0, document.body.scrollHeight);
    }
    if (!hasBeat) { goNext(); return; }
    var think = el("div", "sbeat think", "…");
    stagePush(think);
    window.scrollTo(0, document.body.scrollHeight);
    window.setTimeout(function () {
      if (gen !== story.gen) return;               // 已重来/离开，不再登场
      if (think.parentNode) think.parentNode.removeChild(think);
      stagePush(beat);
      window.scrollTo(0, document.body.scrollHeight);
      var seq = [];
      for (var k = 0; k < replyRows.length; k++) (function (idx) {
        seq.push({ node: replyRows[idx].querySelector(".say"), text: (o.say[idx] && o.say[idx].ja) || "" });
      })(k);
      if (seq.length && autoOn()) {
        autoRelease = goNext;
        chainPlay(seq, goNext);
      } else {
        goNext();
      }
    }, 450);
  }

  /* Scene 结束卡：一幕画面(可选) + 一小句本场重点 + 继续按钮 */
  function sceneEnd(i) {
    var st = curStory(); if (!st) return;
    var sc = st.scenes[i]; if (!sc) return;
    var card = el("div", "scene-card");
    if (sc.beatImg) {
      var f = sFigure(sc.beatImg.src, sc.beatImg.cap || "");
      if (sc.beatImg.cap) f.appendChild(el("figcaption", "scene-cap", sc.beatImg.cap));
      card.appendChild(f);
    }
    var k = el("div", "sknow");
    k.appendChild(el("div", "sknow-l", "这个场面的重点"));
    if (sc.tip && sc.tip.jp) {
      var kj = sSay(sc.tip.jp); kj.classList.add("sknow-jp");
      k.appendChild(kj);
    }
    if (sc.tip && sc.tip.zh) k.appendChild(el("div", "sknow-zh", sc.tip.zh));
    if (sc.tip && sc.tip.ex) {
      var ex = el("div", "sknow-ex");
      var exj = sSay(sc.tip.ex.ja); exj.classList.add("sknow-ex-jp");
      ex.appendChild(el("span", "sknow-ex-t", "例　"));
      ex.appendChild(exj);
      if (sc.tip.ex.rd) {
        ex.appendChild(el("span", "sknow-ex-rd", "　" + sc.tip.ex.rd));
      }
      ex.appendChild(el("span", "sknow-ex-zh", "　" + (sc.tip.ex.zh || "")));
      k.appendChild(ex);
    }
    card.appendChild(k);
    var next = i + 1 < st.scenes.length;
    var nb = el("button", "bigbtn", next ? "继续 →" : "这趟结束了，看收获 ☕");
    nb.addEventListener("click", function () {
      if (next) sceneBegin(i + 1);
      else finishStory();
    });
    card.appendChild(nb);
    stagePush(card);
    window.scrollTo(0, document.body.scrollHeight);
  }

  /* 整段情景完成：任务完成总结（检查清单 + 用到的日语 + 发音 + 生活 Tip） */
  function finishStory() {
    var st = curStory(); if (!st) return;
    if (!storyDone[st.id]) { storyDone[st.id] = true; saveStoryDone(); }
    refreshStoryGate();
    progressPills.forEach(function (p) { p.classList.add("done"); p.classList.remove("on"); });
    var sum = st.summary || null;
    var fin = el("div", "sfin");

    /* 标题区 */
    var head = el("div", "sfin-head");
    head.appendChild(el("div", "sfin-emoji", (sum && sum.emoji) || "☕"));
    head.appendChild(el("h3", "", (sum && sum.title) || "今日任务完成"));
    if (sum && sum.intro) head.appendChild(el("p", "sfin-intro", sum.intro));
    fin.appendChild(head);

    if (!sum) {
      fin.appendChild(el("p", "muted", "你听懂了店员，也开口回应了。"));
    } else {
      /* ✓ 完成清单。多数项是「走完就做到了」；带 need 的那一项要看标志位，
         没做过就老实画 ○ 并给一句提示 —— 无条件打勾等于骗人。 */
      if (sum.checks && sum.checks.length) {
        var ul = el("ul", "sfin-checks");
        sum.checks.forEach(function (c) {
          var text = (typeof c === "string") ? c : c.t;
          var need = (typeof c === "string") ? null : c.need;
          var got = !need || !!story[need];
          var li = el("li", got ? "" : "todo");
          li.appendChild(el("span", "tick", got ? "✓" : "○"));
          li.appendChild(el("span", "txt", text));
          if (!got) {
            li.appendChild(el("span", "sfin-todo",
              "这次没用上也没关系 —— 下次卡住时，一句「すみません、もう一度お願いします。」就能救场。"));
          }
          ul.appendChild(li);
        });
        fin.appendChild(ul);
      }
      /* 今天真正用到的日语（整句可点朗读） */
      if (sum.phrases && sum.phrases.length) {
        var ps = el("div", "sfin-sec");
        ps.appendChild(el("div", "sfin-sec-t", sum.phrasesTitle || "今天真正用到的日语"));
        var list = el("div", "sphrase-list");
        sum.phrases.forEach(function (ph) {
          var c = el("div", "sphrase");
          var jp = sSay(ph.ja); jp.classList.add("sphrase-jp");
          c.appendChild(jp);
          if (ph.rd) c.appendChild(sRd(ph.rd));
          if (ph.zh) c.appendChild(el("div", "sphrase-zh", ph.zh));
          list.appendChild(c);
        });
        ps.appendChild(list);
        fin.appendChild(ps);
      }
      /* 今日发音小知识 */
      if (sum.sound) {
        var sd = el("div", "sfin-card sound");
        sd.appendChild(el("div", "sfin-card-t", sum.sound.t || "今日发音小知识"));
        var sjp = sSay(sum.sound.jp); sjp.classList.add("sfin-sound-jp");
        sd.appendChild(sjp);
        if (sum.sound.note) sd.appendChild(el("div", "sfin-card-note", sum.sound.note));
        fin.appendChild(sd);
      }
      /* 今日日本生活 Tip */
      if (sum.tip) {
        var tp = el("div", "sfin-card tip");
        tp.appendChild(el("div", "sfin-card-t", sum.tip.t || "今日日本生活 Tip"));
        if (sum.tip.zh) tp.appendChild(el("p", "sfin-card-zh", sum.tip.zh));
        fin.appendChild(tp);
      }
    }

    fin.appendChild(unlockTeaser());

    var row = el("div", "sfin-actions");
    var r1 = el("button", "btn", "↺ 再练一次");
    r1.addEventListener("click", function () { story.si = 0; story.j = 0; renderStory(); });
    var r2 = el("button", "btn primary", "返回首页");
    r2.addEventListener("click", storyGoHome);
    row.appendChild(r1); row.appendChild(r2);
    fin.appendChild(row);
    stagePush(fin);
    window.scrollTo(0, document.body.scrollHeight);
  }

  /* 完成页末尾的「还有更多场景」。
     语气要轻：用户刚做完一件事，这时候不该被推销糊脸。
     所以只摆事实（还有多少个场景）+ 三张模糊的缩略图，不放价格、不放「限时」。 */
  function unlockTeaser() {
    var R = reg();
    var E = window.Entitlement;
    var box = el("div", "sfin-card more");
    box.appendChild(el("div", "sfin-card-t", "还有更多场景"));
    box.appendChild(el("p", "sfin-card-zh",
      "咖啡店是免费体验的一节。旅行篇里还有 " +
      (((R && R.DISPLAY) ? R.DISPLAY.scenesTravel : 32) - 1) +
      " 个真实生活场景，从机场一路排到回国。"));

    var strip = el("div", "sfin-thumbs");
    var list = (R ? R.packScenes("travel") : []).filter(function (s) {
      return s.id !== "cafe" && (E ? !E.isSceneUnlocked(s.id) : true);
    }).slice(0, 3);
    list.forEach(function (s) {
      var t = el("div", "sfin-thumb");
      t.appendChild(el("span", "st-emoji", s.emoji));
      t.appendChild(el("span", "st-name", s.titleZh));
      t.appendChild(el("span", "st-lock", "🔒"));
      strip.appendChild(t);
    });
    if (strip.childNodes.length) box.appendChild(strip);

    var b = el("button", "btn ghost", "看看都有哪些场景");
    b.addEventListener("click", function () { nav("travel"); });
    box.appendChild(b);
    return box;
  }

  /* ---------------- 名词高亮 + 底部词卡 ----------------
   * 对一句 jp 里的句子，把能匹配到的 vocab.w 高亮为 <mark class="vn">。
   * 匹配规则：词长从长到短，只取不与已放置区间重叠的出现；同一词可多处高亮。
   * 用 DocumentFragment 组装，无 innerHTML 注入风险。
   * ---------------------------------------------------- */
  var vocabState = { sc: null, vi: -1 };

  function makeMark(sc, vi) {
    var v = sc.vocab[vi];
    if (!v) return null;
    var m = el("mark", "vn", v.w);
    m.title = v.m;
    m.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openVocab(sc, vi);
    });
    return m;
  }

  function buildJp(sc, jp) {
    var frag = document.createDocumentFragment();
    var vocab = (sc && sc.vocab) || [];
    var text = jp || "";
    if (!vocab.length || !text) { frag.appendChild(document.createTextNode(text)); return frag; }

    var cand = [];
    for (var i = 0; i < vocab.length; i++) {
      if (text.indexOf(vocab[i].w) >= 0) cand.push({ w: vocab[i].w, vi: i });
    }
    if (!cand.length) { frag.appendChild(document.createTextNode(text)); return frag; }

    cand.sort(function (a, b) { return b.w.length - a.w.length || text.indexOf(a.w) - text.indexOf(b.w); });

    var marks = [];
    for (var c = 0; c < cand.length; c++) {
      var wl = cand[c].w.length;
      var from = 0, idx;
      while ((idx = text.indexOf(cand[c].w, from)) >= 0) {
        var clash = false;
        for (var m = 0; m < marks.length; m++) {
          if (idx < marks[m].end && idx + wl > marks[m].start) { clash = true; break; }
        }
        if (!clash) marks.push({ start: idx, end: idx + wl, vi: cand[c].vi });
        from = idx + wl;
      }
    }
    marks.sort(function (a, b) { return a.start - b.start; });

    var pos = 0;
    for (var k = 0; k < marks.length; k++) {
      if (marks[k].start > pos) frag.appendChild(document.createTextNode(text.slice(pos, marks[k].start)));
      var mk = makeMark(sc, marks[k].vi);
      if (mk) frag.appendChild(mk);
      pos = marks[k].end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  function openVocab(sc, vi) {
    var v = (sc && sc.vocab) ? sc.vocab[vi] : null;
    if (!v) return;
    vocabState.sc = sc; vocabState.vi = vi;
    var read = "";
    if (v.r && v.r !== v.w) read = v.r;
    $("#vbWord").textContent = v.w;
    $("#vbRead").textContent = read;
    $("#vbMean").textContent = v.m || "";
    $("#vocabBar").hidden = false;
    document.body.classList.add("vocabOpen");
  }
  function closeVocab() {
    $("#vocabBar").hidden = true;
    vocabState.sc = null; vocabState.vi = -1;
    document.body.classList.remove("vocabOpen");
  }

  /* ================= v4：首页品牌区 · 你的日本之旅 · 热门场景 =================
   * 只读 window.RIYU_REGISTRY（货架：标题/封面/分组），不碰任何付费正文。
   * 是否可进入一律问 window.Entitlement，本文件不自己判断购买状态。
   * ------------------------------------------------------------------ */
  function reg() { return window.RIYU_REGISTRY || null; }

  /* 某个篇目「全部场景」的完成度。分母来自 registry 的货架条数
     （旅行 32 / 求学 24），不是付费正文的条数 —— 那些前端根本数不出来。 */
  function packStat(pack) {
    var R = reg();
    if (!R) return { done: 0, total: 0 };
    var list = R.packScenes(pack);   /* 含该篇目里的免费场景，如咖啡店 */
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.story && storyDone[s.story]) done++;
    }
    return { done: done, total: list.length };
  }

  function tripStat() { return packStat("travel"); }

  /* 首页「我的学习进度」：一个环形总进度 + 四行细分 +（设过日期的话）出发倒计时。
     分母一律来自 registry 的货架条数和 DISPLAY 常量 —— 付费正文不在前端，
     前端数不出来，所以这几个数是显式写死的，不是数组长度。 */
  function renderProgress() {
    var host = $("#progCard");
    if (!host) return;
    host.innerHTML = "";
    var R = reg();
    var D = (R && R.DISPLAY) || {};
    var ts = packStat("travel"), ss = packStat("study");
    var doneAll = ts.done + ss.done;
    var totalAll = D.scenesTotal || (ts.total + ss.total);
    var pct = totalAll ? (doneAll / totalAll) : 0;

    var phead = el("div", "hc-head");
    phead.appendChild(el("span", "hc-title", "📊 我的学习进度"));
    host.appendChild(phead);

    var main = el("div", "pc-main");

    /* 环形：r=32 → 周长 2πr ≈ 201.06，用 stroke-dashoffset 表示进度 */
    var C = 201.06;
    var ring = el("div", "ringwrap");
    ring.innerHTML =
      '<svg class="ring" viewBox="0 0 76 76" aria-hidden="true">' +
        '<circle class="ring-bg" cx="38" cy="38" r="32"></circle>' +
        '<circle class="ring-fg" cx="38" cy="38" r="32" ' +
          'stroke-dasharray="' + C + '" ' +
          'stroke-dashoffset="' + (C * (1 - pct)).toFixed(2) + '"></circle>' +
      '</svg>' +
      '<div class="ring-tx"><b>' + doneAll + '</b><i>/ ' + totalAll + '</i></div>';
    main.appendChild(ring);

    var rows = el("div", "pc-rows");
    [
      ["🧳 旅行篇",     ts.done, ts.total],
      ["🎓 求学篇",     ss.done, ss.total],
      ["🆘 语言急救包", 0,       D.phrases],
      ["📖 必要单词",   0,       D.words]
    ].forEach(function (r) {
      var line = el("div", "pc-row");
      line.appendChild(el("span", "pc-name", r[0]));
      line.appendChild(el("span", "pc-val", r[2] ? (r[1] + " / " + r[2]) : "🔒 未解锁"));
      rows.appendChild(line);
    });
    main.appendChild(rows);
    host.appendChild(main);

    /* 出发倒计时：设过日期才出现，没设就给一句话引导，不放空壳 */
    var days = daysUntil(profile.depart);
    var trip = el("div", "pc-trip");
    if (days === null) {
      trip.appendChild(el("span", "pt-tx", "📅 还没设置出发日期，设好之后这里会一直显示还有几天。"));
      var gb = el("button", "minibtn", "去设置");
      gb.addEventListener("click", function () { nav("me"); });
      trip.appendChild(gb);
    } else if (days > 0) {
      trip.appendChild(el("span", "pt-tx", "🧳 距离出发还有"));
      trip.appendChild(el("b", "pt-num", String(days)));
      trip.appendChild(el("span", "pt-tx", "天"));
    } else if (days === 0) {
      trip.appendChild(el("span", "pt-tx", "🎌 就是今天出发，一路顺利。"));
    } else {
      trip.appendChild(el("span", "pt-tx", "🧳 旅行已过去 " + Math.abs(days) + " 天，回来复习一下也不错。"));
    }
    host.appendChild(trip);
  }

  /* 首页「今日推荐」：咖啡店还没走完就推咖啡店（storyGate 那块），
     走完了就改推推荐路线的下一关。两个都不合适时给一句温和的复习建议。 */
  function renderToday() {
    var alt = $("#todayAlt");
    if (!alt) return;
    alt.innerHTML = "";
    var st = firstStory();
    var cafeDone = !!(st && storyDone[st.id]);
    var gate = $("#storyGate");

    /* 咖啡店还没完成 → 今日推荐就是它，alt 让位 */
    if (st && !cafeDone) { alt.hidden = true; if (gate) gate.hidden = false; return; }
    if (gate) gate.hidden = true;
    alt.hidden = false;

    var idx = TOTAL ? nextIdxOf() : -1;
    var box = el("div", "todayalt-box");

    if (TOTAL && idx >= 0 && SCENARIOS[idx]) {
      var sc = SCENARIOS[idx];
      box.appendChild(el("div", "ta-kicker", "继续学习"));
      var tr = el("div", "ta-title");
      tr.appendChild(el("span", "ta-emoji", sc.emoji));
      tr.appendChild(el("span", "", "第 " + (idx + 1) + " 关 · " + sc.titleZh));
      box.appendChild(tr);
      box.appendChild(el("p", "ta-sub", "接着上次往下走，一关大概三五分钟。"));
      var b1 = el("button", "bigbtn", "继续学习 →");
      b1.addEventListener("click", function () { openScenario(sc.id, false); });
      box.appendChild(b1);
    } else if (TOTAL) {
      box.appendChild(el("div", "ta-kicker", "今日推荐"));
      box.appendChild(el("div", "ta-title", "🎉 推荐路线已全部通关"));
      box.appendChild(el("p", "ta-sub", "回「我的备忘录」把收藏过的句子再念两遍，比学新的管用。"));
      var b2 = el("button", "bigbtn", "打开备忘录");
      b2.addEventListener("click", function () { nav("memo"); });
      box.appendChild(b2);
    } else {
      /* 公开访客 / 未购买：推荐路线正文不在前端，如实说明，不装作能学 */
      box.appendChild(el("div", "ta-kicker", "今日推荐"));
      box.appendChild(el("div", "ta-title", "🔒 旅行篇 · 推荐路线"));
      box.appendChild(el("p", "ta-sub", "25 个任务按真实顺序排好了，购买旅行篇后即可依次闯关。"));
      var b3 = el("button", "bigbtn", "先看看都有哪些场景 →");
      b3.addEventListener("click", function () { nav("travel"); });
      box.appendChild(b3);
    }
    alt.appendChild(box);
  }

  /* 场景卡片当前状态：done（已完成）/ open（可进入）/ soon（内容制作中）/ lock（未解锁） */
  function sceneState(s) {
    var E = window.Entitlement;
    if (s.story && storyDone[s.story]) return "done";
    if (!E || E.isSceneUnlocked(s.id)) return s.story ? "open" : "soon";
    return "lock";
  }

  function renderHot() {
    var box = $("#hotScroll");
    var R = reg();
    if (!box || !R) return;
    box.innerHTML = "";
    R.packScenes("travel").forEach(function (s) {
      var st = sceneState(s);
      var card = el("button", "hotcard" + (st === "lock" || st === "soon" ? " locked" : ""));
      card.type = "button";
      card.appendChild(el("span", "hc-emoji", s.emoji));
      card.appendChild(el("span", "hc-title", s.titleZh));
      card.appendChild(el("span", "hc-ja", s.titleJa));
      var tag = el("span", "hc-state");
      if (st === "done") { tag.textContent = "✅ 已完成"; tag.classList.add("ok"); }
      else if (st === "open") { tag.textContent = "▶ 去体验"; }
      else if (st === "lock") { tag.textContent = "🔒 待解锁"; }
      else { tag.textContent = "🚧 制作中"; }
      card.appendChild(tag);
      /* 免费可玩的直接进剧情（少一次点击）；其余进详情页看介绍 */
      card.addEventListener("click", function () {
        if (st === "open") playScene(s.id); else openScene(s.id, "home");
      });
      box.appendChild(card);
    });
  }

  function packNameOf(p) {
    var R = reg();
    var pk = (R && R.packs) ? R.packs[p] : null;
    return pk ? pk.name : "付费内容";
  }

  /* 进「场景详情页」——列表里点场景走这条 */
  function openScene(id, from) {
    var R = reg();
    if (!R) { toast("场景目录还没加载。"); return; }
    if (!R.sceneById(id)) { toast("找不到这个场景。"); return; }
    curSceneId = id;
    sceneFrom = from || "map";
    nav("scene");
  }

  /* 直接进剧情——详情页 CTA 与首页热门卡片走这条 */
  function playScene(id) {
    var R = reg();
    if (!R) { toast("场景目录还没加载。"); return; }
    var s = R.sceneById(id);
    if (!s) { toast("找不到这个场景。"); return; }
    var E = window.Entitlement;
    var unlocked = !E || E.isSceneUnlocked(id);
    /* 有正文且已解锁 → 直接进 */
    if (unlocked && s.story && STORIES[s.story]) { openStory(s.story); return; }
    /* 未解锁优先提示解锁：付费场景即使正文还没做完，也不该对未购买用户说「制作中」 */
    if (!unlocked) {
      toast("「" + s.titleZh + "」属于" + packNameOf(s.pack) + "，解锁后即可体验。");
      return;
    }
    toast("「" + s.titleZh + "」正在制作中，下个版本见。");
  }

  /* ---------------- 首页：主线 + 过滤 + 情景卡片 ---------------- */

  /* 没有付费正文时（公开访客 / 未购买）的主线区：
     只画任务名 + 锁定态，**不出现任何课程正文**。
     任务名来自公开清单 js/content/mainline-manifest.js。 */
  function renderMainlineLocked() {
    var list = window.RIYU_MAINLINE || [];

    $("#mainline").hidden = false;
    $("#mlInfo").textContent = "共 " + list.length + " 个任务　·　购买旅行篇后解锁";
    $("#mlFill").style.width = "0%";
    $("#mlPct").textContent = "0%";
    $("#mlNote").textContent = "🔒 主线正文未解锁。购买「旅行篇」后可依次闯关，进度自动存在本机。";

    /* 难度筛选在未解锁状态下没有意义 */
    $("#filterRow").hidden = true;

    var grid = $("#grid");
    grid.innerHTML = "";
    var R = reg();
    list.forEach(function (it) {
      /* 免费场景（目前只有咖啡店）同时就是推荐路线的第 1 关。
         对没买的人，它也必须画成「能玩」—— 否则同一屏上「今日推荐」说
         咖啡店免费、这张卡说「购买旅行篇后解锁」，自相矛盾。
         判据跟热门场景区共用 sceneState()，不另立一套。 */
      var sc = R ? R.sceneById(it.id) : null;
      var st = sc ? sceneState(sc) : "lock";

      if (st === "open" || st === "done") {
        var free = el("div", "card");
        free.appendChild(el("div", "c-emoji", it.emoji));
        var fRow = el("div", "c-title-row");
        fRow.appendChild(el("div", "c-title", it.titleZh));
        free.appendChild(fRow);
        var fTags = el("div", "c-tags");
        fTags.appendChild(el("span", "tag pass", st === "done" ? "✅ 已完成" : "免费体验"));
        free.appendChild(fTags);
        free.appendChild(el("div", "c-freeline",
          st === "done" ? "再走一遍 →" : "🎬 现在就能玩 →"));
        free.addEventListener("click", function () { playScene(it.id); });
        grid.appendChild(free);
        return;
      }

      var card = el("div", "card locked");
      card.appendChild(el("div", "c-emoji", it.emoji));
      var titleRow = el("div", "c-title-row");
      titleRow.appendChild(el("div", "c-title", it.titleZh));
      card.appendChild(titleRow);
      var tags = el("div", "c-tags");
      tags.appendChild(el("span", "tag lock", "🔒 未解锁"));
      card.appendChild(tags);
      card.appendChild(el("div", "c-lockline", "🔒 购买旅行篇后解锁"));
      card.addEventListener("click", function () {
        toast("🔒 「" + it.titleZh + "」购买旅行篇后解锁。");
      });
      grid.appendChild(card);
    });
  }

  function renderHome() {
    renderToday();
    renderProgress();
    renderPackEntry();
    renderHot();
    if (!TOTAL) { renderMainlineLocked(); return; }
    var nextIdx = nextIdxOf();
    var doneN = passedCount();
    var firstNotPassed = nextIdx >= 0 ? SCENARIOS[nextIdx] : null;

    /* 主线进度条 */
    var ml = $("#mainline"); ml.hidden = false;
    $("#mlInfo").textContent = "已通关 " + doneN + " / " + TOTAL + "　·　当前：第 " + (nextIdx >= 0 ? nextIdx + 1 : TOTAL) + " 关";
    $("#mlFill").style.width = Math.round(doneN / TOTAL * 100) + "%";
    $("#mlPct").textContent = Math.round(doneN / TOTAL * 100) + "%";
    var note;
    if (state.settings.unlockAll) {
      note = "已开启「解锁全部关卡」自由练习，可任意进入；学完≥60%句并测验≥60分仍会计入主线进度。";
    } else if (nextIdx < 0) {
      note = "🎉 恭喜，全部 " + TOTAL + " 关已通关！可随时复习任意一关（或到设置里关闭全解锁再回味）。";
    } else {
      note = "下一关「" + firstNotPassed.titleZh + "」：" + firstNotPassed.emoji + " 学完 ≥60% 句子 + 测验 ≥60 分即可解锁下一关。";
    }
    $("#mlNote").textContent = note;

    /* 难度筛选 chips */
    var fRow = $("#filterRow"); fRow.hidden = false;
    var chips = $("#fChips"); chips.innerHTML = "";
    var groups = [{ key: null, name: "全部" }];
    [1, 2, 3, 4, 5].forEach(function (lv) { groups.push({ key: lv, name: lvName(lv) }); });
    groups.forEach(function (g) {
      var cnt = g.key == null ? TOTAL : SCENARIOS.filter(function (s) { return s.level === g.key; }).length;
      var b = el("button", "fchip" + (state.filter === g.key ? " on" : ""));
      b.appendChild(el("span", "", g.name));
      b.appendChild(el("span", "cnt", cnt));
      b.addEventListener("click", function () { state.filter = (state.filter === g.key) ? null : g.key; renderHome(); });
      chips.appendChild(b);
    });

    /* 情景卡片（按当前难度过滤渲染；解锁判定与过滤无关） */
    var grid = $("#grid");
    grid.innerHTML = "";
    var shown = SCENARIOS.filter(function (s) { return state.filter == null || s.level === state.filter; });
    shown.forEach(function (sc) {
      var i = mainIndex(sc.id);
      var open = isOpen(sc.id);
      var passed = scPass(sc);
      var isCur = i === nextIdx;

      var card = el("div", "card");
      if (!open) card.classList.add("locked");
      if (isCur) card.classList.add("current");

      card.appendChild(el("div", "c-emoji", sc.emoji));
      var titleRow = el("div", "c-title-row");
      titleRow.appendChild(el("div", "c-title", sc.titleZh));
      titleRow.appendChild(lvChip(sc));
      card.appendChild(titleRow);
      card.appendChild(el("div", "c-jp", sc.titleJa));

      var tags = el("div", "c-tags");
      tags.appendChild(el("span", "tag accent", sc.tagZh));
      tags.appendChild(el("span", "tag", sc.styleZh));
      if (passed) tags.appendChild(el("span", "tag pass", "✅ 已通关"));
      else if (isCur) tags.appendChild(el("span", "tag cur", "👉 当前关"));
      else if (!open) tags.appendChild(el("span", "tag lock", "🔒 未解锁"));
      card.appendChild(tags);

      var parts = ["已学习 " + seenCount(sc.id) + "/" + sc.lines.length + " 句"];
      var nFav = 0;
      state.favs.forEach(function (f) { if (f.sid === sc.id) nFav++; });
      if (nFav) parts.push("收藏 " + nFav);
      var p = ensureProg(sc.id);
      if (p.quizBest != null) parts.push("测验最佳 " + p.quizBest + "%");
      var pr = el("div", "c-prog");
      pr.appendChild(document.createTextNode(parts.join(" · ")));
      card.appendChild(pr);

      if (!open) {
        var prev = i > 0 ? SCENARIOS[i - 1] : null;
        var lock = el("div", "c-lockline", "🔒 需先通过上一关「" + (prev ? prev.titleZh : "") + "」");
        card.appendChild(lock);
      }

      card.addEventListener("click", function () {
        if (isOpen(sc.id)) openScenario(sc.id, false);
        else toast("🔒 需先通过上一关「" + SCENARIOS[mainIndex(sc.id) - 1].titleZh + "」才能进入本关。");
      });
      grid.appendChild(card);
    });
  }

  /* ---------------- 打开情景：渲染头部 + 标签页 ---------------- */
  function openScenario(sid, allowLocked) {
    if (!allowLocked && !isOpen(sid)) { toast("🔒 该关尚未解锁。"); return; }
    state.curSid = sid;
    state.stab = "learn";
    state.sr = { role: "A", idx: 0, open: false };
    state.q = null;
    state.warmStep = null;   // 打开情景时热身默认回到第一个未完成步骤
    renderScenario();
    nav("scenario");
  }

  function renderScenario() {
    var sc = scenarioById(state.curSid);
    if (!sc) return;
    recCleanup();          // 离开上一句/切换内容时停掉并清理录音、词卡
    closeVocab();

    $("#tglZh").checked = !!state.settings.showZh;

    /* 头部信息 */
    var head = $("#scenHead");
    head.innerHTML = "";
    var row1 = el("div", "row1");
    row1.appendChild(el("span", "s-emoji", sc.emoji));
    var titleWrap = el("div");
    titleWrap.appendChild(el("h2", "", sc.titleZh + "　" + sc.titleJa));
    var chips = el("div", "c-tags");
    chips.appendChild(lvChip(sc));
    chips.appendChild(el("span", "tag accent", sc.tagZh));
    chips.appendChild(el("span", "tag", sc.styleZh));
    if (scPass(sc)) chips.appendChild(el("span", "tag pass", "✅ 已通关"));
    else if (isOpen(sc.id)) chips.appendChild(el("span", "tag cur", "👉 进行中"));
    titleWrap.appendChild(chips);
    var mi = mainIndex(sc.id);
    titleWrap.appendChild(el("div", "muted small", "第 " + (mi + 1) + " / " + TOTAL + " 关 · 难度 L" + sc.level + " · 本关目标：学完 ≥60% 句子且测验 ≥60 分即通关。"));
    row1.appendChild(titleWrap);
    head.appendChild(row1);
    head.appendChild(el("p", "", sc.scenarioZh));

    var legend = el("div", "legend");
    var spkA = el("span", "speaker A"); spkA.appendChild(el("span", "dot")); spkA.appendChild(document.createTextNode(sc.speakers.A));
    var spkB = el("span", "speaker B"); spkB.appendChild(el("span", "dot")); spkB.appendChild(document.createTextNode(sc.speakers.B));
    legend.appendChild(spkA); legend.appendChild(spkB);
    head.appendChild(legend);

    /* 标签高亮 */
    var tabBtns = document.querySelectorAll("#scenTabs .tab");
    for (var i = 0; i < tabBtns.length; i++) tabBtns[i].classList.toggle("active", tabBtns[i].dataset.stab === state.stab);

    /* 内容区（按标签渲染） */
    var body = $("#scenBody");
    body.innerHTML = "";
    if (state.stab === "learn") renderLearn(sc, body);
    else if (state.stab === "shadow") renderShadow(sc, body);
    else if (state.stab === "quiz") renderQuiz(sc, body);
    applyDisplayClass();
  }

  function applyDisplayClass() {
    var body = $("#scenBody");
    if (!body) return;
    body.classList.toggle("showZh", !!state.settings.showZh);
  }

  /* 旧数据/旧收藏的行可能仍带 kana 读法；新内容为纯平假名(kana===jp 或无)则不再显示“读法”行 */
  function legacyKana(line) {
    if (!line) return "";
    if (!line.kana) return "";
    if (line.kana === (line.jp || "")) return "";
    return line.kana;
  }

  /* ---------------- 情景词语热身（v3 · 纯辅助，不参与通关判定） ----------------
   * 学习页顶部四步：①词语 → ②词语练习(选择/听音) → ③组句 → ④简单对话。
   * 完成状态只记在 prog[sid].warm = {w,q,l,b,s}，仅用于打勾；ensureProg/scPass/isOpen
   * 都不读它，通关判定与老进度完全不受影响。
   * --------------------------------------------------------------------- */
  function hasWarm(sc) { return !!(sc && (sc.warmLines || sc.warmBuild)); }

  function warmGet(sc) { var p = state.prog[sc.id]; return (p && p.warm) || null; }
  function warmIs(sc, k) { var w = warmGet(sc); return !!(w && w[k]); }
  function warmSet(sc, k) {
    var p = ensureProg(sc.id);
    if (!p.warm) p.warm = {};
    if (!p.warm[k]) { p.warm[k] = true; saveProg(); }
  }

  /* 滚动到下方原有完整对话（学/练完后衔接） */
  function warmGotoFull() {
    var scb = $("#scenBody");
    var dl = scb ? scb.querySelector("ol.dialog") : null;
    if (dl) dl.scrollIntoView({ behavior: "smooth", block: "start" });
    else toast("完整对话在下方。");
  }

  function renderWarmUp(sc, host) {
    host.innerHTML = "";
    if (!hasWarm(sc)) return;

    var voice = ttsAvailable();
    var wb = sc.warmBuild || [];
    var wl = sc.warmLines || [];

    var d1 = warmIs(sc, "w"), dq = warmIs(sc, "q"), dl = warmIs(sc, "l"),
        db = warmIs(sc, "b"), ds = warmIs(sc, "s");
    var d2 = dq && (voice ? dl : true);

    /* 初始展开：null → 第一个未完成的步骤 */
    if (state.warmStep == null) {
      state.warmStep = !d1 ? "w1" : (!d2 ? "w2" : (!db ? "w3" : "w4"));
    }

    var head = el("div", "warmhead");
    head.appendChild(el("div", "warmhead-t", "🔥 情景词语热身"));
    head.appendChild(el("div", "warmhead-s",
      "学完整对话前先热热身：①认识词语 → ②词语练习 → ③组句 → ④听简单对话，再往下进入本关完整对话。" +
      "（热身不计入通关判定，可反复练习。）"));
    host.appendChild(head);

    var pills = {};
    function mkStep(key, done, title) {
      var card = el("section", "wstep" + (state.warmStep === key ? " open" : ""));
      var hdr = el("button", "wstep-h");
      hdr.type = "button";
      hdr.appendChild(el("span", "wstep-t", title));
      var pill = el("span", "wstep-done" + (done ? " on" : ""), done ? "✓ 已完成" : "未完成");
      hdr.appendChild(pill);
      hdr.addEventListener("click", function () {
        state.warmStep = state.warmStep === key ? "none" : key;
        renderWarmUp(sc, host);
      });
      card.appendChild(hdr);
      var body = el("div", "wstep-b");
      card.appendChild(body);
      host.appendChild(card);
      pills[key] = pill;
      return body;
    }
    function markPill(key, txt) {
      var p = pills[key];
      if (p) { p.textContent = txt; p.classList.add("on"); }
    }

    /* ---- ① 情景词语 ---- */
    var b1 = mkStep("w1", d1, "① 情景词语 · 本关 " + sc.vocab.length + " 个核心词");
    b1.appendChild(el("p", "muted", "点词卡可看中文并听读（底部词卡）；点词卡右上 🔊 单独朗读。浏览一遍，记住后进入练习。"));
    var grid = el("div", "wordgrid");
    sc.vocab.forEach(function (v, vi) {
      var c = el("div", "wcell");
      c.title = v.m;
      var say = el("button", "minibtn voiceonly wcell-say", "🔊");
      say.addEventListener("click", function (ev) { ev.stopPropagation(); speak(v.w); });
      c.appendChild(say);
      c.appendChild(el("div", "wcell-jp", v.w));
      c.appendChild(el("div", "wcell-m", v.m));
      c.addEventListener("click", function () { openVocab(sc, vi); });
      grid.appendChild(c);
    });
    b1.appendChild(grid);
    if (d1) b1.appendChild(el("p", "oknote", "✓ 已完成词语浏览，随时可回来复习。"));
    else {
      var go1 = el("button", "bigbtn", "✓ 我记住这些词了 → 去②词语练习");
      go1.addEventListener("click", function () { warmSet(sc, "w"); state.warmStep = "w2"; renderWarmUp(sc, host); });
      b1.appendChild(go1);
    }

    /* ---- ② 词语练习 ---- */
    var b2 = mkStep("w2", d2, "② 词语练习 · 选择题 + 听音辨认");
    var partDone = { q: dq, l: dl || !voice };
    var s2footAdded = false;
    function refreshS2() {
      if (partDone.q && partDone.l && !s2footAdded) {
        s2footAdded = true;
        markPill("w2", "✓ 已完成");
        var bar = el("div", "s2done");
        bar.appendChild(el("span", "oknote", "词语练习都完成啦。"));
        var bt = el("button", "bigbtn", "去③ 组句练习 →");
        bt.addEventListener("click", function () { state.warmStep = "w3"; renderWarmUp(sc, host); });
        bar.appendChild(bt);
        b2.appendChild(bar);
      }
    }
    function addPart(label, desc, isDone, runIt, onDone) {
      var part = el("div", "wpart" + (isDone ? " done" : ""));
      var h = el("div", "wpart-h");
      h.appendChild(el("div", "wpart-t", label));
      var pp = el("span", "wpart-pill" + (isDone ? " on" : ""), isDone ? "✓ 已完成" : "待完成");
      h.appendChild(pp);
      part.appendChild(h);
      part.appendChild(el("p", "muted", desc));
      var hp = el("div", "wpart-body");
      part.appendChild(hp);
      var bGo = el("button", "bigbtn ghost", isDone ? "↻ 再练一遍" : "开始练习");
      bGo.addEventListener("click", function () {
        bGo.style.display = "none";
        runIt(hp, function () {
          pp.textContent = "✓ 已完成"; pp.classList.add("on");
          part.classList.add("done");
          onDone();
        });
      });
      part.appendChild(bGo);
      b2.appendChild(part);
      return part;
    }
    addPart("A · 词语选择题", "共 5 题：看假名选中文、或看中文选假名。", dq,
      function (hp, fin) { runWordQuiz(sc, "mean", hp, fin); },
      function () { partDone.q = true; refreshS2(); });
    if (voice) {
      addPart("B · 听音辨认", "共 5 题：听 🔊 发音，选出你听到的假名（每题可重听）。", dl,
        function (hp, fin) { runWordQuiz(sc, "hear", hp, fin); },
        function () { partDone.l = true; refreshS2(); });
    } else {
      b2.appendChild(el("p", "muted small", "（本机未检测到日语语音，听音辨认题已自动跳过，可到词卡/对话里点 🔊 听发音。）"));
    }
    refreshS2();

    /* ---- ③ 句子练习（组句） ---- */
    var b3 = mkStep("w3", db, "③ 句子练习 · 把词块拼成完整日语句子");
    if (wb.length) {
      b3.appendChild(el("p", "muted", "按顺序点下面的词块拼句：点错会抖动提示；点已拼的词块可退回重排。拼成整句会自动朗读。"));
      var sbox = el("div", "sbuilds");
      b3.appendChild(sbox);
      var finishedN = 0;
      wb.forEach(function (b, bi) {
        var blk = makeSentenceBlock(sc, b, bi, wb.length);
        blk._finish = function () {
          finishedN++;
          if (finishedN === wb.length) {
            warmSet(sc, "b");
            markPill("w3", "✓ 已完成");
            var note = el("p", "oknote", "🎉 三句都拼对了！听听简单对话找找语感吧 →");
            b3.appendChild(note);
            state.warmStep = "w4";
            renderWarmUp(sc, host);
          }
        };
        sbox.appendChild(blk);
      });
    } else {
      b3.appendChild(el("p", "muted", "本关暂无组句练习。"));
    }

    /* ---- ④ 简单对话 ---- */
    var b4 = mkStep("w4", ds, "④ 简单对话 · 先用几句更简单的热身对话找语感");
    if (wl.length) renderWarmLines(sc, wl, b4);
    else b4.appendChild(el("p", "muted", "本关暂无简单对话。"));
    if (!ds) {
      var go4 = el("button", "bigbtn", "✓ 热身对话读完了 → 进入下方完整对话");
      go4.addEventListener("click", function () { warmSet(sc, "s"); markPill("w4", "✓ 已完成"); warmGotoFull(); });
      b4.appendChild(go4);
    }

    /* ---- 底部：随时直达原有完整对话 ---- */
    var foot = el("div", "warmfoot");
    foot.appendChild(el("span", "muted small", "完整对话：学完 ≥60% 句子并在「测验」得 ≥60 分即通关。"));
    var fb = el("button", "bigbtn", "⬇ 进入下方完整对话");
    fb.addEventListener("click", function () {
      if (!ds) { warmSet(sc, "s"); markPill("w4", "✓ 已完成"); }
      warmGotoFull();
    });
    foot.appendChild(fb);
    host.appendChild(foot);
  }

  /* 步骤②/①共用的小测验：mode = "mean"(词↔义) / "hear"(听音辨认)，答完回调 onfin */
  function runWordQuiz(sc, mode, host, onfin) {
    host.innerHTML = "";
    var v = (sc.vocab || []).slice();
    if (!ttsAvailable() && mode === "hear") {
      host.appendChild(el("p", "muted", "本机没有日语语音，已跳过听音辨认题。"));
      return;
    }
    if (v.length < 2) { host.appendChild(el("p", "muted", "本关词数不足，跳过练习。")); return; }

    var n = Math.min(5, v.length);
    var items = shuffle(v.slice()).slice(0, n);
    var idx = 0, correctN = 0, wrong = [];

    function distractorsFor(word, answerKind) {
      var out = [], seen = {};
      var pool = shuffle(v.slice());
      for (var i = 0; i < pool.length && out.length < 3; i++) {
        var o = pool[i];
        if (o === word) continue;
        var cand = answerKind === "w" ? o.w : o.m;
        var base = answerKind === "w" ? word.w : word.m;
        if (!cand || cand === base || seen[cand]) continue;
        seen[cand] = 1; out.push(cand);
      }
      return out;
    }

    function renderQ() {
      host.innerHTML = "";
      if (idx >= items.length) { done(); return; }
      var word = items[idx];

      var q;
      if (mode === "mean") {
        var giveWord = Math.random() < 0.5;
        q = {
          kind: "mean", giveWord: giveWord,
          prompt: giveWord ? word.w : word.m,
          answerKind: giveWord ? "m" : "w",
          correct: giveWord ? word.m : word.w
        };
      } else {
        q = { kind: "hear", answerKind: "w", correct: word.w };
      }
      var optVals = shuffle([q.correct].concat(distractorsFor(word, q.answerKind)));

      var meta = el("div", "quizmeta");
      var progBar = el("div", "qbar");
      var inner = el("i");
      inner.style.width = Math.round((idx / n) * 100) + "%";
      progBar.appendChild(inner);
      meta.appendChild(progBar);
      meta.appendChild(el("span", "qscore", (mode === "hear" ? "听音辨认" : "词语选择") + " · 第 " + (idx + 1) + "/" + n + " · 已对 " + correctN));
      host.appendChild(meta);

      var card = el("div", "qcard");
      if (q.kind === "hear") {
        card.appendChild(el("div", "qtype", "🔊 听发音，选出你听到的假名："));
        var qp = el("div", "qprompt");
        var hearBtn = el("button", "bigbtn voiceonly", "🔊 再听一遍");
        hearBtn.addEventListener("click", function () { speak(word.w); });
        qp.appendChild(hearBtn);
        card.appendChild(qp);
        setTimeout(function () { speak(word.w); }, 120);
      } else {
        card.appendChild(el("div", "qtype", q.giveWord ? "看假名，选出正确的中文：" : "看中文，选出对应的假名："));
        var qp2 = el("div", "qprompt");
        if (q.giveWord) qp2.appendChild(el("span", "zja", q.prompt));
        else qp2.appendChild(el("div", "zhp", "“" + q.prompt + "”"));
        card.appendChild(qp2);
      }

      var opts = el("div", "qopts");
      var answered = false;
      optVals.forEach(function (o) {
        var ob = el("button", "qopt" + (q.answerKind === "m" ? " zhopt" : ""), o);
        ob.addEventListener("click", function () {
          if (answered) return;
          answered = true;
          for (var i = 0; i < opts.children.length; i++) opts.children[i].disabled = true;
          var right = o === q.correct;
          if (right) { ob.classList.add("correct"); correctN++; }
          else {
            ob.classList.add("wrong");
            wrong.push({ prompt: q.prompt, giveWord: q.giveWord, word: word, correct: q.correct });
            for (var k = 0; k < opts.children.length; k++) {
              if (opts.children[k].textContent === q.correct) opts.children[k].classList.add("correct");
            }
          }
          var note = el("div", "qnote " + (right ? "ok" : "bad"));
          note.textContent = right ? "✓ 答对了！" : "✗ 正确答案：" + q.correct + "（" + word.m + "）";
          card.appendChild(note);
          var nx = el("button", "bigbtn", idx + 1 >= n ? "看成绩 →" : "下一题 →");
          nx.style.marginTop = "12px";
          nx.addEventListener("click", function () { idx++; renderQ(); });
          card.appendChild(nx);
        });
        opts.appendChild(ob);
      });
      card.appendChild(opts);
      host.appendChild(card);
    }

    function done() {
      host.innerHTML = "";
      var pct = Math.round((correctN / n) * 100);
      var box = el("div", "quizdone");
      box.appendChild(el("div", "score-big", correctN + " / " + n));
      box.appendChild(el("h3", "", pct >= 80 ? "🎉 太棒了！" : pct >= 50 ? "👍 不错，再巩固一下" : "💪 多听多读会更熟"));
      if (wrong.length) {
        var wl = el("ul", "wronglist");
        wl.appendChild(el("li", "", "—— 做错的词 ——"));
        wrong.forEach(function (w) {
          wl.appendChild(el("li", "", (w.giveWord === false ? "“" + w.prompt + "” → " : w.word.w + " → ") + w.correct + "（" + w.word.m + "）"));
        });
        box.appendChild(wl);
      } else {
        box.appendChild(el("p", "oknote", "全部答对，太棒了！"));
      }
      var again = el("button", "bigbtn ghost", "↻ 再练一组");
      again.addEventListener("click", function () { runWordQuiz(sc, mode, host, onfin); });
      box.appendChild(again);
      host.appendChild(box);
      if (onfin) onfin();
    }

    renderQ();
  }

  /* 组句题：一块一个句子；parts 顺序即句子顺序，点对进入下一块 */
  function makeSentenceBlock(sc, b, bi, total) {
    var blk = el("div", "sbuild");
    var head = el("div", "sbuild-h");
    head.appendChild(el("span", "sbuild-no", "句子 " + (bi + 1) + "/" + total));
    head.appendChild(el("span", "sbuild-zh", "“" + b.zh + "”"));
    var hsay = el("button", "minibtn voiceonly", "🔊 听整句");
    hsay.addEventListener("click", function () { speak(b.jp); });
    head.appendChild(hsay);
    blk.appendChild(head);

    var line = el("div", "chunkline");
    blk.appendChild(line);
    var pool = el("div", "chunkpool");
    blk.appendChild(pool);
    var foot = el("div", "sbuild-foot");
    blk.appendChild(foot);

    var n = b.parts.length;
    var order = shuffle(range(n));
    var placed = [];
    var doneFlag = false;

    function refresh() {
      line.innerHTML = ""; pool.innerHTML = "";
      placed.forEach(function (pi) {
        var c = el("button", "chunk used", b.parts[pi]);
        c.type = "button";
        if (!doneFlag) c.addEventListener("click", function () {
          placed.splice(placed.indexOf(pi), 1); refresh();
        });
        line.appendChild(c);
      });
      if (!doneFlag && placed.length) line.appendChild(el("span", "chunkcaret", "▸"));
      order.forEach(function (pi) {
        if (placed.indexOf(pi) >= 0) return;
        var c = el("button", "chunk", b.parts[pi]);
        c.type = "button";
        c.addEventListener("click", function () {
          if (doneFlag) return;
          var want = placed.length;
          if (pi !== want) {   // 必须按句序拼
            c.classList.add("bad");
            setTimeout(function () { c.classList.remove("bad"); }, 450);
            return;
          }
          placed.push(pi);
          if (placed.length === n) success();
          else refresh();
        });
        pool.appendChild(c);
      });
    }
    function success() {
      doneFlag = true;
      line.innerHTML = "";
      placed.forEach(function (pi) { line.appendChild(el("button", "chunk ok", b.parts[pi])); });
      pool.innerHTML = "";
      foot.innerHTML = "";
      foot.appendChild(el("span", "oknote", "✓ 拼对了：" + b.jp));
      speak(b.jp);
      if (blk._finish) blk._finish();
    }
    refresh();
    return blk;
  }

  /* ④ 简单对话：极简版 turn 列表，复用 .jp/.zh 显示；不写 seen 进度 */
  function renderWarmLines(sc, wl, host) {
    var dlg = el("div", "warmdlg");
    wl.forEach(function (line, i) {
      var row = el("div", "wturn " + line.speaker);
      var top = el("div", "wturn-top");
      top.appendChild(el("span", "chip " + line.speaker, sc.speakers[line.speaker]));
      top.appendChild(el("span", "muted small", "热身 · 第 " + (i + 1) + " 句"));
      row.appendChild(top);
      var jd = el("div", "jp say");
      jd.setAttribute("data-say", line.jp);
      jd.appendChild(buildJp(sc, line.jp));
      row.appendChild(jd);
      /* 整句点击即朗读；点名词词卡仍只弹词卡 */
      jd.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("mark.vn")) return;
        ev.stopPropagation();
        playSentence(jd, line.jp);
      });
      row.appendChild(el("div", "zh", "中文：" + line.zh));
      var acts = el("div", "t-actions");
      var bp = el("button", "minibtn voiceonly", "🔊");
      bp.title = "朗读整句";
      bp.setAttribute("aria-label", "朗读整句");
      bp.addEventListener("click", function (ev) { ev.stopPropagation(); playSentence(jd, line.jp); });
      acts.appendChild(bp);
      row.appendChild(acts);
      row.addEventListener("click", function () { row.classList.toggle("open"); });
      dlg.appendChild(row);
    });
    host.appendChild(dlg);
  }

  /* ---------------- 标签：学习对话 ---------------- */
  function renderLearn(sc, container) {
    container.innerHTML = "";
    /* v3：情景词语热身（只对带 warm 字段的新情景显示；原完整对话等照旧在下方） */
    if (hasWarm(sc)) {
      var warmHost = el("div", "warmhost");
      container.appendChild(warmHost);
      renderWarmUp(sc, warmHost);
    }
    var ol = el("ol", "dialog");
    var seenArr = ensureProg(sc.id).seen;
    sc.lines.forEach(function (line, idx) {
      var li = el("li", "turn " + (line.speaker === "A" ? "A" : "B"));
      if (seenArr[idx]) li.classList.add("seen");   // 仅样式钩子：给“已学”句打淡勾（不影响任何逻辑）
      var top = el("div", "t-top");
      top.appendChild(el("span", "chip " + line.speaker, sc.speakers[line.speaker]));
      top.appendChild(el("span", "t-no", "第 " + (idx + 1) + " 句"));
      li.appendChild(top);

      var jd = el("div", "jp say");
      jd.setAttribute("data-say", line.jp);
      jd.appendChild(buildJp(sc, line.jp));
      li.appendChild(jd);
      /* v3.3：整句都是朗读按钮——点句子任意处播放；点名词词卡仍只弹词卡 */
      jd.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("mark.vn")) return;
        ev.stopPropagation();
        markSeen(sc.id, idx);
        playSentence(jd, line.jp);
      });

      var rk = legacyKana(line);
      if (rk) li.appendChild(el("div", "kana", "读法：" + rk));
      li.appendChild(el("div", "zh", "中文：" + line.zh));

      var acts = el("div", "t-actions");
      var bPlay = el("button", "minibtn voiceonly", "🔊");
      bPlay.title = "朗读整句";
      bPlay.setAttribute("aria-label", "朗读整句");
      bPlay.addEventListener("click", function (ev) { ev.stopPropagation(); markSeen(sc.id, idx); playSentence(jd, line.jp); });
      var isFav = favIndexOf(keyOf(sc.id, idx)) >= 0;
      var bFav = el("button", "minibtn" + (isFav ? " on" : ""), isFav ? "★ 已收藏" : "☆ 收藏");
      bFav.addEventListener("click", function (ev) { ev.stopPropagation(); toggleFav(sc, idx, bFav); });
      acts.appendChild(bPlay);
      acts.appendChild(bFav);
      li.appendChild(acts);

      li.addEventListener("click", function () { li.classList.toggle("open"); });
      ol.appendChild(li);
    });
    container.appendChild(ol);

    /* 本课重点名词（快捷词卡入口） */
    if ((sc.vocab || []).length) {
      var vs = el("div", "vstrip");
      vs.appendChild(el("div", "muted small", "🖍 本课重点名词（正文中已标色，点这里或句中任意一个可看中文并听读）："));
      var wr = el("div", "c-tags");
      sc.vocab.forEach(function (v, vi) {
        var c = el("span", "tag accent vchip", v.w + "　" + v.m);
        c.style.cursor = "pointer";
        c.title = "点击打开词卡";
        c.addEventListener("click", function () { openVocab(sc, vi); });
        wr.appendChild(c);
      });
      vs.appendChild(wr);
      container.appendChild(vs);
    }

    var tip = el("p", "muted small", "💡 提示：点卡片展开/收起中文；点整句任意位置即可朗读；🔊 是小喇叭提示；有颜色的名词可点开词卡。");
    tip.style.margin = "14px 0 0";
    container.appendChild(tip);
  }

  function toggleFav(sc, idx, btn) {
    var key = keyOf(sc.id, idx);
    var i = favIndexOf(key);
    if (i >= 0) {
      state.favs.splice(i, 1);
      btn.textContent = "☆ 收藏";
      btn.classList.remove("on");
    } else {
      var line = sc.lines[idx];
      var f = { key: key, sid: sc.id, titleZh: sc.titleZh, speaker: line.speaker, speakerLabel: sc.speakers[line.speaker], jp: line.jp, zh: line.zh };
      if (legacyKana(line)) f.kana = line.kana;   // 新内容纯平假名，不再存读法
      state.favs.push(f);
      btn.textContent = "★ 已收藏";
      btn.classList.add("on");
    }
    saveFavs();
    updateFavCount();
  }

  /* ---------------- 跟读录音（离线自对比） ---------------- */
  var rec = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    stream: null, mr: null, chunks: [], url: null, on: false, denied: false,
    gen: 0,        // 代次令牌：异步回调只认当前代
    curIdx: -1     // 录音/回放属于哪一句(跟读 roleLines 的下标)
  };

  function recCleanup() {
    rec.gen++;
    if (rec.mr && rec.mr.state !== "inactive") { try { rec.mr.stop(); } catch (e) {} }
    rec.mr = null; rec.on = false; rec.chunks = [];
    if (rec.stream) { try { rec.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} rec.stream = null; }
    if (rec.url) { try { URL.revokeObjectURL(rec.url); } catch (e) {} rec.url = null; }
  }
  function recEnter(liIdx) {
    if (rec.curIdx !== liIdx) { recCleanup(); rec.curIdx = liIdx; }
  }

  function renderShadow(sc, container) {
    container.innerHTML = "";
    var box = el("div", "shadowbox");
    var roleLines = [];
    sc.lines.forEach(function (l, i) { if (l.speaker === state.sr.role) roleLines.push(i); });
    if (roleLines.length === 0) {
      box.appendChild(el("p", "", "该角色没有说话，请换另一个角色练习。"));
      container.appendChild(box);
      return;
    }

    /* 选择扮演角色 */
    var pick = el("div", "rolepick");
    pick.appendChild(el("span", "lbl", "我扮演："));
    ["A", "B"].forEach(function (r) {
      var b = el("button", "rolebtn" + (state.sr.role === r ? " active" : ""), "🙂 " + sc.speakers[r] + "（" + r + "）");
      b.addEventListener("click", function () { state.sr.role = r; state.sr.idx = 0; state.sr.open = false; renderScenario(); });
      pick.appendChild(b);
    });
    box.appendChild(pick);
    box.appendChild(el("p", "muted", "练习方式：看对方台词 → 听示范 → 自己说出你的台词 → 点「看答案」对照并录音自对比。"));

    var stage = el("div", "stage");
    box.appendChild(stage);

    if (state.sr.idx >= roleLines.length) {
      renderShadowDone(box, sc, roleLines.length);
      container.appendChild(box);
      return;
    }

    var liIdx = roleLines[state.sr.idx];
    var line = sc.lines[liIdx];
    recEnter(liIdx);
    stage.appendChild(el("div", "counter", "第 " + (state.sr.idx + 1) + " / " + roleLines.length + " 句（" + (state.sr.role === "A" ? sc.speakers.B : sc.speakers.A) + "已说）"));

    var ctxIdx = liIdx - 1;
    if (ctxIdx >= 0 && sc.lines[ctxIdx].speaker !== state.sr.role) {
      stage.appendChild(el("div", "ctx", "▲ 对方：" + sc.lines[ctxIdx].jp));
    }

    var isOpen = !!state.sr.open;
    if (!isOpen && rec.on) recCleanup();   // 台词隐藏时不保留进行中的录音

    if (isOpen) {
      var jp = el("div", "jp");
      jp.appendChild(buildJp(sc, line.jp));
      stage.appendChild(jp);
      var kw = el("div");
      var rk = legacyKana(line);
      if (rk) kw.appendChild(el("div", "kana", "读法：" + rk));
      kw.appendChild(el("div", "zh", "中文：" + line.zh));
      stage.appendChild(kw);
      markSeen(sc.id, liIdx);
    } else {
      stage.appendChild(el("div", "mask", "＊＊＊＊＊＊＊＊"));
      stage.appendChild(el("p", "muted", "（台词已隐藏 —— 先听示范，自己试着说出来）"));
    }

    var btns = el("div", "bigbtns");
    var bPrev = el("button", "bigbtn ghost", "⬅ 上一句");
    bPrev.disabled = state.sr.idx === 0;
    bPrev.addEventListener("click", function () { state.sr.idx--; state.sr.open = false; renderShadow(sc, container); });
    btns.appendChild(bPrev);

    var bPlay = el("button", "bigbtn voiceonly" + (state.sr.open ? " ghost" : ""), "🔊 " + (state.sr.open ? "再听一遍" : "听示范"));
    bPlay.addEventListener("click", function () { speak(line.jp); });
    btns.appendChild(bPlay);

    var bOpen = el("button", "bigbtn ghost", isOpen ? "🙈 再隐藏" : "看答案");
    bOpen.addEventListener("click", function () { state.sr.open = !state.sr.open; renderShadow(sc, container); });
    btns.appendChild(bOpen);

    var bNext = el("button", "bigbtn", "下一句 ➡");
    bNext.addEventListener("click", function () { state.sr.idx++; state.sr.open = false; renderShadow(sc, container); });
    btns.appendChild(bNext);
    stage.appendChild(btns);

    if (isOpen) {
      var note2 = el("div", "pract-note", "✅ 已练习，点「下一句」继续。");
      stage.appendChild(note2);
      if (rec.supported) stage.appendChild(buildRecPanel(sc, line, liIdx));
      else {
        var no = el("div", "recpanel");
        no.appendChild(el("div", "rp-title", "🎙 跟读录音（离线）"));
        no.appendChild(el("div", "recnote", "当前浏览器不支持录音，可点 🔊 反复听示范后自己朗读对照。"));
        stage.appendChild(no);
      }
    }

    container.appendChild(box);
  }

  /* 录音面板：🎙 录音 / ▶▶ 我的录音 / 🔁 对照(标准→我的) */
  function buildRecPanel(sc, line, liIdx) {
    var box = el("div", "recpanel");
    box.appendChild(el("div", "rp-title", "🎙 跟读录音 · 自对比（仅在本页内存中，离线、不上传）"));

    var row = el("div", "recbtns");
    var bRec = el("button", "bigbtn recbtn", "🎙 开始录音");
    var bOwn = el("button", "bigbtn ghost voiceonly", "▶▶ 我的录音");
    var bCmp = el("button", "bigbtn ghost voiceonly", "🔁 对照 标准→我的");
    bOwn.disabled = true; bCmp.disabled = true;
    row.appendChild(bRec); row.appendChild(bOwn); row.appendChild(bCmp);
    box.appendChild(row);

    var note = el("div", "recnote", rec.url ? "已有一段录音，可 ▶▶ 回放 或 🔁 对照。" : "点「🎙 开始录音」读一遍这句话，读完后可回放、对照自己的发音。");
    box.appendChild(note);

    var tips = el("div", "rec-tips", "");
    tips.appendChild(el("span", "muted small", "对照小贴士："));
    var tipsArr = ["长音 oo 要拖长一倍（如 こおひい）", "促音 っ 要停顿一拍", "清浊 か↔が・た↔だ 要分清", "拗音 きゃ/しゅ 快读一拍"];
    tipsArr.forEach(function (t) { tips.appendChild(el("span", "tag", t)); });
    box.appendChild(tips);

    function setNote(msg, cls) { note.textContent = msg; note.className = "recnote" + (cls ? " " + cls : ""); }
    function ui() {
      bRec.textContent = rec.on ? "⏹ 停止录音" : "🎙 开始录音";
      bRec.classList.toggle("recording", !!rec.on);
      var has = !!rec.url;
      bOwn.disabled = !has; bCmp.disabled = !has;
    }

    function startRec() {
      if (!rec.supported || rec.denied || rec.on) return;
      var g = ++rec.gen;
      setNote("正在请求麦克风权限…");
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        if (g !== rec.gen) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return; }
        rec.stream = stream;
        rec.chunks = [];
        try { rec.mr = new MediaRecorder(stream); }
        catch (e) { rec.denied = true; rec.stream = null; ui(); setNote("此浏览器暂不支持录音格式，可只用示范+看文字自行对照。", "bad"); return; }
        rec.mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) rec.chunks.push(ev.data); };
        rec.mr.onstop = function () {
          if (g !== rec.gen) return;
          var type = (rec.mr && rec.mr.mimeType && rec.mr.mimeType.indexOf("audio") === 0) ? rec.mr.mimeType : "audio/webm";
          try {
            var blob = new Blob(rec.chunks, { type: type });
            if (blob.size) { if (rec.url) URL.revokeObjectURL(rec.url); rec.url = URL.createObjectURL(blob); }
          } catch (e) {}
          try { if (rec.stream) rec.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          rec.stream = null; rec.mr = null; rec.chunks = []; rec.on = false;
          rec.curIdx = liIdx;
          ui();
          setNote("已录好。可 ▶▶ 回放自己的录音，或 🔁 对照标准音与自己的发音。", "ok");
        };
        rec.mr.start();
        rec.on = true;
        ui();
        setNote("🎙 正在录音…请照着示范大声读一遍这句话。", "bad");
      }).catch(function () {
        if (g !== rec.gen) return;
        rec.denied = true;
        ui();
        setNote("未获得麦克风权限（或本机没有麦克风）。已改为手动对照：点 🔊 听示范后自己朗读即可。", "bad");
      });
    }
    function stopRec() { if (rec.mr && rec.mr.state === "recording") rec.mr.stop(); }
    function playOwn() {
      if (!rec.url) { setNote("还没有录音，先点「🎙 开始录音」。", "bad"); return; }
      try { var a = new Audio(rec.url); a.play(); } catch (e) {}
    }
    function compare() {
      if (!rec.url) { setNote("还没有录音，先点「🎙 开始录音」。", "bad"); return; }
      setNote("先播放标准音…");
      speak(line.jp, function () {
        setNote("现在播放你的录音，请对照找差异。", "ok");
        playOwn();
      });
    }

    bRec.addEventListener("click", function () { rec.on ? stopRec() : startRec(); });
    bOwn.addEventListener("click", playOwn);
    bCmp.addEventListener("click", compare);
    return box;
  }

  function renderShadowDone(box, sc, total) {
    var done = el("div", "quizdone");
    done.appendChild(el("div", "big-emoji", "🎉"));
    done.appendChild(el("h3", "", "本角色 " + total + " 句已全部练完！"));
    done.appendChild(el("p", "muted", "学过的句子会记入进度。再来一轮或换个角色试试？"));
    var btns = el("div", "bigbtns");
    var again = el("button", "bigbtn", "↻ 再练一遍");
    again.addEventListener("click", function () { state.sr.idx = 0; state.sr.open = false; renderScenario(); });
    btns.appendChild(again);
    var swap = el("button", "bigbtn ghost", "🎭 换成另一个角色");
    swap.addEventListener("click", function () {
      state.sr.role = state.sr.role === "A" ? "B" : "A"; state.sr.idx = 0; state.sr.open = false; renderScenario();
    });
    btns.appendChild(swap);
    var back = el("button", "bigbtn ghost", "→ 去测验试试");
    back.addEventListener("click", function () { setStab("quiz"); });
    btns.appendChild(back);
    done.appendChild(btns);
    box.appendChild(done);
  }

  /* ---------------- 标签：随堂测验 ---------------- */
  function makeQuiz() {
    var sc = scenarioById(state.curSid);
    var n = Math.min(8, sc.lines.length);
    var idxs = shuffle(range(sc.lines.length)).slice(0, n);
    var items = idxs.map(function (liIdx) {
      var dir = Math.random() < 0.5 ? 0 : 1; // 0：给中文选日文；1：给日文选中文
      var line = sc.lines[liIdx];
      var correct = dir === 0 ? line.jp : line.zh;
      var pool = [];
      sc.lines.forEach(function (l, i) { if (i !== liIdx) pool.push(dir === 0 ? l.jp : l.zh); });
      var seen = {}; seen[correct] = 1;
      var distract = [];
      while (distract.length < 3 && pool.length) {
        var v = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        if (!seen[v]) { seen[v] = 1; distract.push(v); }
      }
      return { liIdx: liIdx, dir: dir, promptLine: line, correct: correct, opts: shuffle([correct].concat(distract)) };
    });
    state.q = { items: items, idx: 0, correct: 0, wrong: [], answered: false };
  }

  function renderQuiz(sc, container) {
    container.innerHTML = "";
    if (!state.q) makeQuiz();
    var q = state.q;
    var wrap = el("div", "quizwrap");

    if (q.idx >= q.items.length) { renderQuizDone(sc, q, wrap); container.appendChild(wrap); return; }

    var item = q.items[q.idx];
    var meta = el("div", "quizmeta");
    var prog = el("div", "qprog");
    var bar = el("div", "qbar");
    var inner = el("i");
    inner.style.width = Math.round((q.idx / q.items.length) * 100) + "%";
    bar.appendChild(inner);
    prog.appendChild(bar);
    meta.appendChild(prog);
    meta.appendChild(el("span", "qscore", "第 " + (q.idx + 1) + "/" + q.items.length + " 题 · 已对 " + q.correct));
    wrap.appendChild(meta);

    var card = el("div", "qcard");
    if (item.dir === 0) {
      card.appendChild(el("div", "qtype", "看中文，选出对应的日语句子："));
      card.appendChild(el("div", "qprompt zhp", "“" + item.promptLine.zh + "”"));
    } else {
      card.appendChild(el("div", "qtype", "看/听日语句子，选出正确的中文意思："));
      var qp = el("div", "qprompt");
      var qj = el("div", "");
      qj.appendChild(buildJp(sc, item.promptLine.jp));
      qp.appendChild(qj);
      var qrk = legacyKana(item.promptLine);
      if (qrk) qp.appendChild(el("div", "kana", "读法：" + qrk));
      card.appendChild(qp);
    }

    var opts = el("div", "qopts");
    item.opts.forEach(function (o) {
      var b = el("button", "qopt" + (item.dir === 0 ? "" : " zhopt"), o);
      b.addEventListener("click", function () {
        if (q.answered) return;
        q.answered = true;
        var all = opts.children;
        for (var i = 0; i < all.length; i++) all[i].disabled = true;
        var isRight = o === item.correct;
        if (isRight) { b.classList.add("correct"); q.correct++; }
        else {
          b.classList.add("wrong");
          q.wrong.push(item);
          for (var k = 0; k < all.length; k++) if (all[k].textContent === item.correct) all[k].classList.add("correct");
        }
        var note = el("div", "qnote " + (isRight ? "ok" : "bad"));
        if (isRight) note.textContent = "✓ 答对了！";
        else {
          note.textContent = "✗ 正确答案：" + item.correct;
          var sub = el("div", "small");
          var qrk2 = legacyKana(item.promptLine);
          sub.textContent = item.dir === 0
            ? "对应中文：" + item.promptLine.zh + (qrk2 ? "　读法：" + qrk2 : "")
            : "对应中文：" + item.promptLine.zh + (qrk2 ? "　读法：" + qrk2 : "");
          note.appendChild(sub);
        }
        card.appendChild(note);
        var nxt = el("button", "bigbtn", q.idx + 1 >= q.items.length ? "查看成绩 →" : "下一题 →");
        nxt.style.marginTop = "12px";
        nxt.addEventListener("click", function () { q.idx++; q.answered = false; renderQuiz(sc, container); });
        card.appendChild(nxt);
      });
      opts.appendChild(b);
    });
    card.appendChild(opts);
    wrap.appendChild(card);
    container.appendChild(wrap);
  }

  function renderQuizDone(sc, q, wrap) {
    var pct = Math.round((q.correct / q.items.length) * 100);
    var p = ensureProg(sc.id);
    if (p.quizBest == null || pct > p.quizBest) { p.quizBest = pct; saveProg(); }

    var passed = scPass(sc);
    var mi = mainIndex(sc.id);
    var nextSc = mi >= 0 && mi + 1 < TOTAL ? SCENARIOS[mi + 1] : null;

    var done = el("div", "quizdone");
    done.appendChild(el("div", "score-big", q.correct + " / " + q.items.length));
    done.appendChild(el("h3", "", "正确率 " + pct + "%　" + (pct >= 80 ? "🎉 太棒了！" : pct >= 50 ? "👍 不错，再巩固一下" : "💪 加油，重练一遍会更熟")));
    if (passed) {
      var passCard = el("div", "qnote ok");
      passCard.appendChild(document.createTextNode("✅ 本关已通关！"));
      var pb = el("div", "small");
      if (nextSc) pb.textContent = "已达到 学习≥60%句 且 测验≥60 分，下一关「" + nextSc.titleZh + "」已解锁。";
      else pb.textContent = "恭喜，这是最后一关，你已打通全部主线！🎓";
      passCard.appendChild(pb);
      done.appendChild(passCard);
    } else {
      var needNote = el("div", "qnote bad");
      needNote.textContent = "还需：学习 ≥60% 句子 且 测验 ≥60 分 才算通关。可回学习页把句子都听完，再回来重测。";
      done.appendChild(needNote);
    }
    wrap.appendChild(done);

    if (q.wrong.length) {
      var wl = el("ul", "wronglist");
      wl.appendChild(el("li", "", "—— 本次错题 ——"));
      q.wrong.forEach(function (it) {
        var li = el("li", "");
        if (it.dir === 0) {
          li.appendChild(document.createTextNode("“" + it.promptLine.zh + "” → " + it.correct));
        } else {
          li.appendChild(document.createTextNode(it.promptLine.jp + " → " + it.correct));
        }
        var rk3 = legacyKana(it.promptLine);
        if (rk3) li.appendChild(el("div", "small", "读法：" + rk3));
        wl.appendChild(li);
      });
      done.appendChild(wl);
    }

    var btns = el("div", "bigbtns");
    if (passed && nextSc) {
      var bNext = el("button", "bigbtn", "下一关 ➡ " + nextSc.titleZh);
      bNext.addEventListener("click", function () { openScenario(nextSc.id, true); });
      btns.appendChild(bNext);
    }
    var bWrong = el("button", "bigbtn ghost", "↻ 重做错题");
    if (!q.wrong.length) bWrong.disabled = true;
    bWrong.addEventListener("click", function () {
      if (q.wrong.length) { state.q = { items: q.wrong, idx: 0, correct: 0, wrong: [], answered: false }; }
      renderScenario();
    });
    btns.appendChild(bWrong);

    var bNew = el("button", "bigbtn ghost", "✎ 再来一组");
    bNew.addEventListener("click", function () { makeQuiz(); renderScenario(); });
    btns.appendChild(bNew);

    var bBack = el("button", "bigbtn ghost", "← 回学习");
    bBack.addEventListener("click", function () { setStab("learn"); });
    btns.appendChild(bBack);

    done.appendChild(btns);
    wrap.appendChild(done);
  }

  function setStab(s) { state.stab = s; renderScenario(); }

  /* ---------------- 生词本 ---------------- */
  function renderFavs() {
    updateFavCount();
    var list = $("#favList");
    list.innerHTML = "";
    var note = $("#favEmptyNote");
    var total = state.favs.length;
    note.textContent = total ? "共 " + total + " 条收藏。" : "";
    if (!total) {
      var empty = el("li", "empty");
      empty.appendChild(el("span", "big", "📌"));
      empty.appendChild(document.createTextNode("还没有收藏任何句子。回到情景，点「☆ 收藏」把想记的句子存进来吧。"));
      list.appendChild(empty);
      return;
    }
    state.favs.forEach(function (f) {
      var li = el("li");
      var body = el("div", "f-body");
      var jd = el("div", "f-jp");
      var fsc = scenarioById(f.sid);
      jd.appendChild(buildJp(fsc, f.jp));
      body.appendChild(jd);
      body.appendChild(el("div", "f-zh", f.zh));
      var meta = el("div", "f-meta");
      var chip = el("span", "chip " + f.speaker, f.speakerLabel);
      var fk = f.kana;
      if (fk && fk === (f.jp || "")) fk = "";
      if (fk) meta.appendChild(document.createTextNode("读法：" + fk));
      meta.appendChild(chip);
      if (fsc) {
        var lvc = el("span", "lv lv" + fsc.level + " meta-lv", "L" + fsc.level + " " + lvName(fsc.level));
        meta.appendChild(lvc);
      }
      body.appendChild(meta);
      li.appendChild(body);

      var acts = el("div", "t-actions");
      var bPlay = el("button", "minibtn voiceonly", "🔊");
      bPlay.title = "朗读";
      bPlay.addEventListener("click", function () { speak(f.jp); });
      acts.appendChild(bPlay);
      var bGo = el("button", "minibtn", "去情景");
      bGo.addEventListener("click", function () { openScenario(f.sid, true); });
      acts.appendChild(bGo);
      var bDel = el("button", "minibtn", "移除 ✕");
      bDel.addEventListener("click", function () {
        var i = favIndexOf(f.key);
        if (i >= 0) state.favs.splice(i, 1);
        saveFavs(); renderFavs();
      });
      acts.appendChild(bDel);
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function clearFavs() {
    if (state.favs.length && !window.confirm("确定清空全部生词本收藏吗？此操作不可撤销。")) return;
    state.favs = [];
    saveFavs();
    updateFavCount();
    if (!$("#viewFavs").hidden) renderFavs();
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    $("#setZh").checked = !!state.settings.showZh;
    $("#setUnlock").checked = !!state.settings.unlockAll;
    $("#rateRange").value = state.settings.rate;
    $("#rateVal").textContent = state.settings.rate.toFixed(2).replace(/0$/, "") + "×";
    updateVoiceUI();
    $("#settingsOverlay").hidden = false;
  }
  function closeSettings() { $("#settingsOverlay").hidden = true; }

  function resetData() {
    if (!window.confirm("确定重置全部学习数据吗？（进度、生词本、设置都会清空）")) return;
    Object.keys(K).forEach(function (k) { try { localStorage.removeItem(K[k]); } catch (e) {} });
    state.settings = { showZh: false, rate: 0.95, unlockAll: false };
    state.favs = [];
    state.prog = {};
    state.filter = null;
    /* v4 新增的两处本机数据也一并清掉，否则「重置全部」名不副实 */
    memo = [];
    storyDone = {};
    profile = { nick: "", phone: "", depart: "" };
    closeVocab();
    closeSettings();
    nav("home");
    updateFavCount();
    toast("已重置全部学习数据。");
  }

  /* ================= v4：PWA 安装提示（阶段 6） =================
   * 原则是「不打断」：
   *   1) 已经是从桌面图标打开的（standalone）→ 永远不提示；
   *   2) 用户点过「✕ / 知道了」→ 存本机，以后再也不提示；
   *   3) 不弹模态框、不盖内容，只在底部导航上方浮一条，随时能关；
   *   4) 不出现「PWA / Service Worker / manifest」这类技术词，
   *      只说「添加到手机桌面」「以后打开更方便」。
   * iOS Safari 没有 beforeinstallprompt，只能给一句手动指引。
   * ------------------------------------------------------------ */
  K.install = "riyu.installHint";

  var installDismissed = loadJson(K.install, false) === true;
  var deferredPrompt = null;      /* 只在内存里，刷新即失效 */

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
           window.navigator.standalone === true;   /* iOS 私有属性 */
  }
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);  /* iPadOS 桌面模式 */
  }

  function dismissInstall() {
    installDismissed = true;
    saveJson(K.install, true);
    var b = document.getElementById("installBar");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function showInstallBar(mode) {
    if (installDismissed || isStandalone()) return;
    if (document.getElementById("installBar")) return;
    var bar = el("div", "installbar");
    bar.id = "installBar";
    bar.appendChild(el("span", "ib-ic", "📲"));
    var tx = el("div", "ib-tx");
    tx.appendChild(el("b", "ib-title", "添加到手机桌面"));
    tx.appendChild(el("span", "ib-sub", mode === "ios"
      ? "点底部中间的「分享」按钮，选「添加到主屏幕」。"
      : "装好后像 App 一样打开，断网也能看。"));
    bar.appendChild(tx);
    var go = el("button", "minibtn ib-go", mode === "ios" ? "知道了" : "添加");
    go.addEventListener("click", function () {
      var p = deferredPrompt;
      deferredPrompt = null;
      if (p && p.prompt) { try { p.prompt(); } catch (e) { /* 用户已拒绝过就忽略 */ } }
      dismissInstall();
    });
    bar.appendChild(go);
    var x = el("button", "ib-x", "✕");
    x.setAttribute("aria-label", "以后再说");
    x.title = "以后再说";
    x.addEventListener("click", dismissInstall);
    bar.appendChild(x);
    document.body.appendChild(bar);
  }

  function initInstall() {
    if (installDismissed || isStandalone()) return;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();                 /* 先拦下浏览器自带的横幅，由我们挑时机 */
      deferredPrompt = e;
      setTimeout(function () { showInstallBar("chrome"); }, 5000);
    });
    window.addEventListener("appinstalled", dismissInstall);
    if (isIOS()) setTimeout(function () { showInstallBar("ios"); }, 8000);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    /* 导航 */
    document.querySelectorAll(".navbtn").forEach(function (b) {
      b.addEventListener("click", function () { nav(b.dataset.nav); });
    });
    /* 带 data-nav 的元素一律可导航。<button> 也支持（v4 起首页「打开场景地图」等是按钮）；
       .navbtn 与底部 tab 有自己的绑定，跳过以免重复触发。 */
    document.querySelectorAll("[data-nav]").forEach(function (n) {
      if (n.classList.contains("navbtn")) return;
      if (n.parentNode && n.parentNode.id === "tabBar") return;
      n.addEventListener("click", function () { nav(n.dataset.nav); });
    });
    $("#btnBack").addEventListener("click", function () { nav("home"); });
    var bSceneBack = $("#btnSceneBack");
    if (bSceneBack) bSceneBack.addEventListener("click", function () { nav(sceneFrom); });

    /* 底部 tab（这些是 <button>，上面的 [data-nav] 绑定会跳过它们） */
    document.querySelectorAll("#tabBar .tb").forEach(function (b) {
      b.addEventListener("click", function () { nav(b.dataset.nav); });
    });

    /* 桌面左栏由底部 tab 克隆而来，绑好点击（#sideNav 里的按钮没有 data-nav 属性，
       上面那条 [data-nav] 选择器扫不到，所以克隆完必须自己绑） */
    buildSidebar();

    /* 情景标签 */
    $("#scenTabs").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest(".tab") : null;
      if (t) setStab(t.dataset.stab);
    });

    /* 显示开关（即时生效） */
    $("#tglZh").addEventListener("change", function () { state.settings.showZh = this.checked; saveSettings(); applyDisplayClass(); });

    /* 词卡栏 */
    $("#vbClose").addEventListener("click", closeVocab);
    $("#vbSpeak").addEventListener("click", function () {
      if (vocabState.sc && vocabState.sc.vocab[vocabState.vi]) speak(vocabState.sc.vocab[vocabState.vi].w);
    });

    /* 生词本清空 */
    $("#btnClearFavs").addEventListener("click", clearFavs);
    $("#btnClearFavs2").addEventListener("click", clearFavs);

    /* 设置抽屉 */
    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnCloseSettings").addEventListener("click", closeSettings);
    $("#settingsOverlay").addEventListener("click", function (e) { if (e.target.id === "settingsOverlay") closeSettings(); });
    $("#rateRange").addEventListener("input", function () {
      state.settings.rate = parseFloat(this.value);
      saveSettings();
      $("#rateVal").textContent = state.settings.rate.toFixed(2).replace(/0$/, "") + "×";
    });
    $("#setZh").addEventListener("change", function () { state.settings.showZh = this.checked; saveSettings(); });
    $("#setUnlock").addEventListener("change", function () {
      state.settings.unlockAll = this.checked;
      saveSettings();
      if ($("#viewHome").hidden === false) renderHome();
      else toast(this.checked ? "已解锁全部关卡（自由练习）。" : "已恢复逐关解锁。");
    });
    $("#btnResetData").addEventListener("click", resetData);

    /* 真实情景 · 沉浸式入口/返回 */
    var bStoryIn = $("#btnStoryCafe"); if (bStoryIn) bStoryIn.addEventListener("click", openStory);
    var bStoryBack = $("#btnStoryBack"); if (bStoryBack) bStoryBack.addEventListener("click", storyGoHome);

    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSettings(); });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    /* 注意：scenarios 为空**不再是错误**——主线正文在 js/paid/，公开访客
       拿不到，那是预期状态，首页会渲染成 25 张锁定卡片。只有聚合器本身
       没加载（js/data.js 丢了）才是真的坏了。 */
    if (typeof DAILY_DATA === "undefined") {
      document.body.innerHTML = "<p style='padding:40px;text-align:center'>数据文件 js/data.js 未加载，请确认文件存在。</p>";
      return;
    }
    /* 兜底：老设置里可能带 unlockAll/showKana 等历史键，忽略即可；默认全关 */
    if (typeof state.settings.unlockAll !== "boolean") state.settings.unlockAll = false;
    $("#aboutLine").textContent = META.appName + " · 离线版 v" + META.version + "　主线正文纯平假名 · 不联网不上传。想增加情景或升级为「AI 自由对话练口语」可随时找我。";
    bindEvents();
    initInstall();
    updateFavCount();
    refreshStoryGate();
    if (window.speechSynthesis) {
      speechSynthesis.onvoiceschanged = refreshVoice;
      refreshVoice();
      setTimeout(refreshVoice, 700);
      setTimeout(refreshVoice, 2000);
    } else {
      updateVoiceUI();
    }
    /* 手机返回键 / 侧滑返回 */
    window.addEventListener("hashchange", onHashChange);
    /* 开发预览提示条（?preview=… 时才出现；正式用户看不到） */
    if (window.Entitlement && window.Entitlement.mountBadge) window.Entitlement.mountBadge();
    /* 按地址栏里的视图恢复；带状态却没内容的子页回退到首页 */
    var v0 = viewFromHash();
    if ((v0 === "scenario" && !state.curSid) || (v0 === "story" && !story.id) ||
        (v0 === "scene" && !curSceneId)) v0 = "home";
    nav(v0 || "home", { restore: true });

    /* 预览会话才注入付费正文；到货后把当前页重画一遍（锁卡→可玩）。
       公开访客走不到这里，浏览器不会发出任何 js/paid/ 请求。 */
    loadPaidPack(function (got) {
      if (!got) return;
      nav(viewFromHash() || "home", { silent: true, restore: true });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
