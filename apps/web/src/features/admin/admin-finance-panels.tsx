'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  CheckCircle2,
  CreditCard,
  Loader2,
  Search,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { formatVnd, OrderStatus, PayoutStatus } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface AdminOverviewResponse {
  kpis: {
    totalGmvVnd: number;
    platformRevenueVnd: number;
    instructorEarningsVnd: number;
    paidOrdersCount: number;
    totalUsers: number;
    totalStudents: number;
    totalInstructors: number;
    publishedCoursesCount: number;
    pendingCoursesCount: number;
    pendingInstructorsCount: number;
    pendingPayoutsCount: number;
    certificatesCount: number;
  };
  monthlySeries: Array<{
    month: string;
    gmvVnd: number;
    platformFeeVnd: number;
    ordersCount: number;
  }>;
  topCourses: Array<{
    id: string;
    slug: string;
    title: string;
    enrollmentCount: number;
    ratingAvg: number;
    priceVnd: number;
    salePriceVnd: number | null;
    instructor: { fullName: string };
  }>;
}

export function AdminOverviewPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics-overview'],
    queryFn: () => api.get<AdminOverviewResponse>('/analytics/admin/overview'),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary">
              <TrendingUp className="h-4 w-4" /> Tổng GMV (Đã thanh toán)
            </CardDescription>
            <CardTitle className="font-mono text-2xl text-primary">
              {formatVnd(data.kpis.totalGmvVnd)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Phí nền tảng Try4T (30%)</CardDescription>
            <CardTitle className="font-mono text-2xl text-emerald-600 dark:text-emerald-400">
              {formatVnd(data.kpis.platformRevenueVnd)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" /> Đơn hàng thành công
            </CardDescription>
            <CardTitle className="font-mono text-2xl">{data.kpis.paidOrdersCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-500" /> Chứng chỉ QR đã cấp
            </CardDescription>
            <CardTitle className="font-mono text-2xl">{data.kpis.certificatesCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* GMV & Platform Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tăng trưởng GMV &amp; Doanh thu sàn (6 tháng)</CardTitle>
          <CardDescription>
            Tổng giá trị giao dịch và phần hoa hồng nền tảng từ các đơn VietQR &amp; Sandbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlySeries}>
                <defs>
                  <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`
                  }
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatVnd(Number(value ?? 0)),
                    name === 'gmvVnd' ? 'Tổng GMV' : 'Doanh thu sàn',
                  ]}
                />
                <Area type="monotone" dataKey="gmvVnd" stroke="#10b981" strokeWidth={2.5} fill="url(#gmvGrad)" />
                <Area type="monotone" dataKey="platformFeeVnd" stroke="#0ea5e9" strokeWidth={2} fill="url(#feeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Courses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top khóa học nổi bật trên sàn</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border text-sm">
            {data.topCourses.map((c, idx) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-xs font-bold">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">GV: {c.instructor.fullName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 font-mono text-xs">
                  <span>{c.enrollmentCount} HV</span>
                  <span className="text-amber-500">★ {c.ratingAvg.toFixed(1)}</span>
                  <span className="font-bold text-primary">
                    {formatVnd(c.salePriceVnd ?? c.priceVnd)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// ADMIN ORDERS RECONCILIATION PANEL
// ============================================================================

interface AdminOrderItem {
  id: string;
  orderCode: string;
  totalVnd: number;
  discountVnd: number;
  status: OrderStatus;
  paymentMethod: string;
  createdAt: string;
  user: { fullName: string; email: string };
  coupon: { code: string } | null;
  items: Array<{ id: string; course: { title: string } }>;
  transactions: Array<{ provider: string; status: string; amountVnd: number }>;
}

export function AdminOrdersPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState('');
  const [search, setSearch] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', statusFilter, search],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (search.trim()) qs.set('search', search.trim());
      return api.get<{ statusCounts: Record<string, number>; items: AdminOrderItem[] }>(
        `/commerce/admin/orders?${qs.toString()}`,
      );
    },
  });

  const confirmOrderMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`/commerce/admin/orders/${orderId}/confirm`),
    onSuccess: () => {
      notify.success('Đã xác nhận thanh toán & kích hoạt khóa học cho học viên!');
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-analytics-overview'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Xác nhận đơn thất bại');
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Đối soát đơn hàng &amp; Giao dịch VietQR</CardTitle>
          <CardDescription>
            Tra cứu đơn hàng theo mã TRY4T, kiểm tra trạng thái webhook và hỗ trợ đối soát thủ công.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mã đơn, email..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          {[
            { k: '', l: 'Tất cả' },
            { k: OrderStatus.PAID, l: 'Đã TT' },
            { k: OrderStatus.PENDING, l: 'Chờ TT' },
            { k: OrderStatus.EXPIRED, l: 'Hết hạn' },
          ].map((s) => (
            <Button
              key={s.l}
              size="sm"
              variant={statusFilter === s.k ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s.k)}
              className="h-8 text-xs"
            >
              {s.l}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Chưa có đơn hàng nào khớp bộ lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-3 font-medium">Mã đơn</th>
                  <th className="pb-3 font-medium">Học viên</th>
                  <th className="pb-3 font-medium">Khóa học</th>
                  <th className="pb-3 font-medium">Số tiền</th>
                  <th className="pb-3 font-medium">Trạng thái</th>
                  <th className="pb-3 text-right font-medium">Đối soát</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((ord) => (
                  <tr key={ord.id} className="hover:bg-secondary/35">
                    <td className="py-3 pr-3 font-mono font-bold">
                      #{ord.orderCode}
                      <p className="font-sans text-[10px] font-normal text-muted-foreground">
                        {new Date(ord.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{ord.user.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">{ord.user.email}</p>
                    </td>
                    <td className="max-w-xs py-3 pr-3 text-muted-foreground">
                      <p className="line-clamp-2">
                        {ord.items.map((i) => i.course.title).join(', ')}
                      </p>
                    </td>
                    <td className="py-3 pr-3 font-mono font-bold text-primary">
                      {formatVnd(ord.totalVnd)}
                      {ord.coupon && (
                        <p className="text-[10px] font-normal text-muted-foreground">
                          Mã: {ord.coupon.code}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge
                        variant={
                          ord.status === OrderStatus.PAID
                            ? 'success'
                            : ord.status === OrderStatus.PENDING
                              ? 'warning'
                              : 'outline'
                        }
                      >
                        {ord.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      {ord.status !== OrderStatus.PAID && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={confirmOrderMutation.isPending}
                          onClick={async () => {
                            const ok = await confirmAction({
                              title: `Xác nhận đã nhận tiền cho #${ord.orderCode}?`,
                              description:
                                'Hệ thống sẽ kích hoạt toàn bộ khóa học trong đơn và cộng doanh thu vào ví giảng viên.',
                              confirmLabel: 'Xác nhận PAID',
                            });
                            if (ok) confirmOrderMutation.mutate(ord.id);
                          }}
                          className="h-7 text-[11px]"
                        >
                          Duyệt PAID
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ADMIN PAYOUTS APPROVAL PANEL
// ============================================================================

interface AdminPayoutItem {
  id: string;
  amountVnd: number;
  status: PayoutStatus;
  bankSnapshotJson: {
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
  };
  adminNote: string | null;
  transferProofUrl: string | null;
  createdAt: string;
  instructor: { id: string; fullName: string; email: string };
}

export function AdminPayoutsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>(PayoutStatus.PENDING);
  const [selectedPayout, setSelectedPayout] = React.useState<AdminPayoutItem | null>(null);
  const [transferProofUrl, setTransferProofUrl] = React.useState('');
  const [adminNote, setAdminNote] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', statusFilter],
    queryFn: () => {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      return api.get<{ statusCounts: Record<string, number>; items: AdminPayoutItem[] }>(
        `/payouts/admin${qs}`,
      );
    },
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'PAID' | 'REJECTED' }) =>
      api.post(`/payouts/admin/${id}/decision`, {
        action,
        adminNote: adminNote.trim() || null,
        transferProofUrl: action === 'PAID' ? transferProofUrl.trim() || null : null,
      }),
    onSuccess: (_res, vars) => {
      notify.success(
        vars.action === 'PAID'
          ? 'Đã giải ngân lệnh rút tiền & trừ sổ cái ví giảng viên!'
          : 'Đã từ chối lệnh rút tiền (số dư đã hoàn lại ví giảng viên).',
      );
      setSelectedPayout(null);
      setTransferProofUrl('');
      setAdminNote('');
      void queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-analytics-overview'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Xử lý lệnh rút thất bại');
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Duyệt yêu cầu rút tiền Giảng viên
            </CardTitle>
            <CardDescription>
              Xác nhận giải ngân (đính kèm link chứng từ chuyển khoản) hoặc từ chối kèm lý do.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { k: PayoutStatus.PENDING, l: 'Chờ duyệt' },
              { k: PayoutStatus.PAID, l: 'Đã giải ngân' },
              { k: PayoutStatus.REJECTED, l: 'Từ chối' },
              { k: '', l: 'Tất cả' },
            ].map((s) => (
              <Button
                key={s.l}
                size="sm"
                variant={statusFilter === s.k ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s.k)}
                className="h-8 text-xs"
              >
                {s.l}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Không có yêu cầu rút tiền nào trong trạng thái này.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.items.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="space-y-1 text-xs">
                    <p className="text-sm font-bold">
                      {p.instructor.fullName}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({p.instructor.email})
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Ngân hàng: <strong>{p.bankSnapshotJson?.bankName || '—'}</strong> • STK:{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {p.bankSnapshotJson?.bankAccountNo || '—'}
                      </span>{' '}
                      • {p.bankSnapshotJson?.bankAccountName || '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Tạo lúc {new Date(p.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-extrabold text-primary">
                      {formatVnd(p.amountVnd)}
                    </span>
                    <Badge
                      variant={
                        p.status === PayoutStatus.PAID
                          ? 'success'
                          : p.status === PayoutStatus.PENDING
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {p.status}
                    </Badge>
                    {p.status === PayoutStatus.PENDING && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedPayout(p);
                          setTransferProofUrl('');
                          setAdminNote('');
                        }}
                      >
                        Xử lý
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decide Payout Pop-up */}
      <Dialog
        open={Boolean(selectedPayout)}
        onClose={() => setSelectedPayout(null)}
        title="Xử lý yêu cầu giải ngân"
        maxWidthClass="max-w-md"
      >
        {selectedPayout && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs space-y-1">
              <p className="font-bold text-sm">{selectedPayout.instructor.fullName}</p>
              <p className="font-mono text-lg font-extrabold text-primary">
                {formatVnd(selectedPayout.amountVnd)}
              </p>
              <p className="text-muted-foreground">
                {selectedPayout.bankSnapshotJson?.bankName} •{' '}
                <span className="font-mono">{selectedPayout.bankSnapshotJson?.bankAccountNo}</span>{' '}
                • {selectedPayout.bankSnapshotJson?.bankAccountName}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proof-url">Link ảnh chứng từ chuyển khoản (tùy chọn khi duyệt PAID)</Label>
              <Input
                id="proof-url"
                value={transferProofUrl}
                onChange={(e) => setTransferProofUrl(e.target.value)}
                placeholder="https://res.cloudinary.com/..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-po-note">Ghi chú / Lý do từ chối (bắt buộc ≥ 5 ký tự nếu từ chối)</Label>
              <Textarea
                id="admin-po-note"
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="VD: Đã chuyển khoản qua MB Bank mã GD #FT2611..."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="destructive"
                disabled={decideMutation.isPending}
                onClick={() => {
                  if (adminNote.trim().length < 5) {
                    notify.error('Nhập lý do từ chối tối thiểu 5 ký tự nhé');
                    return;
                  }
                  decideMutation.mutate({ id: selectedPayout.id, action: 'REJECTED' });
                }}
                className="gap-1.5"
              >
                <XCircle className="h-4 w-4" />
                Từ chối
              </Button>
              <Button
                type="button"
                disabled={decideMutation.isPending}
                onClick={() => decideMutation.mutate({ id: selectedPayout.id, action: 'PAID' })}
                className="gap-1.5"
              >
                {decideMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Xác nhận Đã chuyển (PAID)
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
