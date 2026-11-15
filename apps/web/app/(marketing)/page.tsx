import type { Metadata } from 'next';

import CtaSection from '@/components/marketing/cta-section';
import HomeFaq, { HOME_FAQS } from '@/components/marketing/home/home-faq';
import HomeFeatures from '@/components/marketing/home/home-features';
import HomeHero from '@/components/marketing/home/home-hero';
import HomeHowItWorks from '@/components/marketing/home/home-how-it-works';
import HomePreview from '@/components/marketing/home/home-preview';
import HomeRoleSummary from '@/components/marketing/home/home-role-summary';
import JsonLd from '@/components/marketing/json-ld';
import { PRICING_PLANS } from '@/components/marketing/pricing/plans-data';
import {
  AppointmentsShot,
  BookingShot,
} from '@/components/marketing/product-ui/shots';
import { buildPageMetadata, faqPageSchema, JSONLD_URLS } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';

/**
 * تفکیک عمدیِ نیتِ جست‌وجو (اصلاح هم‌نوع‌خواری کلیدواژه)
 * -------------------------------------------------------
 * پیش‌تر این صفحه و `/online-provider-booking` هر دو با
 * «رزرو آنلاین آرایشگاه» شروع می‌شدند و برای یک عبارت رقابت می‌کردند.
 * اکنون صفحهٔ اصلی با «نرم افزار مدیریت آرایشگاه» (نیتِ صاحب سالن — همان
 * مخاطبی که امروز درآمد می‌سازد) شروع می‌شود و صفحهٔ رزرو، نیتِ مشتری را
 * نگه می‌دارد.
 *
 * توجه: H1 صفحهٔ اصلی عمداً دست‌نخورده مانده است چون متنِ محصول است و
 * کلیدِ تعویضِ مخاطب (آرایشگر/مشتری) در هیرو به آن وابسته است؛ تغییر آن یک
 * تصمیم پیام‌رسانی است، نه یک اصلاح فنی.
 */
export const metadata: Metadata = buildPageMetadata({
  title: 'نرم افزار مدیریت آرایشگاه و نوبت دهی آنلاین',
  absoluteTitle: 'منشیم | نرم افزار مدیریت آرایشگاه و نوبت دهی آنلاین',
  description:
    'نرم افزار مدیریت آرایشگاه منشیم: تقویم هوشمند نوبت‌ها، پرونده و باشگاه مشتریان، یادآوری پیامکی و کیف پول؛ به‌همراه فهرست آرایشگاه‌ها و رزرو آنلاین برای مشتریان.',
  path: siteConfig.routes.home,
});

const planPricesInRial = PRICING_PLANS.map(plan => plan.monthlyPrice * 10);

const homeJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${JSONLD_URLS.home}#webpage`,
    url: JSONLD_URLS.home,
    name: 'نرم افزار مدیریت آرایشگاه و نوبت دهی آنلاین | منشیم',
    description:
      'ابزار مدیریت نوبت، مشتری و مالی برای سالن‌داران و فهرست آرایشگاه‌های تأییدشده برای رزرو آنلاین مشتریان.',
    inLanguage: 'fa-IR',
    isPartOf: { '@id': `${siteConfig.url}/#website` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${JSONLD_URLS.home}#application`,
    name: 'منشیم',
    alternateName: siteConfig.nameEn,
    url: JSONLD_URLS.home,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    inLanguage: 'fa-IR',
    description:
      'سامانهٔ رزرو آنلاین آرایشگاه برای مشتریان و مدیریت نوبت، خدمات، پیامک و امور مالی سالن برای آرایشگران.',
    publisher: { '@id': `${siteConfig.url}/#organization` },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'IRR',
      lowPrice: Math.min(...planPricesInRial),
      highPrice: Math.max(...planPricesInRial),
      offerCount: PRICING_PLANS.length,
      url: JSONLD_URLS.pricing,
    },
    featureList: [
      'مدیریت نوبت‌های سالن',
      'مدیریت خدمات و ساعات کاری',
      'پرونده و گروه‌بندی مشتریان',
      'یادآوری پیامکی',
      'مدیریت پرداخت‌ها و کیف پول',
      'صفحهٔ عمومی سالن برای مشاهده و رزرو خدمات',
    ],
  },
  faqPageSchema(HOME_FAQS),
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeJsonLd} />
      {/* اسکرین‌شات‌ها سمت سرور رندر می‌شوند و به‌عنوان prop به Hero کلاینت می‌روند */}
      <HomeHero
        barberShot={
          <AppointmentsShot className="mx-auto max-w-lg lg:max-w-none" />
        }
        customerShot={
          <BookingShot className="mx-auto w-[17.5rem] lg:w-[19rem]" />
        }
      />
      <HomeRoleSummary />
      {/*
        سکشن‌های زیر fold با کلاس `below-fold-section` (تعریف‌شده در
        globals.css) رندر اولیه را به تعویق می‌اندازند؛ این کار کار
        layout/paint را بدون تغییر ظاهر کاهش می‌دهد. روی LCP (Hero)
        اعمال نمی‌شود.
      */}
      <div id="features" className="scroll-mt-32 below-fold-section">
        <HomeFeatures />
      </div>
      <div className="below-fold-section">
        <HomeHowItWorks />
      </div>
      <div className="below-fold-section">
        <HomePreview />
      </div>
      <div className="below-fold-section">
        <HomeFaq />
      </div>
      <div className="below-fold-section">
        <CtaSection
          title="سالن خودتان را آنلاین کنید"
          description="خدمات و ساعات کاری را مشخص کنید و لینک رزرو سالن را با مشتریانتان به اشتراک بگذارید."
        />
      </div>
    </>
  );
}
