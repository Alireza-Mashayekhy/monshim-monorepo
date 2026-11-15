import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DepositInvoiceView } from '@/components/pages/deposit/deposit-invoice-view';
import QueryProvider from '@/providers/query-provider';

export const metadata: Metadata = {
  // `absolute` چون این مسیر از قالبِ عنوانِ سراسری (`%s | منشیم`) رد نمی‌شود،
  // وگرنه نام برند دو بار تکرار می‌شد: «... | منشیم | منشیم».
  title: { absolute: 'صورت‌حساب و پرداخت بیعانه | منشیم' },
  description: 'مشاهده جزئیات خدمات، محاسبه کمیسیون و پرداخت آنلاین بیعانه نوبت در منشیم',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function DepositInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <QueryProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#f4f8f9] flex items-center justify-center p-4">
            <p className="text-xs font-bold text-gray-500">
              در حال آماده‌سازی صورت‌حساب...
            </p>
          </div>
        }
      >
        <DepositInvoiceView token={token} />
      </Suspense>
    </QueryProvider>
  );
}
