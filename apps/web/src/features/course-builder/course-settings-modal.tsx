'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  CourseLevel,
  updateCourseSchema,
  type UpdateCourseInput,
} from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { ThumbnailCropModal } from './thumbnail-crop-modal';
import type { BuilderCourse, CategoryOption } from './types';

interface CourseSettingsModalProps {
  open: boolean;
  onClose: () => void;
  course: BuilderCourse;
  onSaved: () => void;
}

export function CourseSettingsModal({
  open,
  onClose,
  course,
  onSaved,
}: CourseSettingsModalProps) {
  const [cropOpen, setCropOpen] = React.useState(false);
  const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(course.thumbnailUrl);

  const { data: categories } = useQuery({
    queryKey: ['public-categories'],
    queryFn: () => api.get<CategoryOption[]>('/categories'),
  });

  const form = useForm<UpdateCourseInput>({
    resolver: zodResolver(updateCourseSchema),
    values: {
      title: course.title,
      subtitle: course.subtitle ?? '',
      categoryId: course.categoryId ?? undefined,
      level: course.level,
      priceVnd: course.priceVnd,
      salePriceVnd: course.salePriceVnd,
      descriptionMd: course.descriptionMd ?? '',
      sequentialLockEnabled: course.sequentialLockEnabled,
      minWatchPercent: course.minWatchPercent,
    },
  });

  React.useEffect(() => {
    setThumbnailUrl(course.thumbnailUrl);
  }, [course.thumbnailUrl, open]);

  const hasUnsaved = form.formState.isDirty || thumbnailUrl !== course.thumbnailUrl;

  async function handleSafeClose() {
    if (hasUnsaved) {
      const ok = await confirmAction({
        title: 'Đóng mà không lưu thay đổi?',
        description: 'Một số cài đặt khóa học bạn vừa sửa sẽ không được lưu lại.',
        confirmLabel: 'Vẫn đóng',
        cancelLabel: 'Ở lại sửa tiếp',
      });
      if (!ok) return;
    }
    onClose();
  }

  async function onSubmit(values: UpdateCourseInput) {
    try {
      await api.patch(`/instructor/courses/${course.id}`, {
        ...values,
        categoryId: values.categoryId || null,
        thumbnailUrl: thumbnailUrl || null,
        salePriceVnd:
          values.salePriceVnd === undefined ||
          values.salePriceVnd === null ||
          Number.isNaN(values.salePriceVnd)
            ? null
            : values.salePriceVnd,
      });
      notify.success('Đã lưu cài đặt khóa học');
      onSaved();
      onClose();
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Lưu thất bại');
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={() => void handleSafeClose()}
        title="Cài đặt khóa học & Ảnh bìa 16:9"
        description="Thiết lập thông tin hiển thị, học phí và quy tắc mở khóa bài học."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* Thumbnail preview + Crop trigger */}
          <div className="grid items-center gap-4 rounded-xl border border-border bg-secondary/30 p-4 sm:grid-cols-[200px_1fr]">
            <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-xs text-muted-foreground">
                  <ImageIcon className="mb-1 h-5 w-5" />
                  Chưa có ảnh bìa
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Ảnh bìa chuẩn 16:9 (1280×720)</p>
              <p className="text-xs text-muted-foreground">
                Ảnh đẹp, rõ chữ giúp tăng tỷ lệ click từ trang chủ &amp; kết quả tìm kiếm.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCropOpen(true)}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {thumbnailUrl ? 'Đổi & Crop ảnh bìa' : 'Tải lên & Crop 16:9'}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-title">Tiêu đề khóa học</Label>
            <Input id="cs-title" {...form.register('title')} />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-subtitle">Mô tả ngắn</Label>
            <Input id="cs-subtitle" {...form.register('subtitle')} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cs-category">Danh mục</Label>
              <select
                id="cs-category"
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
              <Label htmlFor="cs-level">Trình độ</Label>
              <select
                id="cs-level"
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
                {...form.register('level')}
              >
                <option value={CourseLevel.ALL}>Mọi trình độ</option>
                <option value={CourseLevel.BEGINNER}>Cơ bản</option>
                <option value={CourseLevel.INTERMEDIATE}>Trung cấp</option>
                <option value={CourseLevel.ADVANCED}>Nâng cao</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cs-price">Giá gốc (VNĐ)</Label>
              <Input
                id="cs-price"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                {...form.register('priceVnd', {
                  setValueAs: (v) => (v === '' || v === null ? 0 : Number(v)),
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-sale">Giá khuyến mãi (VNĐ)</Label>
              <Input
                id="cs-sale"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="Để trống nếu không giảm"
                {...form.register('salePriceVnd', {
                  setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
                })}
              />
              {form.formState.errors.salePriceVnd && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.salePriceVnd.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-desc">Mô tả chi tiết khóa học (Hỗ trợ Markdown)</Label>
            <textarea
              id="cs-desc"
              rows={4}
              className="flex w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Bạn sẽ học được gì? Yêu cầu đầu vào? Dự án thực tế sau khóa học..."
              {...form.register('descriptionMd')}
            />
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-secondary/30 p-4 sm:grid-cols-[1fr_160px]">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                {...form.register('sequentialLockEnabled')}
              />
              <div>
                <p className="text-sm font-medium">Mở khóa bài học tuần tự (Sequential Drip)</p>
                <p className="text-xs text-muted-foreground">
                  Chặn nhảy cóc: bắt buộc hoàn thành bài trước (Video ≥ ngưỡng % hoặc qua Quiz).
                </p>
              </div>
            </label>
            <div className="space-y-1">
              <Label htmlFor="cs-watch" className="text-xs">
                Ngưỡng xem video (%)
              </Label>
              <Input
                id="cs-watch"
                type="number"
                min={50}
                max={100}
                {...form.register('minWatchPercent', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => void handleSafeClose()}>
              Đóng
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Lưu cài đặt
            </Button>
          </div>
        </form>
      </Dialog>

      <ThumbnailCropModal
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        currentUrl={thumbnailUrl}
        onUploaded={(url) => setThumbnailUrl(url)}
      />
    </>
  );
}
