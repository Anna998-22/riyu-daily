/* =========================================================================
 * にほんの旅 · 数据聚合器（v3）
 * -------------------------------------------------------------------------
 * 把各分卷推入 window.RIYU_SCEN 的情景合并、排序成全局 DAILY_DATA，
 * 供 js/app.js 使用。
 *
 * ⚠️ 内容分卷已不在公开前端：
 *   l1~l5.js（主线 25 关完整正文）已移到 js/paid/，不进公开仓库，
 *   由 app.js 的 loadPaidPack() 在带 ?preview= 的会话里按需注入。
 *
 *   所以本文件在**没有付费包**时会得到一个空 scenarios —— 那是正常状态，
 *   不是错误。app.js 会据此把主线渲染成 25 张锁定卡片（名字来自
 *   js/content/mainline-manifest.js 这份公开清单）。
 *
 * 因为付费包是异步注入的（脚本 onload 才到），本文件把合并逻辑包成
 * build()，并挂在 window.RIYU_REBUILD_DATA 上：付费包加载完成后，
 * app.js 调它重跑一次，DAILY_DATA 就有了内容。
 *
 * 排序规则：level 升序；同级保持文件内的先后 → 形成稳定的“主线关卡”顺序。
 * 老版本数据无 level/vocab 字段时自动兜底为 level=1 / vocab=[]。
 * v3：情景可带 warmWords（为凑够 8~12 个核心词额外补的词），这里并入 vocab。
 * ========================================================================= */
(function () {
  "use strict";

  function build() {
    var all = (window.RIYU_SCEN || []).slice();

    all.forEach(function (s) {
      if (typeof s.level !== "number") s.level = 1;
      if (!s.vocab) s.vocab = [];
      if (s.warmWords && s.warmWords.length) {
        s.vocab = s.vocab.concat(s.warmWords);
      }
    });

    /* 现代浏览器(Chrome/Edge/Safari/Firefox)的 Array#sort 均稳定，可放心使用 */
    all.sort(function (a, b) { return (a.level || 1) - (b.level || 1); });

    window.DAILY_DATA = {
      meta: {
        appName: "にほんの旅",
        appNameJa: "にほんのたび",
        version: "3.0.0",
        updated: "2026-09-06",
        note: "离线学习版 v3 · 主线闯关 + 名词标注 + 录音自对比 + 情景词语热身。内容与进度均保存在本机，不联网。"
      },
      scenarios: all
    };

    return window.DAILY_DATA;
  }

  /* 付费包异步注入完成后，app.js 调这个重跑一次 */
  window.RIYU_REBUILD_DATA = build;

  build();
})();
