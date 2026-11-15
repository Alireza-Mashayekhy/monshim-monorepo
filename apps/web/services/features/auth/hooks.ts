import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { trackEvent } from '@/lib/analytics';
import { getErrorStatus } from '@/lib/api-error';
import { authKeys } from '@/lib/auth';
import { isAdmin, isBarber, rolesOf } from '@/lib/roles';
import { clearSessionCache } from '@/lib/session-cache';
import { useAuthStore } from '@/store/auth.store';

import {
  changePassword,
  fetchMe,
  login,
  loginWithPassword,
  logout,
  refreshSession,
  registerBarber,
  requestChangePasswordCode,
  sendOtp,
  signUp,
  verifyOtp,
} from './api';

export { authKeys } from '@/lib/auth';

/**
 * تنها منبع حقیقی اطلاعات کاربر در سمت کلاینت.
 * بعد از لاگین/ثبت‌نام/تغییر نقش، کش آن باطل می‌شود تا همه‌جا به‌روزرسانی شود.
 *
 * صفحات عمومیِ معمولی به این کوئری نیازی ندارند، اما صفحات ورود باید نشست
 * قابل تمدید را هم بررسی کنند تا کاربرِ واردشده دوباره فرم ورود نبیند.
 */
export const useMe = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    enabled: options?.enabled,
    staleTime: 60 * 1000,
    // Cookies may have changed in another tab while this one was hidden.
    refetchOnWindowFocus: 'always',
    /**
     * خطاهای احراز هویت (۴۰۰/۴۰۱/۴۰۳) با تلاشِ مجدد درست نمی‌شوند؛ بقیهٔ
     * حالت‌ها گذرا هستند: ۴۲۹ (محدودیت نرخ)، ۵xx، قطعی شبکه و timeout.
     * قبلاً ۴۲۹ هم مستقیماً به صفحهٔ «بررسی نشست انجام نشد» می‌رفت، در حالی
     * که یک ثانیه بعد همان درخواست موفق می‌شد.
     */
    retry: (count, error) => {
      const status = getErrorStatus(error);
      if (status === 400 || status === 401 || status === 403) return false;
      return count < 2;
    },
  });

export function useCurrentUser() {
  const { data, isLoading, isFetching, isError, refetch } = useMe();
  const user = data?.data ?? null;
  return {
    user,
    roles: rolesOf(user),
    isBarber: isBarber(user),
    isAdmin: isAdmin(user),
    isLoading,
    isFetching,
    isError,
    refetch,
  };
}

function useSyncSession() {
  const queryClient = useQueryClient();
  return async () => {
    // Cancel old-account reads before clearing them; late responses must not
    // overwrite the new session. Never make a successful OTP mutation appear to
    // fail just because the subsequent /me request had a network error.
    const canceled = clearSessionCache(queryClient);
    useAuthStore.getState().clearUser();
    await canceled;
    await queryClient
      .fetchQuery({
        queryKey: authKeys.me,
        queryFn: ({ signal }) => fetchMe(signal),
        retry: false,
        staleTime: 0,
      })
      .catch(() => undefined);
  };
}

export function useLogin() {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: login,
    onSuccess: result => (result.data?.newUser === false ? sync() : undefined),
  });
}

export function useLoginWithPassword() {
  const sync = useSyncSession();
  return useMutation({ mutationFn: loginWithPassword, onSuccess: sync });
}

export function useSendOtp() {
  return useMutation({ mutationFn: sendOtp });
}

export function useVerifyOtp() {
  return useMutation({ mutationFn: verifyOtp });
}

/**
 * ثبت‌نامِ مشتری.
 *
 * ردیابی در همین لایه (و نه در فرم‌ها) انجام می‌شود تا هر مسیری که به این
 * موتیشن می‌رسد — فرم ثبت‌نام، دیالوگ رزرو و در آینده هر فرم دیگر — یک
 * رویدادِ یکسان بفرستد و رویدادِ تکراری ساخته نشود.
 * هیچ داده شخصی در payload نیست.
 */
export function useSignUp(source: 'register' | 'booking_dialog' = 'register') {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: signUp,
    onMutate: () => {
      trackEvent('customer_registration_started', { source });
    },
    onSuccess: async () => {
      trackEvent('customer_registration_completed', { source });
      return sync();
    },
  });
}

/** ثبت‌نامِ آرایشگر — همان الگوی ردیابیِ بالا. */
export function useRegisterBarber() {
  const sync = useSyncSession();
  // Registration already issues tokens containing the new role.
  return useMutation({
    mutationFn: registerBarber,
    onMutate: () => {
      trackEvent('provider_registration_started', { source: 'provider_signup' });
    },
    onSuccess: async () => {
      trackEvent('provider_registration_completed', {
        source: 'provider_signup',
      });
      return sync();
    },
  });
}

/** دریافت توکن تازه — برای وقتی که نقش کاربر در سرور تغییر کرده است */
export function useRefreshSession() {
  const sync = useSyncSession();
  return useMutation({ mutationFn: refreshSession, onSuccess: sync });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      const canceled = clearSessionCache(queryClient);
      useAuthStore.getState().clearUser();
      await canceled;
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}

export function useRequestChangePasswordCode() {
  return useMutation({ mutationFn: requestChangePasswordCode });
}
