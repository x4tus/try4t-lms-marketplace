'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  Infinity as InfinityIcon,
  Loader2,
  Lock,
  Play,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Users,
  Video,
} from 'lucide-react';
import { CourseLevel, formatDuration, formatVnd, LessonType, PaymentMethod } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';
import { useCartStore } from '@/features/cart/cart.store';
import { FreePreviewModal } from '@/features/catalog/free-preview-modal';
import type { CatalogCourseDetail } from '@/features/catalog/types';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

const LEVEL_LABELS: Record<CourseLevel, string> = {
  ALL: 'Mọi trình độ',
  BEGINNER: 'Cơ bản',
  INTERMEDIATE: 'Trung cấp',
  ADVANCED: 'Nâng cao',
};

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const slug = params.slug;

  const user = useAuthStore((s) => s.user);
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const { items, addItem, openDrawer, refreshFromServer } = useCartStore();
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
  const [previewLessonId, setPreviewLessonId] = React.useState<string | null>(null);

  const { data: course, isLoading, error } = useQuery({
    queryKey: ['catalog-course-detail', slug, user?.id ?? 'guest'],
    queryFn: () => api.get<CatalogCourseDetail>(`/catalog/courses/${slug}`),
    retry: false,
  });

  const freeEnrollMutation = useMutation({
    mutationFn: (courseId: string) =>
      api.post('/commerce/orders', {
        courseIds: [courseId],
        paymentMethod: PaymentMethod.SANDBOX,
      }),
    onSuccess: () => {
      notify.success('Đăng ký khóa học miễn phí thành công!');
      void refreshFromServer();
      void queryClient.invalidateQueries({ queryKey: ['catalog-course-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
      router.push(`/learn/${slug}`);
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể kích hoạt khóa học');
    },
  });

  React.useEffect(() => {
    if (course?.sections) {
      const initial: Record<string, boolean> = {};
      course.sections.forEach((sec, idx) => {
        initial[sec.id] = idx < 2; // Mở sẵn 2 chương đầu
      });
      setExpandedSections(initial);
    }
  }, [course?.id]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-bold">Không tìm thấy khóa học</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Khóa học này có thể chưa được xuất bản hoặc đường dẫn không tồn tại.
        </p>
        <Link href="/courses" className="mt-5">
          <Button>Quay lại kho khóa học</Button>
        </Link>
      </div>
    );
  }

  const effectivePrice = course.salePriceVnd ?? course.priceVnd;
  const hasDiscount =
    course.salePriceVnd !== null &&
    course.priceVnd > 0 &&
    course.salePriceVnd < course.priceVnd;
  const discountPercent = hasDiscount
    ? Math.round(((course.priceVnd - course.salePriceVnd!) / course.priceVnd) * 100)
    : null;
  const inCart = items.some((i) => i.id === course.id);
  const firstPreview = course.freePreviewLessons[0] ?? null;

  function toggleSection(sectionId: string) {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  function handleAddCart() {
    if (!course) return;
    if (inCart) {
      openDrawer();
      return;
    }
    void addItem(
      {
        id: course.id,
        slug: course.slug,
        title: course.title,
        thumbnailUrl: course.thumbnailUrl,
        instructorName: course.instructor.fullName,
        priceVnd: course.priceVnd,
        salePriceVnd: course.salePriceVnd,
      },
      Boolean(user),
    );
  }

  function handleFreeEnroll() {
    if (!course) return;
    if (!user) {
      notify.info('Đăng nhập để nhận khóa học miễn phí này ngay!');
      openLogin();
      return;
    }
    freeEnrollMutation.mutate(course.id);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/courses" className="hover:text-foreground">
          Khóa học
        </Link>
        {course.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href={`/courses?category=${encodeURIComponent(course.category.slug)}`}
              className="hover:text-foreground"
            >
              {course.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate font-medium text-foreground">{course.title}</span>
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_370px]">
        {/* LEFT COLUMN */}
        <div className="min-w-0 space-y-8">
          {/* Course Hero Info */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {course.category && <Badge>{course.category.name}</Badge>}
              <Badge variant="outline">{LEVEL_LABELS[course.level]}</Badge>
              {course.sequentialLockEnabled && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="h-3 w-3 text-primary" /> Học theo lộ trình tuần tự
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
              {course.title}
            </h1>

            {course.subtitle && (
              <p className="text-base leading-relaxed text-muted-foreground">{course.subtitle}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                <Star className="h-4 w-4 fill-current" />
                {course.ratingAvg > 0 ? course.ratingAvg.toFixed(1) : 'Mới'}
                <span className="font-normal text-muted-foreground">
                  ({course.ratingCount} đánh giá)
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {course.enrollmentCount} học viên
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" /> {course.sections.length} chương •{' '}
                {course.totalLessons} bài học
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {formatDuration(course.totalDurationSec)}
              </span>
            </div>
          </div>

          {/* Course Description Markdown */}
          {course.descriptionMd && (
            <Card>
              <CardHeader>
                <CardTitle>Giới thiệu khóa học</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm leading-relaxed text-foreground/90 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-950 [&_pre]:p-3.5 [&_pre]:text-zinc-100">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {course.descriptionMd}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Curriculum Accordion */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Nội dung lộ trình học</h2>
                <p className="text-xs text-muted-foreground">
                  {course.sections.length} chương • {course.totalLessons} bài học • Tổng thời lượng{' '}
                  {formatDuration(course.totalDurationSec)}
                  {course.freePreviewLessons.length > 0 &&
                    ` • ${course.freePreviewLessons.length} bài học thử miễn phí`}
                </p>
              </div>
              {firstPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewLessonId(firstPreview.id)}
                  className="gap-1.5"
                >
                  <Play className="h-3.5 w-3.5 fill-current text-primary" />
                  Xem bài học thử đầu tiên
                </Button>
              )}
            </div>

            <div className="space-y-2.5">
              {course.sections.map((section, sIdx) => {
                const isOpen = Boolean(expandedSections[section.id]);
                return (
                  <div
                    key={section.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 bg-secondary/35 px-4 py-3.5 text-left transition-colors hover:bg-secondary/60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate text-sm font-semibold">
                          Chương {sIdx + 1}: {section.title}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {section.lessons.length} bài • {formatDuration(section.totalDurationSec)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-border/70">
                        {section.lessons.map((lesson) => (
                          <div
                            key={lesson.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              {lesson.type === LessonType.VIDEO ? (
                                <Video className="h-4 w-4 shrink-0 text-emerald-500" />
                              ) : lesson.type === LessonType.ARTICLE ? (
                                <FileText className="h-4 w-4 shrink-0 text-sky-500" />
                              ) : (
                                <HelpCircle className="h-4 w-4 shrink-0 text-amber-500" />
                              )}
                              <span className="truncate font-medium">{lesson.title}</span>
                              {lesson.quizMeta && (
                                <Badge variant="outline" className="text-[10px]">
                                  {lesson.quizMeta.questionsCount} câu
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              {lesson.isFreePreview ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPreviewLessonId(lesson.id)}
                                  className="h-7 gap-1 px-2.5 text-xs text-primary"
                                >
                                  <Eye className="h-3.5 w-3.5" /> Học thử
                                </Button>
                              ) : course.isEnrolled ? (
                                <Link href={`/learn/${course.slug}`}>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                                    Vào học
                                  </Button>
                                </Link>
                              ) : (
                                <span
                                  title="Đăng ký khóa học để mở khóa"
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </span>
                              )}

                              <span className="w-12 text-right font-mono text-xs text-muted-foreground">
                                {formatDuration(lesson.videoDurationSec)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instructor Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>Giảng viên hướng dẫn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                {course.instructor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.instructor.avatarUrl}
                    alt={course.instructor.fullName}
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                    {course.instructor.fullName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="space-y-1">
                  <p className="text-base font-bold">{course.instructor.fullName}</p>
                  {course.instructor.headline && (
                    <p className="text-xs text-muted-foreground">{course.instructor.headline}</p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                    <span>{course.instructor.publishedCoursesCount} khóa học</span>
                    <span>• {course.instructor.totalStudents} học viên</span>
                    {course.instructor.yearsOfExperience !== null && (
                      <span>• {course.instructor.yearsOfExperience} năm kinh nghiệm</span>
                    )}
                  </div>
                </div>
              </div>
              {course.instructor.bio && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {course.instructor.bio}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Reviews Section */}
          <Card>
            <CardHeader>
              <CardTitle>Đánh giá từ học viên ({course.ratingCount})</CardTitle>
            </CardHeader>
            <CardContent>
              {course.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có đánh giá nào. Học viên đã đăng ký và hoàn thành ≥ 20% khóa học có thể viết
                  đánh giá xác thực trong phòng học.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {course.reviews.map((rev) => (
                    <div key={rev.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{rev.user.fullName}</p>
                        <span className="font-mono text-xs text-amber-500">
                          {'★'.repeat(rev.rating)}
                          <span className="text-muted-foreground/30">
                            {'★'.repeat(Math.max(0, 5 - rev.rating))}
                          </span>
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{rev.comment}</p>
                      {rev.instructorReply && (
                        <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                          <p className="font-semibold text-primary">Phản hồi từ Giảng viên:</p>
                          <p className="mt-1 text-muted-foreground">{rev.instructorReply}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT STICKY PURCHASE CARD */}
        <aside className="lg:sticky lg:top-24">
          <Card className="overflow-hidden shadow-lg">
            {/* Preview Thumbnail */}
            <div className="relative aspect-video bg-secondary">
              {course.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              )}
              {firstPreview && (
                <button
                  type="button"
                  onClick={() => setPreviewLessonId(firstPreview.id)}
                  className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/40 transition-colors hover:bg-black/55"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform group-hover:scale-110">
                    <Play className="ml-0.5 h-6 w-6 fill-current" />
                  </span>
                  <span className="mt-2.5 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white">
                    Xem học thử miễn phí
                  </span>
                </button>
              )}
            </div>

            <CardContent className="space-y-5 p-6">
              {/* Pricing */}
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="font-mono text-3xl font-extrabold text-primary">
                  {formatVnd(effectivePrice)}
                </span>
                {hasDiscount && (
                  <>
                    <span className="font-mono text-sm text-muted-foreground line-through">
                      {formatVnd(course.priceVnd)}
                    </span>
                    <Badge variant="destructive" className="font-mono">
                      -{discountPercent}%
                    </Badge>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                {course.isEnrolled ? (
                  <Link href={`/learn/${course.slug}`} className="block">
                    <Button size="lg" className="w-full gap-2">
                      <Play className="h-4 w-4 fill-current" />
                      Vào phòng học ngay
                    </Button>
                  </Link>
                ) : effectivePrice === 0 ? (
                  <Button
                    size="lg"
                    className="w-full gap-2"
                    disabled={freeEnrollMutation.isPending}
                    onClick={handleFreeEnroll}
                  >
                    {freeEnrollMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Đăng ký miễn phí ngay
                  </Button>
                ) : (
                  <>
                    <Button size="lg" className="w-full gap-2" onClick={handleAddCart}>
                      <ShoppingCart className="h-4 w-4" />
                      {inCart ? 'Đã trong giỏ — Mở giỏ hàng' : 'Thêm vào giỏ hàng'}
                    </Button>
                    {firstPreview && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setPreviewLessonId(firstPreview.id)}
                      >
                        <Eye className="h-4 w-4" />
                        Học thử miễn phí ({course.freePreviewLessons.length} bài)
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Course Perks */}
              <div className="space-y-2.5 border-t border-border pt-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Khóa học này bao gồm:</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{formatDuration(course.totalDurationSec)} nội dung bài giảng chất lượng</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>{course.totalLessons} bài học (Video, Markdown &amp; Quiz)</span>
                </div>
                <div className="flex items-center gap-2">
                  <InfinityIcon className="h-4 w-4 text-primary" />
                  <span>Truy cập trọn đời, tự lưu tiến độ từng giây (Resume Playback)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  <span>Chứng chỉ hoàn thành PDF + mã QR xác thực công khai</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Kích hoạt ngay lập tức sau thanh toán VietQR tự động</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Free Preview Cinema Pop-up */}
      <FreePreviewModal
        courseSlug={previewLessonId ? course.slug : null}
        initialLessonId={previewLessonId}
        courseThumbnail={course.thumbnailUrl}
        instructorName={course.instructor.fullName}
        onClose={() => setPreviewLessonId(null)}
      />
    </div>
  );
}
