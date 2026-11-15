'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

import {
  ANALYTICS_PATH_MASKS,
  ANALYTICS_SECRET_QUERY_PARAMS,
  markAnalyticsReady,
} from '@/lib/analytics';
import { requiresAuth } from '@/lib/route-access';

const GA_ID = 'G-KXZ735QXG9';
const CLARITY_ID = 'ymyycjeoqr';

/**
 * گِیتِ بارگذاری ابزارهای آنالیتیکس.
 *
 * چرا گیت داریم (و چرا حفظ شد)
 * ----------------------------
 * `lazyOnload` اسکریپت‌ها را بعد از رویداد `load` اجرا می‌کند و Clarity در همان
 * لحظه از DOM اسنپ‌شات می‌گیرد؛ یعنی یک ابزار شخص ثالث پیش از هر تعاملِ کاربر،
 * تصویری از صفحهٔ او (که ممکن است صفحهٔ خصوصی باشد) به سرور خودش می‌فرستاد.
 * گیت تعاملی این کار را تا اولین تعامل عقب می‌اندازد.
 *
 * چه چیزی تغییر کرد (و چرا)
 * ------------------------
 * ایرادِ نسخهٔ قبل این بود که **همه‌چیز** پشت تعامل قفل بود؛ نتیجه: بازدیدکننده‌ای
 * که از گوگل می‌آمد، صفحه را می‌خواند و می‌رفت (بدون کلیک/اسکرول) هیچ‌جا شمرده
 * نمی‌شد. یعنی دقیقاً همان ترافیکی که ارزشِ سئو را می‌سازد، در GA4 نامرئی بود.
 *
 * اکنون دو ابزار، دو سیاست جدا دارند:
 *
 *   • **GA4** (فقط شمارش، بدون ضبط DOM): در صفحه‌های عمومی پس از ۳ ثانیه هم
 *     بدون تعامل بارگذاری می‌شود؛ در صفحه‌های خصوصی همان گیت تعاملی (۲۰ ثانیه)
 *     باقی می‌ماند.
 *   • **Clarity** (ضبط نشست و DOM): فقط با تعاملِ واقعی کاربر (یا ۲۰ ثانیه
 *     fallback) و **هرگز در صفحه‌های خصوصی** بارگذاری نمی‌شود.
 *
 * سیگنال‌های DNT/GPC در `lib/analytics.ts` نیز رعایت می‌شوند و رویدادها فقط
 * پس از آماده‌شدن گیت به شبکه می‌روند.
 */
/** اسکریپتِ پاک‌سازیِ آدرس، مستقیماً از همان ثابت‌های `lib/analytics.ts`. */
const SANITIZER_SOURCE = `
              var masks = ${JSON.stringify(ANALYTICS_PATH_MASKS)};
              var secretParams = ${JSON.stringify(ANALYTICS_SECRET_QUERY_PARAMS)};
              var cleanUrl = new URL(window.location.href);
              try {
                for (var i = 0; i < masks.length; i += 1) {
                  var re = new RegExp(masks[i].pattern);
                  if (re.test(cleanUrl.pathname)) {
                    cleanUrl.pathname = cleanUrl.pathname.replace(re, masks[i].replacement);
                    break;
                  }
                }
                for (var j = 0; j < secretParams.length; j += 1) {
                  cleanUrl.searchParams.delete(secretParams[j]);
                }
              } catch (e) {
                /* اگر پاک‌سازی شکست خورد، صفحه اصلاً اندازه‌گیری نمی‌شود. */
                cleanUrl = null;
              }
              if (!cleanUrl) return;
              var pageLocation = cleanUrl.toString();
`;

const INTERACTION_EVENTS: Array<keyof DocumentEventMap> = [
  'pointerdown',
  'pointermove',
  'keydown',
  'scroll',
  'touchstart',
];

/** صفحهٔ عمومی: اندازه‌گیریِ ترافیک ورودی حتی بدون تعامل. */
const PUBLIC_GA_TIMEOUT_MS = 3_000;
/** صفحهٔ خصوصی و Clarity: همان رفتار محافظه‌کارانهٔ قبلی. */
const FALLBACK_TIMEOUT_MS = 20_000;

export default function AnalyticsGate() {
  const pathname = usePathname();
  const isPrivateRoute = requiresAuth(pathname);

  const [gaEnabled, setGaEnabled] = useState(false);
  const [clarityEnabled, setClarityEnabled] = useState(false);
  const interactedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onInteraction = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;
      INTERACTION_EVENTS.forEach(event =>
        window.removeEventListener(event, onInteraction, {
          passive: true,
        } as AddEventListenerOptions),
      );
      setGaEnabled(true);
      // Clarity فقط روی صفحه‌های عمومی؛ صفحهٔ خصوصی/حساب هرگز ضبط نمی‌شود.
      if (!isPrivateRoute) setClarityEnabled(true);
    };

    INTERACTION_EVENTS.forEach(event =>
      window.addEventListener(event, onInteraction, {
        passive: true,
      } as AddEventListenerOptions),
    );

    // GA4: روی صفحهٔ عمومی حتی بدون تعامل هم شمرده می‌شود.
    const gaTimer = window.setTimeout(
      () => setGaEnabled(true),
      isPrivateRoute ? FALLBACK_TIMEOUT_MS : PUBLIC_GA_TIMEOUT_MS,
    );

    // Clarity همیشه محافظه‌کارانه می‌ماند.
    const clarityTimer = isPrivateRoute
      ? null
      : window.setTimeout(() => setClarityEnabled(true), FALLBACK_TIMEOUT_MS);

    return () => {
      INTERACTION_EVENTS.forEach(event =>
        window.removeEventListener(event, onInteraction, {
          passive: true,
        } as AddEventListenerOptions),
      );
      window.clearTimeout(gaTimer);
      if (clarityTimer !== null) window.clearTimeout(clarityTimer);
    };
  }, [isPrivateRoute]);

  // کمربند ایمنی: اگر `onReady` اسکریپت دیر برسد، صف رویدادها بالاخره خالی
  // می‌شود. `markAnalyticsReady` تا وقتی `gtag` واقعاً موجود نباشد کاری نمی‌کند،
  // پس فراخوانی تکراری بی‌خطر است.
  useEffect(() => {
    if (!gaEnabled) return;
    const retry = window.setTimeout(() => markAnalyticsReady(), 1_500);
    return () => window.clearTimeout(retry);
  }, [gaEnabled]);

  return (
    <>
      {gaEnabled && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script
            id="google-analytics"
            strategy="afterInteractive"
            // صفِ رویدادهای ثبت‌شده پیش از آماده‌شدن گیت، همین‌جا خالی می‌شود.
            onReady={() => markAnalyticsReady()}
          >
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;

              gtag('js', new Date());

              (function () {
                ${SANITIZER_SOURCE}
                // ارسالِ خودکارِ page_view خاموش است تا آدرسِ حاویِ توکن هرگز
                // به گوگل نرود؛ صفحه با آدرسِ پاک‌شده و دستی ثبت می‌شود.
                gtag('config', '${GA_ID}', { send_page_view: false });
                gtag('set', { page_location: pageLocation });
                gtag('event', 'page_view', {
                  page_location: pageLocation,
                  page_title: document.title,
                });
              })();
            `}
          </Script>
        </>
      )}

      {clarityEnabled && (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);
              t.async=1;
              t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];
              y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_ID}");
          `}
        </Script>
      )}
    </>
  );
}
