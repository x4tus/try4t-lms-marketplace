'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Power, TicketPercent, Trash2 } from 'lucide-react';
import { DiscountType, formatVnd } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { InstructorCourseSummary } from '@/features/course-builder/types';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface CouponItem {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountVnd: number | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  course: { id: string; title: string } | null;
}

interface InstructorCouponsPanelProps {
  courses: InstructorCourseSummary[];
}

export function InstructorCouponsPanel({ courses }: InstructorCouponsPanelProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [courseId, setCourseId] = React.useState('');
  const [discountType, setDiscountType] = React.useState<DiscountType>(DiscountType.PERCENT);
  const [discountValue, setDiscountValue] = React.useState('20');
  const [maxDiscountVnd, setMaxDiscountVnd] = React.useState('200000');
  const [usageLimit, setUsageLimit] = React.useState('100');
  const [expiresAt, setExpiresAt] = React.useState('');

  const { data: coupons, isLoading } = useQuery({
    queryKey: ['instructor-coupons'],
    queryFn: () => api.get<CouponItem[]>('/commerce/coupons'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/commerce/coupons', {
        code: code.trim().toUpperCase(),
        courseId: courseId || null,
        discountType,
        discountValue: Number(discountValue),
        maxDiscountVnd:
          discountType === DiscountType.PERCENT && maxDiscountVnd.trim()
            ? Number(maxDiscountVnd)
            : null,
        usageLimit: usageLimit.trim() ? Number(usageLimit) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isActive: true,
      }),
    onSuccess: () => {
      notify.success('Đã tạo mã giảm giá mới!');
      setModalOpen(false);
      setCode('');
      setCourseId('');
      setExpiresAt('');
      void queryClient.invalidateQueries({ queryKey: ['instructor-coupons'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Tạo mã giảm giá thất bại');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/commerce/coupons/${id}`, { isActive }),
    onSuccess: () => {
      notify.success('Đã cập nhật trạng thái mã giảm giá');
      void queryClient.invalidateQueries({ queryKey: ['instructor-coupons'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/commerce/coupons/${id}`),
    onSuccess: () => {
      notify.success('Đã xóa mã giảm giá');
      void queryClient.invalidateQueries({ queryKey: ['instructor-coupons'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TicketPercent className="h-5 w-5 text-primary" />
              Quản lý mã giảm giá (Coupon)
            </CardTitle>
            <CardDescription>
              Tạo mã ưu đãi theo % hoặc số tiền cố định áp dụng cho 1 khóa hoặc toàn bộ khóa học của
              bạn.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Tạo mã Coupon
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !coupons || coupons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Bạn chưa tạo mã giảm giá nào. Bấm &ldquo;Tạo mã Coupon&rdquo; để thúc đẩy doanh số khóa học.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-3 font-medium">Mã Coupon</th>
                    <th className="pb-3 font-medium">Mức giảm</th>
                    <th className="pb-3 font-medium">Phạm vi</th>
                    <th className="pb-3 font-medium">Lượt dùng</th>
                    <th className="pb-3 font-medium">Trạng thái</th>
                    <th className="pb-3 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coupons.map((cp) => (
                    <tr key={cp.id} className="hover:bg-secondary/35">
                      <td className="py-3 pr-4">
                        <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                          {cp.code}
                        </span>
                        {cp.expiresAt && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            HSD: {new Date(cp.expiresAt).toLocaleDateString('vi-VN')}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {cp.discountType === DiscountType.PERCENT ? (
                          <div>
                            <p className="font-bold">Giảm {cp.discountValue}%</p>
                            {cp.maxDiscountVnd && (
                              <p className="text-[11px] text-muted-foreground">
                                Tối đa {formatVnd(cp.maxDiscountVnd)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="font-bold">Giảm {formatVnd(cp.discountValue)}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {cp.course ? cp.course.title : 'Tất cả khóa của tôi'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {cp.usedCount} / {cp.usageLimit ?? '∞'}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={cp.isActive ? 'success' : 'secondary'}>
                          {cp.isActive ? 'Đang bật' : 'Tạm khóa'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              toggleMutation.mutate({ id: cp.id, isActive: !cp.isActive })
                            }
                            title={cp.isActive ? 'Tạm khóa' : 'Bật lại'}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              const ok = await confirmAction({
                                title: `Xóa mã "${cp.code}"?`,
                                description:
                                  'Học viên sẽ không thể dùng mã này nữa. Các đơn cũ đã dùng vẫn được giữ nguyên lịch sử.',
                                confirmLabel: 'Xóa mã',
                                destructive: true,
                              });
                              if (ok) deleteMutation.mutate(cp.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Coupon Pop-up */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tạo mã giảm giá (Coupon)"
        description="Học viên nhập mã này trực tiếp tại bước thanh toán VietQR / Sandbox."
        maxWidthClass="max-w-md"
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length < 3) {
              notify.error('Mã giảm giá cần tối thiểu 3 ký tự (VD: SALE30)');
              return;
            }
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cp-code">Mã Coupon</Label>
            <Input
              id="cp-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="VD: TRY4T30"
              className="font-mono uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-course">Phạm vi áp dụng</Label>
            <select
              id="cp-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">Tất cả khóa học của tôi</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-type">Loại giảm giá</Label>
              <select
                id="cp-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value={DiscountType.PERCENT}>Phần trăm (%)</option>
                <option value={DiscountType.FIXED_AMOUNT}>Số tiền (VNĐ)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-val">
                {discountType === DiscountType.PERCENT ? 'Giá trị (%)' : 'Số tiền giảm (₫)'}
              </Label>
              <Input
                id="cp-val"
                type="number"
                step={1}
                min={1}
                max={discountType === DiscountType.PERCENT ? 100 : 50_000_000}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {discountType === DiscountType.PERCENT && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-max">Giảm tối đa (₫)</Label>
                <Input
                  id="cp-max"
                  type="number"
                  step={1}
                  min={1000}
                  value={maxDiscountVnd}
                  onChange={(e) => setMaxDiscountVnd(e.target.value)}
                  placeholder="Bỏ trống = không giới hạn"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cp-limit">Giới hạn lượt dùng</Label>
              <Input
                id="cp-limit"
                type="number"
                step={1}
                min={1}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="Bỏ trống = không giới hạn"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-exp">Ngày hết hạn (tùy chọn)</Label>
            <Input
              id="cp-exp"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tạo mã Coupon
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
