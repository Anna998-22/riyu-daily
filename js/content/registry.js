/* =========================================================================
 * 场景目录（Registry）——公开前端里的“货架”
 * -------------------------------------------------------------------------
 * 重要：本文件是公开的（GitHub Pages 源码人人可看）。
 *   所以这里**只放销售可见信息**：id / 分组 / 标题 / 一句话说明。
 *   绝对不要往这里放课程正文（对话、选项、分支、tip）——
 *   那些属于付费内容，将来由后端按权限下发。
 *
 * 规模：旅行篇 32 + 求学篇 24 = 56 个场景。
 *   「56」是展示口径，等于本文件 scenes 的条数（结构 + 占位）。
 *   有 story 字段的才是有正文的，目前只有免费的咖啡店一个。
 *   其余 55 个是**占位**：只有名字和一句话说明，正文待补/待付费解锁。
 *
 * 和「推荐路线」的区别：
 *   推荐路线是 25 / 20 条**任务**（js/content/mainline-manifest.js、
 *   studyroute-manifest.js），是「学习顺序」；这里是「全部场景」，
 *   是货架。两者条数本来就不同，别混着算。
 * ========================================================================= */
(function () {
  "use strict";

  /* ---------------- 内容包（购买页 / 权益用） ----------------
   * price     = 首发体验价（当前展示价）
   * listPrice = 正式价（显示成划掉的那个）
   * 只做价格展示 UI，本轮不接任何真实支付。
   * --------------------------------------------------------- */
  var packs = {
    free: {
      id: "free",
      name: "免费体验",
      emoji: "☕",
      desc: "不用注册、不用付费，直接体验完整的一段真实场景。"
    },
    travel: {
      id: "travel",
      emoji: "🧳",
      name: "日本旅行实战日语",
      price: "¥29.9",
      listPrice: "¥39.9",
      unit: "旅行篇",
      tagline: "去日本之前，先把真实生活场景走一遍。",
      /* 购买页清单：用户买完能解决什么（只写场景分类，不含正文） */
      features: ["推荐路线 25 个任务", "全部场景 32 个", "出发前 / 吃喝玩乐 / 出行移动 / 求助与杂事", "离线可用，进度存在本机"]
    },
    study: {
      id: "study",
      emoji: "🎓",
      name: "日本求学实战日语",
      price: "¥29.9",
      listPrice: "¥39.9",
      unit: "求学篇",
      tagline: "从落地到上课、打工、办手续，一路能开口。",
      features: ["推荐路线 20 个任务", "全部场景 24 个", "入学准备 / 课堂 / 校园 / 生活手续 / 打工", "离线可用，进度存在本机"]
    },
    bundle: {
      id: "bundle",
      emoji: "🇯🇵",
      name: "旅行 + 求学 完整版",
      price: "¥49.9",
      listPrice: "¥59.9",
      unit: "完整版",
      tagline: "包含旅行篇与求学篇的所有内容，更划算。",
      saveText: "比单买省 ¥9.9",
      features: ["旅行篇 + 求学篇全部内容", "推荐路线 45 个任务", "全部场景 56 个", "离线可用，进度存在本机"]
    }
  };

  /* ---------------- 分组 ----------------
   * scenes 里存的是场景 id；顺序 = 地图上的展示顺序。
   * 每个分组内的场景不用连续编号，编号（no）在全篇统一排。
   * ------------------------------------ */
  var groups = {
    travel: [
      { id: "before", no: "1", name: "出发前",     emoji: "🧳", scenes: ["airport", "transit", "hotel", "luggage", "wifi"] },
      { id: "enjoy",  no: "2", name: "吃喝玩乐",   emoji: "🍜", scenes: ["cafe", "restaurant", "shopping", "drugstore", "convenience", "ramen", "sushi", "izakaya", "bakery", "onsen"] },
      { id: "move",   no: "3", name: "出行移动",   emoji: "🚕", scenes: ["taxi", "bus", "shinkansen", "ticket", "sightseeing", "photo", "toilet", "currency"] },
      { id: "trouble",no: "4", name: "求助与杂事", emoji: "🆘", scenes: ["directions", "medical", "help", "lost", "police", "pharmacy", "post-office", "weather", "earthquake"] }
    ],
    study: [
      { id: "enroll", no: "1", name: "入学准备", emoji: "📝", scenes: ["school-checkin", "school-papers", "placement-test", "visa-renew"] },
      { id: "class",  no: "2", name: "课堂学习", emoji: "📚", scenes: ["classroom", "teacher-talk", "ask-leave", "seminar", "library"] },
      { id: "campus", no: "3", name: "校园生活", emoji: "🏫", scenes: ["classmate", "dorm", "daily-life", "club", "canteen"] },
      { id: "papers", no: "4", name: "生活手续", emoji: "🏛️", scenes: ["bank", "city-hall", "hospital", "health-check", "apartment", "utility"] },
      { id: "work",   no: "5", name: "打工兼职", emoji: "💼", scenes: ["part-time", "job-interview"] },
      { id: "goal",   no: "6", name: "升学毕业", emoji: "🎓", scenes: ["scholarship", "graduation"] }
    ]
  };

  /* ---------------- 场景货架 ----------------
   * pack   : free / travel / study —— 权限判定只看这个字段
   * story  : 有值 = 正文已完成（可进入体验）；无值 = 只有货架信息
   * no     : 场景编号（列表左侧的 01、02…），按所属篇目统一排
   * titleJa: 假名标注，方便还没认全汉字的人念出来
   * --------------------------------------------------------- */
  var scenes = [
    /* ==================== 旅行篇 32 ==================== */
    /* --- 出发前 (5) --- */
    { id: "airport",     pack: "travel", group: "before",  no: "01", emoji: "✈️", titleZh: "机场",       titleJa: "くうこう",         desc: "办理登机、入境审查、取行李" },
    { id: "transit",     pack: "travel", group: "before",  no: "02", emoji: "🚃", titleZh: "交通",       titleJa: "でんしゃ",         desc: "电车、地铁、买票、换乘" },
    { id: "hotel",       pack: "travel", group: "before",  no: "03", emoji: "🏨", titleZh: "酒店",       titleJa: "ほてる",           desc: "入住、退房、房间问题" },
    { id: "luggage",     pack: "travel", group: "before",  no: "04", emoji: "🧳", titleZh: "行李寄存",   titleJa: "にもつ",           desc: "投币寄存柜、酒店寄存、当天送达" },
    { id: "wifi",        pack: "travel", group: "before",  no: "05", emoji: "📶", titleZh: "上网卡",     titleJa: "わいふぁい",       desc: "租 WiFi、买上网卡、流量不够" },

    /* --- 吃喝玩乐 (10) --- */
    { id: "cafe",        pack: "free",   group: "enjoy",   no: "06", emoji: "☕", titleZh: "咖啡店",     titleJa: "かふぇ",           desc: "在日本咖啡店完成一次真实点单", story: "cafe", badge: "免费体验" },
    { id: "restaurant",  pack: "travel", group: "enjoy",   no: "07", emoji: "🍜", titleZh: "餐厅",       titleJa: "れすとらん",       desc: "点餐、加菜、结账、餐具" },
    { id: "shopping",    pack: "travel", group: "enjoy",   no: "08", emoji: "🛍️", titleZh: "购物",       titleJa: "かいもの",         desc: "问价格、试穿、支付方式" },
    { id: "drugstore",   pack: "travel", group: "enjoy",   no: "09", emoji: "🧴", titleZh: "药妆店",     titleJa: "どらっぐすとあ",   desc: "找商品、问用法、免税" },
    { id: "convenience", pack: "travel", group: "enjoy",   no: "10", emoji: "🏪", titleZh: "便利店",     titleJa: "こんびに",         desc: "结账、加热、买票、寄快递" },
    { id: "ramen",       pack: "travel", group: "enjoy",   no: "11", emoji: "🍥", titleZh: "拉面店",     titleJa: "らあめん",         desc: "食券机、选口味、加面加蛋" },
    { id: "sushi",       pack: "travel", group: "enjoy",   no: "12", emoji: "🍣", titleZh: "寿司店",     titleJa: "すし",             desc: "回转寿司点单、结账、忌口" },
    { id: "izakaya",     pack: "travel", group: "enjoy",   no: "13", emoji: "🍶", titleZh: "居酒屋",     titleJa: "いざかや",         desc: "点单、干杯、问推荐、结账" },
    { id: "bakery",      pack: "travel", group: "enjoy",   no: "14", emoji: "🥐", titleZh: "面包店",     titleJa: "ぱんや",           desc: "挑选、加热、打包带走" },
    { id: "onsen",       pack: "travel", group: "enjoy",   no: "15", emoji: "♨️", titleZh: "温泉旅馆",   titleJa: "おんせん",         desc: "入住、泡汤规矩、早晚餐" },

    /* --- 出行移动 (8) --- */
    { id: "taxi",        pack: "travel", group: "move",    no: "16", emoji: "🚕", titleZh: "打车",       titleJa: "たくしい",         desc: "拦车、说目的地、付款方式" },
    { id: "bus",         pack: "travel", group: "move",    no: "17", emoji: "🚌", titleZh: "巴士",       titleJa: "ばす",             desc: "上车、投币、问哪一站下" },
    { id: "shinkansen",  pack: "travel", group: "move",    no: "18", emoji: "🚄", titleZh: "新干线",     titleJa: "しんかんせん",     desc: "买票、指定席、找站台" },
    { id: "ticket",      pack: "travel", group: "move",    no: "19", emoji: "🎫", titleZh: "景点门票",   titleJa: "ちけっと",         desc: "买票、营业时间、有没有折扣" },
    { id: "sightseeing", pack: "travel", group: "move",    no: "20", emoji: "🗾", titleZh: "观光咨询",   titleJa: "かんこう",         desc: "问推荐路线、要地图、问怎么去" },
    { id: "photo",       pack: "travel", group: "move",    no: "21", emoji: "📷", titleZh: "找人拍照",   titleJa: "しゃしん",         desc: "开口请人帮忙、道谢" },
    { id: "toilet",      pack: "travel", group: "move",    no: "22", emoji: "🚻", titleZh: "找洗手间",   titleJa: "といれ",           desc: "问哪里有洗手间、能不能借用" },
    { id: "currency",    pack: "travel", group: "move",    no: "23", emoji: "💴", titleZh: "换钱取现",   titleJa: "りょうがえ",       desc: "兑换外币、ATM 取现、卡不能用" },

    /* --- 求助与杂事 (9) --- */
    { id: "directions",  pack: "travel", group: "trouble", no: "24", emoji: "🧭", titleZh: "问路",       titleJa: "みちをきく",       desc: "找不到路时怎么开口问" },
    { id: "medical",     pack: "travel", group: "trouble", no: "25", emoji: "🏥", titleZh: "医疗",       titleJa: "びょういん",       desc: "身体不适、描述症状、买药" },
    { id: "help",        pack: "travel", group: "trouble", no: "26", emoji: "🆘", titleZh: "求助",       titleJa: "たすけ",           desc: "遇到困难时请人帮忙" },
    { id: "lost",        pack: "travel", group: "trouble", no: "27", emoji: "🎒", titleZh: "丢失物品",   titleJa: "わすれもの",       desc: "东西丢了、去失物招领" },
    { id: "police",      pack: "travel", group: "trouble", no: "28", emoji: "👮", titleZh: "找警察",     titleJa: "けいさつ",         desc: "报警、问路、说明情况" },
    { id: "pharmacy",    pack: "travel", group: "trouble", no: "29", emoji: "💊", titleZh: "药店买药",   titleJa: "くすりや",         desc: "说症状、问用法用量、要不要处方" },
    { id: "post-office", pack: "travel", group: "trouble", no: "30", emoji: "📮", titleZh: "邮局",       titleJa: "ゆうびんきょく",   desc: "寄明信片、寄包裹、EMS" },
    { id: "weather",     pack: "travel", group: "trouble", no: "31", emoji: "🌤️", titleZh: "闲聊天气",   titleJa: "てんきのはなし",   desc: "和店员、房东、路上的人搭话" },
    { id: "earthquake",  pack: "travel", group: "trouble", no: "32", emoji: "🌏", titleZh: "地震台风",   titleJa: "じしん",           desc: "遇到灾害时怎么问、怎么办" },

    /* ==================== 求学篇 24 ==================== */
    /* --- 入学准备 (4) --- */
    { id: "school-checkin", pack: "study", group: "enroll", no: "01", emoji: "🏫", titleZh: "学校报到",   titleJa: "とうこう",         desc: "第一天到校，找到窗口报到" },
    { id: "school-papers",  pack: "study", group: "enroll", no: "02", emoji: "📄", titleZh: "学校手续",   titleJa: "てつづき",         desc: "提交材料、填表、办证件" },
    { id: "placement-test", pack: "study", group: "enroll", no: "03", emoji: "📝", titleZh: "分班测试",   titleJa: "くらすわけ",       desc: "入学考试、面试、分到哪个班" },
    { id: "visa-renew",     pack: "study", group: "enroll", no: "04", emoji: "🛂", titleZh: "签证更新",   titleJa: "ざいりゅうこうしん", desc: "在留期间更新、准备材料、去入管局" },

    /* --- 课堂学习 (5) --- */
    { id: "classroom",    pack: "study", group: "class", no: "05", emoji: "📚", titleZh: "课堂",       titleJa: "じゅぎょう",       desc: "听不懂时怎么应对、提问" },
    { id: "teacher-talk", pack: "study", group: "class", no: "06", emoji: "🧑🏫", titleZh: "老师交流", titleJa: "せんせい",         desc: "课后找老师、请教问题" },
    { id: "ask-leave",    pack: "study", group: "class", no: "07", emoji: "🙋", titleZh: "请假",       titleJa: "けっせき",         desc: "迟到、请假、补交作业" },
    { id: "seminar",      pack: "study", group: "class", no: "08", emoji: "🎤", titleZh: "课堂发表",   titleJa: "はっぴょう",       desc: "上台汇报、被提问、回答" },
    { id: "library",      pack: "study", group: "class", no: "09", emoji: "📖", titleZh: "图书馆",     titleJa: "としょかん",       desc: "办借书证、借还书、找资料" },

    /* --- 校园生活 (5) --- */
    { id: "classmate",  pack: "study", group: "campus", no: "10", emoji: "👥", titleZh: "同学交流",   titleJa: "ともだち",         desc: "自我介绍、聊天、约一起吃饭" },
    { id: "dorm",       pack: "study", group: "campus", no: "11", emoji: "🛏️", titleZh: "宿舍",       titleJa: "りょう",           desc: "入住、邻居、设施报修" },
    { id: "daily-life", pack: "study", group: "campus", no: "12", emoji: "🚲", titleZh: "日常生活",   titleJa: "せいかつ",         desc: "扔垃圾、逛超市、办月票" },
    { id: "club",       pack: "study", group: "campus", no: "13", emoji: "🎏", titleZh: "社团活动",   titleJa: "ぶかつ",           desc: "加入社团、参加活动、和前辈说话" },
    { id: "canteen",    pack: "study", group: "campus", no: "14", emoji: "🍱", titleZh: "食堂",       titleJa: "しょくどう",       desc: "点餐、买餐券、和同学拼桌" },

    /* --- 生活手续 (6) --- */
    { id: "bank",         pack: "study", group: "papers", no: "15", emoji: "🏦", titleZh: "银行",       titleJa: "ぎんこう",         desc: "开户、汇款、取现" },
    { id: "city-hall",    pack: "study", group: "papers", no: "16", emoji: "🏛️", titleZh: "市役所",     titleJa: "しやくしょ",       desc: "在留卡、保险、住民登记" },
    { id: "hospital",     pack: "study", group: "papers", no: "17", emoji: "🏥", titleZh: "医院",       titleJa: "びょういん",       desc: "挂号、描述症状、拿药" },
    { id: "health-check", pack: "study", group: "papers", no: "18", emoji: "🩺", titleZh: "健康检查",   titleJa: "けんこうしんだん", desc: "学校体检、预约、看结果" },
    { id: "apartment",    pack: "study", group: "papers", no: "19", emoji: "🏠", titleZh: "租房",       titleJa: "へやさがし",       desc: "看房、问房租礼金、签合同" },
    { id: "utility",      pack: "study", group: "papers", no: "20", emoji: "💡", titleZh: "水电燃气",   titleJa: "こうねつひ",       desc: "开通、缴费、搬家时停掉" },

    /* --- 打工兼职 (2) --- */
    { id: "part-time",     pack: "study", group: "work", no: "21", emoji: "🍳", titleZh: "打工",   titleJa: "ばいと",     desc: "面试、排班、请假、同事沟通" },
    { id: "job-interview", pack: "study", group: "work", no: "22", emoji: "💼", titleZh: "面试",   titleJa: "めんせつ",   desc: "志望理由、经历、提问环节" },

    /* --- 升学毕业 (2) --- */
    { id: "scholarship", pack: "study", group: "goal", no: "23", emoji: "💰", titleZh: "奖学金",   titleJa: "しょうがくきん", desc: "申请条件、材料、面试" },
    { id: "graduation",  pack: "study", group: "goal", no: "24", emoji: "🎓", titleZh: "毕业典礼", titleJa: "そつぎょう",     desc: "典礼流程、致辞、和老师道别" }
  ];

  /* ---------------- 索引与查询 ---------------- */
  var byId = {};
  for (var i = 0; i < scenes.length; i++) byId[scenes[i].id] = scenes[i];

  function sceneById(id) { return byId[id] || null; }

  /* 某篇目下的所有场景（按 no 顺序） */
  function scenesOf(pack) {
    var out = [];
    for (var i = 0; i < scenes.length; i++) if (scenes[i].pack === pack) out.push(scenes[i]);
    return out;
  }
  /* 某篇目的分组（组内 scenes 由 id 还原成对象） */
  function groupsOf(pack) {
    var gs = groups[pack] || [];
    return gs.map(function (g) {
      return {
        id: g.id, no: g.no, name: g.name, emoji: g.emoji,
        scenes: g.scenes.map(sceneById).filter(Boolean)
      };
    });
  }
  /* 免费场景（永远可玩，也是首页“热门场景”的素材） */
  function freeScenes() { return scenesOf("free"); }

  /* 某篇目下的完整场景列表（按分组顺序，且**含该篇目里的免费场景**）。
   * 注意：不能直接用 scenesOf(pack)——咖啡店的 pack 是 "free"，
   * 但它身在旅行篇的「吃喝玩乐」组里，算旅行篇的第 6 个场景。 */
  function packScenes(pack) {
    var out = [], seen = {}, gs = groups[pack] || [];
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].scenes.length; j++) {
        var s = byId[gs[i].scenes[j]];
        if (s && !seen[s.id]) { seen[s.id] = 1; out.push(s); }
      }
    }
    return out;
  }

  /* 有正文、可真正进入体验的场景 */
  function playableScenes() {
    return scenes.filter(function (s) { return !!s.story; });
  }

  /* ---------------- 必要单词 ----------------
   * 「单词」在付费边界里跟对话正文同级，所以公开前端**只能放免费的那部分**：
   *   cafe : 真的词表（免费体验课，本来就该完整）
   *   其余 : 只是「这个场景有几个词」这个**销售数字**，不是正文
   * 真正的词表将来放在 js/paid/ 里，由后端按权限下发。
   *
   * 下面的数字是**占位**（按场景复杂度的粗略估法：简单的 3 个、复杂的 4 个），
   * 56 个场景合计正好 200 —— 和页面「单词 x/200」的口径对齐。
   * 只是为了让锁定态能说出「解锁后可查看 N 个词」，不代表真实词数。
   * ---------------------------------------------------------------------- */
  var WORDS = {
    /* 免费体验：真的词，可看可听 */
    cafe: { list: [
      { ja: "コーヒー",       rd: "こーひー",       zh: "咖啡" },
      { ja: "アイスコーヒー", rd: "あいすこーひー", zh: "冰咖啡" },
      { ja: "サイズ",         rd: "さいず",         zh: "尺寸" },
      { ja: "ミルク",         rd: "みるく",         zh: "牛奶" }
    ] },

    /* 旅行篇 —— 出发前 (5) */
    airport: 4, transit: 4, hotel: 4, luggage: 4, wifi: 3,
    /* 旅行篇 —— 吃喝玩乐 (9，咖啡店在上面) */
    restaurant: 4, shopping: 4, drugstore: 3, convenience: 3, ramen: 4,
    sushi: 4, izakaya: 4, bakery: 3, onsen: 4,
    /* 旅行篇 —— 出行移动 (8) */
    taxi: 4, bus: 3, shinkansen: 4, ticket: 4, sightseeing: 4,
    photo: 3, toilet: 3, currency: 3,
    /* 旅行篇 —— 求助与杂事 (9) */
    directions: 4, medical: 4, help: 3, lost: 3, police: 4,
    pharmacy: 3, "post-office": 3, weather: 3, earthquake: 4,

    /* 求学篇 —— 入学准备 (4) */
    "school-checkin": 3, "school-papers": 4, "placement-test": 3, "visa-renew": 4,
    /* 求学篇 —— 课堂学习 (5) */
    classroom: 4, "teacher-talk": 3, "ask-leave": 3, seminar: 4, library: 3,
    /* 求学篇 —— 校园生活 (5) */
    classmate: 3, dorm: 4, "daily-life": 4, club: 3, canteen: 3,
    /* 求学篇 —— 生活手续 (6) */
    bank: 4, "city-hall": 4, hospital: 4, "health-check": 3, apartment: 4, utility: 3,
    /* 求学篇 —— 打工兼职 (2) */
    "part-time": 4, "job-interview": 4,
    /* 求学篇 —— 升学毕业 (2) */
    scholarship: 4, graduation: 3
  };

  function wordEntry(id) { return WORDS[id]; }
  /* 公开可见的词表；没有就返回 null（= 正文不在前端，别编假词） */
  function wordsOf(id) {
    var e = WORDS[id];
    return (e && e.list) ? e.list : null;
  }
  /* 该场景一共几个词（含前端拿不到的那些），给锁定态显示用 */
  function wordCountOf(id) {
    var e = WORDS[id];
    if (!e) return 0;
    return e.list ? e.list.length : e;
  }
  function wordTotal() {
    var n = 0;
    for (var k in WORDS) if (Object.prototype.hasOwnProperty.call(WORDS, k)) n += wordCountOf(k);
    return n;
  }

  /* 展示口径的常量。
   * scenes* 三个是**数出来的**（场景目录本身就公开）；
   * phrases / words 是**口径常量**，不是数组长度 —— 大部分正文不在公开前端，
   * 前端数不出来，所以写成显式常量，改的时候跟正文一起改，别去猜。
   * words 另有一份逐场景的占位表在 WORDS 里，两者要能对上（现在都是 200）。 */
  var DISPLAY = {
    scenesTravel: 32,   /* = scenes 里 pack="travel" 的条数 + 免费咖啡店 */
    scenesStudy: 24,    /* = scenes 里 pack="study" 的条数 */
    scenesTotal: 56,    /* = scenesTravel + scenesStudy，展示口径就是 56 */
    phrases: 50,        /* 语言急救包总条数（全站口径，不是前端数组长度） */
    words: 200          /* 必要单词总词数（同上；= wordTotal()） */
  };

  window.RIYU_REGISTRY = {
    packs: packs,
    groups: groups,
    scenes: scenes,
    DISPLAY: DISPLAY,
    sceneById: sceneById,
    scenesOf: scenesOf,
    packScenes: packScenes,
    groupsOf: groupsOf,
    freeScenes: freeScenes,
    playableScenes: playableScenes,
    wordsOf: wordsOf,
    wordCountOf: wordCountOf,
    wordTotal: wordTotal
  };
})();
