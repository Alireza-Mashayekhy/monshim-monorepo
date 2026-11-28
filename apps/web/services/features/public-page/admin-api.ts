import { api } from '@/services/api/client';
import { endpoints } from '@/services/api/endpoints';
import { ApiSingleResponse } from '@/services/api/types';

/** کاربرد کد: فقط صفحهٔ اختصاصی / فقط اشتراک پیامکی / هر دو */
export type DiscountApplicableTo = 'PUBLIC_PAGE' | 'SUBSCRIPTION' | 'BOTH';

export interface PublicPageDiscount {
  id: string;
  code: string;
  percentOff: number;
  isActive: boolean;
  applicableTo: DiscountApplicableTo;
  /** سقف کل استفاده‌های موفق (null = نامحدود) */
  maxTotalUses: number | null;
  /** سقف استفادهٔ هر کاربر (null = نامحدود) */
  maxUsesPerUser: number | null;
  /** تعداد استفاده‌های موفق ثبت‌شده (برای نمایش «مصرف‌شده: X از Y») */
  usedCount: number;
  /** تاریخ انقضا (ISO؛ null = بدون انقضا) */
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** دادهٔ فرم ساخت/ویرایش کد تخفیف */
export interface PublicPageDiscountDraft {
  code: string;
  percentOff: number;
  applicableTo?: DiscountApplicableTo;
  maxTotalUses?: number | null;
  maxUsesPerUser?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}

export async function getPublicPageDiscounts() {
  const { data } = await api.get<ApiSingleResponse<PublicPageDiscount[]>>(
    endpoints.publicPage.adminDiscounts,
  );
  return data;
}

export async function createPublicPageDiscount(dto: PublicPageDiscountDraft) {
  const { data } = await api.post<ApiSingleResponse<PublicPageDiscount>>(
    endpoints.publicPage.adminDiscounts,
    dto,
  );
  return data;
}

export async function updatePublicPageDiscount(
  id: string,
  dto: Partial<PublicPageDiscountDraft> & { isActive?: boolean },
) {
  const { data } = await api.patch<ApiSingleResponse<PublicPageDiscount>>(
    endpoints.publicPage.adminDiscount(id),
    dto,
  );
  return data;
}

export async function deletePublicPageDiscount(id: string) {
  const { data } = await api.delete<ApiSingleResponse<{ id: string }>>(
    endpoints.publicPage.adminDiscount(id),
  );
  return data;
}
