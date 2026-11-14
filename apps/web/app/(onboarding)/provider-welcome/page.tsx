import type { Metadata } from 'next';

import ProviderWelcome from '@/components/pages/auth/barbaer/provider-welcome';
import { getDashboardEntryPath } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'به منشیم خوش آمدید',
  description: 'شروع کار با منشیم: مشاهدهٔ آموزش‌ها یا ورود به داشبورد',
};

type ProviderWelcomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProviderWelcomePage({
  searchParams,
}: ProviderWelcomePageProps) {
  const params = await searchParams;

  return (
    <ProviderWelcome
      dashboardHref={getDashboardEntryPath(params.callbackUrl)}
    />
  );
}
