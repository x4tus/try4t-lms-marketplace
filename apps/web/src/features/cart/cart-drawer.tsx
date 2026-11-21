'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ShoppingBag, Trash2, X } from 'lucide-react';
import { formatVnd } from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { CourseThumbnail } from '@/components/ui/course-thumbnail';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';
import { notify } from '@/lib/notify';
import { useCartStore } from './cart.store';

export function CartDrawer() {
  const { items, isOpen, closeDrawer, removeItem, clear, openCheckout } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const isAuthenticated = Boolean(user);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, closeDrawer]);

  if (!isOpen) return null;

  const subtotalOriginal = items.reduce((sum, item) => sum + item.priceVnd, 0);
  const totalPayable = items.reduce((sum, item) => sum + (item.salePriceVnd ?? item.priceVnd), 0);
  const savedAmount = Math.max(0, subtotalOriginal - totalPayable);

  function handleCheckoutClick() {
    if (!user) {
      closeDrawer();
      notify.info('Đăng nhập để tiếp tục thanh toán', {
        description: 'Giỏ hàng của bạn sẽ được tự động đồng bộ ngay sau khi đăng nhập.',
      });
      openLogin();
      return;
    }

    openCheckout(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={closeDrawer}
      />

      {/* Slide-over Panel */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-card text-card-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">Giỏ hàng của bạn</h2>
              <p className="text-xs text-muted-foreground">{items.length} khóa học đã chọn</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Đóng giỏ hàng"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold">Giỏ hàng đang trống</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Khám phá hàng loạt khóa học thực chiến và thêm vào giỏ để nhận ưu đãi ngay nhé.
              </p>
              <Link href="/courses" onClick={closeDrawer} className="mt-5">
                <Button size="sm">Khám phá khóa học</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const effectivePrice = item.salePriceVnd ?? item.priceVnd;
                return (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-xl border border-border bg-secondary/25 p-3"
                  >
                    <Link
                      href={`/courses/${item.slug}`}
                      onClick={closeDrawer}
                      className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-border"
                    >
                      <CourseThumbnail
                        src={item.thumbnailUrl}
                        alt={item.title}
                        compact
                        className="h-full w-full aspect-auto"
                      />
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/courses/${item.slug}`}
                        onClick={closeDrawer}
                        className="line-clamp-2 text-xs font-semibold leading-snug hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.instructorName}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-1.5 font-mono text-xs">
                          <span className="font-bold text-primary">
                            {formatVnd(effectivePrice)}
                          </span>
                          {item.salePriceVnd !== null && item.salePriceVnd < item.priceVnd && (
                            <span className="text-[10px] text-muted-foreground line-through">
                              {formatVnd(item.priceVnd)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeItem(item.id, isAuthenticated)}
                          aria-label="Xóa khỏi giỏ"
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => void clear(isAuthenticated)}
                  className="cursor-pointer text-xs text-muted-foreground hover:text-destructive"
                >
                  Xóa toàn bộ giỏ hàng
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Summary */}
        {items.length > 0 && (
          <div className="space-y-3 border-t border-border bg-card p-5">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Tạm tính</span>
                <span className="font-mono">{formatVnd(subtotalOriginal)}</span>
              </div>
              {savedAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Tiết kiệm khuyến mãi</span>
                  <span className="font-mono">-{formatVnd(savedAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 text-sm font-bold">
                <span>Tổng thanh toán</span>
                <span className="font-mono text-base text-primary">{formatVnd(totalPayable)}</span>
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={handleCheckoutClick}>
              Tiến hành thanh toán
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
