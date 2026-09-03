import { isAr } from '../i18n'
import { RadarMark } from '../sections/Header'

export default function Accessibility() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-void)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <header className="border-b border-[#1a2540] px-5 py-8">
        <div className="mx-auto max-w-4xl">
          <a href={isAr ? '/ar' : '/'} className="inline-flex items-center gap-2 hover:text-[#22d3ee] transition-colors mb-6">
            <span className="text-[#8b98ad]">←</span>
            <span className="font-mono2 text-[12px] tracking-[0.1em] uppercase">
              {isAr ? 'العودة إلى الرئيسية' : 'Back to Home'}
            </span>
          </a>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {isAr ? 'إمكانية الوصول' : 'Accessibility'}
          </h1>
          <p className="text-[#8b98ad] max-w-2xl">
            {isAr
              ? 'التزامنا بجعل Captain Adel متاحًا لجميع المستخدمين، بما في ذلك أولئك الذين يستخدمون تقنيات مساعدة.'
              : 'Our commitment to making Captain Adel accessible to all users, including those using assistive technologies.'}
          </p>
        </div>
      </header>

      {/* Main content */}
      <main className="px-5 py-12">
        <div className="mx-auto max-w-4xl space-y-12">
          {/* Conformance Statement */}
          <section className="border border-[#1a2540] rounded-lg p-8" style={{ backgroundColor: '#0E1729' }}>
            <div className="flex items-start gap-4 mb-6">
              <RadarMark size={32} />
              <div>
                <h2 className="text-xl font-bold mb-2">
                  {isAr ? 'معايير الوصول' : 'Conformance Statement'}
                </h2>
                <p className="text-[#8b98ad] font-mono2 text-[12px] tracking-[0.1em] uppercase">
                  WCAG 2.1 Level AA
                </p>
              </div>
            </div>
            <div className="space-y-4 text-[#8b98ad]">
              <p>
                {isAr
                  ? 'Captain Adel يلتزم بمعايير الويب العالمية WCAG 2.1 عند مستوى AA. تم اختبار جميع الصفحات الرئيسية للتحقق من:'
                  : 'Captain Adel is committed to meeting the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. All main pages have been tested and verified for:'}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  {isAr
                    ? 'نسب التباين: 4.5:1 للنصوص، 3:1 للعناصر غير النصية'
                    : 'Contrast Ratios: 4.5:1 for text, 3:1 for non-text elements'}
                </li>
                <li>
                  {isAr
                    ? 'التنقل بلوحة المفاتيح: جميع الميزات متاحة عبر لوحة المفاتيح'
                    : 'Keyboard Navigation: all features accessible via keyboard'}
                </li>
                <li>
                  {isAr
                    ? 'قارئات الشاشة: دعم NVDA و JAWS و VoiceOver'
                    : 'Screen Readers: support for NVDA, JAWS, and VoiceOver'}
                </li>
                <li>
                  {isAr
                    ? 'النصوص ثنائية الاتجاه: دعم صحيح للنصوص الإنجليزية والعربية'
                    : 'Bidirectional Text: proper support for English and Arabic content'}
                </li>
                <li>
                  {isAr
                    ? 'الحركة المقللة: احترام تفضيل prefers-reduced-motion للمستخدم'
                    : 'Reduced Motion: respect for user prefers-reduced-motion setting'}
                </li>
              </ul>
            </div>
          </section>

          {/* Known Issues & Mitigations */}
          <section>
            <h2 className="text-xl font-bold mb-4">
              {isAr ? 'مشاكل معروفة والحلول' : 'Known Issues & Mitigations'}
            </h2>
            <div className="space-y-4">
              <div className="border border-[#1a2540] rounded-lg p-6" style={{ backgroundColor: '#0E1729' }}>
                <h3 className="font-bold mb-2">
                  {isAr ? 'لوحة الألوان لعسر اللون (Color-Blindness)' : 'Color-Blind Palette'}
                </h3>
                <p className="text-[#8b98ad] mb-3">
                  {isAr
                    ? 'الأخضر والأحمر المستخدمان في الحالات الإيجابية/السلبية قد يكونان صعبي التمييز للمستخدمين ذوي عمى الألوان الأحمر-الأخضر (8% من الذكور).'
                    : 'The green and red colors used for positive/negative states may be difficult to distinguish for users with red-green color blindness (8% of males).'}
                </p>
                <p className="text-[#8b98ad] text-sm">
                  {isAr
                    ? 'التخفيف: جميع الحالات الدلالية مصحوبة بأيقونات وأيقونات نصية ('
                    : 'Mitigation: All semantic states are accompanied by icons and text labels ('}
                  <code className="bg-[#0a0e12] px-2 py-1 rounded text-[#22d3ee]">✓</code>
                  {isAr ? '، ' : ', '}
                  <code className="bg-[#0a0e12] px-2 py-1 rounded text-[#22d3ee]">⚠</code>
                  {isAr ? '، ' : ', '}
                  <code className="bg-[#0a0e12] px-2 py-1 rounded text-[#22d3ee]">✕</code>
                  {isAr ? ')، لذا لا تعتمد الفهم على اللون وحده.' : '), so comprehension does not depend on color alone.'}
                </p>
              </div>

              <div className="border border-[#1a2540] rounded-lg p-6" style={{ backgroundColor: '#0E1729' }}>
                <h3 className="font-bold mb-2">
                  {isAr ? 'الرموز منخفضة الشفافية' : 'Low-Opacity Decorative Elements'}
                </h3>
                <p className="text-[#8b98ad]">
                  {isAr
                    ? 'بعض العناصر الزخرفية (الحدود والظلال والتأثيرات البصرية) تستخدم شفافية منخفضة. هذه العناصر ليست ضرورية لفهم المحتوى وتُعتبر تحسينات بصرية فقط.'
                    : 'Some decorative elements (borders, shadows, visual effects) use low opacity. These are non-essential visual enhancements and do not impact content comprehension.'}
                </p>
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h2 className="text-xl font-bold mb-4">
              {isAr ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts'}
            </h2>
            <div className="space-y-3 text-[#8b98ad]">
              <div className="flex items-center gap-3">
                <kbd className="bg-[#1a2540] px-3 py-2 rounded font-mono2 text-[#22d3ee]">Tab</kbd>
                <span>{isAr ? 'الانتقال بين العناصر التفاعلية' : 'Navigate between interactive elements'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="bg-[#1a2540] px-3 py-2 rounded font-mono2 text-[#22d3ee]">Shift + Tab</kbd>
                <span>{isAr ? 'الانتقال للخلف بين العناصر' : 'Navigate backwards between elements'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="bg-[#1a2540] px-3 py-2 rounded font-mono2 text-[#22d3ee]">Enter</kbd>
                <span>{isAr ? 'تفعيل الأزرار والروابط' : 'Activate buttons and links'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="bg-[#1a2540] px-3 py-2 rounded font-mono2 text-[#22d3ee]">Escape</kbd>
                <span>{isAr ? 'إغلاق الحوارات والقوائم المنسدلة' : 'Close dialogs and dropdowns'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="bg-[#1a2540] px-3 py-2 rounded font-mono2 text-[#22d3ee]">↑ / ↓</kbd>
                <span>{isAr ? 'التنقل في القوائم والقوائم المنسدلة' : 'Navigate menus and lists'}</span>
              </div>
            </div>
          </section>

          {/* Technologies & Standards */}
          <section>
            <h2 className="text-xl font-bold mb-4">
              {isAr ? 'التقنيات والمعايير المستخدمة' : 'Technologies & Standards'}
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-[#1a2540] rounded-lg p-6" style={{ backgroundColor: '#0E1729' }}>
                <h3 className="font-bold mb-3">
                  {isAr ? 'معايير HTML' : 'HTML Standards'}
                </h3>
                <ul className="text-[#8b98ad] space-y-2 text-sm">
                  <li>• Semantic HTML5 tags</li>
                  <li>• ARIA labels &amp; roles</li>
                  <li>• Proper heading hierarchy</li>
                  <li>• Alternative text for images</li>
                </ul>
              </div>
              <div className="border border-[#1a2540] rounded-lg p-6" style={{ backgroundColor: '#0E1729' }}>
                <h3 className="font-bold mb-3">
                  {isAr ? 'تقنيات CSS & JS' : 'CSS & JS Techniques'}
                </h3>
                <ul className="text-[#8b98ad] space-y-2 text-sm">
                  <li>• Focus ring indicators (2px solid)</li>
                  <li>• Sufficient touch targets (44×44px min)</li>
                  <li>• Logical CSS properties (RTL-safe)</li>
                  <li>• DOMPurify sanitization</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Feedback & Contact */}
          <section className="border-t border-[#1a2540] pt-8">
            <h2 className="text-xl font-bold mb-4">
              {isAr ? 'الملاحظات والمساعدة' : 'Feedback & Support'}
            </h2>
            <p className="text-[#8b98ad] mb-6">
              {isAr
                ? 'إذا واجهت أي مشاكل في إمكانية الوصول أو كان لديك اقتراحات لتحسينات، يرجى التواصل بنا:'
                : 'If you encounter any accessibility issues or have suggestions for improvements, please contact us:'}
            </p>
            <div className="flex items-center gap-3 bg-[#0E1729] border border-[#1a2540] rounded-lg p-6 w-fit">
              <span className="text-[#22d3ee]">✉</span>
              <a href="mailto:i@flygaca.com" className="font-mono2 text-[12px] tracking-[0.1em] hover:text-[#22d3ee] transition-colors">
                i@flygaca.com
              </a>
            </div>
            <p className="text-[#8b98ad] text-sm mt-4">
              {isAr
                ? 'سنقدر ملاحظاتك ونعمل على تحسين تجربة الوصول بشكل مستمر.'
                : 'We appreciate your feedback and are committed to continuously improving accessibility.'}
            </p>
          </section>

          {/* Disclaimer */}
          <section className="border-t border-[#1a2540] pt-8 pb-16">
            <p className="text-[#8b98ad] text-sm">
              {isAr
                ? 'آخر تحديث: 2026-09-03 — يتم تحديث بيان إمكانية الوصول هذا بانتظام مع تحسيناتنا المستمرة.'
                : 'Last Updated: 2026-09-03 — This accessibility statement is regularly updated as we continue to make improvements.'}
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
