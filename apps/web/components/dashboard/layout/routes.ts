import {
  CalendarDays,
  Clock,
  Gem,
  Globe,
  Headphones,
  LayoutDashboard,
  Scissors,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';

export const dashboardRoutes = [
  {
    title: 'داشبورد',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'نوبت‌ها',
    href: '/dashboard/appointments',
    icon: CalendarDays,
  },
  {
    title: 'خدمات',
    href: '/dashboard/services',
    icon: Scissors,
  },
  {
    title: 'ساعات رزرو',
    href: '/dashboard/work-hours',
    icon: Clock,
  },
  {
    title: 'پروفایل',
    href: '/dashboard/profile',
    icon: UserRound,
  },
  { icon: Wallet, title: 'امور مالی', href: '/dashboard/financial' },
  { icon: Gem, title: 'اشتراک', href: '/dashboard/subscription' },
  {
    icon: Users,
    title: 'مشتریان',
    href: '/dashboard/club',
  },
  /**
   * صفحهٔ اختصاصی/عمومی آرایشگاه (`/provider/[id]`) — خرید پکیج یا پیشرفت به
   * سمت ۳۰۰ نوبتِ پرداخت‌شده. در انتهای فهرست نگه داشته شده چون منوی موبایل
   * با اندیس به آیتم‌ها اشاره می‌کند.
   */
  {
    icon: Globe,
    title: 'صفحهٔ اختصاصی',
    href: '/dashboard/public-page',
  },
  /** پشتیبانی آرایشگر — همان تیکت‌های پنل کاربر (اندیس ۹، انتهای فهرست) */
  {
    icon: Headphones,
    title: 'پشتیبانی',
    href: '/dashboard/support',
  },
];

export type DashboardRoute = (typeof dashboardRoutes)[number];

/**
 * تشخیص فعال‌بودن یک مسیر در ناوبری موبایل (نوار پایین و منوی «بیشتر»).
 * `/dashboard` فقط با تطابق دقیق فعال است تا روی همهٔ زیرصفحه‌ها روشن نماند.
 */
export function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** چهار مقصد اصلی که مستقیم در نوار پایین موبایل دیده می‌شوند. */
const BOTTOM_NAV_HREFS = [
  '/dashboard',
  '/dashboard/appointments',
  '/dashboard/financial',
  '/dashboard/club',
];

export const bottomNavRoutes: DashboardRoute[] = BOTTOM_NAV_HREFS.flatMap(
  href => dashboardRoutes.filter(route => route.href === href),
);

export interface MoreMenuItem extends DashboardRoute {
  description?: string;
}

export interface MoreMenuGroup {
  title: string;
  items: MoreMenuItem[];
}

/** گروه‌بندی و توضیح کوتاهِ آیتم‌های منوی «بیشتر» (فقط نمایشی). */
const MORE_MENU_LAYOUT: {
  title: string;
  items: { href: string; description: string }[];
}[] = [
  {
    title: 'مدیریت سالن',
    items: [
      { href: '/dashboard/services', description: 'خدمات، قیمت و مدت زمان' },
      { href: '/dashboard/work-hours', description: 'روزها و ساعت‌های کاری' },
      {
        href: '/dashboard/public-page',
        description: 'صفحهٔ عمومی آرایشگاه شما',
      },
    ],
  },
  {
    title: 'حساب و پشتیبانی',
    items: [
      { href: '/dashboard/profile', description: 'اطلاعات شما و سالن' },
      { href: '/dashboard/subscription', description: 'پلن فعلی و تمدید' },
      { href: '/dashboard/support', description: 'تیکت‌ها و ارتباط با ما' },
    ],
  },
];

/**
 * آیتم‌های منوی «بیشتر» = هر مسیری که در نوار پایین نیست.
 *
 * منبع حقیقت همچنان `dashboardRoutes` است: اگر مسیر تازه‌ای اضافه شود و در
 * `MORE_MENU_LAYOUT` نیامده باشد، حذف نمی‌شود و در گروه «سایر» نمایش داده
 * می‌شود.
 */
export const moreMenuGroups: MoreMenuGroup[] = (() => {
  const remaining = new Map(
    dashboardRoutes
      .filter(route => !BOTTOM_NAV_HREFS.includes(route.href))
      .map(route => [route.href, route] as const),
  );

  const groups: MoreMenuGroup[] = MORE_MENU_LAYOUT.map(group => ({
    title: group.title,
    items: group.items.flatMap(({ href, description }) => {
      const route = remaining.get(href);
      if (!route) return [];

      remaining.delete(href);

      return [{ ...route, description }];
    }),
  })).filter(group => group.items.length > 0);

  if (remaining.size > 0) {
    groups.push({ title: 'سایر', items: [...remaining.values()] });
  }

  return groups;
})();

export const moreMenuRoutes: MoreMenuItem[] = moreMenuGroups.flatMap(
  group => group.items,
);
