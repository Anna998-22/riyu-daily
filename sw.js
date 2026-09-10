/* ============================================================
 * Service Worker —— 只做「公开静态外壳」的离线缓存
 * ============================================================
 *
 * ⚠️ 红线（改动本文件前必读）：
 *   本 SW 只缓存下面 SHELL 数组里**逐个列出来**的文件，别的一律不碰。
 *   付费正文（主线 25 关 l1~l5.js、旅行篇 / 求学篇场景正文）现在都在
 *   js/paid/ 里，那个目录不进公开仓库，所以线上根本取不到这些 URL。
 *   将来接了后端下发，也**绝对不要把付费内容的 URL 加进 SHELL**。
 *   不做通配、不做「所有同源请求都缓存」——就是怕以后有人不小心把
 *   付费内容一起缓存进用户设备。
 *
 * 升级方式：改了 css/js/插画之后，把 VERSION 往上加一位（v1 → v2）。
 *   不改 VERSION 的话，老用户会一直用缓存里的旧文件。
 *
 * 注意：Service Worker 只在 http(s) 下工作，file:// 双击打开时不会注册，
 *   本文件自然也不生效——那不是 bug，是浏览器的规定。
 * ============================================================ */

var VERSION = "v3";
var CACHE = "riyu-shell-" + VERSION;

/* 公开静态外壳：全部是「扒源码也看得到」的东西，不含任何付费正文 */
var SHELL = [
  "./index.html",
  "./manifest.json",
  "./css/style.css",

  "./js/app.js",
  "./js/data.js",
  "./js/entitlement.js",
  "./js/content/mainline-manifest.js",
  "./js/content/studyroute-manifest.js",
  "./js/content/registry.js",
  "./js/content/phrases.js",
  "./js/story/cafe.js",

  "./js/voice.js",

  /* 咖啡店六幕插画（日系动漫风）。原图约 400×615，页面上任何地方都
     不许把它们放大到 400px 以上 —— CSS 里已限宽，见 .sceneimg img。 */
  "./img/cafe/scene-01.jpg",
  "./img/cafe/scene-02.jpg",
  "./img/cafe/scene-03.jpg",
  "./img/cafe/scene-04.jpg",
  "./img/cafe/scene-05.jpg",
  "./img/cafe/scene-06.jpg",

  /* index.html 的 <link rel="icon"> 指向 icon-any.svg，
     不列进来离线打开时地址栏图标会 404（页面本身没事，但没必要缺这一条） */
  "./img/icon/icon-any.svg",
  "./img/icon/icon-192.png",
  "./img/icon/icon-512.png",
  "./img/icon/icon-maskable-512.png",
  "./img/icon/apple-touch-icon.png"
];

/* 命中缓存的 URL 集合（用绝对 URL 比对，避免 ./ 与绝对路径写法不一致） */
var SHELL_SET = null;
function shellSet() {
  if (!SHELL_SET) {
    SHELL_SET = {};
    for (var i = 0; i < SHELL.length; i++) {
      SHELL_SET[new URL(SHELL[i], self.location.href).href] = 1;
    }
  }
  return SHELL_SET;
}

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 逐个 add 而不是 addAll：任何一个文件 404 都不会让整个 SW 装不上，
         顶多是那一个文件没缓存，联网时照常能取到。 */
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: "reload" }))["catch"](function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* 只清自己家的旧版本，不动同域下别的应用（比如 growth-space）的缓存 */
        if (k.indexOf("riyu-shell-") === 0 && k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;

  /* 只处理同源 GET；跨域、非 GET（将来接后端买断接口的 POST）一律放行走网络 */
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  /* 页面导航：一律回 index.html（hash 路由，地址栏变化不会产生新请求） */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)["catch"](function () {
        return caches.match(new URL("./index.html", self.location.href).href);
      })
    );
    return;
  }

  /* 不在白名单里的同源资源：直接走网络，**不缓存**（付费内容将来就走这条路） */
  if (!shellSet()[new URL(req.url).href]) return;

  /* 白名单资源：缓存优先，同时后台悄悄更新（stale-while-revalidate） */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })["catch"](function () { return hit; });
      return hit || net;
    })
  );
});
