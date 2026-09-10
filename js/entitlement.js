/* =========================================================================
 * 权限真相源（Entitlement）——全站唯一判断“用户有没有买”的地方
 * -------------------------------------------------------------------------
 * 铁律（不要破坏）：
 *   1. 任何 UI 都只能问这里，禁止自己读 localStorage 判断是否已购买。
 *   2. 本文件绝不把权限写进 localStorage / sessionStorage。
 *   3. 现在没有后端，默认「未购买」。
 *
 * 开发预览：?preview=true（或 travel / study）打开对应权益。
 *   - 只存在于这一次页面加载的内存里，刷新即失效。
 *   - 正式用户不带参数，看到的永远是未购买状态。
 *   将来接入登录与数据库权限后，**删除 readPreview() 这一个函数**即可。
 *
 * 将来接后端：只需改 fetchEntitlements() 的内部实现为请求 /api/me，
 * 其余代码（所有页面）一行都不用动。
 * ========================================================================= */
(function () {
  "use strict";

  var PREVIEW_BADGE_ID = "previewBadge";

  /* ---- 开发预览：唯一的“作弊入口”，接后端时删掉本函数及调用 ---- */
  function readPreview() {
    var q = "";
    try { q = String(window.location.search || ""); } catch (e) { return null; }
    var m = /[?&]preview=([^&#]*)/.exec(q);
    if (!m) return null;
    var v = decodeURIComponent(m[1]).toLowerCase();
    if (v === "true" || v === "1" || v === "all" || v === "full") return { travel: true, study: true };
    if (v === "travel") return { travel: true, study: false };
    if (v === "study") return { travel: false, study: true };
    if (v === "none" || v === "false" || v === "0") return { travel: false, study: false };
    return null;
  }

  /* ---- 未来后端接口位置：现在恒为“未购买” ----
   * 字段名对齐将来数据库的 travel_access / study_access：
   *   travel_access = 旅行篇（推荐路线 25 + 全部场景 32）
   *   study_access  = 求学篇（推荐路线 20 + 全部场景 24）
   *   两个都为真 = 完整版。**不需要第三个权限位。**
   * 返回值里的 travel / study 是这两项的别名，供现有 UI 读取，不用改调用方。 */
  function fetchEntitlements() {
    /* === 接入后端时替换本函数体 ===
     * return fetch("/api/me", { credentials: "include" })
     *   .then(function (r) { return r.json(); })
     *   .then(function (u) { return { travel_access: !!u.travel_access, study_access: !!u.study_access }; });
     * 在此之前，前端不知道任何人的购买状态。 */
    return { travel_access: false, study_access: false };
  }

  /* ---- 内容下发接口位置：现在恒为“拿不到” ----
   * 公开前端**不持有**付费正文（对话 / 单词 / 救命句），
   * 所以未解锁的场景，公开侧只允许知道三个字段：
   *     { scene_id, title, locked }
   * 将来由后端按 travel_access / study_access 判断后返回真实内容：
   *     { scene_id, steps: [...], words: [...], phrases: [...] }
   * 在此之前一律返回 null —— 调用方据此渲染锁定态，
   * 绝不编造占位正文（灰掉的假句子比空着更糟）。 */
  function fetchSceneContent(sceneId) {
    /* === 接入后端时替换本函数体 ===
     * return fetch("/api/scene?id=" + encodeURIComponent(sceneId), { credentials: "include" })
     *   .then(function (r) { return r.ok ? r.json() : null; });
     * 注意：那时本函数的调用方要改成异步（现在是同步返回 null）。 */
    return null;
  }

  /* 未解锁场景在公开前端的全部信息 —— 只有这三项 */
  function placeholderOf(scene) {
    if (!scene) return null;
    return {
      scene_id: scene.id,
      title: scene.titleZh,
      locked: !isUnlocked(scene.pack)
    };
  }

  var preview = readPreview();
  var cached = null;

  function get() {
    if (cached) return cached;
    var e = fetchEntitlements() || {};
    /* 数据库字段名 travel_access / study_access 是权威；
       travel / study 是给 UI 读的别名，两个都留着。 */
    if (preview) {
      if (preview.travel) { e.travel_access = true; e.travel = true; }
      if (preview.study) { e.study_access = true; e.study = true; }
    }
    e.travel = !!(e.travel || e.travel_access);
    e.study = !!(e.study || e.study_access);
    e.travel_access = e.travel;
    e.study_access = e.study;
    e.full = !!(e.travel && e.study);   // 两篇都有 = 完整版
    cached = e;
    return cached;
  }

  function isPreview() { return !!preview; }

  /* 场景目录里的 pack：free（永远免费）/ travel / study */
  function isUnlocked(pack) {
    if (!pack || pack === "free") return true;   // 免费内容与权限无关
    var e = get();
    if (pack === "travel") return e.travel;
    if (pack === "study") return e.study;
    return false;
  }

  /* 按场景 id 判断（需要先加载 registry.js，否则一律按未解锁处理） */
  function isSceneUnlocked(sceneId) {
    var reg = window.RIYU_REGISTRY;
    if (!reg || !reg.sceneById) return false;
    var sc = reg.sceneById(sceneId);
    if (!sc) return false;
    return isUnlocked(sc.pack);
  }

  /* 预览模式顶部提示条：避免把“预览”误当成“真的买了” */
  function mountBadge() {
    if (!preview) return;
    if (document.getElementById(PREVIEW_BADGE_ID)) return;
    var b = document.createElement("div");
    b.id = PREVIEW_BADGE_ID;
    b.className = "preview-badge";
    var on = [];
    if (preview.travel) on.push("旅行篇");
    if (preview.study) on.push("求学篇");
    b.textContent = on.length ? "👀 开发预览：已模拟解锁 " + on.join(" + ") + "（刷新即失效）"
                              : "👀 开发预览：未购买状态";
    var close = document.createElement("button");
    close.className = "pv-x";
    close.setAttribute("aria-label", "关闭提示");
    close.textContent = "✕";
    close.addEventListener("click", function () { b.remove(); });
    b.appendChild(close);
    document.body.appendChild(b);
  }

  window.Entitlement = {
    get: get,
    isPreview: isPreview,
    isUnlocked: isUnlocked,
    isSceneUnlocked: isSceneUnlocked,
    mountBadge: mountBadge,
    /* 内容下发与占位（见上方注释）—— 接后端时只改这两个函数体 */
    fetchSceneContent: fetchSceneContent,
    placeholderOf: placeholderOf
  };
})();
