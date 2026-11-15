'use client';

import { ImagePlus, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import AppCard from '@/components/shared/app-card';
import { Button } from '@/components/ui/button';
import {
  IMAGE_ACCEPT,
  MAX_PORTFOLIO_IMAGES,
} from '@/lib/image-upload';
import {
  readImageFiles,
  summarizeFileOutcome,
} from '@/lib/upload-image-files';
import { getFullImageUrl, toPersianDigits } from '@/lib/utils';
import { useUpdateBarberPortfolio } from '@/services/features/barber/hooks';

interface PendingImage {
  id: string;
  file: File;
  preview: string;
}

interface PortfolioManagerProps {
  images?: string[] | null;
}

const EMPTY_PORTFOLIO_IMAGES: string[] = [];


export default function PortfolioManager({
  images = EMPTY_PORTFOLIO_IMAGES,
}: PortfolioManagerProps) {
  const currentImages = images ?? EMPTY_PORTFOLIO_IMAGES;
  const [savedImages, setSavedImages] = useState(currentImages);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdateBarberPortfolio();

  const startEditing = () => {
    setSavedImages(currentImages);
    setPendingImages([]);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setSavedImages(currentImages);
    setPendingImages([]);
    setIsEditing(false);
  };

  const handleAddFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';

    const available =
      MAX_PORTFOLIO_IMAGES - savedImages.length - pendingImages.length;
    if (available <= 0) {
      toast.warning(
        `حداکثر ${toPersianDigits(MAX_PORTFOLIO_IMAGES)} نمونه‌کار مجاز است.`,
      );
      return;
    }

    /**
     * هر فایل مستقل خوانده می‌شود: یک فایل خراب/غیرمجاز بقیه را از کار
     * نمی‌اندازد و پیام موفقیت فقط وقتی نمایش داده می‌شود که همه موفق باشند
     * (قبلاً هر فایل معتبر پیام «اضافه شد» جدا می‌گرفت و با خطای بعدی
     * متناقض به‌نظر می‌رسید).
     */
    const { accepted, rejected } = await readImageFiles(files, {
      maxCount: available,
    });

    if (accepted.length > 0) {
      const newImages: PendingImage[] = accepted.map((image, index) => ({
        id: `${image.file.name}-${image.file.lastModified}-${index}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        file: image.file,
        preview: image.dataUrl,
      }));
      setPendingImages(current => {
        const merged = [...current, ...newImages];
        return merged.slice(0, MAX_PORTFOLIO_IMAGES - savedImages.length);
      });
    }

    const outcome = summarizeFileOutcome(accepted.length, rejected);
    if (outcome?.type === 'success') toast.success(outcome.message);
    else if (outcome?.type === 'warning') toast.warning(outcome.message);
    else if (outcome?.type === 'error') toast.error(outcome.message);
  };

  const saveChanges = async () => {
    try {
      const response = await updateMutation.mutateAsync({
        files: pendingImages.map(image => image.file),
        existingImages: savedImages,
      });

      /**
       * منبع حقیقت پس از ذخیره، پاسخ سرور است — نه تصاویر پیش‌نویس محلی.
       * اگر سرور تعداد کمتری برگرداند (مثلاً یکی از فایل‌ها رد شده باشد)،
       * UI هم همان تعداد را نشان می‌دهد تا «تعداد نمایش‌داده‌شده» با
       * «تعداد واقعاً ذخیره‌شده» یکی بماند.
       */
      setSavedImages(response.data.portfolioImages ?? savedImages);
      setPendingImages([]);
      setIsEditing(false);
    } catch {
      // پیام خطا در `onError` همان هوک نمایش داده شده است؛ نکتهٔ مهم این است
      // که حالت ویرایش و فایل‌های انتخاب‌شده حفظ می‌شوند تا کاربر بتواند
      // فقط همان فایل ناموفق را دوباره بفرستد (بدون انتخاب از نو).
    }
  };

  const effectiveSavedImages = isEditing ? savedImages : currentImages;

  const displayedImages = [
    ...effectiveSavedImages.map((src, index) => ({
      id: `saved-${src}-${index}`,
      src: getFullImageUrl(src) ?? src,
      isSaved: true,
      savedIndex: index,
    })),
    ...pendingImages.map(image => ({
      id: image.id,
      src: image.preview,
      isSaved: false,
      savedIndex: -1,
    })),
  ];

  return (
    <AppCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <ImagePlus size={18} className="text-primary-600" />
            نمونه‌کارها و عکس‌های رزومه
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            عکس‌های نمونه‌کار خود را نمایش دهید؛ حداکثر ۵ عکس با حجم هرکدام تا ۳
            مگابایت.
          </p>
        </div>

        {!isEditing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 self-start"
            onClick={startEditing}
          >
            <Pencil size={14} />
            ویرایش عکس‌ها
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={saveChanges}
              loading={updateMutation.isPending}
              className="gap-1"
            >
              <Save size={14} />
              ذخیره
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancelEditing}
              disabled={updateMutation.isPending}
              className="gap-1"
            >
              <X size={14} />
              انصراف
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>
          {toPersianDigits(displayedImages.length)} از{' '}
          {toPersianDigits(MAX_PORTFOLIO_IMAGES)} عکس
        </span>
        {isEditing && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={
              updateMutation.isPending ||
              displayedImages.length >= MAX_PORTFOLIO_IMAGES
            }
            className="gap-1"
          >
            <Plus size={14} />
            افزودن عکس
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={handleAddFiles}
      />

      {displayedImages.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {displayedImages.map((image, index) => (
            <div
              key={image.id}
              className="relative aspect-square overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
            >
              <Image
                src={image.src}
                alt={`نمونه‌کار ${toPersianDigits(index + 1)}`}
                fill
                unoptimized
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 18vw"
                className="object-cover"
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    if (image.isSaved) {
                      setSavedImages(current =>
                        current.filter(
                          (_, currentIndex) =>
                            currentIndex !== image.savedIndex,
                        ),
                      );
                    } else {
                      setPendingImages(current =>
                        current.filter(pending => pending.id !== image.id),
                      );
                    }
                  }}
                  disabled={updateMutation.isPending}
                  aria-label="حذف عکس نمونه‌کار"
                  className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
          هنوز عکسی برای رزومه ثبت نشده است.
          {isEditing && ' از دکمهٔ افزودن عکس استفاده کنید.'}
        </div>
      )}
    </AppCard>
  );
}
