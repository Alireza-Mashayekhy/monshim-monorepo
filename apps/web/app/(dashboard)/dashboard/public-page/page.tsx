// app/(dashboard)/public-page/page.tsx
'use client';

import {
  AlertCircle,
  BadgeCheck,
  Check,
  CheckCircle2,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Lock,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import DashboardShell from '@/components/dashboard/layout/dashboard-shell';
import { PublicPageExplainer } from '@/components/dashboard/public-page/public-page-explainer';
import AppCard from '@/components/shared/app-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import FadeIn from '@/components/shared/fade-in';
import PageHeader from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { revalidateMyPublicBarberPage } from '@/lib/actions/public-page';
import { trackEventOnce } from '@/lib/analytics';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  MAX_PUBLIC_PAGE_SLUG_LENGTH,
  sanitizePublicPageSlugInput,
  validatePublicPageSlug,
} from '@/lib/public-page-slug';
import { siteConfig } from '@/lib/site-config';
import { remainingSubscriptionDays } from '@/lib/subscription';
import { formatFaNumber, toPersianDigits } from '@/lib/utils';
import { usePayPublicPage } from '@/services/features/payment/hooks';
import {
  useCheckPublicPageSlug,
  useMyPublicPageStatus,
  usePublicPagePlans,
  useUpdatePublicPageSlug,
} from '@/services/features/public-page/hooks';

const URL_HOST_PREFIX = `${siteConfig.url.replace(/^https?:\/\//, '')}/provider/`;

/**
 * آستانهٔ هشدار «اشتراک در حال پایان است» — باید با
 * `PUBLIC_PAGE_EXPIRING_REMINDER_DAYS` در بک‌اند
 * (`apps/api/src/notification/sms-templates.ts`) یکی باشد، چون همان عدد
 * متن پیامک «۷ روز مانده» (قالب ۹۲۵۸۰۶) را تعیین می‌کند.
 */
const EXPIRY_WARNING_DAYS = 7;

const SUBSCRIPTION_TICK_MS = 60_000;
let subscriptionNowTick = Math.floor(Date.now() / SUBSCRIPTION_TICK_MS);

function subscribeSubscriptionNow(onChange: () => void) {
  const id = setInterval(() => {
    subscriptionNowTick = Math.floor(Date.now() / SUBSCRIPTION_TICK_MS);
    onChange();
  }, SUBSCRIPTION_TICK_MS);

  return () => clearInterval(id);
}

function getSubscriptionNowSnapshot() {
  return subscriptionNowTick;
}

function getSubscriptionNowServerSnapshot() {
  return subscriptionNowTick;
}

/**
 * «اکنون» برای محاسبهٔ اعتبار باقی‌ماندهٔ اشتراک.
 *
 * مثل `useNow` صفحهٔ اشتراک: `useSyncExternalStore` با یک تیک دقیقه‌ای تا
 * رندر سمت سرور و کلاینت یکی بماند و مقدار فقط هر دقیقه به‌روز شود.
 */
function useSubscriptionNow() {
  return useSyncExternalStore(
    subscribeSubscriptionNow,
    getSubscriptionNowSnapshot,
    getSubscriptionNowServerSnapshot,
  );
}

/**
 * صفحهٔ اختصاصی (عمومی) آرایشگاه در داشبورد.
 *
 * صفحهٔ عمومی با آدرس `/provider/[slug]` فقط با اشتراک فعال «پروفایل
 * اختصاصی» فعال می‌شود (دورهٔ رایگان پس از ثبت‌نام، مهلت انتقالی خریداران
 * قبلی یا پلن تمدید پولی). مسیرهای دائمی قبلی (خرید یک‌بارهٔ پکیج و حد نصاب
 * رزرو) حذف شده‌اند.
 *
 * پس از فعال‌سازی، آرایشگر باید یک اسلاگ یکتا انتخاب کند تا به‌جای شناسهٔ عددی
 * در آدرس عمومی سالن نمایش داده شود.
 */
export default function PublicPagePage() {
  const [copied, setCopied] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: statusData, isLoading, isError, refetch } =
    useMyPublicPageStatus();
  const { data: plansData, isLoading: isLoadingPlans } = usePublicPagePlans();
  const payPublicPage = usePayPublicPage();
  const updateSlug = useUpdatePublicPageSlug();

  const status = statusData?.data;
  const plans = plansData?.data ?? [];
  const isActive = Boolean(status?.isActive);
  const isPubliclyHidden = status?.isPubliclyVisible === false;
  const currentSlug = status?.slug ?? null;
  const publicUrl = status?.publicUrl ?? '';
  const subscription = status?.subscription ?? null;
  const lastSubscription = status?.lastSubscription ?? null;
  const nowMs = useSubscriptionNow() * SUBSCRIPTION_TICK_MS;

  const subscriptionRemainingDays = remainingSubscriptionDays(
    subscription?.endDate,
    nowMs,
  );
  /**
   * پلن‌های تمدید همیشه نمایش داده می‌شوند چون تنها مسیر فعال‌سازی همین
   * اشتراک است (چه صفحه فعال باشد تا تمدید، چه غیرفعال تا فعال‌سازی دوباره).
   */
  const showRenewalPlans = true;

  // اسلاگ فقط یک بار ثبت می‌شود: بعد از ثبت، فرم انتخاب اسلاگ دیگر نمایش داده
  // نمی‌شود و بک‌اند هم هر تلاش برای تغییر را رد می‌کند.
  const isSlugLocked = Boolean(status?.isSlugLocked ?? currentSlug);
  const showSlugForm = isActive && !currentSlug && !isSlugLocked;
  const trimmedDraft = slugDraft.trim();
  const localValidation = validatePublicPageSlug(slugDraft);
  const candidateSlug = localValidation.valid ? localValidation.slug : '';
  const debouncedSlug = useDebounce(candidateSlug, 350);
  const shouldCheckRemote =
    showSlugForm &&
    localValidation.valid &&
    debouncedSlug === localValidation.slug;

  const slugCheck = useCheckPublicPageSlug(debouncedSlug, shouldCheckRemote);
  const isCheckingAvailability =
    showSlugForm &&
    localValidation.valid &&
    (debouncedSlug !== localValidation.slug || slugCheck.isFetching);
  const remoteAvailability = slugCheck.data?.data;

  const canSaveSlug =
    localValidation.valid &&
    !isCheckingAvailability &&
    Boolean(remoteAvailability?.available) &&
    !updateSlug.isPending;

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // دسترسی به کلیپ‌بورد ممکن است مسدود باشد
    }
  };

  // ثبت نهایی فقط بعد از تأیید صریح کاربر در دیالوگ انجام می‌شود.
  const handleSaveSlug = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localValidation.valid) {
      toast.error(localValidation.reason);
      return;
    }
    if (!canSaveSlug) return;
    setIsConfirmOpen(true);
  };

  const handleConfirmSaveSlug = async () => {
    try {
      const response = await updateSlug.mutateAsync(localValidation.slug);
      const savedSlug = response.data?.slug ?? localValidation.slug;
      // لحظه‌ای که صفحه برای اولین بار واقعاً قابل مشاهده می‌شود = انتشار.
      trackEventOnce(
        `profile-published:${savedSlug}`,
        'provider_profile_published',
        {
          activation: 'subscription',
        },
      );
      void revalidateMyPublicBarberPage([currentSlug, savedSlug]);
      setSlugDraft('');
      toast.success('آدرس اختصاصی شما ثبت شد و از این پس قابل تغییر نیست');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'خطا در ثبت اسلاگ'));
      throw error;
    }
  };

  if (isLoading) {
    return (
      <DashboardShell>
        <PageHeader title="صفحهٔ اختصاصی آرایشگاه" />
        <div className="mt-4 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </DashboardShell>
    );
  }

  // اگر خواندن وضعیت ناموفق بود، هرگز «فعال/غیرفعال» حدسی نمایش داده نمی‌شود؛
  // آرایشگر یک خطای روشن با دکمهٔ تلاش دوباره می‌بیند.
  if (isError || !status) {
    return (
      <DashboardShell>
        <PageHeader title="صفحهٔ اختصاصی آرایشگاه" />
        <div className="mt-4 space-y-4">
          <AppCard>
            <div className="flex items-start gap-3">
              <AlertCircle size={22} className="mt-0.5 shrink-0 text-rose-600" />
              <div>
                <h2 className="text-base font-black text-gray-900">
                  دریافت وضعیت صفحهٔ اختصاصی ناموفق بود
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  وضعیت اشتراک و صفحهٔ اختصاصی شما از سرور خوانده نشد؛ برای جلوگیری
                  از نمایش اطلاعات اشتباه، چیزی دربارهٔ فعال یا غیرفعال بودن صفحه
                  نشان داده نمی‌شود. اتصال خود را بررسی کنید و دوباره تلاش کنید.
                </p>
                <Button
                  className="mt-4 gap-1.5"
                  size="sm"
                  onClick={() => void refetch()}
                >
                  تلاش دوباره
                </Button>
              </div>
            </div>
          </AppCard>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageHeader title="صفحهٔ اختصاصی آرایشگاه" />

      <FadeIn>
        <div className="mt-4 space-y-4">
          {/*
            توضیح کامل «صفحهٔ اختصاصی چیست و چه خواصی دارد».
            پیش‌تر فقط یک جملهٔ کوتاه بالای پلن‌ها بود و آرایشگر درک روشنی از
            ارزش این صفحه و تفاوت پلن‌ها نداشت.
          */}
          <PublicPageExplainer
            publicUrl={publicUrl || undefined}
            isActive={isActive}
          />

          <AppCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe size={20} className="text-primary" />
                <h2 className="text-base font-black text-gray-900">
                  وضعیت صفحهٔ عمومی
                </h2>
              </div>
              {isPubliclyHidden ? (
                <Badge variant="secondary">نمایش عمومی غیرفعال</Badge>
              ) : isActive ? (
                <Badge className="gap-1 bg-primary text-white">
                  <BadgeCheck size={13} /> فعال
                </Badge>
              ) : (
                <Badge variant="secondary">غیرفعال</Badge>
              )}
            </div>

            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {!isActive
                ? 'صفحهٔ اختصاصی شما غیرفعال است. با خرید یکی از پلن‌های اشتراک پروفایل اختصاصی فعال می‌شود و سپس می‌توانید اسلاگ دلخواه سالن خود را ثبت کنید.'
                : isPubliclyHidden
                  ? 'امتیاز و آدرس صفحهٔ اختصاصی شما محفوظ است، اما نمایش عمومی سالن توسط مدیریت غیرفعال شده است.'
                  : currentSlug
                    ? 'صفحهٔ اختصاصی شما فعال است؛ مشتریان می‌توانند بدون ورود به سامانه آن را با آدرس اختصاصی شما ببینند و در نتایج جستجو نمایش داده می‌شود. آدرس اختصاصی شما قطعی و غیرقابل تغییر است.'
                    : 'صفحهٔ اختصاصی شما فعال شده است! برای ساخت لینک عمومی و جایگزینی شناسهٔ عددی در آدرس، لطفاً یک اسلاگ یکتا برای سالن خود انتخاب و ثبت کنید.'}
            </p>

            {isPubliclyHidden && (
              <p className="mt-2 text-sm font-medium text-amber-800">
                حساب و دسترسی به پنل برقرار است. برای بررسی وضعیت نمایش با
                پشتیبانی تماس بگیرید.
              </p>
            )}

            {isActive && currentSlug && publicUrl && (
              <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-2/50 p-4">
                <p className="text-xs text-muted-foreground">
                  آدرس اختصاصی صفحهٔ شما
                </p>
                <p
                  dir="ltr"
                  className="mt-1 truncate text-left text-sm font-bold text-gray-900"
                >
                  {publicUrl}
                </p>
                {!isPubliclyHidden && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={publicUrl} target="_blank">
                        <ExternalLink size={14} /> مشاهده صفحه
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopy}>
                      {copied ? <Check size={14} /> : null}
                      {copied ? 'کپی شد' : 'کپی لینک'}
                    </Button>
                  </div>
                )}
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-white/70 p-2.5 text-xs leading-6 text-gray-600">
                  <Lock size={14} className="mt-1 shrink-0 text-gray-400" />
                  <span>
                    آدرس اختصاصی فقط یک بار قابل انتخاب است و پس از ثبت قابل
                    تغییر نیست؛ تغییر آدرس باعث از دست رفتن رتبهٔ صفحهٔ شما در
                    نتایج گوگل می‌شود.
                  </span>
                </p>
              </div>
            )}

            {showSlugForm && (
              <form
                onSubmit={handleSaveSlug}
                className="mt-4 space-y-3 rounded-2xl border border-primary/25 bg-primary-2/40 p-4"
              >
                <div className="flex items-center gap-2">
                  <Link2 size={16} className="text-primary" />
                  <h3 className="text-sm font-black text-gray-900">
                    ثبت اسلاگ آدرس اختصاصی سالن
                  </h3>
                </div>

                <p className="text-xs leading-6 text-muted-foreground">
                  این عبارت به‌جای شناسهٔ عددی در آدرس عمومی صفحهٔ شما نمایش
                  داده می‌شود. فقط از حروف انگلیسی کوچک، اعداد و خط تیره (-)
                  استفاده کنید.
                </p>

                <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-700">
                  <TriangleAlert size={15} className="mt-1 shrink-0" />
                  <span>
                    <strong className="font-black">
                      این انتخاب فقط یک بار انجام می‌شود و قابل برگشت نیست.
                    </strong>{' '}
                    اسلاگ پس از ثبت قفل می‌شود و دیگر امکان تغییر آن از پنل وجود
                    ندارد؛ چون آدرس صفحهٔ شما در گوگل و لینک‌هایی که مشتریان
                    به‌اشتراک گذاشته‌اند به همین آدرس گره می‌خورد.
                  </span>
                </p>

                <div
                  dir="ltr"
                  className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
                >
                  <span className="select-none border-r border-gray-100 bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-500">
                    {URL_HOST_PREFIX}
                  </span>
                  <Input
                    dir="ltr"
                    value={slugDraft}
                    maxLength={MAX_PUBLIC_PAGE_SLUG_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="aria-salon"
                    onChange={e =>
                      setSlugDraft(sanitizePublicPageSlugInput(e.target.value))
                    }
                    className="h-11 rounded-none border-0 bg-transparent px-3 text-left text-sm font-semibold focus-visible:ring-0"
                  />
                </div>

                <div className="min-h-5 text-xs">
                  {!trimmedDraft ? (
                    <span className="text-muted-foreground">
                      نمونهٔ معتبر: aria-salon یا salon-mina-24
                    </span>
                  ) : !localValidation.valid ? (
                    <span className="flex items-center gap-1.5 font-medium text-rose-600">
                      <AlertCircle size={14} className="shrink-0" />
                      {localValidation.reason}
                    </span>
                  ) : isCheckingAvailability ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 size={14} className="shrink-0 animate-spin" />
                      در حال بررسی تکراری نبودن اسلاگ...
                    </span>
                  ) : slugCheck.isError ? (
                    <span className="flex items-center gap-1.5 font-medium text-rose-600">
                      <AlertCircle size={14} className="shrink-0" />
                      خطا در بررسی وضعیت اسلاگ؛ لطفاً دوباره تلاش کنید.
                    </span>
                  ) : remoteAvailability?.available ? (
                    <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                      <CheckCircle2 size={14} className="shrink-0" />
                      {remoteAvailability.reason}
                    </span>
                  ) : remoteAvailability ? (
                    <span className="flex items-center gap-1.5 font-medium text-rose-600">
                      <AlertCircle size={14} className="shrink-0" />
                      {remoteAvailability.reason}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!canSaveSlug}
                    className="gap-1.5"
                  >
                    {updateSlug.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
                    ثبت نهایی اسلاگ و ساخت لینک
                  </Button>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  با زدن این دکمه یک پنجرهٔ تأیید باز می‌شود تا انتخاب نهایی خود
                  را قطعی کنید.
                </p>
              </form>
            )}

            <ConfirmDialog
              open={isConfirmOpen}
              onOpenChange={setIsConfirmOpen}
              title="ثبت قطعی و یک‌بارهٔ آدرس اختصاصی"
              confirmLabel="بله، ثبت کن؛ دیگر تغییر نمی‌دهم"
              cancelLabel="انصراف"
              isPending={updateSlug.isPending}
              onConfirm={handleConfirmSaveSlug}
              description={
                <span className="block space-y-2 text-right">
                  <span className="block">
                    آدرس اختصاصی صفحهٔ شما به این صورت ساخته می‌شود:
                  </span>
                  <span
                    dir="ltr"
                    className="block rounded-lg bg-gray-100 px-2 py-1.5 text-center text-xs font-bold text-gray-800"
                  >
                    {`${URL_HOST_PREFIX}${localValidation.valid ? localValidation.slug : ''}`}
                  </span>
                  <span className="block font-bold text-rose-600">
                    ⚠️ این کار قابل برگشت نیست و فقط یک بار می‌توانید انجامش
                    بدهید.
                  </span>
                  <span className="block">
                    بعد از ثبت، اسلاگ قفل می‌شود و امکان تغییر آن از پنل وجود
                    ندارد؛ آدرس فعلی صفحهٔ شما در گوگل و لینک‌هایی که به‌اشتراک
                    گذاشته‌اید به همین عبارت وابسته می‌شود.
                  </span>
                  <span className="block">
                    اگر مطمئن نیستید، «انصراف» را بزنید و بعداً ثبت کنید.
                  </span>
                </span>
              }
            />

            {isActive && status && !status.isApproved && (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-700">
                پروفایل سالن شما هنوز تایید نشده است. صفحهٔ اختصاصی بلافاصله بعد
                از تایید پروفایل توسط ادمین در دسترس عموم قرار می‌گیرد.
              </p>
            )}

            {status?.reason === 'SUBSCRIPTION' && subscription && (
              <p className="mt-3 text-xs text-muted-foreground">
                پروفایل اختصاصی شما با اشتراک «{subscription.planName}» فعال است
                و تا{' '}
                {toPersianDigits(
                  new Date(subscription.endDate).toLocaleDateString('fa-IR'),
                )}{' '}
                ({toPersianDigits(subscriptionRemainingDays)} روز دیگر) اعتبار
                دارد.
              </p>
            )}

            {/*
              همان هشدار پیامک «۷ روز مانده» — این‌جا هم دیده می‌شود تا اگر
              آرایشگر پیامک را ندید، از داشبورد هم متوجه شود. آستانه از همان
              مقدار بک‌اند (`PUBLIC_PAGE_EXPIRING_REMINDER_DAYS = 7`) می‌آید.
            */}
            {isActive &&
              subscription &&
              subscriptionRemainingDays > 0 &&
              subscriptionRemainingDays <= EXPIRY_WARNING_DAYS && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <strong className="font-black">
                      فقط {toPersianDigits(subscriptionRemainingDays)} روز به
                      پایان اشتراک صفحهٔ اختصاصی مانده است.
                    </strong>{' '}
                    با پایان اعتبار، صفحه از دسترس عموم خارج می‌شود و آسیب به
                    سئوی صفحه وارد می‌شود. برای تمدید، از پلن‌های پایین صفحه
                    استفاده کنید.
                  </span>
                </div>
              )}
          </AppCard>

          {/* اشتراک منقضی‌شده: تاریخ پایان واقعی را نشان دهیم، نه یک وضعیت خالی */}
          {!isActive && lastSubscription && (
            <AppCard>
              <div className="flex items-start gap-3">
                <TriangleAlert size={22} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <h2 className="text-base font-black text-gray-900">
                    اشتراک صفحهٔ اختصاصی شما منقضی شده است
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    اشتراک «{lastSubscription.planName}»
                    {lastSubscription.isFreeTrial ? ' (دورهٔ رایگان)' : ''} در
                    تاریخ{' '}
                    {toPersianDigits(
                      new Date(lastSubscription.endDate).toLocaleDateString(
                        'fa-IR',
                      ),
                    )}{' '}
                    پایان یافت. تا زمانی که اشتراک جدید فعال نشود، صفحهٔ اختصاصی
                    شما در دسترس عموم نیست و در Providers و Sitemap نمایش داده
                    نمی‌شود.
                  </p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    برای فعال‌سازی دوباره، یکی از پلن‌های زیر را انتخاب کنید؛
                    اسلاگ، آدرس و همهٔ محتوای قبلی محفوظ است و چیزی از نو
                    ساخته نمی‌شود.
                  </p>
                </div>
              </div>
            </AppCard>
          )}

          {/* وضعیت اشتراک «پروفایل اختصاصی» (دورهٔ رایگان یا پلن تمدید پولی) */}
          {subscription && (
            <AppCard>
              <div className="flex flex-wrap items-center gap-2">
                <BadgeCheck size={20} className="text-primary" />
                <h2 className="text-base font-black text-gray-900">
                  اشتراک پروفایل اختصاصی
                </h2>
                {subscription.isFreeTrial ? (
                  <Badge variant="secondary">دورهٔ رایگان</Badge>
                ) : (
                  <Badge variant="secondary">پلن پولی</Badge>
                )}
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">پلن</dt>
                  <dd className="font-bold text-gray-900">
                    {subscription.planName}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">تاریخ شروع</dt>
                  <dd className="font-bold text-gray-900">
                    {toPersianDigits(
                      new Date(subscription.startDate).toLocaleDateString(
                        'fa-IR',
                      ),
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">تاریخ پایان</dt>
                  <dd className="font-bold text-gray-900">
                    {toPersianDigits(
                      new Date(subscription.endDate).toLocaleDateString(
                        'fa-IR',
                      ),
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">اعتبار باقی‌مانده</dt>
                  <dd className="font-bold text-gray-900">
                    {toPersianDigits(subscriptionRemainingDays)} روز
                  </dd>
                </div>
              </dl>

              <p className="mt-3 rounded-2xl border border-primary/20 bg-primary-2/40 p-3 text-xs leading-6 text-muted-foreground">
                در پایان این دوره، صفحهٔ اختصاصی شما غیرفعال می‌شود. با تمدید
                اشتراک، مدت اعتبار به زمان باقی‌مانده اضافه می‌شود و چیزی از دست
                نمی‌رود.
              </p>
            </AppCard>
          )}

          {/* پلن‌های تمدید اشتراک پروفایل اختصاصی */}
          {showRenewalPlans && (
            <AppCard>
              <h2 className="text-base font-black text-gray-900">
                {isActive
                  ? 'تمدید اشتراک پروفایل اختصاصی'
                  : 'فعال‌سازی اشتراک پروفایل اختصاصی'}
              </h2>

              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {isActive
                  ? 'برای اینکه صفحه‌تان بدون وقفه در دسترس بماند، یکی از پلن‌های زیر را انتخاب کنید. قیمت‌ها به‌صورت قطعی از سامانه خوانده می‌شوند و پس از پرداخت موفق، مدت اعتبار به زمان باقی‌ماندهٔ شما «اضافه» می‌شود (نه اینکه از نو شروع شود)؛ پس با تمدید زودهنگام چیزی از دست نمی‌دهید.'
                  : 'صفحهٔ اختصاصی شما در حال حاضر غیرفعال است و مشتری‌ها آن را نمی‌بینند. با انتخاب یکی از پلن‌های زیر، صفحه بلافاصله فعال می‌شود؛ اسلاگ، آدرس و همهٔ محتوای قبلی محفوظ است و نیازی به ساختن صفحه از نو نیست.'}
              </p>

              <ul className="mt-3 grid gap-1.5 text-[11px] leading-6 text-muted-foreground sm:grid-cols-2">
                <li className="flex items-start gap-1.5">
                  <Check size={13} className="mt-1 shrink-0 text-emerald-600" />
                  پرداخت یک‌باره، بدون تمدید خودکار و بدون کسر ماهانه
                </li>
                <li className="flex items-start gap-1.5">
                  <Check size={13} className="mt-1 shrink-0 text-emerald-600" />
                  آدرس و اسلاگ ثبت‌شده در گوگل دست‌نخورده می‌ماند
                </li>
                <li className="flex items-start gap-1.5">
                  <Check size={13} className="mt-1 shrink-0 text-emerald-600" />
                  همهٔ امتیازها، نظرات و نمونه‌کارها حفظ می‌شود
                </li>
                <li className="flex items-start gap-1.5">
                  <Check size={13} className="mt-1 shrink-0 text-emerald-600" />
                  با پایان اعتبار، خرید خودکار انجام نمی‌شود
                </li>
              </ul>

              {isLoadingPlans ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {plans.map(plan => (
                    <div
                      key={plan.id}
                      className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50/60 p-4"
                    >
                      <h3 className="text-sm font-black text-gray-900">
                        {plan.name}
                      </h3>
                      <p className="mt-2 text-2xl font-black text-primary">
                        {formatFaNumber(plan.price)}
                        <span className="mr-1 text-xs font-medium text-muted-foreground">
                          تومان
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {toPersianDigits(plan.durationDays)} روز دسترسی
                      </p>
                      <Button
                        size="sm"
                        className="mt-4 w-full"
                        disabled={payPublicPage.isPending}
                        onClick={() =>
                          payPublicPage.mutate({ planId: plan.id })
                        }
                      >
                        {payPublicPage.isPending ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : null}
                        انتخاب و پرداخت
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </AppCard>
          )}
        </div>
      </FadeIn>
    </DashboardShell>
  );
}
