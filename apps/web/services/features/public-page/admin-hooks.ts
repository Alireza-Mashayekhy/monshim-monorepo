'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPublicPageDiscount,
  deletePublicPageDiscount,
  DiscountApplicableTo,
  getPublicPageDiscounts,
  updatePublicPageDiscount,
} from './admin-api';

const discountsKey = ['public-page-discounts'] as const;

export function usePublicPageDiscounts() {
  return useQuery({ queryKey: discountsKey, queryFn: getPublicPageDiscounts });
}

export function useCreatePublicPageDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPublicPageDiscount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountsKey }),
  });
}

export function useUpdatePublicPageDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dto
    }: {
      id: string;
      code?: string;
      percentOff?: number;
      isActive?: boolean;
      applicableTo?: DiscountApplicableTo;
      maxTotalUses?: number | null;
      maxUsesPerUser?: number | null;
      startsAt?: string | null;
      expiresAt?: string | null;
    }) => updatePublicPageDiscount(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountsKey }),
  });
}

export function useDeletePublicPageDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePublicPageDiscount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountsKey }),
  });
}
