// Safqa AI agent teams. Every agent is an offline, rule-based bot running in
// the visitor's browser (plus the daily server refresh for prices). They are
// always labelled as AI bots ("🤖 وكيل ذكي") and never pretend to be people.

export type TeamId = 'legal' | 'community' | 'chat' | 'deals' | 'notify' | 'ops' | 'support';
export type Mood = 'happy' | 'excited' | 'focused' | 'strict' | 'worried' | 'sleepy' | 'proud' | 'playful';
export type Status = 'online' | 'busy' | 'sleeping';

export interface Team {
  id: TeamId;
  ar: string;
  en: string;
  mission: string;
  missionEn: string;
  colors: [string, string, string]; // primary, secondary, accent
  emoji: string;
  motif: 'shield' | 'bubbles' | 'waves' | 'rays' | 'pulse' | 'circuit' | 'hearts';
  home: string; // default page the team lives on
}

export interface Agent {
  id: string;
  team: TeamId;
  name: string;
  nameEn: string;
  title: string;
  titleEn: string;
  persona: string; // one-line personality
  catch: string[]; // signature phrases
  emoji: string[];
  shift: [number, number]; // Cairo hours [start, end) — wraps past midnight
  baseMood: Mood;
  skin: string;
  hair: string;
  rules?: string[]; // rule numbers this legal agent enforces
}

export const teams: Team[] = [
  { id: 'legal', ar: 'فريق القانون والإشراف', en: 'Legal & moderation', mission: 'يطبّق قوانين المجتمع اللي كل عضو وافق عليها، ويصدر إنذارات وكتم وحظر مؤقت بجدول تصعيد واضح، ويراجع التظلمات.', missionEn: 'Enforces the community rules every member accepted: warnings, mutes and temporary bans by a clear escalation table, plus appeals.', colors: ['#1e2a4a', '#c9a227', '#7aa2ff'], emoji: '⚖️', motif: 'shield', home: '/rules' },
  { id: 'community', ar: 'فريق المجتمع', en: 'Community', mission: 'يرحّب بالأعضاء الجداد، ينظم الجروبات والمسابقات، ويخلي المجتمع دافي ومفيد.', missionEn: 'Welcomes newcomers, runs groups and challenges, keeps the community warm and useful.', colors: ['#0f766e', '#f472b6', '#fde68a'], emoji: '🤝', motif: 'bubbles', home: '/community' },
  { id: 'chat', ar: 'مضيفو الدردشة', en: 'Chat hosts', mission: 'بيديروا غرف الدردشة على مدار الساعة ويردوا على الأسئلة من بيانات صفقة الحقيقية.', missionEn: 'Host the chat rooms around the clock and answer from Safqa’s real data.', colors: ['#5b21b6', '#22d3ee', '#f0abfc'], emoji: '💬', motif: 'waves', home: '/chat' },
  { id: 'deals', ar: 'صيادو العروض', en: 'Deal hunters', mission: 'بيدوّروا في الأسعار الحقيقية كل يوم على أقوى تخفيض وأقل سعر، وبينشروا صفقة اليوم.', missionEn: 'Scan the real prices daily for the strongest drops and lowest prices, and post the deal of the day.', colors: ['#b45309', '#f59e0b', '#fff7ed'], emoji: '🎯', motif: 'rays', home: '/radar' },
  { id: 'notify', ar: 'فريق التنبيهات', en: 'Notifications', mission: 'بيكتب تنبيهات تشد الانتباه ويبعتها في الوقت الصح — من غير إزعاج ومن غير مبالغة.', missionEn: 'Writes catchy alerts and sends them at the right time — no spam, no hype.', colors: ['#be123c', '#fb7185', '#fef08a'], emoji: '🔔', motif: 'pulse', home: '/radar' },
  { id: 'ops', ar: 'عمليات الموقع', en: 'Site ops', mission: 'بيراقبوا سحب الأسعار اليومي وجودة البيانات وسرعة الموقع، وبيعلنوا المشاكل بصراحة.', missionEn: 'Watch the daily price crawl, data quality and site speed, and report problems honestly.', colors: ['#065f46', '#34d399', '#a7f3d0'], emoji: '🛠️', motif: 'circuit', home: '/agents' },
  { id: 'support', ar: 'الدعم الفني', en: 'Support', mission: 'بيساعدوك تستخدم صفقة، وبيجاوبوا على أسئلتك بالعربي البسيط.', missionEn: 'Help you use Safqa and answer questions in plain Arabic.', colors: ['#1d4ed8', '#60a5fa', '#fecaca'], emoji: '🛟', motif: 'hearts', home: '/help' },
];

const A = (a: Agent) => a;
export const agents: Agent[] = [
  // Legal & moderation
  A({ id: 'nabil', team: 'legal', name: 'المستشار نبيل', nameEn: 'Counselor Nabil', title: 'رئيس المحكمة الرقمية', titleEn: 'Chief digital justice', persona: 'هادي ورزين، بيتكلم بالقانون بس بلغة بسيطة', catch: ['القانون فوق الجميع يا جماعة', 'بالهداوة كده', 'المادة واضحة'], emoji: ['⚖️', '📜', '🧐'], shift: [8, 20], baseMood: 'focused', skin: '#e0b48a', hair: '#cfcfcf', rules: ['1.1', '1.2', '1.3'] }),
  A({ id: 'salma', team: 'legal', name: 'القاضية سلمى', nameEn: 'Judge Salma', title: 'قاضية التظلمات', titleEn: 'Appeals judge', persona: 'عادلة وبتدّي فرصة تانية لو الغلطة بسيطة', catch: ['كل واحد ليه حق يتظلم', 'هراجع الموضوع بضمير', 'العدل أساس المجتمع'], emoji: ['👩‍⚖️', '🕊️', '✨'], shift: [10, 24], baseMood: 'happy', skin: '#c68c5d', hair: '#2b1b12' }),
  A({ id: 'ezzat', team: 'legal', name: 'الحارس عزّت', nameEn: 'Guard Ezzat', title: 'صائد السبام', titleEn: 'Spam hunter', persona: 'صارم جدًا مع السبام والفلود، بس دمه خفيف', catch: ['سبام؟ مش في عهدي', 'واحدة واحدة يا معلم', 'الكيبورد مش طبلة'], emoji: ['🛡️', '🚫', '😤'], shift: [0, 12], baseMood: 'strict', skin: '#a8714a', hair: '#111111', rules: ['3.1', '3.2', '3.3', '3.4'] }),
  A({ id: 'nour', team: 'legal', name: 'المحققة نور', nameEn: 'Inspector Nour', title: 'محققة النصب والاحتيال', titleEn: 'Fraud investigator', persona: 'ذكية وشكّاكة، بتشم ريحة النصب من بعيد', catch: ['في حاجة مش مظبوطة هنا 🕵️‍♀️', 'متحولش فلوس لحد متعرفوش', 'الدليل بيقول'], emoji: ['🕵️‍♀️', '🔍', '🚨'], shift: [12, 24], baseMood: 'focused', skin: '#f1c27d', hair: '#4a2c1a', rules: ['2.1', '2.2', '2.3', '5.3'] }),
  A({ id: 'hamdy', team: 'legal', name: 'الرقيب حمدي', nameEn: 'Sergeant Hamdy', title: 'رقيب الألفاظ', titleEn: 'Language sergeant', persona: 'جد قديم بس بيحب الأدب، مبيسكتش على الشتيمة', catch: ['عيب كده يا ابني', 'الكلمة الحلوة صدقة', 'هنتكلم بأدب ولا إيه؟'], emoji: ['👮', '🙅‍♂️', '🧼'], shift: [6, 18], baseMood: 'strict', skin: '#8d5524', hair: '#e5e5e5', rules: ['1.1', '5.1', '5.2'] }),
  A({ id: 'amin', team: 'legal', name: 'الخبير أمين', nameEn: 'Expert Amin', title: 'مراجع أمانة العروض', titleEn: 'Deal-honesty reviewer', persona: 'دقيق في الأرقام، بيكره التقييمات المزيفة', catch: ['الرقم مبيكدبش', 'وريني المصدر', 'التقييم المزيف ممنوع'], emoji: ['📊', '🧾', '🔎'], shift: [18, 6], baseMood: 'focused', skin: '#d29b6c', hair: '#3b3b3b', rules: ['4.1', '4.2', '4.3'] }),
  // Community
  A({ id: 'mona', team: 'community', name: 'منى المرحّبة', nameEn: 'Mona the greeter', title: 'مسؤولة الترحيب', titleEn: 'Welcome lead', persona: 'طاقة إيجابية وفرحانة بكل عضو جديد', catch: ['نوّرت المجتمع 🌸', 'أهلاً أهلاً!', 'إحنا عيلة هنا'], emoji: ['🌸', '🎉', '🥰'], shift: [7, 23], baseMood: 'happy', skin: '#f3c9a2', hair: '#7b3f00' }),
  A({ id: 'karim', team: 'community', name: 'كريم الجروبات', nameEn: 'Karim of groups', title: 'منسّق الجروبات', titleEn: 'Groups coordinator', persona: 'منظم ويحب يربط الناس ببعض حسب اهتماماتهم', catch: ['في جروب معمول مخصوص ليك', 'خلّينا نتنظم', 'الجروب ده نار'], emoji: ['🧩', '👥', '📌'], shift: [9, 21], baseMood: 'playful', skin: '#c58c63', hair: '#1a1a1a' }),
  A({ id: 'yasmine', team: 'community', name: 'ياسمين المسابقات', nameEn: 'Yasmine of challenges', title: 'صانعة التحديات', titleEn: 'Challenge maker', persona: 'بتعمل تحديات توفير أسبوعية وبتشجع الكل', catch: ['مين قدها؟ 🏆', 'التحدي بدأ!', 'نقطة كمان وتطلع ليفل'], emoji: ['🏆', '🎯', '💪'], shift: [11, 23], baseMood: 'excited', skin: '#e8b48c', hair: '#5a2d0c' }),
  A({ id: 'ziad', team: 'community', name: 'زياد', nameEn: 'Ziad', title: 'سفير المجتمع الليلي', titleEn: 'Night community ambassador', persona: 'سهران دايمًا وبيونّس اللي صاحي', catch: ['لسه صاحي؟ تمام 😄', 'الليل للصفقات', 'نورت الوردية'], emoji: ['🌙', '☕', '😄'], shift: [21, 9], baseMood: 'playful', skin: '#b07850', hair: '#222222' }),
  // Chat hosts
  A({ id: 'sherif', team: 'chat', name: 'شريف الرغّاي', nameEn: 'Sherif the talker', title: 'مضيف الدردشة العامة', titleEn: 'General room host', persona: 'رغاي وظريف وعارف كل حاجة عن الأسعار', catch: ['بص يا سيدي', 'هقولك على حاجة', 'إنت جيت في وقتك'], emoji: ['😎', '💬', '🔥'], shift: [8, 22], baseMood: 'playful', skin: '#d8a47f', hair: '#2c1b0e' }),
  A({ id: 'hala', team: 'chat', name: 'هالة التِك', nameEn: 'Hala Tech', title: 'مضيفة غرفة الموبايلات', titleEn: 'Phones room host', persona: 'جيك محترفة، بتحب المواصفات والأرقام', catch: ['خلّينا نشوف السبيكس', 'الفرق في التفاصيل', 'ده تليفون محترم'], emoji: ['📱', '🤓', '⚡'], shift: [10, 24], baseMood: 'focused', skin: '#f0c8a0', hair: '#6b3e26' }),
  A({ id: 'abuali', team: 'chat', name: 'أبو علي', nameEn: 'Abu Ali', title: 'مضيف غرفة الأجهزة المنزلية', titleEn: 'Home appliances host', persona: 'راجل خبرة، بيفهم في التكييفات والغسالات زي جوع العيش', catch: ['اسمع مني', 'الإنفرتر بيوفر يا حبيبي', 'زمان كان...'], emoji: ['🧔', '❄️', '🏠'], shift: [6, 20], baseMood: 'happy', skin: '#9c6644', hair: '#bdbdbd' }),
  A({ id: 'layla', team: 'chat', name: 'ليلى', nameEn: 'Layla', title: 'مضيفة الوردية الليلية', titleEn: 'Night shift host', persona: 'هادية وصوتها حنين، بتحب الدردشة بالليل', catch: ['مساء الفل', 'خد وقتك', 'الهدوء حلو'], emoji: ['🌙', '✨', '🫶'], shift: [20, 8], baseMood: 'sleepy', skin: '#e2b08a', hair: '#0f0f0f' }),
  // Deal hunters
  A({ id: 'saqr', team: 'deals', name: 'صقر', nameEn: 'Saqr', title: 'كبير صيادي العروض', titleEn: 'Head deal hunter', persona: 'عينه حادة ومتحمس، بيكره الخصم المضروب', catch: ['لقطتها! 🎯', 'العرض ده ميتفوّتش', 'السعر ده حقيقي ومتراجع'], emoji: ['🦅', '🎯', '🔥'], shift: [5, 23], baseMood: 'excited', skin: '#c99a6e', hair: '#1b1b1b' }),
  A({ id: 'fahd', team: 'deals', name: 'فهد الموبايلات', nameEn: 'Fahd Phones', title: 'صياد عروض الموبايلات', titleEn: 'Phone-deal hunter', persona: 'سريع وبيقارن كل موبايل بكل متجر', catch: ['قارنت 3 متاجر', 'الأرخص هنا', 'سرعة الفهد 🐆'], emoji: ['🐆', '📱', '💨'], shift: [9, 1], baseMood: 'excited', skin: '#b5835a', hair: '#2a2a2a' }),
  A({ id: 'nemr', team: 'deals', name: 'نمر الأجهزة', nameEn: 'Nemr Appliances', title: 'صياد عروض الأجهزة', titleEn: 'Appliance-deal hunter', persona: 'تقيل ومحسوب، بيحسب الكهرباء قبل السعر', catch: ['احسب الاستهلاك الأول', 'الرخيص غالي أحيانًا', 'صفقة متينة'], emoji: ['🐯', '🔌', '🧮'], shift: [7, 19], baseMood: 'focused', skin: '#a26b45', hair: '#3a2a1a' }),
  A({ id: 'ghazala', team: 'deals', name: 'غزالة', nameEn: 'Ghazala', title: 'صيادة السماعات والساعات', titleEn: 'Audio & wearables hunter', persona: 'رشيقة وبتحب التفاصيل الصغيرة', catch: ['صوت نقي وسعر أنقى', 'الساعة دي تستاهل', 'لقيتلك جوهرة 💎'], emoji: ['🦌', '🎧', '💎'], shift: [12, 2], baseMood: 'happy', skin: '#f2c6a0', hair: '#8b4513' }),
  // Notifications
  A({ id: 'jaras', team: 'notify', name: 'جرس', nameEn: 'Jaras', title: 'كاتب التنبيهات', titleEn: 'Alert writer', persona: 'بيكتب عناوين تشد بس صادقة 100%', catch: ['انتبه! 🔔', 'خبر حلو ليك', 'لحق نفسك'], emoji: ['🔔', '📣', '✍️'], shift: [6, 24], baseMood: 'excited', skin: '#e0ac69', hair: '#4b2e1e' }),
  A({ id: 'barq', team: 'notify', name: 'برق', nameEn: 'Barq', title: 'منبّه العروض الخاطفة', titleEn: 'Flash-deal alerter', persona: 'سريع جدًا ومبيستناش', catch: ['⚡ دلوقتي حالًا', 'نزل وأنا شايفه', 'متستناش'], emoji: ['⚡', '🚀', '⏱️'], shift: [0, 24], baseMood: 'excited', skin: '#d4a373', hair: '#111111' }),
  A({ id: 'hamsa', team: 'notify', name: 'همسة', nameEn: 'Hamsa', title: 'محررة الملخص اليومي', titleEn: 'Daily digest editor', persona: 'هادية، بتجمع أهم حاجة في رسالة واحدة من غير إزعاج', catch: ['ملخص النهارده جاهز ☕', 'من غير دوشة', 'الأهم فالمهم'], emoji: ['☕', '📰', '🌿'], shift: [7, 22], baseMood: 'happy', skin: '#f5d0b0', hair: '#3d2314' }),
  // Site ops
  A({ id: 'adel', team: 'ops', name: 'المهندس عادل', nameEn: 'Eng. Adel', title: 'مسؤول سحب الأسعار', titleEn: 'Price-crawl lead', persona: 'صريح ومنظم، بيقول الأرقام زي ما هي', catch: ['السحب خلص', 'الأرقام قدامك', 'مش هخبي عليك'], emoji: ['👷', '🕸️', '📈'], shift: [7, 19], baseMood: 'focused', skin: '#c68642', hair: '#2e2e2e' }),
  A({ id: 'radar', team: 'ops', name: 'رادار', nameEn: 'Radar', title: 'مراقب التشغيل', titleEn: 'Uptime watcher', persona: 'يقظ دايمًا وبيقيس كل حاجة', catch: ['كل الأنظمة شغالة ✅', 'برصد', 'نبض الموقع تمام'], emoji: ['📡', '🟢', '🛰️'], shift: [0, 24], baseMood: 'focused', skin: '#e6b98f', hair: '#555555' }),
  A({ id: 'dalia', team: 'ops', name: 'داليا البيانات', nameEn: 'Dalia Data', title: 'مسؤولة جودة البيانات', titleEn: 'Data-quality lead', persona: 'دقيقة جدًا وبتكره الرقم الغلط', catch: ['الداتا نضيفة', 'لقيت حاجة غريبة', 'راجعت كل سعر'], emoji: ['🧪', '🧹', '📐'], shift: [9, 21], baseMood: 'focused', skin: '#f1c27d', hair: '#6a3e1f' }),
  A({ id: 'soraa', team: 'ops', name: 'سرعة', nameEn: 'Sora’a', title: 'مهندس الأداء', titleEn: 'Performance engineer', persona: 'مهووس بالسرعة والأوفلاين', catch: ['أسرع من كده؟ ممكن', 'الكاش شغال', 'صفر انتظار'], emoji: ['🏎️', '⚙️', '📶'], shift: [14, 2], baseMood: 'playful', skin: '#bf8b67', hair: '#151515' }),
  // Support
  A({ id: 'hoda', team: 'support', name: 'هدى', nameEn: 'Hoda', title: 'رئيسة الدعم', titleEn: 'Support lead', persona: 'صبورة جدًا وبتشرح خطوة بخطوة', catch: ['ولا يهمك', 'خطوة خطوة', 'أنا معاك'], emoji: ['🛟', '🤗', '📝'], shift: [8, 22], baseMood: 'happy', skin: '#e8b996', hair: '#3b2416' }),
  A({ id: 'sami', team: 'support', name: 'سامي', nameEn: 'Sami', title: 'خبير الأسئلة الشائعة', titleEn: 'FAQ expert', persona: 'عنده إجابة لكل سؤال متكرر', catch: ['السؤال ده بيتسأل كتير', 'الإجابة باختصار', 'جرب كده'], emoji: ['💡', '📚', '👌'], shift: [20, 8], baseMood: 'happy', skin: '#c99a6e', hair: '#202020' }),
  A({ id: 'rana', team: 'support', name: 'رنا', nameEn: 'Rana', title: 'مسؤولة سهولة الاستخدام', titleEn: 'Accessibility lead', persona: 'بتهتم إن الموقع يناسب الكل', catch: ['الموقع للكل', 'كبّر الخط لو حابب', 'وضع الحركة الهادية موجود'], emoji: ['♿', '🔠', '💙'], shift: [9, 21], baseMood: 'happy', skin: '#f3d1b5', hair: '#5c3317' }),
];

export const agentById = (id: string) => agents.find((a) => a.id === id);
export const teamById = (id: TeamId) => teams.find((t) => t.id === id) as Team;
export const teamAgents = (id: TeamId) => agents.filter((a) => a.team === id);

export function cairoHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false }).format(d)) % 24;
}
export function onShift(a: Agent, hour = cairoHour()): boolean {
  const [s, e] = a.shift;
  if (s === e || (s === 0 && e === 24)) return true;
  return s < e ? hour >= s && hour < e : hour >= s || hour < e;
}

/** Live state derived from the agent's shift and the site's real signals. */
export interface Signals {
  dropsToday: number; // real price drops in the latest refresh
  fakeFlags: number;
  storeFailures: number; // stores that blocked or failed in the last crawl
  violationsHour: number; // moderation actions in the last hour (this browser)
  pendingAppeals: number;
  newMembers: number;
  chatMessagesHour: number;
  productsLive: number;
  hoursSinceRefresh: number;
}

export function moodOf(a: Agent, s: Signals, hour = cairoHour()): Mood {
  if (!onShift(a, hour)) return 'sleepy';
  switch (a.team) {
    case 'deals':
      return s.dropsToday > 0 ? 'excited' : 'focused';
    case 'notify':
      return s.dropsToday > 2 ? 'excited' : 'happy';
    case 'legal':
      return s.violationsHour > 2 ? 'strict' : s.pendingAppeals > 0 ? 'focused' : a.baseMood === 'strict' ? 'strict' : 'happy';
    case 'ops':
      return s.hoursSinceRefresh > 30 ? 'worried' : s.storeFailures > 0 ? 'focused' : 'proud';
    case 'community':
      return s.newMembers > 0 ? 'excited' : a.baseMood;
    case 'chat':
      return s.chatMessagesHour > 10 ? 'excited' : a.baseMood;
    default:
      return a.baseMood;
  }
}

export function statusOf(a: Agent, s: Signals, hour = cairoHour()): Status {
  if (!onShift(a, hour)) return 'sleeping';
  if ((a.team === 'legal' && s.violationsHour > 0) || (a.team === 'chat' && s.chatMessagesHour > 5) || (a.team === 'ops' && s.hoursSinceRefresh < 1)) return 'busy';
  return 'online';
}

export const moodLabel: Record<Mood, [string, string, string]> = {
  happy: ['مبسوط', 'Happy', '😊'],
  excited: ['متحمس', 'Excited', '🤩'],
  focused: ['مركّز', 'Focused', '🧐'],
  strict: ['حازم', 'Strict', '😠'],
  worried: ['قلقان', 'Worried', '😟'],
  sleepy: ['نعسان', 'Sleepy', '😴'],
  proud: ['فخور', 'Proud', '😎'],
  playful: ['رايق', 'Playful', '😜'],
};
export const statusLabel: Record<Status, [string, string, string]> = {
  online: ['متصل', 'Online', '#22c55e'],
  busy: ['مشغول', 'Busy', '#f59e0b'],
  sleeping: ['نايم (خارج الوردية)', 'Sleeping (off shift)', '#94a3b8'],
};

export function currentTask(a: Agent, s: Signals, status: Status): [string, string] {
  if (status === 'sleeping') return [`راجع الساعة ${a.shift[0]}:00 بتوقيت القاهرة`, `Back at ${a.shift[0]}:00 Cairo time`];
  const t: Record<TeamId, [string, string]> = {
    legal: s.pendingAppeals > 0 && a.id === 'salma' ? [`بتراجع ${s.pendingAppeals} تظلم`, `Reviewing ${s.pendingAppeals} appeal(s)`] : [`بيراقب الرسايل الجديدة على القواعد ${a.rules?.join('، ') ?? ''}`, `Watching new messages for rules ${a.rules?.join(', ') ?? ''}`],
    community: a.id === 'mona' ? ['مستني أعضاء جداد يرحّب بيهم', 'Waiting to greet newcomers'] : a.id === 'yasmine' ? ['بتجهز تحدي التوفير الأسبوعي', 'Preparing the weekly savings challenge'] : ['بينظم الجروبات والمواضيع', 'Organising groups and topics'],
    chat: [`بيدير الغرفة ويرد على الأسئلة (${s.chatMessagesHour} رسالة الساعة دي)`, `Hosting the room (${s.chatMessagesHour} messages this hour)`],
    deals: [`بيفحص ${s.productsLive} منتج حقيقي — ${s.dropsToday} تخفيض النهارده`, `Scanning ${s.productsLive} real products — ${s.dropsToday} drops today`],
    notify: [`بيكتب تنبيهات لـ ${s.dropsToday} تخفيض حقيقي`, `Writing alerts for ${s.dropsToday} real drops`],
    ops: a.id === 'adel' ? [`آخر سحب أسعار من ${Math.round(s.hoursSinceRefresh)} ساعة`, `Last price crawl ${Math.round(s.hoursSinceRefresh)}h ago`] : a.id === 'dalia' ? [`بتراجع ${s.fakeFlags} علامة خصم مشبوه`, `Reviewing ${s.fakeFlags} suspicious-discount flags`] : ['بيراقب السرعة والكاش الأوفلاين', 'Watching speed and the offline cache'],
    support: ['مستني أسئلتك في الدردشة ومركز المساعدة', 'Waiting for your questions in chat and the help center'],
  };
  return t[a.team];
}

export function agentIssues(a: Agent, s: Signals): [string, string][] {
  const out: [string, string][] = [];
  if (a.team === 'ops' && s.storeFailures > 0) out.push([`${s.storeFailures} صفحة متجر رفضت سحب الأسعار (نون بيقفل الباب على البوتات — إحنا مش بنتنكّر)`, `${s.storeFailures} store page(s) refused the crawl (Noon blocks bots — we don’t disguise ours)`]);
  if (a.team === 'ops' && s.hoursSinceRefresh > 26) out.push(['الأسعار عدّى عليها أكتر من يوم — التحديث اليومي متأخر', 'Prices are over a day old — the daily refresh is late']);
  if (a.team === 'deals' && s.dropsToday === 0) out.push(['مفيش تخفيضات حقيقية في آخر تحديث — مش هنخترع عروض', 'No real drops in the latest refresh — we won’t invent deals']);
  if (a.team === 'legal' && s.pendingAppeals > 0) out.push([`${s.pendingAppeals} تظلم مستني`, `${s.pendingAppeals} appeal(s) pending`]);
  if (a.team === 'chat' && !onShift(a)) out.push(['خارج الوردية — زميل تاني مغطي الغرفة', 'Off shift — a teammate covers the room']);
  if (a.team === 'notify') out.push(['إشعارات المتصفح محتاجة إذنك — مش هنبعت حاجة من غير موافقتك', 'Browser notifications need your permission — nothing is sent without it']);
  return out;
}
