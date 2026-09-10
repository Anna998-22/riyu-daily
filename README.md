# にほんの旅 · 去日本，不怕开口。

面向中文母语者的**日语真实场景练习**网页。纯静态、零依赖、零构建：
把本文件夹里的 `index.html` 拖进浏览器（推荐 Edge / Chrome）即可开始使用，
学习进度与收藏保存在**本机**（localStorage），关闭后仍在。不用注册、不联网、不上传。

---

## 这个仓库是「公开前端」

GitHub Pages 上的这份代码是**公开的**，任何人查看源码都能看到它的全部内容。
所以本仓库**只放货架，不放货**：

| 公开可见 | 说明 |
| --- | --- |
| 首页 | 品牌、进度环、入口卡 |
| 场景目录 | 场景名、分组、一句话说明、锁定状态 |
| 推荐路线清单 | 只有**任务名**，没有正文 |
| 价格与权益 | 三档价格、买完能解锁什么 |
| **咖啡店（免费体验）** | **完整内容**：6 幕对话、分支、单词、完成页 |

**不在本仓库、你在源码里搜不到的东西**：

- 旅行篇 / 求学篇的**完整课程正文**（对话、选项、分支、提示）
- **完整救命句库**（语言急救包里只有少量通用免费句）
- **完整单词库**（目录里只有「这个场景有几个词」这个数字）

这些内容由 `js/paid/` 承载，而 **`js/paid/` 整个目录已在 `.gitignore` 里排除，不进版本库**。
线上访客的浏览器不会去请求它，即使请求也拿不到。

> ⚠️ 这是**仓库级保护，不是防盗版**。文件一旦分发出去，前端没有任何手段阻止转发。
> 真正的权限只能由后端判定。

---

## 权限架构

只有一个真相源：**`js/entitlement.js`**。所有 UI 都只能问它，禁止自己判断是否已购买。

```js
Entitlement.get()   // → { travel, study, full, travel_access, study_access }
```

- 字段名对齐将来数据库的 `travel_access` / `study_access`：
  - `travel_access` = 旅行篇（推荐路线 25 + 全部场景 32）
  - `study_access`  = 求学篇（推荐路线 20 + 全部场景 24）
  - 两者皆为真 = 完整版。**不需要第三个权限位。**
- `travel` / `study` 是这两项的别名，供现有 UI 读取。
- **现在没有后端，默认「未购买」。**
- **绝不用 localStorage 判断购买**，**绝不用前端隐藏冒充真实权限**。
- 权限**绝不写入** localStorage / sessionStorage。

### 接入后端时要改的，只有两个函数体

两个函数都在 `js/entitlement.js`，调用方一行都不用动：

```js
/* ① 我是谁、买了什么 */
fetchEntitlements()   // 现在恒返回 { travel_access: false, study_access: false }
                      // 将来 → fetch("/api/me", { credentials: "include" })

/* ② 这一个场景的正文（对话 / 单词 / 救命句） */
fetchSceneContent(sceneId)   // 现在恒返回 null（公开前端不持有付费正文）
                             // 将来 → fetch("/api/scene?id=…")
```

**未解锁的场景，公开前端只允许知道三个字段**：

```js
{ scene_id, title, locked }        // = Entitlement.placeholderOf(scene)
```

拿不到正文时一律渲染锁定态，**不摆灰色假句子**——那比空着更糟。
`app.js` 里的 `paidWordsOf()` / `paidPhrasesOf()` 是正文的唯一取用口，
优先级是「后端下发 > 本机预览包 > 没有」。

### 本地预览已购内容（开发用）

带 `?preview=true`（或 `?preview=travel` / `?preview=study`）打开，
会把 `js/paid/` 里的本机内容注入进来，用来预览已购买是什么样子。

**只在这一次页面加载的内存里有效，刷新即失效，不写任何存储。**
正式用户不带参数，看到的永远是未购买状态。接后端时删掉 `readPreview()` 即可。

---

## 目录结构

```
riyu-daily/
  index.html                       单页入口
  css/style.css                    样式
  manifest.json  sw.js             PWA（离线缓存白名单**不含任何付费路径**）
  img/                             图标、咖啡店插画（SVG）
  js/
    entitlement.js                 ★ 权限真相源（唯一判断"买没买"的地方）
    content/
      registry.js                  场景货架：56 个场景的**销售元数据**，零正文
      mainline-manifest.js         旅行篇推荐路线 25 条**任务名**，零正文
      studyroute-manifest.js       求学篇推荐路线 20 条**任务名**，零正文
      phrases.js                   语言急救包：免费句 + 每类的付费条数常量
    story/cafe.js                  免费体验·咖啡店 完整剧情
    data.js                        数据聚合器（勿改）
    app.js                         交互逻辑
  js/paid/                         ⚠️ 付费正文，已被 .gitignore 排除，不进仓库
```

## 技术说明

- 零依赖、零构建、无后端。原生 HTML/CSS/JS，经典 `<script>` 加载，兼容 `file://` 双击打开。
- 路由用 hash（`#/view`），不用 `pushState` —— `file://` 下 origin 为 null，会被 Chrome 拒绝。
- 朗读用系统自带日语语音（`speechSynthesis`），完全本地。
- 若以后想升级为「AI 自由对话练口语」，可在现有结构外加服务端调用，届时再议。
