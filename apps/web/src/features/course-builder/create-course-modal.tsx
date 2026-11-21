'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  CourseLevel,
  createCourseSchema,
  formatVnd,
  type CourseProgressionMode,
  type CreateCourseInput,
} from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import type { CategoryOption } from './types';

interface CreateCourseModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateCourseModal({ open, onClose }: CreateCourseModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [progressionMode, setProgressionMode] = React.useState<CourseProgressionMode>('FREE');
  const [blockFastForward, setBlockFastForward] = React.useState(true);
  const [maxSeekAheadPercent, setMaxSeekAheadPercent] = React.useState(5);

  const { data: categories } = useQuery({
    queryKey: ['public-categories'],
    queryFn: () => api.get<CategoryOption[]>('/categories'),
  });

  const form = useForm<z.input<typeof createCourseSchema>, unknown, CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      categoryId: undefined,
      level: CourseLevel.ALL,
      priceVnd: 0,
      salePriceVnd: undefined,
      sequentialLockEnabled: false,
      minWatchPercent: 80,
    },
  });

  async function onSubmit(values: CreateCourseInput) {
    try {
      const created = await api.post<{ id: string }>('/instructor/courses', {
        ...values,
        categoryId: values.categoryId || null,
        sequentialLockEnabled: progressionMode !== 'FREE',
        progressionConfig: {
          mode: progressionMode,
          blockFastForward,
          maxSeekAheadPercent,
        },
        salePriceVnd:
          values.salePriceVnd === undefined || Number.isNaN(values.salePriceVnd)
            ? null
            : values.salePriceVnd,
      });
      await queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
      notify.success('Đã tạo khóa học nháp!', {
        description: 'Đang mở Course Builder để bạn bắt đầu soạn giáo trình.',
      });
      form.reset();
      setProgressionMode('FREE');
      setBlockFastForward(true);
      setMaxSeekAheadPercent(5);
      onClose();
      router.push(`/instructor/courses/${created.id}/builder`);
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể tạo khóa học');
    }
  }

  const watchPrice = Number(form.watch('priceVnd') || 0);
  const watchSale = form.watch('salePriceVnd');
  const discountPercent =
    watchPrice > 0 &&
    typeof watchSale === 'number' &&
    !Number.isNaN(watchSale) &&
    watchSale >= 0 &&
    watchSale < watchPrice
      ? Math.round(((watchPrice - watchSale) / watchPrice) * 100)
      : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tạo khóa học mới trên Try4T"
      description="Khởi tạo thông tin nền tảng — bạn sẽ xây dựng giáo trình kéo thả ngay bước kế tiếp."
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="cc-title">Tên khóa học *</Label>
          <Input
            id="cc-title"
            placeholder="VD: Full-Stack Next.js & NestJS Thực Chiến Từ A-Z"
            {...form.register('title')}
          />
          {form.formState.errors.title && (
            <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cc-subtitle">Mô tả ngắn hấp dẫn</Label>
          <Input
            id="cc-subtitle"
            placeholder="Xây dựng sản phẩm thương mại hóa với Prisma, PostgreSQL & Cloud..."
            {...form.register('subtitle')}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cc-category">Danh mục</Label>
            <select
              id="cc-category"
              className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              {...form.register('categoryId')}
            >
              <option value="">-- Chọn danh mục --</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-level">Trình độ</Label>
            <select
              id="cc-level"
              className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              {...form.register('level')}
            >
              <option value={CourseLevel.ALL}>Mọi trình độ</option>
              <option value={CourseLevel.BEGINNER}>Cơ bản (Beginner)</option>
              <option value={CourseLevel.INTERMEDIATE}>Trung cấp (Intermediate)</option>
              <option value={CourseLevel.ADVANCED}>Nâng cao (Advanced)</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cc-price">Giá gốc (VNĐ — 0 nếu miễn phí)</Label>
            <Input
              id="cc-price"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="VD: 799000"
              {...form.register('priceVnd', {
                setValueAs: (v) => (v === '' || v === null ? 0 : Number(v)),
              })}
            />
            <p className="font-mono text-[11px] text-muted-foreground">
              Hiển thị: {formatVnd(Number.isFinite(watchPrice) ? Math.max(0, watchPrice) : 0)}
            </p>
            {form.formState.errors.priceVnd && (
              <p className="text-xs text-destructive">{form.formState.errors.priceVnd.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-sale">Giá khuyến mãi (tùy chọn)</Label>
            <Input
              id="cc-sale"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="VD: 499000 (trống nếu không giảm)"
              {...form.register('salePriceVnd', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
            />
            {discountPercent !== null && (
              <p className="font-mono text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {formatVnd(Number(watchSale))} • Giảm {discountPercent}%
              </p>
            )}
            {form.formState.errors.salePriceVnd && (
              <p className="text-xs text-destructive">
                {form.formState.errors.salePriceVnd.message}
              </p>
            )}
          </div>
        </div>

        {/* Progression Rules & Anti-Seek */}
        <div className="space-y-3 rounded-xl border border-border bg-secondary/35 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Điều kiện mở khóa bài học &amp; Chống tua video
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-prog-mode" className="text-xs">
              Quy tắc mở bài tiếp theo
            </Label>
            <select
              id="cc-prog-mode"
              value={progressionMode}
              onChange={(e) => setProgressionMode(e.target.value as CourseProgressionMode)}
              className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-xs"
            >
              <option value="FREE">Học tự do (Mở tất cả chương &amp; bài học)</option>
              <option value="LESSON_SEQUENTIAL">
                Khóa tuần tự từng bài (Phải xong bài trước mới mở bài kế tiếp)
              </option>
              <option value="SECTION_SEQUENTIAL">
                Khóa theo từng Chương (Hoàn thành hết Chương 1 mới mở Chương 2...)
              </option>
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_130px] sm:items-center">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={blockFastForward}
                onChange={(e) => setBlockFastForward(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <strong>Chặn tua nhanh vượt phần chưa xem</strong> ngay khi học viên kéo thanh thời
                gian
              </span>
            </label>

            {blockFastForward && (
              <div className="space-y-1">
                <Label htmlFor="cc-seek-pct" className="text-[11px] text-muted-foreground">
                  Tua trước tối đa
                </Label>
                <select
                  id="cc-seek-pct"
                  value={maxSeekAheadPercent}
                  onChange={(e) => setMaxSeekAheadPercent(Number(e.target.value))}
                  className="flex h-8 w-full rounded-lg border border-input bg-card px-2 font-mono text-xs"
                >
                  <option value={0}>0% (Chặn tuyệt đối)</option>
                  <option value={5}>+5% thời lượng</option>
                  <option value={10}>+10% thời lượng</option>
                  <option value={15}>+15% thời lượng</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Tạo &amp; Mở Course Builder
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
