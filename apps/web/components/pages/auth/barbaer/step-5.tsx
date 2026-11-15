'use client';

import { ImageIcon, Loader2, Scissors, Store, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import StepFooter from '@/components/pages/auth/barbaer/step-footer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { getActivityTypeLabel } from '@/constants/activity-types';
import { getApiErrorMessage, getErrorStatus } from '@/lib/api-error';
import {
  buildAuthHref,
  type CallbackUrlValue,
  PROVIDER_WELCOME_PATH,
} from '@/lib/auth';
import { jalaliToIso } from '@/lib/date-utils';
import { stripNumericSeparators, toEnglishDigits } from '@/lib/digits';
import {
  getImageUploadError,
  MAX_PORTFOLIO_IMAGES,
  resolveImageMimeType,
} from '@/lib/image-upload';
import { toFa } from '@/lib/jalali';
import { isValidIranianNationalCode } from '@/lib/national-code';
import { isValidPhone, normalizePhone, onlyDigits } from '@/lib/phone';
import { onSignupPersistFailure } from '@/lib/signup-draft-storage';
import { formatPrice } from '@/lib/utils';
import { useRegisterBarber, useSendOtp } from '@/services/features/auth/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useBarberSignupStore } from '@/store/useBarberSignupStore';

const MIN_DEPOSIT = 100_000;
const DEPOSIT_MAX_RATIO = 0.3;

/**
 * تبدیل `data:` URL به فایل قابل ارسال در FormData.
 *
 * چرا فایل و نه Blob خالی؟ چون نام فایل هم مهم است: بک‌اند پسوند
 * `originalname` را بررسی می‌کند و MIME Type را هم از آن می‌گیرد؛ Blob بدون
 * نام، خطای «فرمت فایل مجاز نیست» می‌داد.
 *
 * خروجی `null` یعنی این آیتم قابل ارسال نیست و باید به کاربر گزارش شود؛
 * عمداً پرتاب نمی‌کند تا یک تصویر خراب، کل ثبت‌نام را از بین نبرد.
 */
export function dataUrlToUploadFile(
  dataUrl: string,
  index: number,
): { file: File } | { error: string } {
  try {
    // پرچم `s` لازم نیست: payload پایهٔ Base64 خط جدید ندارد و حالت غیر
    // Base64 با `[\s\S]` پوشش داده می‌شود (هدف کامپایل ES2017 است).
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!match) return { error: 'ساختار تصویر ذخیره‌شده معتبر نیست.' };

    const declaredType = match[1] || 'image/webp';
    const isBase64 = Boolean(match[2]);
    const payload = match[3] ?? '';

    const bytes = isBase64
      ? Uint8Array.from(atob(payload), char => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));

    const type = resolveImageMimeType({ type: declaredType });
    const extension =
      type === 'image/jpeg' ? 'jpg' : type.split('/')[1] || 'webp';
    const file = new File([bytes], `portfolio-${index + 1}.${extension}`, {
      type,
    });

    if (file.size === 0) {
      return { error: `تصویر شماره ${index + 1} خالی است؛ دوباره انتخاب کنید.` };
    }
    const validationError = getImageUploadError(file);
    if (validationError) {
      return { error: `تصویر شماره ${index + 1}: ${validationError}` };
    }
    return { file };
  } catch {
    return { error: `تصویر شماره ${index + 1} قابل خواندن نیست.` };
  }
}

export default function BarbaerStep5({
  callbackUrl,
}: {
  callbackUrl?: CallbackUrlValue;
}) {
  const router = useRouter();
  const store = useBarberSignupStore();
  const [otpCode, setOtpCode] = useState('');
  const [draftLimitWarning, setDraftLimitWarning] = useState<string | null>(
    null,
  );
  const busy = useRef(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const registerMutation = useRegisterBarber();
  const sendOtpMutation = useSendOtp();

  /**
   * شنوندهٔ خطای ذخیرهٔ پیش‌نویس.
   *
   * اگر مرورگر نتواند پیش‌نویس را در `localStorage` نگه دارد (حالت ناشناس،
   * سهمیهٔ پر، یا سیاست ذخیره‌سازی مرورگر) هیچ استثنایی به کاربر نشان داده
   * نمی‌شود؛ فقط یک هشدار غیرمسدودکننده که «تصاویر پس از refresh نیاز به
   * انتخاب دوباره دارند». عملیات جاری هرگز به‌خاطر این شکست نمی‌خورد.
   */
  useEffect(() => {
    const previous = onSignupPersistFailure(failure => {
      setDraftLimitWarning(
        failure.imagesDropped
          ? 'حافظهٔ مرورگر برای نگه‌داشتن تصاویر کافی نبود؛ تصاویر در این صفحه سالم هستند اما پس از بستن یا بازخوانی صفحه باید دوباره انتخاب شوند. بقیهٔ اطلاعات ذخیره شد.'
          : 'ذخیرهٔ خودکار پیش‌نویس در این مرورگر ممکن نیست (مثلاً حالت ناشناس). تا پایان همین نشست اطلاعات حفظ می‌شود؛ پیش از بستن صفحه ثبت‌نام را کامل کنید.',
      );
    });

    return () => {
      onSignupPersistFailure(previous);
    };
  }, []);

  const {
    fullName,
    phone,
    nationalCode,
    password,
    image,
    shopName,
    provinceId,
    cityId,
    provinceName,
    cityName,
    address,
    activityType,
    bio,
    portfolio,
    services,
    referralCode,
    birthDate,
    updateData,
  } = store;

  // Persisted drafts can bypass earlier steps; revalidate before sending OTP.
  const validateDraft = () => {
    if (
      !fullName.trim() ||
      !isValidPhone(phone) ||
      !shopName.trim() ||
      !provinceId ||
      !cityId ||
      !address.trim()
    ) {
      toast.error('اطلاعات فردی و سالن را در مراحل قبل تکمیل کنید.');
      return false;
    }
    if (nationalCode && !isValidIranianNationalCode(nationalCode)) {
      toast.error('کد ملی وارد شده در مرحله اول معتبر نیست.');
      return false;
    }
    if (!password || password.length < 6) {
      toast.error('رمز عبور را در مرحله اول وارد کنید (حداقل ۶ کاراکتر).');
      return false;
    }
    if (!activityType) {
      toast.error('نوع فعالیت سالن را در مرحله قبل انتخاب کنید.');
      return false;
    }
    if (
      !services.length ||
      services.length > 10 ||
      services.some(service => {
        const price = Number(stripNumericSeparators(service.price));
        const duration = Number(stripNumericSeparators(service.duration));
        const depositRaw = stripNumericSeparators(service.depositPrice ?? '');

        let depositOk = true;
        if (depositRaw) {
          const deposit = Number(depositRaw);
          depositOk =
            Number.isFinite(deposit) &&
            deposit >= MIN_DEPOSIT &&
            deposit <= price * DEPOSIT_MAX_RATIO;
        }

        return (
          !service.name.trim() ||
          !Number.isFinite(price) ||
          price <= 0 ||
          !Number.isInteger(duration) ||
          duration <= 0 ||
          !depositOk
        );
      })
    ) {
      toast.error(
        'نام، قیمت، بیعانه و مدت زمان خدمات را در مرحله قبل اصلاح کنید.',
      );
      return false;
    }
    if (portfolio.length > MAX_PORTFOLIO_IMAGES) {
      toast.error('حداکثر ۵ نمونه‌کار مجاز است.');
      return false;
    }
    return true;
  };

  // مرحله ۱: ارسال OTP
  const handleSendOtp = async () => {
    if (busy.current || !validateDraft()) return;
    busy.current = true;
    setIsSendingOtp(true);
    try {
      await sendOtpMutation.mutateAsync({ phone: normalizePhone(phone) });
      setOtpCode('');
      setIsOtpModalOpen(true);
      toast.success('کد تأیید به شماره شما ارسال شد.');
    } catch (error) {
      if (getErrorStatus(error) === 400) {
        setOtpCode('');
        setIsOtpModalOpen(true);
      } else {
        toast.error(getApiErrorMessage(error, 'خطا در ارسال کد تأیید'));
      }
    } finally {
      setIsSendingOtp(false);
      busy.current = false;
    }
  };

  // مرحله ۲: تأیید کد و ثبت نهایی
  const handleFinalSubmit = async () => {
    if (busy.current || !validateDraft()) return;
    if (!/^\d{4}$/.test(otpCode)) {
      toast.error('کد تأیید چهاررقمی را وارد کنید.');
      return;
    }
    busy.current = true;
    let invalidResponseReported = false;
    try {
      // ساخت FormData
      const formData = new FormData();

      // فیلدهای متنی به صورت JSON
      const payload: any = {
        fullName: fullName.trim(),
        phone: normalizePhone(phone),
        nationalCode: nationalCode?.trim() || undefined,
        salonName: shopName.trim(),
        provinceId,
        cityId,
        address,
        activityType,
        bio: bio || '',
        code: otpCode,
        password,
        birthDate: jalaliToIso(birthDate) || undefined,
        services: services.map(s => {
          const depositRaw = stripNumericSeparators(s.depositPrice ?? '');
          const deposit = depositRaw ? Number(depositRaw) : undefined;
          return {
            name: s.name,
            price: Number(stripNumericSeparators(s.price)),
            durationMinutes: parseInt(stripNumericSeparators(s.duration), 10),
            ...(deposit ? { depositPrice: deposit } : {}),
          };
        }),
      };

      // اضافه کردن کد معرف (در صورت وجود)
      if (referralCode && referralCode.trim()) {
        payload.referralCode = toEnglishDigits(referralCode)
          .trim()
          .toUpperCase();
      }
      formData.append('data', JSON.stringify(payload));

      /**
       * تبدیل تصاویر پیش‌نویس به فایل.
       *
       * هر تصویر مستقل تبدیل می‌شود: یک تصویر خراب نباید ثبت‌نام را متوقف کند
       * (قبلاً `base64ToBlob` استثنا پرتاب می‌کرد و کل ارسال با پیامی مبهم
       * شکست می‌خورد). حالا فقط همان تصویر کنار گذاشته و به کاربر گزارش
       * می‌شود؛ بقیهٔ اطلاعات ثبت می‌شوند.
       */
      const skippedImages: string[] = [];

      if (image) {
        const logo = dataUrlToUploadFile(image, 0);
        if ('file' in logo) {
          formData.append('profileImage', logo.file);
        } else {
          skippedImages.push(`لوگوی برند: ${logo.error}`);
        }
      }

      portfolio.forEach((img, index) => {
        const converted = dataUrlToUploadFile(img, index);
        if ('file' in converted) {
          formData.append('portfolio', converted.file);
        } else {
          skippedImages.push(converted.error);
        }
      });

      if (skippedImages.length > 0) {
        // هشدار غیرمسدودکننده؛ ثبت‌نام با تصاویر سالم ادامه پیدا می‌کند.
        toast.warning(skippedImages[0]);
      }

      /**
       * ثبت‌نام موفق تنها جایی است که «آرایشگر تازه» قطعی می‌شود؛ پس فقط از
       * همین‌جا به صفحهٔ خوش‌آمدگویی می‌رویم (ورودهای بعدی مستقیم به داشبورد
       * می‌روند). مقصد پیش از درخواست ثبت می‌شود تا ریدایرکتِ `AuthProvider`
       * هم — که با واردشدن کاربر فعال می‌شود — به همین صفحه برود.
       */
      const welcomeHref = buildAuthHref(PROVIDER_WELCOME_PATH, callbackUrl);
      useAuthStore.getState().setPostAuthPath(welcomeHref);

      /**
       * پاسخ سرور باید حاوی تأیید ثبت‌نام باشد. اگر پاسخ نامعتبر/خالی
       * برگردد، پیش‌نویس نباید پاک شود؛ وگرنه کاربر همهٔ داده‌ها را از دست
       * می‌دهد و نمی‌داند ثبت‌نام انجام شده یا نه.
       */
      const registrationResponse = await registerMutation.mutateAsync(formData);
      if (
        !registrationResponse ||
        typeof registrationResponse !== 'object'
      ) {
        /**
         * این خطا از سمت کلاینت است و `getApiErrorMessage` آن را با پیام
         * عمومی («خطایی رخ داد») جایگزین می‌کند؛ برای همین متن نهایی را
         * مستقیم `toast` می‌کنیم.
         */
        invalidResponseReported = true;
        toast.error(
          'پاسخ سرور برای ثبت‌نام معتبر نبود. اطلاعات شما حفظ شده است؛ لطفاً دوباره تلاش کنید.',
        );
        return;
      }

      toast.success('ثبت‌نام شما با موفقیت انجام شد!');
      setIsOtpModalOpen(false);
      setOtpCode('');
      store.reset();
      router.replace(welcomeHref);
      router.refresh();
    } catch (error) {
      /**
       * اگر توستِ «پاسخ نامعتبر» پیش‌تر نمایش داده شده، دیگر لازم نیست یک
       * پیام عمومی هم روی آن بیاید (پیام تکراری/متناقض ممنوع).
       */
      if (invalidResponseReported) {
        invalidResponseReported = false;
        useAuthStore.getState().setPostAuthPath(null);
        return;
      }
      useAuthStore.getState().setPostAuthPath(null);
      toast.error(
        getApiErrorMessage(
          error,
          error instanceof Error && !('isAxiosError' in error)
            ? error.message
            : 'خطا در ارسال اطلاعات. لطفاً مجدداً تلاش کنید.',
        ),
      );
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/*
        اگر مرورگر نتواند پیش‌نویس را در حافظهٔ محلی نگه دارد، تصاویر فقط تا
        همین نشست در حافظه می‌مانند. این یک هشدار است، نه خطا: ثبت‌نام کار
        می‌کند و فقط پس از refresh، تصاویر باید دوباره انتخاب شوند.
      */}
      {draftLimitWarning && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3"
        >
          <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed font-medium text-amber-800">
            {draftLimitWarning}
          </p>
        </div>
      )}

      {/* کارت‌های پیش‌نمایش */}
      <div className="space-y-4">
        {/* اطلاعات فردی */}
        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-700 mb-3">
            <User size={16} className="text-primary-600" />
            <h3 className="font-bold text-sm">اطلاعات فردی</h3>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">نام و نام خانوادگی</span>
              <span className="font-medium text-left">{fullName || '—'}</span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">شماره موبایل</span>
              <span className="font-medium text-left dir-ltr">
                {phone || '—'}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">کد ملی</span>
              <span className="font-medium text-left dir-ltr">
                {nationalCode || '—'}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">تاریخ تولد</span>
              <span className="font-medium text-left">{birthDate || '—'}</span>
            </div>
          </div>
        </div>

        {/* اطلاعات سالن */}
        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-700 mb-3">
            <Store size={16} className="text-primary-600" />
            <h3 className="font-bold text-sm">اطلاعات سالن</h3>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">لوگوی برند</span>
              {image ? (
                <img
                  src={image}
                  alt="لوگوی برند"
                  className="w-10 h-10 rounded-xl object-cover border"
                />
              ) : (
                <span className="text-gray-400">انتخاب نشده</span>
              )}
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">نام آرایشگاه</span>
              <span className="font-medium text-left">{shopName || '—'}</span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">نوع فعالیت</span>
              <span className="font-medium text-left">
                {getActivityTypeLabel(activityType) || '—'}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">استان</span>
              <span className="font-medium text-left">
                {provinceName || '—'}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">شهر</span>
              <span className="font-medium text-left">{cityName || '—'}</span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">آدرس</span>
              <span className="font-medium text-left leading-5">
                {address || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* نمونه کارها */}
        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-700 mb-2">
            <ImageIcon size={16} className="text-primary-600" />
            <h3 className="font-bold text-sm">نمونه کارها</h3>
          </div>
          {portfolio.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {portfolio.slice(0, 4).map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`نمونه کار ${idx + 1}`}
                  className="w-full aspect-square object-cover rounded-xl border"
                />
              ))}
              {portfolio.length > 4 && (
                <div className="flex items-center justify-center w-full aspect-square bg-gray-100 rounded-xl text-xs text-gray-500 border">
                  +{toFa(portfolio.length - 4)} بیشتر
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              هیچ نمونه کاری انتخاب نشده است.
            </p>
          )}
        </div>

        {/* خدمات */}
        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-700 mb-2">
            <Scissors size={16} className="text-primary-600" />
            <h3 className="font-bold text-sm">خدمات</h3>
          </div>
          {services.length > 0 ? (
            <div className="space-y-2">
              {services.map(s => {
                const deposit = Number(
                  (s.depositPrice ?? '').replace(/,/g, ''),
                );
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-gray-100 bg-white px-3 py-2"
                  >
                    <div className="flex justify-between items-center gap-2 text-sm">
                      <span className="font-bold">{s.name || 'بدون نام'}</span>
                      <span className="text-gray-600 font-medium">
                        {s.price ? toFa(formatPrice(s.price)) : '—'}
                        {' تومان / '}
                        {s.duration ? `${toFa(s.duration)} دقیقه` : '—'}
                      </span>
                    </div>
                    {deposit > 0 && (
                      <p className="text-[11px] text-primary-600 font-medium mt-1">
                        بیعانه: {toFa(formatPrice(deposit))} تومان
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">هیچ خدمتی ثبت نشده است.</p>
          )}
        </div>
      </div>

      {/* کد معرف (اختیاری) */}
      <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
        <div className="flex items-center gap-2 text-gray-700 mb-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary-600"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" x2="19" y1="8" y2="14" />
            <line x1="22" x2="16" y1="11" y2="11" />
          </svg>
          <h3 className="font-bold text-sm">کد معرف (اختیاری)</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {referralCode
            ? 'کد معرف از لینک دعوت وارد شده است؛ در صورت نیاز می‌توانید آن را ویرایش کنید.'
            : 'اگر کد معرف آرایشگری را دارید، در اینجا وارد کنید.'}
        </p>
        <input
          type="text"
          placeholder="کد معرف ۸ کاراکتری"
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:bg-white focus:border-primary-500 outline-none transition-colors dir-ltr text-center font-mono tracking-wider"
          value={referralCode}
          onChange={e =>
            updateData({
              referralCode: toEnglishDigits(e.target.value).toUpperCase(),
            })
          }
          maxLength={8}
        />
      </div>

      <StepFooter
        onBack={store.prevStep}
        primary={
          <Button
            type="button"
            onClick={handleSendOtp}
            disabled={registerMutation.isPending || isSendingOtp}
            className="flex-1 h-12 text-base font-bold shadow-md shadow-primary/20 gap-2 cursor-pointer"
          >
            {isSendingOtp ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                ارسال کد...
              </>
            ) : (
              'ثبت نهایی'
            )}
          </Button>
        }
      />

      {/* مودال ورود کد */}
      <Dialog
        open={isOtpModalOpen}
        onOpenChange={open => {
          if (!busy.current) setIsOtpModalOpen(open);
        }}
      >
        {' '}
        <DialogContent className="sm:max-w-md transition-[top,max-height] duration-200 ease-out">
          <DialogHeader>
            <DialogTitle>تأیید شماره موبایل</DialogTitle>
            <DialogDescription>
              کد تأیید به شماره {phone} ارسال شد. لطفاً آن را وارد کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <InputOTP
              maxLength={4}
              value={otpCode}
              onChange={value => setOtpCode(onlyDigits(value))}
              pasteTransformer={onlyDigits}
              inputMode="numeric"
              pattern="[0-9]*"
              dir="ltr"
              id="input-otp-ltr"
              autoFocus
            >
              <InputOTPGroup className="w-full gap-2 flex-row-reverse justify-center">
                <InputOTPSlot
                  index={0}
                  className="h-12 w-12 border rounded-md"
                />
                <InputOTPSlot
                  index={1}
                  className="h-12 w-12 border rounded-md"
                />
                <InputOTPSlot
                  index={2}
                  className="h-12 w-12 border rounded-md"
                />
                <InputOTPSlot
                  index={3}
                  className="h-12 w-12 border rounded-md"
                />
              </InputOTPGroup>
            </InputOTP>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={registerMutation.isPending}
                onClick={() => {
                  setIsOtpModalOpen(false);
                  setOtpCode('');
                }}
              >
                انصراف
              </Button>
              <Button
                onClick={handleFinalSubmit}
                disabled={otpCode.length < 4 || registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin ml-2" />
                    در حال ثبت...
                  </>
                ) : (
                  'تأیید و ثبت'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
