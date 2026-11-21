'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Loader2,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
  XCircle,
} from 'lucide-react';
import { formatVnd, OrderStatus, PaymentMethod } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCartStore } from '@/features/cart/cart.store';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

interface CouponValidationResult {
  code: string;
  discountType: string;
  discountValue: number;
  maxDiscountVnd: number | null;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  eligibleCourseIds: string[];
}

export interface OrderDetailResponse {
  id: string;
  orderCode: string;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  coupon: { code: string } | null;
  items: Array<{
    id: string;
    courseId: string;
    unitPriceVnd: number;
    discountVnd: number;
    netPriceVnd: number;
    course: {
      id: string;
      slug: string;
      title: string;
      thumbnailUrl: string | null;
    };
  }>;
  vietQr: {
    bankCode: string;
    accountNo: string;
    accountName: string;
    amountVnd: number;
    transferContent: string;
    qrImageUrl: string | null;
  };
  sandboxEnabled: boolean;
}

function formatCountdown(expiresAtIso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - nowMs) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CheckoutModal() {
  const { items, isCheckoutOpen, resumeOrderId, closeCheckout, refreshFromServer } = useCartStore();
  const queryClient = useQueryClient();

  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(PaymentMethod.VIETQR);
  const [couponInput, setCouponInput] = React.useState('');
  const [appliedCoupon, setAppliedCoupon] = React.useState<CouponValidationResult | null>(null);
  const [activeOrderId, setActiveOrderId] = React.useState<string | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const paidHandledRef = React.useRef<string | null>(null);

  // Đồng bộ khi mở modal với resumeOrderId hoặc reset state khi đóng
  React.useEffect(() => {
    if (isCheckoutOpen) {
      setActiveOrderId(resumeOrderId ?? null);
      setCouponInput('');
      setAppliedCoupon(null);
      paidHandledRef.current = null;
    }
  }, [isCheckoutOpen, resumeOrderId]);

  // Reset coupon nếu giỏ hàng thay đổi trước khi tạo đơn
  const cartCourseIdsKey = items.map((i) => i.id).join(',');
  React.useEffect(() => {
    setAppliedCoupon(null);
  }, [cartCourseIdsKey]);

  // Countdown tick mỗi giây khi đang ở bước thanh toán
  React.useEffect(() => {
    if (!isCheckoutOpen || !activeOrderId) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isCheckoutOpen, activeOrderId]);

  const { data: activeOrder, isLoading: loadingOrder } = useQuery({
    queryKey: ['commerce-order-detail', activeOrderId],
    queryFn: () => api.get<OrderDetailResponse>(`/commerce/orders/${activeOrderId}`),
    enabled: isCheckoutOpen && Boolean(activeOrderId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === OrderStatus.PENDING) return 3000;
      return false;
    },
  });

  // Tự động đồng bộ giỏ hàng & học liệu ngay khi đơn chuyển sang PAID
  React.useEffect(() => {
    if (activeOrder?.status === OrderStatus.PAID && paidHandledRef.current !== activeOrder.id) {
      paidHandledRef.current = activeOrder.id;
      notify.success('Thanh toán thành công! Khóa học đã được mở khóa.', {
        description: `Đơn hàng #${activeOrder.orderCode} đã kích hoạt trọn đời.`,
      });
      void refreshFromServer();
      void queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-course-detail'] });
    }
  }, [activeOrder, queryClient, refreshFromServer]);

  const validateCouponMutation = useMutation({
    mutationFn: (code: string) =>
      api.post<CouponValidationResult>('/commerce/coupons/validate', {
        code,
        courseIds: items.map((i) => i.id),
      }),
    onSuccess: (res) => {
      setAppliedCoupon(res);
      notify.success(`Áp dụng mã ${res.code} thành công!`, {
        description: `Giảm ngay ${formatVnd(res.discountVnd)} cho đơn hàng.`,
      });
    },
    onError: (err) => {
      setAppliedCoupon(null);
      notify.error(err instanceof ApiClientError ? err.message : 'Mã giảm giá không hợp lệ');
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.post<OrderDetailResponse>('/commerce/orders', {
        courseIds: items.map((i) => i.id),
        couponCode: appliedCoupon?.code ?? null,
        paymentMethod,
      }),
    onSuccess: (order) => {
      setActiveOrderId(order.id);
      queryClient.setQueryData(['commerce-order-detail', order.id], order);
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      if (order.status !== OrderStatus.PAID) {
        notify.info(`Đã tạo đơn #${order.orderCode}`, {
          description: 'Quét mã VietQR hoặc bấm giả lập Sandbox bên dưới để hoàn tất.',
        });
      }
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể tạo đơn hàng');
    },
  });

  const sandboxPayMutation = useMutation({
    mutationFn: ({ orderId, outcome }: { orderId: string; outcome: 'SUCCEED' | 'FAIL' | 'EXPIRE' }) =>
      api.post<OrderDetailResponse>(`/commerce/orders/${orderId}/sandbox-pay`, { outcome }),
    onSuccess: (order) => {
      queryClient.setQueryData(['commerce-order-detail', order.id], order);
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      if (order.status === OrderStatus.FAILED) {
        notify.error('Đã giả lập giao dịch thất bại');
      } else if (order.status === OrderStatus.EXPIRED) {
        notify.warning('Đã giả lập đơn hàng hết hạn 15 phút');
      }
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Thao tác Sandbox thất bại');
    },
  });

  function copyValue(key: string, value: string) {
    void navigator.clipboard.writeText(value);
    setCopiedField(key);
    notify.success('Đã sao chép vào bộ nhớ tạm');
    window.setTimeout(() => setCopiedField(null), 1800);
  }

  const subtotalVnd = items.reduce((sum, i) => sum + (i.salePriceVnd ?? i.priceVnd), 0);
  const discountVnd = appliedCoupon?.discountVnd ?? 0;
  const finalTotalVnd = Math.max(0, subtotalVnd - discountVnd);

  const firstPurchasedCourse = activeOrder?.items[0]?.course ?? null;

  return (
    <Dialog
      open={isCheckoutOpen}
      onClose={closeCheckout}
      title={
        activeOrderId
          ? activeOrder?.status === OrderStatus.PAID
            ? 'Kích hoạt khóa học thành công!'
            : `Thanh toán đơn hàng #${activeOrder?.orderCode ?? '...'}`
          : 'Xác nhận đơn hàng & Thanh toán'
      }
      description={
        activeOrderId
          ? 'Hệ thống tự động kiểm tra giao dịch mỗi 3 giây và mở khóa ngay khi nhận đủ tiền.'
          : 'Áp dụng mã giảm giá và chọn phương thức thanh toán VietQR tự động hoặc Sandbox.'
      }
      maxWidthClass="max-w-2xl"
    >
      {/* STEP 1: REVIEW CART & COUPON */}
      {!activeOrderId && (
        <div className="space-y-5">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Giỏ hàng của bạn đang trống.
            </div>
          ) : (
            <>
              {/* Course List */}
              <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1">
                {items.map((item) => {
                  const effective = item.salePriceVnd ?? item.priceVnd;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-secondary/25 p-2.5"
                    >
                      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {item.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.instructorName}</p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold text-primary">
                        {formatVnd(effective)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Coupon Input */}
              {subtotalVnd > 0 && (
                <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      Mã giảm giá (Coupon)
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-muted-foreground">Thử nhanh:</span>
                      {['TRY4T20', 'WELCOME100K'].map((sample) => (
                        <button
                          key={sample}
                          type="button"
                          onClick={() => {
                            setCouponInput(sample);
                            validateCouponMutation.mutate(sample);
                          }}
                          className="cursor-pointer rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-primary/20"
                        >
                          {sample}
                        </button>
                      ))}
                    </div>
                  </div>

                  {appliedCoupon ? (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>
                          Đã áp dụng <strong className="font-mono">{appliedCoupon.code}</strong> —
                          Giảm <strong className="font-mono">{formatVnd(appliedCoupon.discountVnd)}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponInput('');
                        }}
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Gỡ mã giảm giá"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const clean = couponInput.trim().toUpperCase();
                        if (!clean) return;
                        validateCouponMutation.mutate(clean);
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Nhập mã giảm giá (VD: TRY4T20)"
                        className="h-9 font-mono text-xs uppercase"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="secondary"
                        disabled={!couponInput.trim() || validateCouponMutation.isPending}
                        className="shrink-0"
                      >
                        {validateCouponMutation.isPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Áp dụng
                      </Button>
                    </form>
                  )}
                </div>
              )}

              {/* Payment Method Selector */}
              {finalTotalVnd > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Phương thức thanh toán</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod(PaymentMethod.VIETQR)}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all',
                        paymentMethod === PaymentMethod.VIETQR
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-border hover:bg-secondary/40',
                      )}
                    >
                      <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="text-xs font-semibold">Chuyển khoản VietQR 24/7</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Quét mã QR ngân hàng, SePay tự động kích hoạt sau vài giây.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod(PaymentMethod.SANDBOX)}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all',
                        paymentMethod === PaymentMethod.SANDBOX
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-border hover:bg-secondary/40',
                      )}
                    >
                      <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      <div>
                        <p className="text-xs font-semibold">Try4T Sandbox (Test nhanh)</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Mô phỏng thanh toán thành công / thất bại / hết hạn chỉ với 1 click.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>
                    Tổng đơn hàng là <strong>0 ₫</strong>. Khóa học sẽ được kích hoạt ngay lập tức
                    khi bạn bấm xác nhận!
                  </span>
                </div>
              )}

              {/* Totals */}
              <div className="space-y-1.5 rounded-xl border border-border bg-card p-4 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Tạm tính ({items.length} khóa học)</span>
                  <span className="font-mono">{formatVnd(subtotalVnd)}</span>
                </div>
                {discountVnd > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Giảm giá Coupon ({appliedCoupon?.code})</span>
                    <span className="font-mono">-{formatVnd(discountVnd)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
                  <span>Tổng thanh toán</span>
                  <span className="font-mono text-lg text-primary">{formatVnd(finalTotalVnd)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeCheckout}>
                  Để sau
                </Button>
                <Button
                  type="button"
                  size="lg"
                  disabled={createOrderMutation.isPending}
                  onClick={() => createOrderMutation.mutate()}
                  className="gap-2"
                >
                  {createOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {finalTotalVnd === 0 ? 'Kích hoạt miễn phí ngay' : 'Tạo đơn & Lấy mã QR'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 2: ACTIVE ORDER (PENDING QR / PAID / FAILED / EXPIRED) */}
      {activeOrderId && (
        <div>
          {loadingOrder || !activeOrder ? (
            <div className="flex flex-col items-center justify-center py-14 text-sm text-muted-foreground">
              <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" />
              Đang tải thông tin đơn hàng...
            </div>
          ) : activeOrder.status === OrderStatus.PAID ? (
            <div className="space-y-5 py-3 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold">Chúc mừng! Khóa học đã sẵn sàng</h3>
                <p className="text-sm text-muted-foreground">
                  Đơn hàng <span className="font-mono font-semibold">#{activeOrder.orderCode}</span>{' '}
                  đã được xác nhận ({formatVnd(activeOrder.totalVnd)}). Toàn bộ bài giảng đã mở khóa
                  trọn đời.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-secondary/25 p-3 text-left">
                {activeOrder.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{it.course.title}</span>
                    <Link
                      href={`/learn/${it.course.slug}`}
                      onClick={closeCheckout}
                      className="shrink-0 font-semibold text-primary hover:underline"
                    >
                      Vào học →
                    </Link>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                {firstPurchasedCourse && (
                  <Link href={`/learn/${firstPurchasedCourse.slug}`} onClick={closeCheckout}>
                    <Button size="lg" className="gap-2">
                      <Play className="h-4 w-4 fill-current" />
                      Vào phòng học ngay
                    </Button>
                  </Link>
                )}
                <Link href="/my-courses" onClick={closeCheckout}>
                  <Button size="lg" variant="outline" className="gap-2">
                    Khóa học của tôi
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : activeOrder.status === OrderStatus.FAILED ||
            activeOrder.status === OrderStatus.EXPIRED ? (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                {activeOrder.status === OrderStatus.EXPIRED ? (
                  <Clock className="h-7 w-7" />
                ) : (
                  <XCircle className="h-7 w-7" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">
                  {activeOrder.status === OrderStatus.EXPIRED
                    ? 'Đơn hàng đã hết hạn (15 phút)'
                    : 'Thanh toán không thành công'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Đơn <span className="font-mono">#{activeOrder.orderCode}</span> không còn hiệu
                  lực. Bạn có thể tạo lại đơn mới ngay bây giờ.
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" onClick={closeCheckout}>
                  Đóng
                </Button>
                {items.length > 0 && (
                  <Button onClick={() => setActiveOrderId(null)}>Tạo lại đơn hàng</Button>
                )}
              </div>
            </div>
          ) : (
            /* PENDING VIETQR + SANDBOX CONTROLS */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs">
                <span className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang chờ thanh toán • Tự động đối soát mỗi 3 giây
                </span>
                <Badge variant="warning" className="gap-1 font-mono">
                  <Clock className="h-3 w-3" />
                  Còn {formatCountdown(activeOrder.expiresAt, nowMs)}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-[210px_1fr]">
                {/* VietQR Code Image */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white p-3 text-center">
                  {activeOrder.vietQr.qrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeOrder.vietQr.qrImageUrl}
                      alt={`VietQR ${activeOrder.orderCode}`}
                      className="h-44 w-44 object-contain"
                    />
                  ) : (
                    <QrCode className="h-24 w-24 text-zinc-400" />
                  )}
                  <span className="mt-1.5 font-mono text-[10px] font-semibold text-zinc-700">
                    VietQR • {activeOrder.vietQr.bankCode}
                  </span>
                </div>

                {/* Bank Transfer Info */}
                <div className="space-y-2.5 text-xs">
                  <div className="rounded-xl border border-border bg-secondary/25 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Ngân hàng</span>
                      <span className="font-semibold">{activeOrder.vietQr.bankCode}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Chủ tài khoản</span>
                      <span className="font-semibold">{activeOrder.vietQr.accountName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Số tài khoản</span>
                      <button
                        type="button"
                        onClick={() => copyValue('acc', activeOrder.vietQr.accountNo)}
                        className="inline-flex cursor-pointer items-center gap-1.5 font-mono font-bold text-foreground hover:text-primary"
                      >
                        {activeOrder.vietQr.accountNo}
                        {copiedField === 'acc' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Số tiền chính xác</span>
                      <button
                        type="button"
                        onClick={() => copyValue('amt', String(activeOrder.totalVnd))}
                        className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-sm font-extrabold text-primary"
                      >
                        {formatVnd(activeOrder.totalVnd)}
                        {copiedField === 'amt' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                      <span className="text-muted-foreground">Nội dung CK (bắt buộc)</span>
                      <button
                        type="button"
                        onClick={() => copyValue('code', activeOrder.vietQr.transferContent)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary/15 px-2 py-0.5 font-mono font-bold text-primary"
                      >
                        {activeOrder.vietQr.transferContent}
                        {copiedField === 'code' ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    Chuyển đúng số tiền và giữ nguyên mã <strong className="font-mono">{activeOrder.orderCode}</strong> để hệ thống tự động kích hoạt khóa học.
                  </p>
                </div>
              </div>

              {/* Sandbox Testing Controls */}
              {activeOrder.sandboxEnabled && (
                <div className="space-y-2.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary">
                      Chế độ Sandbox Dev/Demo (Mô phỏng Webhook ngân hàng)
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      PAYMENT_SANDBOX_ENABLED=true
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={sandboxPayMutation.isPending}
                      onClick={() =>
                        sandboxPayMutation.mutate({ orderId: activeOrder.id, outcome: 'SUCCEED' })
                      }
                      className="gap-1.5"
                    >
                      {sandboxPayMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Giả lập Thanh toán Thành công
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sandboxPayMutation.isPending}
                      onClick={() =>
                        sandboxPayMutation.mutate({ orderId: activeOrder.id, outcome: 'FAIL' })
                      }
                    >
                      Giả lập Thất bại
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sandboxPayMutation.isPending}
                      onClick={() =>
                        sandboxPayMutation.mutate({ orderId: activeOrder.id, outcome: 'EXPIRE' })
                      }
                    >
                      Giả lập Hết hạn
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
