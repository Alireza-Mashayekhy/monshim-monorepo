'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { revalidatePublicBarberCache } from '@/lib/actions/public-page';
import { getApiErrorMessage } from '@/lib/api-error';
import { api } from '@/services/api/client';
import type { ApiSingleResponse } from '@/services/api/types';
import type { BarberResponse } from '@/services/features/barber/types';

export function SlugEditDialog({ barber }: { barber: BarberResponse }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(barber.slug ?? '');
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: async (value: string | null) => {
      const { data } = await api.patch<
        ApiSingleResponse<{ slug: string | null; previousSlug: string | null }>
      >(`/admin/barber/${barber.id}/slug`, { slug: value });
      return data.data;
    },
    onSuccess: result => {
      void queryClient.invalidateQueries({
        queryKey: ['adminBarberManagement'],
      });
      void queryClient.invalidateQueries({ queryKey: ['adminBarbers'] });
      void queryClient.invalidateQueries({ queryKey: ['barbers'] });
      void queryClient.invalidateQueries({ queryKey: ['homeBarbers'] });
      void revalidatePublicBarberCache({
        userId: barber.id,
        slugs: [result.previousSlug, result.slug],
      }).catch(() => false);
      toast.success('اسلاگ صفحه به‌روزرسانی شد.');
      setOpen(false);
    },
    onError: error =>
      toast.error(getApiErrorMessage(error, 'ذخیره اسلاگ انجام نشد.')),
  });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setSlug(barber.slug ?? '');
          setOpen(true);
        }}
      >
        <Pencil size={14} /> ویرایش اسلاگ
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!update.isPending) setOpen(value);
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ویرایش اسلاگ {barber.salonName}</DialogTitle>
            <DialogDescription>
              تغییر یا حذف اسلاگ، آدرس قبلی صفحه را از دسترس خارج می‌کند. برای
              حذف، فیلد را خالی بگذارید.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault();
              update.mutate(slug.trim() || null);
            }}
          >
            <label
              className="block text-sm font-medium"
              htmlFor={`admin-slug-${barber.id}`}
            >
              اسلاگ صفحهٔ اختصاصی
            </label>
            <Input
              id={`admin-slug-${barber.id}`}
              dir="ltr"
              value={slug}
              onChange={event => setSlug(event.target.value)}
              maxLength={80}
              disabled={update.isPending}
            />
            <Button type="submit" loading={update.isPending}>
              ذخیره اسلاگ
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
