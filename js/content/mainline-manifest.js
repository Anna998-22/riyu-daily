/* =========================================================================
 * 旅行篇 · 推荐路线 —— 公开目录清单（25 个任务）
 * -------------------------------------------------------------------------
 * 这是**公开前端**文件，任何人都能看到。所以这里**只有目录信息**：
 *     no      第几个任务（1~25）
 *     id      进度键，和 localStorage 里的 riyu.progress[id] 对应
 *     emoji   图标（纯装饰）
 *     titleZh 任务名
 *
 * ⚠️ 这里**没有**正文。每一关的日文对话、假名读法、中文翻译、单词表，
 *    全部在 js/paid/l1~l5.js 里（不进公开仓库），由 app.js 的
 *    loadPaidPack() 在带 ?preview= 的会话中按需注入。
 *    没买 / 没注入时，本清单只用来把 25 张**锁定卡片**画出来。
 *
 * 加内容请改 js/paid/ 下的文件；改任务顺序或名字才动这里。
 * ========================================================================= */

window.RIYU_MAINLINE = [
  { no: 1, id: "cafe", emoji: "☕", titleZh: "咖啡店点餐" },
  { no: 2, id: "convenience", emoji: "🏪", titleZh: "便利店购物" },
  { no: 3, id: "subway-ticket", emoji: "🚇", titleZh: "地铁站买票" },
  { no: 4, id: "weather-talk", emoji: "🌤️", titleZh: "闲聊天气" },
  { no: 5, id: "self-intro", emoji: "🙋", titleZh: "初次见面·自我介绍" },
  { no: 6, id: "restaurant", emoji: "🍜", titleZh: "餐厅点菜" },
  { no: 7, id: "asking-way", emoji: "🧭", titleZh: "车站问路" },
  { no: 8, id: "clothes-shop", emoji: "👕", titleZh: "服装店买衣服" },
  { no: 9, id: "visiting-friend", emoji: "🏠", titleZh: "去朋友家做客" },
  { no: 10, id: "post-office", emoji: "📮", titleZh: "邮局寄包裹" },
  { no: 11, id: "pharmacy", emoji: "💊", titleZh: "身体不适·买药" },
  { no: 12, id: "hotel", emoji: "🏨", titleZh: "酒店入住" },
  { no: 13, id: "phone-reserve", emoji: "📞", titleZh: "电话订座" },
  { no: 14, id: "hospital", emoji: "🏥", titleZh: "医院看病" },
  { no: 15, id: "lost-bag", emoji: "🎒", titleZh: "失物招领" },
  { no: 16, id: "hangout", emoji: "📅", titleZh: "和朋友约时间" },
  { no: 17, id: "hair-salon", emoji: "💇", titleZh: "理发店" },
  { no: 18, id: "office-first-day", emoji: "🏢", titleZh: "职场初识" },
  { no: 19, id: "coworker-lunch", emoji: "🍱", titleZh: "与同事午休聊天" },
  { no: 20, id: "taxi", emoji: "🚕", titleZh: "打车" },
  { no: 21, id: "airport", emoji: "✈️", titleZh: "机场值机" },
  { no: 22, id: "interview", emoji: "💼", titleZh: "求职面试" },
  { no: 23, id: "complaint", emoji: "🙇", titleZh: "餐厅投诉换菜" },
  { no: 24, id: "business-talk", emoji: "🤝", titleZh: "商务商谈" },
  { no: 25, id: "repair-call", emoji: "🔧", titleZh: "电话报修" }
];
