'use client';

import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Copy,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Link2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import AppCard from '@/components/shared/app-card';
import { Badge } from '@/components/ui/badge';
import { cn, toPersianDigits } from '@/lib/utils';

const FEATURES = [
  {
    icon: Search,
    title: 'در گوگل پیدا می‌شوید',
    description:
      'صفحهٔ شما برای موتورهای جستجو بهینه (SEO) می‌شود: عنوان، توضیحات، تصویر و داده‌های ساختاریافته (Schema.org) دارد؛ پس وقتی کسی «آرایشگاه + محله/شهر شما» را در گوگل جستجو کند، می‌تواند به صفحهٔ شما برسد.',
  },
  {
    icon: Link2,
    title: 'آدرس اختصاصی و ثابت',
    description:
      'به‌جای یک شناسهٔ عددیِ طولانی، یک آدرس خوانا و کوتاه دارید که پایینش با اسلاگ خودتان ساخته می‌شود. همین آدرس را در اینستاگرام، بایو، کارت ویزیت و پیامک می‌گذارید.',
  },
  {
    icon: CalendarCheck,
    title: 'رزرو آنلاین ۲۴ ساعته',
    description:
      'مشتری بدون تماس تلفنی و بدون نصب اپلیکیشن، از روی همان صفحه ساعت خالی را می‌بیند و نوبت می‌گیرد — حتی نیمه‌شب که سالن بسته است.',
  },
  {
    icon: ImageIcon,
    title: 'ویترین نمونه‌کار و خدمات',
    description:
      'تصویر سالن، نمونه‌کارها، فهرست خدمات همراه با قیمت و مدت‌زمان، نشانی و موقعیت؛ همه در یک صفحهٔ مرتب و موبایل‌پسند.',
  },
  {
    icon: Star,
    title: 'امتیاز و نظرات واقعی',
    description:
      'امتیاز و نظرات واقعیِ مشتریان روی صفحه نمایش داده می‌شود و همان داده در نتایج گوگل هم به‌صورت ستاره دیده می‌شود؛ اعتماد مشتری تازه را می‌سازد.',
  },
  {
    icon: TrendingUp,
    title: 'قابل اندازه‌گیری',
    description:
      'بازدید صفحه و کلیک روی دکمهٔ رزرو ثبت می‌شود تا بدانید صفحه چقدر مشتری می‌آورد و کدام بخش را باید بهتر کنید.',
  },
] as const;

const STEPS = [
  {
    title: 'اشتراک فعال می‌شود',
    description:
      'هر آرایشگر بعد از ثبت‌نام، یک ماه رایگان دارد. بعد از آن با یکی از پلن‌های ماهانه یا سه‌ماهه تمدید می‌کنید.',
  },
  {
    title: 'اسلاگ را انتخاب می‌کنید',
    description:
      'یک‌بار عبارت دلخواه (مثل نام سالن) را ثبت می‌کنید. این انتخاب قطعی است و بعد از ثبت تغییر نمی‌کند.',
  },
  {
    title: 'صفحه در دسترس عموم قرار می‌گیرد',
    description:
      'به‌محض تأیید پروفایل توسط ادمین، صفحه برای همه قابل مشاهده، قابل جستجو و قابل رزرو می‌شود.',
  },
] as const;

const FAQ = [
  {
    question: 'اگر اشتراکم تمام شود چه اتفاقی می‌افتد؟',
    answer:
      'صفحه به‌صورت موقت از دسترس عموم خارج می‌شود، اما اسلاگ، آدرس و همهٔ داده‌های شما (عکس، نمونه‌کار، نظرات) محفوظ می‌ماند. با تمدید، همان آدرس قبلی دوباره فعال می‌شود و نیازی به ساخت صفحهٔ جدید نیست.',
  },
  {
    question: 'آیا آدرس صفحه بعداً قابل تغییر است؟',
    answer:
      'نه. اسلاگ فقط یک بار ثبت می‌شود تا آدرس شما در گوگل و لینک‌هایی که مشتریان به اشتراک گذاشته‌اند نشکند. پس با دقت انتخابش کنید.',
  },
  {
    question: 'چه چیزی صفحهٔ من را در گوگل بالا می‌آورد؟',
    answer:
      'محتوای واقعی و کامل: بیوگرافی نوشته‌شده، نمونه‌کارهای باکیفیت، خدمات با قیمت و مدت‌زمان، و نشانی دقیق. صفحه‌های ناقص در گوگل کم‌ارزش دیده می‌شوند. نظرات و لینک‌هایی که دیگران به صفحهٔ شما می‌دهند هم اثر دارند.',
  },
  {
    question: 'مشتری برای رزرو باید ثبت‌نام کند؟',
    answer:
      'خیر. مشاهدهٔ صفحه و رزرو برای مشتری بدون ورود به سامانه و بدون نصب اپ انجام می‌شود؛ همین موضوع نرخ تبدیل را بالا می‌برد.',
  },
] as const;

interface PublicPageExplainerProps {
  /** آدرس عمومی صفحه (اگر فعال و اسلاگ ثبت شده باشد) برای نمونهٔ زنده. */
  publicUrl?: string;
  isActive?: boolean;
  className?: string;
}

/**
 * توضیح کامل و قابل‌فهم «صفحهٔ اختصاصی» برای آرایشگر.
 *
 * چرا این کامپوننت؟
 * پیش از این بالای بخش پلن‌ها فقط یک جملهٔ کوتاه بود و آرایشگر دقیقاً
 * نمی‌دانست این صفحه چیست، چه کاری می‌کند، چه ویژگی‌هایی دارد و پول برای
 * چه چیزی می‌دهد. متن‌ها عمداً به زبان کسب‌وکار نوشته شده‌اند (نه اصطلاح
 * فنی) و هر ادعا با قابلیتِ واقعیِ صفحهٔ `/provider/[slug]` هم‌خوان است:
 * متادیتای سئوشده، JSON-LD (بیزینس + امتیاز + خدمات + بردکرامب)، رزرو
 * بدون ورود، نمونه‌کار و نظرات.
 */
export function PublicPageExplainer({
  publicUrl,
  isActive = false,
  className,
}: PublicPageExplainerProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // دسترسی به کلیپ‌بورد ممکن است مسدود باشد
    }
  };

  return (
    <AppCard className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-2 text-primary">
            <Sparkles size={17} />
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">
              صفحهٔ اختصاصی آرایشگاه شما چیست؟
            </h2>
            <p className="text-xs text-muted-foreground">
              یک صفحهٔ عمومی، سئوشده و قابل رزرو — مثل یک وب‌سایت شخصی، بدون
              هزینهٔ ساخت و نگهداری
            </p>
          </div>
        </div>

        {isActive ? (
          <Badge className="gap-1 bg-emerald-100 text-emerald-700">
            <BadgeCheck size={13} /> فعال
          </Badge>
        ) : (
          <Badge variant="secondary">غیرفعال</Badge>
        )}
      </div>

      <p className="text-sm leading-7 text-muted-foreground">
        صفحهٔ اختصاصی، همان صفحه‌ای است که مشتری با آدرس اختصاصی شما یا از طریق
        جستجوی گوگل باز می‌کند. این صفحه مستقل از داشبورد است: هیچ ورودی ندارد،
        در موبایل سریع باز می‌شود و همه‌چیز مشتری در یک نگاه جلوی چشمش است. نام
        سالن، عکس، نمونه‌کار، خدمات و قیمت‌ها، نشانی روی نقشه، امتیاز و نظرات، و
        دکمهٔ رزرو آنلاین — بدون تماس تلفنی.
      </p>

      {/* نمونهٔ زندهٔ آدرس */}
      {publicUrl ? (
        <div className="rounded-2xl border border-primary/20 bg-primary-2/40 p-3">
          <p className="text-[11px] font-bold text-muted-foreground">
            همین حالا صفحهٔ شما با این آدرس باز می‌شود
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p
              dir="ltr"
              className="min-w-0 flex-1 truncate text-left text-xs font-bold text-gray-900"
            >
              {publicUrl}
            </p>
            <div className="flex gap-1.5">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary"
              >
                <ExternalLink size={12} /> بازکردن
              </a>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary"
              >
                <Copy size={12} /> {copiedUrl ? 'کپی شد' : 'کپی لینک'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-3 text-xs leading-6 text-muted-foreground">
          {isActive
            ? 'اشتراک شما فعال است؛ بعد از ثبت اسلاگ، آدرس اختصاصی و نمونهٔ زندهٔ صفحه همین‌جا نمایش داده می‌شود.'
            : 'هنوز این صفحه فعال نیست. با فعال‌کردن اشتراک، آدرس اختصاصی شما ساخته می‌شود و همین‌جا نمایش داده می‌شود.'}
        </div>
      )}

      {/* ویژگی‌ها */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-black text-gray-900">
          <Store size={15} className="text-primary" />
          چه چیزهایی داخل این صفحه هست؟
        </h3>

        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map(feature => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-gray-50/60 p-3"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-gray-100">
                  <Icon size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-gray-800">
                    {feature.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-6 text-gray-500">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* چطور کار می‌کند */}
      <div className="rounded-2xl border border-gray-100 p-3">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-black text-gray-900">
          <Globe size={15} className="text-primary" />
          چطور راه می‌افتد؟
        </h3>

        <ol className="space-y-2.5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white">
                {toPersianDigits(index + 1)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-gray-800">{step.title}</p>
                <p className="mt-0.5 text-[11px] leading-6 text-gray-500">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* چه چیزی به شما می‌رسد */}
      <div className="grid gap-2 sm:grid-cols-3">
        <InsightTile
          icon={Users}
          label="مشتری تازه"
          value="از گوگل و لینک اینستاگرام"
        />
        <InsightTile
          icon={CalendarCheck}
          label="رزرو بدون تماس"
          value="۲۴ ساعته، بدون ثبت‌نام"
        />
        <InsightTile
          icon={ShieldCheck}
          label="هزینهٔ ساخت"
          value="صفر — آماده"
        />
      </div>

      {/* پرسش‌های رایج */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
          <BookOpen size={15} className="text-primary" />
          پرسش‌های رایج
        </h3>

        {FAQ.map(item => (
          <details
            key={item.question}
            className="group rounded-2xl border border-gray-100 bg-white px-3 py-2.5"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-black text-gray-800">
              {item.question}
              <ArrowUpRight
                size={14}
                className="shrink-0 text-gray-300 transition group-open:rotate-90"
              />
            </summary>
            <p className="mt-2 text-[11px] leading-6 text-gray-500">
              {item.answer}
            </p>
          </details>
        ))}
      </div>

      <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50/70 p-3 text-[11px] leading-6 text-amber-800">
        <MapPin size={14} className="mt-1 shrink-0" />
        <span>
          مهم: کیفیت این صفحه به محتوای واقعیِ پروفایل شما بستگی دارد. بیوگرافی
          نوشته‌شده، حداقل چند نمونه‌کار و خدمات با قیمت و مدت‌زمان، شانس دیده
          شدن در گوگل را چند برابر می‌کند.
        </span>
      </p>
    </AppCard>
  );
}

function InsightTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center gap-1.5 text-primary">
        <Icon size={14} />
        <span className="text-[11px] font-black">{label}</span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-gray-500">{value}</p>
    </div>
  );
}
