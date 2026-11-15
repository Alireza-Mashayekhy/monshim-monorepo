'use client';

import { ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import StepFooter from '@/components/pages/auth/barbaer/step-footer';
import { Button } from '@/components/ui/button';
import { IMAGE_ACCEPT, MAX_PORTFOLIO_IMAGES } from '@/lib/image-upload';
import {
  readImageFiles,
  summarizeFileOutcome,
} from '@/lib/upload-image-files';
import { toPersianDigits } from '@/lib/utils';
import { useBarberSignupStore } from '@/store/useBarberSignupStore';

interface Step3Props {
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function BarbaerStep3({ onSubmit }: Step3Props) {
  const { portfolio, prevStep, updateData } = useBarberSignupStore();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const portfolioInputRef = useRef<HTMLInputElement>(null);
  /**
   * قفل هم‌زمانی: انتخاب دوبارهٔ فایل (یا دوبار کلیک) نباید دو بار خواندن را
   * شروع کند و state را با هم ادغام کند. `ref` استفاده شده تا حتی وقتی کاربر
   * بلافاصله دوباره کلیک می‌کند، مقدار به‌روز باشد.
   */
  const readingRef = useRef(false);

  const remaining = Math.max(0, MAX_PORTFOLIO_IMAGES - portfolio.length);

  const removePortfolioImage = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    updateData({ portfolio: portfolio.filter((_, i) => i !== index) });
  };

  const handlePortfolioClick = () => {
    if (isReading) return;
    if (portfolio.length >= MAX_PORTFOLIO_IMAGES) {
      toast.warning('در ثبت نام اولیه حداکثر ۵ عکس مجاز است.');
      return;
    }
    portfolioInputRef.current?.click();
  };

  const handlePortfolioChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const files = Array.from(input.files ?? []);
      // ورودی بلافاصله پاک می‌شود تا انتخاب دوبارهٔ همان فایل هم رویداد بدهد
      // و مقدار قدیمی در عنصر input باقی نماند.
      input.value = '';
      if (files.length === 0 || readingRef.current) return;

      // وضعیت فعلی را دوباره از store می‌خوانیم تا با تغییرات دیگر اجزا
      // (مثلاً حذف هم‌زمان یک تصویر) هم‌خوان باشیم.
      const currentPortfolio = useBarberSignupStore.getState().portfolio;
      const available = Math.max(
        0,
        MAX_PORTFOLIO_IMAGES - currentPortfolio.length,
      );

      if (available === 0) {
        toast.warning('در ثبت نام اولیه حداکثر ۵ عکس مجاز است.');
        return;
      }

      readingRef.current = true;
      setIsReading(true);
      try {
        const { accepted, rejected } = await readImageFiles(files, {
          maxCount: available,
        });

        if (accepted.length > 0) {
          // ادغام نتیجه با جدیدترین state (نه کپی قدیمی) تا هیچ تصویری گم نشود.
          const latest = useBarberSignupStore.getState().portfolio;
          const merged = [
            ...latest,
            ...accepted.map(image => image.dataUrl),
          ].slice(0, MAX_PORTFOLIO_IMAGES);
          updateData({ portfolio: merged });
        }

        const outcome = summarizeFileOutcome(accepted.length, rejected);
        if (outcome?.type === 'success') toast.success(outcome.message);
        else if (outcome?.type === 'warning') toast.warning(outcome.message);
        else if (outcome?.type === 'error') toast.error(outcome.message);
      } finally {
        readingRef.current = false;
        setIsReading(false);
      }
    },
    [updateData],
  );

  const handleNext = () => {
    onSubmit({ portfolio: useBarberSignupStore.getState().portfolio });
  };

  // شمارنده را با ارقام فارسی نشان می‌دهیم تا با بقیهٔ متن‌های صفحه یک‌دست باشد.
  const counterLabel = `${toPersianDigits(portfolio.length)} از ${toPersianDigits(
    MAX_PORTFOLIO_IMAGES,
  )}`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2.5 bg-amber-50/70 border border-amber-200/60 rounded-2xl px-4 py-3">
        <ImageIcon className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
          حداکثر ۵ تصویر مجاز است و حجم هر تصویر باید حداکثر ۳ مگابایت باشد
          (فرمت‌های JPEG، PNG، GIF و WebP).
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-500">
            تصاویر بارگذاری‌شده
          </h3>
          <span className="text-[11px] font-bold text-gray-400">
            {counterLabel}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {portfolio.map((img, idx) => (
            <div
              key={`${idx}-${img.slice(-24)}`}
              className="relative aspect-square rounded-2xl overflow-hidden group shadow-sm border border-gray-100 cursor-pointer bg-gray-100"
              onClick={() => setLightboxImage(img)}
            >
              <img
                src={img}
                alt={`نمونه کار ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={e => removePortfolioImage(e, idx)}
                aria-label="حذف تصویر نمونه‌کار"
                className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1 rounded-full opacity-80 hover:opacity-100 transition-opacity z-10 cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {portfolio.length < MAX_PORTFOLIO_IMAGES && (
            <button
              type="button"
              onClick={handlePortfolioClick}
              disabled={isReading}
              className="aspect-square rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 hover:border-primary-300 transition-colors bg-gray-50 disabled:cursor-wait"
            >
              <Plus size={24} />
              <span className="text-[10px] mt-1 font-bold">
                {isReading ? 'در حال خواندن…' : 'افزودن'}
              </span>
              <span className="text-[9px] mt-0.5 text-gray-400/80 font-medium">
                {remaining > 0
                  ? `${toPersianDigits(remaining)} عکس دیگر`
                  : 'حداکثر ۳ مگابایت'}
              </span>
            </button>
          )}
          <input
            type="file"
            ref={portfolioInputRef}
            onChange={handlePortfolioChange}
            className="hidden"
            accept={IMAGE_ACCEPT}
            multiple
          />
        </div>
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            aria-label="بستن"
            className="absolute top-5 right-5 text-white bg-white/20 p-2 rounded-full z-[101] hover:bg-white/30 transition-colors cursor-pointer"
            onClick={() => setLightboxImage(null)}
          >
            <X size={24} />
          </button>
          <div
            className="relative w-full max-w-3xl max-h-[80vh] rounded-lg shadow-2xl z-[101]"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt="نمایش نمونه کار"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      <StepFooter
        onBack={prevStep}
        primary={
          <Button
            type="button"
            onClick={handleNext}
            disabled={isReading}
            className="flex-1 h-12 text-base font-bold shadow-md shadow-primary/20 cursor-pointer"
          >
            مرحله بعد
          </Button>
        }
      />
    </div>
  );
}
