import { isAr } from '../i18n'
import { RadarMark } from '../sections/Header'

export default function Accessibility() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-void)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <header className="border-b px-5 py-8" style={{ borderColor: 'var(--color-void-raised)' }}>
        <div className="mx-auto max-w-4xl">
          <a href={isAr ? '/ar' : '/'} className="inline-flex items-center gap-2 transition-colors mb-6 hover:opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>←</span>
            <span className="font-mono2 text-[12px] tracking-[0.1em] uppercase">
              {isAr ? 'العودة إلى الرئيسية' : 'Back to Home'}
            </span>
          </a>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {isAr ? 'إمكانية الوصول' : 'Accessibility'}
          </h1>
          <p className="max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
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
          <section className="rounded-lg p-8" style={{ borderColor: 'var(--color-void-raised)', backgroundColor: 'var(--color-surface-elevated)', border: `1px solid var(--color-void-raised)` }}>
            <div className="flex items-start gap-4 mb-6">
              <RadarMark size={32} />
              <div>
                <h2 className="text-xl font-bold mb-2">
                  {isAr ? 'معايير الوصول' : 'Conformance Statement'}
                </h2>
                <p className="font-mono2 text-[12px] tracking-[0.1em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>
                  WCAG 2.1 Level AA
                </p>
              </div>
            </div>
            <div className="space-y-4" style={{ color: 'var(--color-text-secondary)' }}>
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
              <div className="rounded-lg p-6" style={{ borderColor: 'var(--color-void-raised)', backgroundColor: 'var(--color-surface-elevated)', border: `1px solid var(--color-void-raised)` }}>
                <h3 className="font-bold mb-2">
                  {isAr ? 'لوحة الألوان لعسر اللون (Color-Blindness)' : 'Color-Blind Palette'}
                </h3>
                <p className="mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                  {isAr
                    ? 'الأخضر والأحمر المستخدمان في الحالات الإيجابية/السلبية قد يكونان صعبي التمييز للمستخدمين ذوي عمى الألوان الأحمر-الأخضر (8% من الذكور).'
                    : 'The green and red colors used for positive/negative states may be difficult to distinguish for users with red-green color blindness (8% of males).'}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {isAr
                    ? 'التخفيف: جميع الحالات الدلالية مصحوبة بأيقونات وأيقونات نصية ('
                    : 'Mitigation: All semantic states are accompanied by icons and text labels ('}
                  <code className="px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-void-950)', color: 'var(--color-neon-cyan)' }}>✓</code>
                  {isAr ? '، ' : ', '}
                  <code className="px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-void-950)', color: 'var(--color-neon-cyan)' }}>⚠</code>
                  {isAr ? '، ' : ', '}
                  <code className="px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-void-950)', color: 'var(--color-neon-cyan)' }}>✕</code>
                  {isAr ? ')، لذا لا تعتمد الفهم على اللون وحده.' : '), so comprehension does not depend on color alone.'}
                </p>
              </div>

              <div className="rounded-lg p-6" style={{ borderColor: 'var(--color-void-raised)', backgroundColor: 'var(--color-surface-elevated)', border: `1px solid var(--color-void-raised)` }}>
                <h3 className="font-bold mb-2">
                  {isAr ? 'الرموز منخفضة الشفافية' : 'Low-Opacity Decorative Elements'}
                </h3>
                <p style={{ color: 'var(--color-text-secondary)' }}>
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
            <div className="space-y-3" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="flex items-center gap-3">
                <kbd className="px-3 py-2 rounded font-mono2" style={{ backgroundColor: 'var(--color-void-raised)', color: 'var(--color-neon-cyan)' }}>Tab</kbd>
                <span>{isAr ? 'الانتقال بين العناصر التفاعلية' : 'Navigate between interactive elements'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="px-3 py-2 rounded font-mono2" style={{ backgroundColor: 'var(--color-void-raised)', color: 'var(--color-neon-cyan)' }}>Shift + Tab</kbd>
                <span>{isAr ? 'الانتقال للخلف بين العناصر' : 'Navigate backwards between elements'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="px-3 py-2 rounded font-mono2" style={{ backgroundColor: 'var(--color-void-raised)', color: 'var(--color-neon-cyan)' }}>Enter</kbd>
                <span>{isAr ? 'تفعيل الأزرار والروابط' : 'Activate buttons and links'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="px-3 py-2 rounded font-mono2" style={{ backgroundColor: 'var(--color-void-raised)', color: 'var(--color-neon-cyan)' }}>Escape</kbd>
                <span>{isAr ? 'إغلاق الحوارات والقوائم المنسدلة' : 'Close dialogs and dropdowns'}</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="px-3 py-2 rounded font-mono2" style={{ backgroundColor: 'var(--color-void-raised)', color: 'var(--color-neon-cyan)' }}>↑ / ↓</kbd>
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
              <div className="rounded-lg p-6" style={{ borderColor: 'var(--color-void-raised)', backgroundColor: 'var(--color-surface-elevated)', border: `1px solid var(--color-void-raised)` }}>
                <h3 className="font-bold mb-3">
                  {isAr ? 'معايير HTML' : 'HTML Standards'}
                </h3>
                <ul className="space-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <li>• Semantic HTML5 tags</li>
                  <li>• ARIA labels &amp; roles</li>
                  <li>• Proper heading hierarchy</li>
                  <li>• Alternative text for images</li>
                </ul>
              </div>
              <div className="rounded-lg p-6" style={{ borderColor: 'var(--color-void-raised)', backgroundColor: 'var(--color-surface-elevated)', border: `1px solid var(--color-void-raised)` }}>
                <h3 className="font-bold mb-3">
                  {isAr ? 'تقنيات CSS & JS' : 'CSS & JS Techniques'}
                </h3>
                <ul className="space-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <li>• Focus ring indicators (2px solid)</li>
                  <li>• Sufficient touch targets (44×44px min)</li>
                  <li>• Logical CSS properties (RTL-safe)</li>
                  <li>• DOMPurify sanitization</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Feedback & Contact */}
          <section className="pt-8" style={{ borderTopColor: 'var(--color-void-raised)', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
            <h2 className="text-xl font-bold mb-4">
              {isAr ? 'الملاحظات والمساعدة' : 'Feedback & Support'}
            </h2>
            <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              {isAr
                ? 'إذا واجهت أي مشاكل في إمكانية الوصول أو كان لديك اقتراحات لتحسينات، يرجى التواصل بنا:'
                : 'If you encounter any accessibility issues or have suggestions for improvements, please contact us:'}
            </p>
            <div className="flex items-center gap-3 rounded-lg p-6 w-fit" style={{ backgroundColor: 'var(--color-surface-elevated)', borderColor: 'var(--color-void-raised)', border: `1px solid var(--color-void-raised)` }}>
              <span style={{ color: 'var(--color-neon-cyan)' }}>✉</span>
              <a href="mailto:i@flygaca.com" className="font-mono2 text-[12px] tracking-[0.1em] transition-colors" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                i@flygaca.com
              </a>
            </div>
            <p className="text-sm mt-4" style={{ color: 'var(--color-text-secondary)' }}>
              {isAr
                ? 'سنقدر ملاحظاتك ونعمل على تحسين تجربة الوصول بشكل مستمر.'
                : 'We appreciate your feedback and are committed to continuously improving accessibility.'}
            </p>
          </section>

          {/* Disclaimer */}
          <section className="pt-8 pb-16" style={{ borderTopColor: 'var(--color-void-raised)', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
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
