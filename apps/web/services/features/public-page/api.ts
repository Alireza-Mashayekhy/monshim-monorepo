import { api } from '@/services/api/client';
import { endpoints } from '@/services/api/endpoints';
import { ApiSingleResponse } from '@/services/api/types';

import {
  PublicPageDiscountQuote,
  PublicPageStatus,
  PublicPageSubscriptionPlan,
  SlugAvailabilityResult,
} from './types';

/** وضعیت صفحهٔ عمومیِ آرایشگرِ جاری (فعال/غیرفعال، اسلاگ و پیشرفت به سمت حد نصاب) */
export async function getMyPublicPageStatus() {
  const { data } = await api.get<ApiSingleResponse<PublicPageStatus>>(
    endpoints.publicPage.me,
  );
  return data;
}

/**
 * پلن‌های قابل انتخاب برای خرید/تمدید اشتراک «پروفایل اختصاصی».
 * قیمت‌ها از بک‌اند می‌آیند؛ فرانت فقط نمایش می‌دهد.
 */
export async function getPublicPagePlans() {
  const { data } = await api.get<
    ApiSingleResponse<PublicPageSubscriptionPlan[]>
  >(endpoints.publicPage.plans);
  return data;
}

/** بررسی آزاد و غیرتکراری بودن اسلاگ پیشنهادی */
export async function checkPublicPageSlug(slug: string) {
  const { data } = await api.get<ApiSingleResponse<SlugAvailabilityResult>>(
    endpoints.publicPage.checkSlug,
    { params: { slug } },
  );
  return data;
}

/**
 * استعلام/اعتبارسنجی کد تخفیف برای یک پلنِ مشخص.
 *
 * `target` مشخص می‌کند کد برای خرید صفحهٔ اختصاصی (`PUBLIC_PAGE`) است یا
 * اشتراک پیامکی (`SUBSCRIPTION`)؛ قیمت واقعی پلن و سقف‌های استفاده در
 * بک‌اند از روی دیتابیس سنجیده می‌شود.
 */
export async function quotePublicPageDiscount(params: {
  code: string;
  target: 'PUBLIC_PAGE' | 'SUBSCRIPTION';
  planId: string;
}) {
  const { data } = await api.post<ApiSingleResponse<PublicPageDiscountQuote>>(
    endpoints.publicPage.discountQuote,
    params,
  );
  return data;
}

/** ثبت یا ویرایش اسلاگ یکتای صفحهٔ اختصاصی آرایشگر */
export async function updateMyPublicPageSlug(slug: string) {
  const { data } = await api.patch<ApiSingleResponse<PublicPageStatus>>(
    endpoints.publicPage.updateSlug,
    { slug },
  );
  return data;
}
