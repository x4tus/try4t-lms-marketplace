'use client';

import { create } from 'zustand';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

const CART_STORAGE_KEY = 'try4t_guest_cart_v1';

export interface CartCourseItem {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  instructorName: string;
  priceVnd: number;
  salePriceVnd: number | null;
}

function readStoredCart(): CartCourseItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartCourseItem[]) : [];
  } catch {
    return [];
  }
}

function writeStoredCart(items: CartCourseItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

interface CartState {
  items: CartCourseItem[];
  isOpen: boolean;
  isCheckoutOpen: boolean;
  resumeOrderId: string | null;
  hydrated: boolean;
  syncing: boolean;
  hydrate: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  openCheckout: (resumeOrderId?: string | null) => void;
  closeCheckout: () => void;
  syncWithServer: () => Promise<void>;
  refreshFromServer: () => Promise<void>;
  addItem: (item: CartCourseItem, isAuthenticated?: boolean) => Promise<void>;
  removeItem: (courseId: string, isAuthenticated?: boolean) => Promise<void>;
  clear: (isAuthenticated?: boolean) => Promise<void>;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isOpen: false,
  isCheckoutOpen: false,
  resumeOrderId: null,
  hydrated: false,
  syncing: false,

  hydrate: () => {
    set({ items: readStoredCart(), hydrated: true });
  },

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),

  openCheckout: (resumeOrderId = null) =>
    set({ isOpen: false, isCheckoutOpen: true, resumeOrderId }),
  closeCheckout: () => set({ isCheckoutOpen: false, resumeOrderId: null }),

  syncWithServer: async () => {
    set({ syncing: true });
    try {
      const guestItems = readStoredCart();
      const guestIds = guestItems.map((i) => i.id);
      const res = await api.post<{ items: CartCourseItem[]; removedReasons: string[] }>(
        '/commerce/cart/sync',
        { courseIds: guestIds },
      );
      writeStoredCart([]);
      set({ items: res.items, syncing: false });

      if (res.removedReasons.length > 0) {
        notify.info('Giỏ hàng đã được cập nhật tự động', {
          description: res.removedReasons[0],
        });
      }
    } catch {
      set({ syncing: false });
    }
  },

  refreshFromServer: async () => {
    try {
      const items = await api.get<CartCourseItem[]>('/commerce/cart');
      set({ items });
    } catch {
      // ignore if guest or offline
    }
  },

  addItem: async (item, isAuthenticated = false) => {
    const existing = get().items.some((i) => i.id === item.id);
    if (existing) {
      notify.info('Khóa học đã có sẵn trong giỏ hàng', {
        description: item.title,
      });
      set({ isOpen: true });
      return;
    }

    if (isAuthenticated) {
      try {
        const items = await api.post<CartCourseItem[]>('/commerce/cart', {
          courseId: item.id,
        });
        set({ items });
        notify.success('Đã thêm vào giỏ hàng!', {
          description: item.title,
        });
      } catch (err) {
        notify.error(err instanceof ApiClientError ? err.message : 'Không thể thêm vào giỏ hàng');
      }
      return;
    }

    const next = [item, ...get().items];
    writeStoredCart(next);
    set({ items: next });
    notify.success('Đã thêm vào giỏ hàng!', {
      description: item.title,
    });
  },

  removeItem: async (courseId, isAuthenticated = false) => {
    const prev = get().items;
    const next = prev.filter((i) => i.id !== courseId);
    set({ items: next });

    if (isAuthenticated) {
      try {
        const serverItems = await api.delete<CartCourseItem[]>(`/commerce/cart/${courseId}`);
        set({ items: serverItems });
      } catch {
        set({ items: prev });
      }
      return;
    }

    writeStoredCart(next);
  },

  clear: async (isAuthenticated = false) => {
    const prev = get().items;
    set({ items: [] });

    if (isAuthenticated) {
      try {
        await Promise.all(prev.map((item) => api.delete(`/commerce/cart/${item.id}`)));
      } catch {
        // ignore partial failures
      }
      return;
    }

    writeStoredCart([]);
  },
}));
