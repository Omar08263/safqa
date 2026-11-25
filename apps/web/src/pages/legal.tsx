import type { ReactNode } from 'react';
import { FileText, Scale } from 'lucide-react';
import { Card, PageHeader } from '../fx/fx';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

type Section = { arTitle: string; enTitle: string; ar: string[]; en: string[] };

function LegalDoc({
  kicker,
  titleAr,
  titleEn,
  ledeAr,
  ledeEn,
  icon,
  sections,
  otherHref,
  otherAr,
  otherEn,
}: {
  kicker: string;
  titleAr: string;
  titleEn: string;
  ledeAr: string;
  ledeEn: string;
  icon: ReactNode;
  sections: Section[];
  otherHref: string;
  otherAr: string;
  otherEn: string;
}) {
  const tr = useTr();
  const { locale } = usePrefs();
  const ar = locale === 'ar';
  return (
    <div className="space-y-6">
      <PageHeader icon={icon} title={ar ? titleAr : titleEn} lede={ar ? ledeAr : ledeEn} kicker={kicker}>
        <p className="text-xs text-muted">{tr('آخر تحديث: 18 نوفمبر 2026', 'Last updated: 18 November 2026')}</p>
      </PageHeader>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={otherHref} className="font-semibold text-primary">
          {ar ? otherAr : otherEn}
        </a>
        <a href="/privacy.html" className="text-muted hover:text-foreground">
          {tr('النسخة الثابتة · /privacy.html', 'Stable page · /privacy.html')}
        </a>
        <a href="/terms.html" className="text-muted hover:text-foreground">
          {tr('النسخة الثابتة · /terms.html', 'Stable page · /terms.html')}
        </a>
      </div>
      {sections.map((s) => (
        <Card key={s.enTitle} className="p-6">
          <h2 className="text-lg font-bold">{ar ? s.arTitle : s.enTitle}</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-muted">
            {(ar ? s.ar : s.en).map((p) => (
              <p key={p.slice(0, 48)}>{p}</p>
            ))}
          </div>
        </Card>
      ))}
      <Card className="p-6">
        <h2 className="text-lg font-bold">{tr('التواصل', 'Contact')}</h2>
        <p className="mt-2 text-sm text-muted">
          {tr('لأي استفسار حول هذه الصفحة راسلنا على', 'For questions about this page, email')}{' '}
          <a className="font-semibold text-primary" href="mailto:rxcc@agentmail.to">
            rxcc@agentmail.to
          </a>
        </p>
      </Card>
      <section lang={ar ? 'en' : 'ar'} dir={ar ? 'ltr' : 'rtl'} className="rounded-[1.5rem] border border-border bg-card/50 p-6">
        <p className="text-xs font-semibold text-primary">{ar ? 'English' : 'العربية'}</p>
        <h2 className="mt-1 text-xl font-bold">{ar ? titleEn : titleAr}</h2>
        <p className="mt-2 text-sm leading-7 text-muted">{ar ? ledeEn : ledeAr}</p>
        {sections.map((s) => (
          <div key={`alt-${s.enTitle}`} className="mt-5">
            <h3 className="font-semibold">{ar ? s.enTitle : s.arTitle}</h3>
            <div className="mt-2 space-y-2 text-sm leading-7 text-muted">
              {(ar ? s.en : s.ar).map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

const privacy: Section[] = [
  {
    arTitle: 'مقدمة',
    enTitle: 'Introduction',
    ar: [
      'تحترم صفقة خصوصيتك. تشرح هذه السياسة البيانات التي نتعامل معها عند استخدامك لموقع صفقة لمقارنة أسعار المتاجر المصرية — ومنها نون وأمازون مصر وبي.تك وغيرها — وكيف تُحفظ، ولماذا، وما حقوقك.',
      'النسخة المتاحة حاليًا على هذا العنوان هي نسخة تجريبية ثابتة تعمل من المتصفح. لا يوجد خادم خلفي يستقبل حسابك أو قايمة المراقبة أو التنبيهات.',
    ],
    en: [
      'Safqa respects your privacy. This policy explains the data we handle when you use the Safqa site to compare prices at Egyptian stores — including Noon, Amazon.eg, B.TECH and others — how it is stored, why, and what your rights are.',
      'The site at this address is a static demo that runs in your browser. There is no backend server that receives your account, watchlist or alerts.',
    ],
  },
  {
    arTitle: 'من نحن',
    enTitle: 'Who we are',
    ar: [
      'صفقة (Safqa) منصة مستقلة لمقارنة الأسعار وكشف الخصومات المضخّمة لمساعدة المتسوق في مصر على معرفة السعر العادل قبل الشراء. صفقة ليست تابعة لنون أو أمازون أو أي متجر تُعرض أسعاره.',
    ],
    en: [
      'Safqa is an independent price-comparison tool that also flags inflated discounts, so shoppers in Egypt can see a fair price before they buy. Safqa is not affiliated with Noon, Amazon, or any store whose prices appear here.',
    ],
  },
  {
    arTitle: 'البيانات التي نتعامل معها',
    enTitle: 'Data we handle',
    ar: [
      'بيانات الحساب: الاسم والبريد الإلكتروني والباسورد (تُحفظ محليًا في النسخة التجريبية)، وصورة الملف إن أضفتها أو وصلت عبر جوجل.',
      'تفضيلات الاستخدام: اللغة، المظهر، قايمة المراقبة، التنبيهات، المجموعات، الميزانية وإعدادات الجهاز.',
      'بيانات الأسعار العامة: أسعار وتوفر المنتجات من الصفحات العامة للمتاجر (مثل بيانات JSON-LD)، دون الدخول إلى أي حساب لديك في تلك المتاجر.',
    ],
    en: [
      'Account data: name, email and password (stored locally in the demo), and a profile picture if you add one or sign in with Google.',
      'Preferences: language, theme, watchlist, alerts, collections, budget and device settings.',
      'Public price data: product prices and availability from public store pages (for example JSON-LD), without signing into any of your store accounts.',
    ],
  },
  {
    arTitle: 'التخزين المحلي في النسخة التجريبية',
    enTitle: 'Local storage in the demo',
    ar: [
      'في هذه النسخة التجريبية تُحفظ حساباتك وقوائم المتابعة والتنبيهات والإعدادات على جهازك فقط عبر تخزين المتصفح (localStorage). لا تُرسل هذه البيانات إلى خادم صفقة، ولا نطّلع عليها.',
      'مسح بيانات الموقع أو استخدام متصفح أو جهاز آخر يُظهر حسابًا فارغًا. يمكنك تصدير بياناتك أو حذفها من صفحة الإعدادات في أي وقت.',
    ],
    en: [
      'In this demo, your accounts, watchlists, alerts and settings are stored only on your device in the browser (localStorage). They are not sent to a Safqa server, and we cannot see them.',
      'Clearing site data, or using another browser or device, shows an empty account. Export or delete this data from Settings at any time.',
    ],
  },
  {
    arTitle: 'تسجيل الدخول بحساب جوجل',
    enTitle: 'Google sign-in',
    ar: [
      'زر «المتابعة بحساب جوجل» يستخدم خدمة Google Identity Services. عند الموافقة، يصل إلى المتصفح رمز تعريفي (ID token). النسخة التجريبية تفك الرمز محليًا وتتحقق من الجمهور (audience) وتاريخ الانتهاء فقط — لا يوجد خادم للتحقق من التوقيع الرقمي.',
      'نستخدم من الرمز الاسم والبريد الإلكتروني والصورة فقط لإنشاء جلسة محلية في المتصفح. لا نطلب صلاحيات أخرى، ولا نشارك رمز جوجل مع أطراف ثالثة.',
    ],
    en: [
      'The “Continue with Google” button uses Google Identity Services. If you agree, the browser receives an ID token. The demo decodes it locally and checks the audience and expiry only — there is no server to verify the digital signature.',
      'We use only your name, email and profile picture from the token to create a local session in this browser. We do not request other scopes, and we do not share the Google token with third parties.',
    ],
  },
  {
    arTitle: 'بيانات الأسعار وملفات الارتباط',
    enTitle: 'Price data and cookies',
    ar: [
      'الأسعار المعروضة مأخوذة من صفحات المنتجات العامة وقد تتأخر عن لحظة الشراء، لا سيّما في النسخة التجريبية التي تُحدَّث دوريًا. السعر النهائي هو ما يظهر عند التاجر.',
      'النسخة التجريبية لا تستخدم ملفات ارتباط تتبع إعلاني. نعتمد على تخزين المتصفح لتذكر جلستك وتفضيلاتك ودعم العمل دون اتصال. عند استخدام تسجيل جوجل قد تضع جوجل ملفات ارتباط خاصة بها.',
    ],
    en: [
      'Prices shown come from public product pages and may lag behind the moment of purchase, especially in the demo, which is updated periodically. The final price is always the one shown by the merchant.',
      'The demo does not use advertising tracking cookies. We rely on local browser storage to remember your session and preferences and to support offline use. If you use Google sign-in, Google may set its own cookies.',
    ],
  },
  {
    arTitle: 'المشاركة، الاحتفاظ، حقوقك والأطفال',
    enTitle: 'Sharing, retention, your rights and children',
    ar: [
      'لا نبيع بياناتك. في هذه النسخة التجريبية لا تُرفع بيانات حسابك إلى خوادمنا. تبقى البيانات المحلية ما دامت محفوظة في متصفحك، ويمكنك الاطلاع عليها أو تصديرها أو حذفها من الإعدادات.',
      'صفقة ليست موجّهة للأطفال دون 13 عامًا. إذا علمت أن طفلًا قدّم بيانات عبر أجهزته، امسح بيانات الموقع وتواصل معنا.',
    ],
    en: [
      'We do not sell your data. In this demo your account data is not uploaded to our servers. Local data remains for as long as it stays in your browser; you may view, export or delete it from Settings.',
      'Safqa is not directed at children under 13. If you learn that a child has submitted data on their device, clear the site data and contact us.',
    ],
  },
];

const terms: Section[] = [
  {
    arTitle: 'القبول ووصف الخدمة',
    enTitle: 'Acceptance and the service',
    ar: [
      'باستخدامك موقع صفقة أو إنشاء حساب (بما في ذلك الحساب المحلي أو تسجيل جوجل) فإنك توافق على هذه الشروط وقواعد المجتمع. إذا لم توافق، يُرجى عدم استخدام الموقع.',
      'صفقة أداة لمقارنة أسعار المنتجات في متاجر مصرية منها نون وأمازون مصر وبي.تك، وعرض تاريخ السعر، وكشف الخصم المضخّم، ووضع تنبيهات تساعدك على قرار الشراء. الخدمة تُقدَّم «كما هي»، والنسخة الحالية تجريبية ثابتة تعمل من المتصفح.',
    ],
    en: [
      'By using the Safqa site or creating an account (including a local demo account or Google sign-in) you agree to these terms and to the community rules. If you do not agree, please do not use the site.',
      'Safqa is a tool for comparing product prices at Egyptian stores including Noon, Amazon.eg and B.TECH, showing price history, flagging inflated discounts, and letting you set alerts. The service is provided “as is”, and the current edition is a static in-browser demo.',
    ],
  },
  {
    arTitle: 'الأسعار وعدم الارتباط بالمتاجر',
    enTitle: 'Prices and no affiliation',
    ar: [
      'الأسعار والتوفر والخصومات معلومات إرشادية قد تختلف عما يظهر عند المتجر لحظة الشراء. صفقة لا تبيع المنتجات ولا تستلم مدفوعات ولا تضمن أي سعر أو مخزون. الحاسبات تقديرية فقط، والشراء يتم لدى التاجر.',
      'صفقة منصة مستقلة. أسماء المتاجر والعلامات التجارية ملك لأصحابها، وذكرها للمقارنة فقط ولا يعني رعاية أو شراكة.',
    ],
    en: [
      'Prices, availability and discounts are indicative and may differ from what the store shows at checkout. Safqa does not sell the products, does not take payment, and does not guarantee any price or stock. Calculators are estimates only; the purchase is made with the merchant.',
      'Safqa is independent. Store names and trade marks belong to their owners and appear here only for comparison, not as sponsorship or partnership.',
    ],
  },
  {
    arTitle: 'الحسابات في النسخة التجريبية',
    enTitle: 'Accounts in the demo',
    ar: [
      'الحساب البريدي وحساب جوجل في هذه النسخة يُحفظان على جهازك. أنت مسؤول عن سرية جهازك ومتصفحك. استعادة الباسورد في النسخة التجريبية تعرض الرمز على الشاشة لأنه لا يوجد خادم بريد. عند تسجيل جوجل نستخدم الاسم والبريد والصورة فقط لإنشاء الجلسة المحلية.',
    ],
    en: [
      'Email and Google accounts in this edition are stored on your device. You are responsible for that device and browser. Password reset in the demo shows the code on screen because there is no mail server. With Google sign-in we use only your name, email and picture to create the local session.',
    ],
  },
  {
    arTitle: 'قواعد المجتمع',
    enTitle: 'Community rules',
    ar: [
      'أي مساحة نقاش أو تعليقات أو رسائل أو مجموعات مشاركة داخل صفقة تخضع لهذه القواعد. المخالفة قد تؤدي لإخفاء المحتوى أو إيقاف الحساب.',
      'تعامل باحترام: يُمنع السبّ والإهانة والتحرش وخطاب الكراهية. يُمنع الاحتيال والعروض الوهمية وطلب بيانات دفع من الآخرين. يُمنع انتحال صفة صفقة أو المتاجر أو المستخدمين. يُمنع الإغراق والإعلانات غير المصرّح بها. يُمنع نشر بيانات شخصية عن الغير دون إذن أو أي محتوى غير قانوني أو مواد تستغل القاصرين — وهذا محظور حظرًا قاطعًا. يُمنع التلاعب المتعمد بالأسعار أو المراجعات لتضليل المتسوقين. كن صادقًا عند مشاركة تجربة شراء. لا تحاول اختراق الموقع أو إعاقة الآخرين.',
    ],
    en: [
      'Any discussion, comments, messages or shared lists inside Safqa follow these rules. Breaking them may lead to content being hidden or the account being closed.',
      'Be respectful: insults, harassment and hate speech are not allowed. Fraud, fake deals, and asking others for payment details are not allowed. Do not impersonate Safqa, stores or other users. No spam or unsolicited ads. Do not publish someone else’s personal data without permission, illegal content, or any sexual material involving minors — which is strictly prohibited. Do not manipulate prices or reviews to mislead shoppers. Be honest when sharing a purchase. Do not attempt to break into the site or disrupt others.',
    ],
  },
  {
    arTitle: 'الملكية الفكرية وتحديد المسؤولية والقانون',
    enTitle: 'Intellectual property, liability and law',
    ar: [
      'محتوى صفقة (الشعار والنصوص والتصميم والشيفرة) ملك لنا أو مرخّص لنا. يجوز الاستخدام الشخصي غير التجاري وفق هذه الشروط. بيانات أسعار المتاجر تبقى خاضعة لحقوق أصحابها.',
      'إلى أقصى حد يسمح به قانون جمهورية مصر العربية، لا تتحمل صفقة المسؤولية عن خسائر ناتجة عن الاعتماد على سعر معروض أو قرار شراء أو انقطاع الخدمة أو فقدان بيانات محفوظة محليًا أو محتوى ينشره مستخدمون. يُفسَّر الاتفاق وفق قوانين مصر وتختص محاكمها بالنظر في النزاعات في الحدود التي يسمح بها القانون.',
    ],
    en: [
      'Safqa’s own content (logo, copy, design and code) belongs to us or is licensed to us. You may use the site for personal, non-commercial purposes under these terms. Store price data remains subject to its owners’ rights.',
      'To the fullest extent permitted by the laws of the Arab Republic of Egypt, Safqa is not liable for losses arising from reliance on a displayed price, a purchase decision, downtime, loss of locally stored data, or content posted by other users. These terms are governed by Egyptian law, and its courts have jurisdiction to the extent the law allows.',
    ],
  },
];

export function PrivacyPage() {
  const tr = useTr();
  return (
    <LegalDoc
      kicker="صفقة Safqa"
      titleAr="سياسة الخصوصية"
      titleEn="Privacy Policy"
      ledeAr="كيف تتعامل صفقة مع بياناتك عند مقارنة أسعار نون وأمازون مصر والمتاجر المصرية الأخرى، خصوصًا في النسخة التجريبية التي تحفظ بياناتك على جهازك."
      ledeEn="How Safqa handles your data when you compare prices at Noon, Amazon.eg and other Egyptian stores, especially in the demo that keeps your data on your device."
      icon={<FileText className="h-6 w-6" />}
      sections={privacy}
      otherHref="/terms"
      otherAr="الشروط والأحكام وقواعد المجتمع"
      otherEn="Terms of Service & community rules"
    />
  );
}

export function TermsPage() {
  return (
    <LegalDoc
      kicker="صفقة Safqa"
      titleAr="الشروط والأحكام وقواعد المجتمع"
      titleEn="Terms of Service & Community Rules"
      ledeAr="شروط استخدام صفقة لمقارنة الأسعار في المتاجر المصرية، ومسؤولياتك، وقواعد النقاش والمجتمع."
      ledeEn="The terms for using Safqa to compare prices at Egyptian stores, your responsibilities, and the community rules."
      icon={<Scale className="h-6 w-6" />}
      sections={terms}
      otherHref="/privacy"
      otherAr="سياسة الخصوصية"
      otherEn="Privacy Policy"
    />
  );
}
