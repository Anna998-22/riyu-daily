/* =========================================================================
 * 求学篇 · 推荐路线 —— 公开目录清单（20 个任务）
 * -------------------------------------------------------------------------
 * 和 mainline-manifest.js 一样，这是**公开前端**文件，只有目录信息：
 *     no / id / emoji / titleZh
 *
 * ⚠️ 这一条路线目前**全部是占位**：20 个任务里没有任何一个写了正文，
 *    js/paid/ 下也还没有对应的内容文件。清单先立起来，用于：
 *      · 在「场景地图 → 求学篇」里画出 20 张锁定卡片
 *      · 让「推荐路线 x/20」这个进度有个真实的分母
 *    将来写完正文，放进 js/paid/ 并由 loadPaidPack() 注入，本文件不用改。
 *
 * 前 13 项按主人给的顺序原样保留，其余为补足 20 项所加。
 * ========================================================================= */

window.RIYU_STUDYROUTE = [
  { no: 1, id: "school-checkin", emoji: "🏫", titleZh: "学校报到" },
  { no: 2, id: "school-papers", emoji: "📋", titleZh: "学校手续" },
  { no: 3, id: "placement-test", emoji: "📝", titleZh: "分班测试" },
  { no: 4, id: "entrance-ceremony", emoji: "🎓", titleZh: "开学典礼" },
  { no: 5, id: "teacher-talk", emoji: "👩‍🏫", titleZh: "老师交流" },
  { no: 6, id: "class-speak", emoji: "🙋", titleZh: "课堂发言" },
  { no: 7, id: "group-work", emoji: "👥", titleZh: "小组讨论" },
  { no: 8, id: "ask-leave", emoji: "🤒", titleZh: "向老师请假" },
  { no: 9, id: "classmate-talk", emoji: "💬", titleZh: "同学交流" },
  { no: 10, id: "club-join", emoji: "🎏", titleZh: "社团介绍" },
  { no: 11, id: "dorm-movein", emoji: "🛏️", titleZh: "宿舍入住" },
  { no: 12, id: "dorm-life", emoji: "🏠", titleZh: "宿舍生活" },
  { no: 13, id: "bank-account", emoji: "🏦", titleZh: "银行开户" },
  { no: 14, id: "city-office", emoji: "🏛️", titleZh: "市役所登记" },
  { no: 15, id: "phone-contract", emoji: "📱", titleZh: "手机办卡" },
  { no: 16, id: "clinic-visit", emoji: "🏥", titleZh: "医院看病" },
  { no: 17, id: "job-interview", emoji: "💼", titleZh: "打工面试" },
  { no: 18, id: "part-time", emoji: "🏪", titleZh: "便利店打工" },
  { no: 19, id: "second-hand", emoji: "🪑", titleZh: "买二手家具" },
  { no: 20, id: "daily-life", emoji: "🌱", titleZh: "日常生活" }
];
