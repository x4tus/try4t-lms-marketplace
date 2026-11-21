'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Crop, Image as ImageIcon, Loader2, Save, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  CourseLevel,
  updateCourseSchema,
  type CourseProgressionMode,
  type UpdateCourseInput,
} from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { CourseThumbnail } from '@/components/ui/course-thumbnail';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
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

  const initialMode: CourseProgressionMode =
    course.progressionConfig?.mode ??
    (course.sequentialLockEnabled ? 'LESSON_SEQUENTIAL' : 'FREE');
  const initialBlockSeek = course.progressionConfig?.blockFastForward ?? true;
  const initialSeekPct = course.progressionConfig?.maxSeekAheadPercent ?? 5;

  const [progressionMode, setProgressionMode] = React.useState<CourseProgressionMode>(initialMode);
  const [blockFastForward, setBlockFastForward] = React.useState<boolean>(initialBlockSeek);
  const [maxSeekAheadPercent, setMaxSeekAheadPercent] = React.useState<number>(initialSeekPct);

  const { data: categories } = useQuery({
    queryKey: ['public-categories'],
    queryFn: () => api.get<CategoryOption[]>('/categories'),
  });

  const form = useForm<z.input<typeof updateCourseSchema>, unknown, UpdateCourseInput>({
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
    setProgressionMode(
      course.progressionConfig?.mode ??
        (course.sequentialLockEnabled ? 'LESSON_SEQUENTIAL' : 'FREE'),
    );
    setBlockFastForward(course.progressionConfig?.blockFastForward ?? true);
    setMaxSeekAheadPercent(course.progressionConfig?.maxSeekAheadPercent ?? 5);
  }, [course, open]);

  const progressionChanged =
    progressionMode !== initialMode ||
    blockFastForward !== initialBlockSeek ||
    maxSeekAheadPercent !== initialSeekPct;

  const hasUnsaved =
    form.formState.isDirty || thumbnailUrl !== course.thumbnailUrl || progressionChanged;

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
        sequentialLockEnabled: progressionMode !== 'FREE',
        progressionConfig: {
          mode: progressionMode,
          blockFastForward,
          maxSeekAheadPercent,
        },
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
        description="Thiết lập thông tin hiển thị, học phí, quy tắc mở khóa chương/bài và chống tua nhanh video."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* Thumbnail preview + Crop / Re-crop trigger */}
          <div className="grid items-center gap-4 rounded-xl border border-border bg-secondary/30 p-4 sm:grid-cols-[200px_1fr]">
            <CourseThumbnail
              src={thumbnailUrl}
              alt={course.title}
              compact
              className="rounded-lg border border-border"
            />
            <div className="space-y-2">
              <p className="text-sm font-semibold">Ảnh bìa chuẩn 16:9 (1280×720)</p>
              <p className="text-xs text-muted-foreground">
                Bạn có thể cắt/xoay lại ngay trên ảnh bìa cũ mà không cần tải file mới lên lại.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCropOpen(true)}
              >
                {thumbnailUrl ? (
                  <>
                    <Crop className="h-3.5 w-3.5" /> Cắt lại / Đổi ảnh bìa
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-3.5 w-3.5" /> Tải lên &amp; Crop 16:9
                  </>
                )}
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
            <Label htmlFor="cs-desc">Mô tả chi tiết khóa học</Label>
            <RichTextEditor
              id="cs-desc"
              rows={5}
              value={form.watch('descriptionMd') ?? ''}
              onChange={(val) => form.setValue('descriptionMd', val, { shouldDirty: true })}
              placeholder="Bạn sẽ học được gì? Yêu cầu đầu vào? Dự án thực tế sau khóa học..."
            />
          </div>

          {/* Progression & Anti-Seek Policy */}
          <div className="space-y-3.5 rounded-xl border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Quy tắc mở khóa tiến độ &amp; Chặn tua nhanh video
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    value: 'FREE',
                    title: 'Học tự do',
                    desc: 'Học viên mở tự do mọi chương và bài học.',
                  },
                  {
                    value: 'LESSON_SEQUENTIAL',
                    title: 'Tuần tự từng bài',
                    desc: 'Phải xong bài trước mới mở khóa bài liền sau.',
                  },
                  {
                    value: 'SECTION_SEQUENTIAL',
                    title: 'Hoàn thành theo Chương',
                    desc: 'Học hết bài trong Chương 1 mới mở Chương 2...',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setProgressionMode(opt.value)}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition-all ${
                    progressionMode === opt.value
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-secondary/50'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-[1fr_150px_140px] sm:items-end">
              <label className="flex cursor-pointer items-start gap-2.5 self-center">
                <input
                  type="checkbox"
                  checked={blockFastForward}
                  onChange={(e) => setBlockFastForward(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div>
                  <p className="text-xs font-semibold">Chặn tua nhanh tức thì (Anti-Seek)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Kéo vượt phần chưa xem sẽ lập tức trả về mốc tối đa hợp lệ.
                  </p>
                </div>
              </label>

              <div className="space-y-1">
                <Label htmlFor="cs-seek-pct" className="text-xs">
                  Biên độ tua trước
                </Label>
                <select
                  id="cs-seek-pct"
                  disabled={!blockFastForward}
                  value={maxSeekAheadPercent}
                  onChange={(e) => setMaxSeekAheadPercent(Number(e.target.value))}
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-2.5 font-mono text-xs disabled:opacity-50"
                >
                  <option value={0}>0% (Chặn cứng)</option>
                  <option value={5}>+5% thời lượng</option>
                  <option value={10}>+10% thời lượng</option>
                  <option value={15}>+15% thời lượng</option>
                  <option value={25}>+25% thời lượng</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="cs-watch" className="text-xs">
                  Ngưỡng hoàn thành (%)
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
