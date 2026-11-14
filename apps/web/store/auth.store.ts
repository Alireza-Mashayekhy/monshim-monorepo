import { create } from 'zustand';

import { extractUser } from '@/lib/roles';
import { UserResponse } from '@/services/features/auth/types';

type AuthStore = {
  user: UserResponse | null;
  setUser: (user: UserResponse | UserResponse[] | null) => void;
  clearUser: () => void;
  /**
   * مقصد یک‌بارمصرفِ بعد از احراز هویت (فقط در حافظه).
   *
   * پس از ثبت‌نام موفق آرایشگر، هم فرم ثبت‌نام و هم `AuthProvider` (که می‌بیند
   * کاربرِ واردشده روی صفحهٔ auth است) هم‌زمان ریدایرکت می‌کنند. این مقدار
   * باعث می‌شود هر دو به یک مقصد بروند و مسابقه‌ای بینشان شکل نگیرد.
   */
  postAuthPath: string | null;
  setPostAuthPath: (path: string | null) => void;
};

export const useAuthStore = create<AuthStore>(set => ({
  user: null,
  postAuthPath: null,

  setPostAuthPath: postAuthPath => set({ postAuthPath }),

  setUser: user =>
    set({
      user: extractUser(user),
    }),

  clearUser: () =>
    set({
      user: null,
    }),
}));
