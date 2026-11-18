// Safqa community rules. Every member accepts this exact version before
// posting, commenting, reviewing or chatting. Penalties cite these numbers.
export const RULES_VERSION = '2026-11-18';

export interface Rule { id: string; ar: string; en: string; detail: string; severity: 1 | 2 | 3 | 5; agent: string }
export interface RuleSection { id: string; ar: string; en: string; rules: Rule[] }

export const ruleSections: RuleSection[] = [
  { id: '1', ar: 'الاحترام', en: 'Respect', rules: [
    { id: '1.1', ar: 'ممنوع الشتيمة والألفاظ الخارجة', en: 'No profanity or vulgar language', detail: 'أي سب أو لفظ خارج بالعربي أو الإنجليزي أو بحروف متقطعة أو مموّهة يعتبر مخالفة. الهزار مسموح من غير شتيمة.', severity: 2, agent: 'hamdy' },
    { id: '1.2', ar: 'ممنوع التنمر والإهانة الشخصية', en: 'No bullying or personal insults', detail: 'ممنوع تهين عضو أو تتريق على شكله أو ظروفه أو اختياراته. انتقد العرض، متنتقدش الشخص.', severity: 2, agent: 'nabil' },
    { id: '1.3', ar: 'ممنوع خطاب الكراهية والتمييز', en: 'No hate speech or discrimination', detail: 'ممنوع أي محتوى يهاجم دين أو جنس أو أصل أو إعاقة.', severity: 3, agent: 'nabil' },
  ] },
  { id: '2', ar: 'الأمان والخصوصية', en: 'Safety & privacy', rules: [
    { id: '2.1', ar: 'ممنوع نشر بيانات شخصية', en: 'No personal data in public', detail: 'متنشرش أرقام تليفونات أو أرقام كروت بنكية أو أرقام قومية أو عناوين — لا بتاعتك ولا بتاعة غيرك — في الأماكن العامة.', severity: 2, agent: 'nour' },
    { id: '2.2', ar: 'ممنوع الروابط الضارة والتصيّد', en: 'No malicious or phishing links', detail: 'ممنوع روابط مختصرة مجهولة، روابط IP، روابط تحميل برامج، أو رسائل "حدّث بياناتك البنكية".', severity: 3, agent: 'nour' },
    { id: '2.3', ar: 'ممنوع رفع ملفات تنفيذية', en: 'No executable uploads', detail: 'ممنوع رفع exe أو apk أو سكريبتات. الصور والفيديو والمستندات مسموحة في حدود المساحة.', severity: 3, agent: 'nour' },
  ] },
  { id: '3', ar: 'السبام والإزعاج', en: 'Spam & flooding', rules: [
    { id: '3.1', ar: 'ممنوع تكرار نفس الرسالة', en: 'No repeated messages', detail: 'تكرار نفس الكلام أكتر من مرة في 10 دقايق يعتبر سبام.', severity: 1, agent: 'ezzat' },
    { id: '3.2', ar: 'ممنوع الإعلانات والروابط الكتير', en: 'No ads or link dumping', detail: 'أكتر من رابطين في رسالة واحدة، أو روابط أفلييت وإعلانات لصفحاتك، ممنوعة.', severity: 1, agent: 'ezzat' },
    { id: '3.3', ar: 'ممنوع الفلود (رسايل كتير بسرعة)', en: 'No flooding', detail: 'أكتر من 6 رسايل في 30 ثانية = فلود.', severity: 1, agent: 'ezzat' },
    { id: '3.4', ar: 'ممنوع الكتابة كلها كابيتال أو إيموجي بالهبل', en: 'No all-caps or emoji walls', detail: 'رسالة أغلبها حروف كابيتال أو أكتر من 15 إيموجي ورا بعض.', severity: 1, agent: 'ezzat' },
  ] },
  { id: '4', ar: 'الأمانة في العروض والتقييمات', en: 'Honest deals & reviews', rules: [
    { id: '4.1', ar: 'ممنوع العروض والأسعار المضللة', en: 'No misleading deals or prices', detail: 'متكتبش سعر أو خصم مش حقيقي، ومتقولش "آخر قطعة" أو "خصم 90%" لو مش صح.', severity: 2, agent: 'amin' },
    { id: '4.2', ar: 'ممنوع التقييمات المزيفة', en: 'No fake reviews', detail: 'قيّم المنتج اللي جربته بس. التقييم المدفوع أو تقييم منتجك أو تقييمات كتير لنفس المنتج ممنوعة.', severity: 2, agent: 'amin' },
    { id: '4.3', ar: 'ممنوع انتحال شخصية متجر أو وكيل', en: 'No impersonation', detail: 'متدّعيش إنك متجر أو موظف في صفقة أو وكيل ذكي.', severity: 3, agent: 'amin' },
  ] },
  { id: '5', ar: 'المحتوى الممنوع', en: 'Prohibited content', rules: [
    { id: '5.1', ar: 'ممنوع المحتوى الجنسي أو العنيف', en: 'No sexual or violent content', detail: 'نصوص أو صور أو فيديو.', severity: 5, agent: 'hamdy' },
    { id: '5.2', ar: 'ممنوع بيع أو الترويج لممنوعات', en: 'No illegal goods', detail: 'أسلحة، مخدرات، أدوية بدون روشتة، حسابات مسروقة.', severity: 5, agent: 'hamdy' },
    { id: '5.3', ar: 'ممنوع النصب وطلب تحويل فلوس', en: 'No scams or money requests', detail: 'ممنوع تطلب "مقدّم" أو "عربون" بتحويل فودافون كاش أو إنستاباي أو تبيع خارج المنصة بطريقة مشبوهة.', severity: 5, agent: 'nour' },
  ] },
];

export const allRules: Rule[] = ruleSections.flatMap((s) => s.rules);
export const ruleById = (id: string) => allRules.find((r) => r.id === id);

/** Escalation table: points in the last 30 days -> penalty. */
export const escalation: { min: number; action: 'warning' | 'mute' | 'ban'; minutes: number; ar: string; en: string }[] = [
  { min: 1, action: 'warning', minutes: 0, ar: 'إنذار رسمي', en: 'Official warning' },
  { min: 3, action: 'mute', minutes: 10, ar: 'كتم 10 دقايق', en: '10-minute mute' },
  { min: 5, action: 'mute', minutes: 60, ar: 'كتم ساعة', en: '1-hour mute' },
  { min: 8, action: 'ban', minutes: 24 * 60, ar: 'حظر مؤقت 24 ساعة', en: '24-hour temporary ban' },
  { min: 12, action: 'ban', minutes: 7 * 24 * 60, ar: 'حظر مؤقت 7 أيام', en: '7-day temporary ban' },
];
