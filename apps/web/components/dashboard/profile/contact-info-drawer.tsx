'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LocateFixed, MapPinned, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import FormProvider from '@/components/form/form-provider';
import RHFInput from '@/components/form/rhf-input';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  extractLatLngFromMapsInput,
  roundCoordinate,
} from '@/lib/contact-links';
import { toPersianDigits } from '@/lib/utils';
import {
  useMyBarberProfile,
  useUpdateBarberProfile,
} from '@/services/features/barber/hooks';
import { UpdateBarberProfile } from '@/services/features/barber/types';

/**
 * نقشه به‌صورت dynamic و فقط سمت کلاینت بارگذاری می‌شود (leaflet به
 * `window` نیاز دارد و نباید وارد SSR شود).
 */
const LocationMap = dynamic(
  () => import('@/components/dashboard/profile/location-map'),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-2xl bg-gray-100" />
    ),
  },
);

const schema = z.object({
  contactPhone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  telegram: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  /** فقط برای استخراج مختصات؛ به سرور ارسال نمی‌شود. */
  mapsLink: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ContactInfoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactInfoDrawer({
  open,
  onOpenChange,
}: ContactInfoDrawerProps) {
  const { data: profile } = useMyBarberProfile();
  // این mutation بعد از موفقیت هم کشِ پروفایل را invalidate می‌کند و هم
  // `revalidateMyPublicBarberPage` را می‌زند؛ پس ذخیرهٔ این فرم بلافاصله
  // در صفحهٔ عمومی هم دیده می‌شود.
  const updateMutation = useUpdateBarberProfile();
  const [locating, setLocating] = useState(false);

  const methods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactPhone: '',
      whatsapp: '',
      instagram: '',
      telegram: '',
      latitude: null,
      longitude: null,
      mapsLink: '',
    },
  });

  const { control, reset, setValue, getValues, handleSubmit } = methods;
  const watchedLatitude = useWatch({ control, name: 'latitude' });
  const watchedLongitude = useWatch({ control, name: 'longitude' });
  const watchedMapsLink = useWatch({ control, name: 'mapsLink' });

  const hasLocation =
    typeof watchedLatitude === 'number' && typeof watchedLongitude === 'number';

  useEffect(() => {
    if (profile?.data) {
      reset({
        contactPhone: profile.data.contactPhone ?? '',
        whatsapp: profile.data.whatsapp ?? '',
        instagram: profile.data.instagram ?? '',
        telegram: profile.data.telegram ?? '',
        latitude: profile.data.latitude ?? null,
        longitude: profile.data.longitude ?? null,
        mapsLink: '',
      });
    }
  }, [profile?.data, reset, open]);

  // چسباندن لینک Google Maps → استخراج خودکار عرض/طول جغرافیایی
  const linkHasCoords = Boolean(extractLatLngFromMapsInput(watchedMapsLink));
  useEffect(() => {
    if (!watchedMapsLink) return;
    const coords = extractLatLngFromMapsInput(watchedMapsLink);
    if (!coords) return;
    if (
      getValues('latitude') !== coords.latitude ||
      getValues('longitude') !== coords.longitude
    ) {
      setValue('latitude', coords.latitude, { shouldDirty: true });
      setValue('longitude', coords.longitude, { shouldDirty: true });
    }
  }, [watchedMapsLink, getValues, setValue]);

  const setCoordinates = (latitude: number, longitude: number) => {
    setValue('latitude', latitude, { shouldDirty: true });
    setValue('longitude', longitude, { shouldDirty: true });
  };

  const handleFillAccountPhone = () => {
    const phone = profile?.data?.phone?.trim();
    if (!phone) {
      toast.error('شماره موبایلی در حساب شما ثبت نشده است.');
      return;
    }
    setValue('contactPhone', phone, { shouldDirty: true });
    toast.success('شماره موبایل حساب در شماره تماس سالن درج شد.');
  };

  const handleFillWhatsApp = () => {
    const source =
      getValues('contactPhone')?.trim() || profile?.data?.phone?.trim() || '';
    if (!source) {
      toast.error('اول شماره تماس سالن یا شماره حساب را وارد کنید.');
      return;
    }
    setValue('whatsapp', source, { shouldDirty: true });
    toast.success('شماره در فیلد واتساپ درج شد.');
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setCoordinates(
          roundCoordinate(position.coords.latitude),
          roundCoordinate(position.coords.longitude),
        );
        setLocating(false);
        toast.success('موقعیت فعلی شما دریافت شد.');
      },
      () => {
        setLocating(false);
        toast.error(
          'دریافت موقعیت فعلی ممکن نشد؛ دسترسی به مکان را در مرورگر بررسی کنید.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleClearLocation = () => {
    setValue('latitude', null, { shouldDirty: true });
    setValue('longitude', null, { shouldDirty: true });
    setValue('mapsLink', '', { shouldDirty: true });
  };

  const onSubmit = (data: FormData) => {
    const payload: UpdateBarberProfile = {
      contactPhone: data.contactPhone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || null,
      instagram: data.instagram?.trim() || null,
      telegram: data.telegram?.trim() || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    };
    updateMutation.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const isLoading = updateMutation.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader>
          <DrawerTitle className="text-center">
            راه‌های ارتباطی و مسیریابی
          </DrawerTitle>
          <DrawerDescription className="text-center text-sm">
            اطلاعات تماس و موقعیت مکانی سالن خود را برای صفحهٔ عمومی ثبت کنید
          </DrawerDescription>
        </DrawerHeader>

        <FormProvider
          methods={methods}
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 px-4 pb-6"
        >
          {/* ---- شماره تماس سالن ---- */}
          <div className="space-y-2">
            <RHFInput
              name="contactPhone"
              label="شماره تماس سالن"
              isRequired
              dir="ltr"
              type="tel"
              inputMode="tel"
              placeholder="0912… یا 021…"
              description="تلفن ثابت با کد شهر یا موبایل؛ برای دکمهٔ «تماس» در صفحهٔ عمومی نمایش داده می‌شود."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleFillAccountPhone}
              className="gap-1 text-primary hover:text-primary-700"
            >
              استفاده از شماره موبایل حسابم
            </Button>
          </div>

          {/* ---- واتساپ ---- */}
          <div className="space-y-2">
            <RHFInput
              name="whatsapp"
              label="واتساپ"
              dir="ltr"
              type="tel"
              inputMode="tel"
              placeholder="0912…"
              description="برای چت مستقیم مشتری؛ شماره‌ای که در واتساپ فعال است."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleFillWhatsApp}
              className="gap-1 text-primary hover:text-primary-700"
            >
              پرکردن از شماره تماس سالن / حساب
            </Button>
          </div>

          {/* ---- اینستاگرام ---- */}
          <RHFInput
            name="instagram"
            label="اینستاگرام"
            dir="ltr"
            placeholder="username"
            description="با @ یا لینک کامل (instagram.com/…) هم می‌توانید وارد کنید؛ فقط شناسه ذخیره می‌شود."
          />

          {/* ---- تلگرام ---- */}
          <RHFInput
            name="telegram"
            label="تلگرام"
            dir="ltr"
            placeholder="username"
            description="با @ یا لینک کامل (t.me/…) هم می‌توانید وارد کنید؛ فقط شناسه ذخیره می‌شود."
          />

          {/* ---- موقعیت مکانی ---- */}
          <div className="space-y-3 rounded-2xl border border-primary/15 bg-primary-3/40 p-4">
            <div className="flex items-center gap-2">
              <MapPinned size={17} className="shrink-0 text-primary" />
              <h4 className="text-sm font-black text-gray-900">
                موقعیت مکانی روی نقشه (برای گوگل‌مپ و اسنپ)
              </h4>
            </div>

            <p className="text-xs leading-6 text-gray-500">
              روی نقشه کلیک کنید یا pin را جابه‌جا کنید؛ یا از دکمه‌های زیر
              استفاده کنید.
            </p>

            <LocationMap
              latitude={hasLocation ? watchedLatitude : null}
              longitude={hasLocation ? watchedLongitude : null}
              onChange={setCoordinates}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetCurrentLocation}
                disabled={locating}
                className="gap-1"
              >
                <LocateFixed size={15} />
                {locating ? 'در حال دریافت…' : 'دریافت موقعیت فعلی من'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearLocation}
                disabled={!hasLocation}
                className="gap-1 text-red-600 hover:text-red-700"
              >
                <Trash2 size={15} />
                حذف موقعیت مکانی
              </Button>
            </div>

            <RHFInput
              name="mapsLink"
              label="لینک Google Maps"
              dir="ltr"
              placeholder="https://maps.google.com/…"
              description={
                linkHasCoords
                  ? 'مختصات از لینک استخراج شد ✓'
                  : 'لینک مکان را بچسبانید تا عرض و طول جغرافیایی خودکار استخراج شود.'
              }
            />

            <p className="text-xs font-medium text-gray-600">
              وضعیت:{' '}
              {hasLocation
                ? `ثبت شده (${toPersianDigits(
                    (watchedLatitude as number).toFixed(5),
                  )}، ${toPersianDigits(
                    (watchedLongitude as number).toFixed(5),
                  )})`
                : 'ثبت نشده'}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
          </Button>
        </FormProvider>
      </DrawerContent>
    </Drawer>
  );
}
