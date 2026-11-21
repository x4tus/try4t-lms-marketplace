'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookMarked,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { Role, type PaginatedResult } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';
import { useProfileModalStore } from '@/features/auth/profile-modal';
import { CourseCard } from '@/features/catalog/course-card';
import { FreePreviewModal } from '@/features/catalog/free-preview-modal';
import type { CatalogCourseCardItem } from '@/features/catalog/types';
import { api } from '@/lib/api-client';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  _count: { courses: number };
}

const FALLBACK_CATEGORIES: CategoryItem[] = [
  { id: '1', name: 'Lập trình Web', slug: 'lap-trinh-web', icon: 'Globe', _count: { courses: 0 } },
  {
    id: '2',
    name: 'Backend & Kiến trúc hệ thống',
    slug: 'backend-kien-truc',
    icon: 'Server',
    _count: { courses: 0 },
  },
  { id: '3', name: 'Mobile App', slug: 'mobile-app', icon: 'Smartphone', _count: { courses: 0 } },
  { id: '4', name: 'UI/UX Design', slug: 'ui-ux-design', icon: 'Palette', _count: { courses: 0 } },
  { id: '5', name: 'DevOps & Cloud', slug: 'devops-cloud', icon: 'Cloud', _count: { courses: 0 } },
  {
    id: '6',
    name: 'AI & Data Engineering',
    slug: 'ai-data',
    icon: 'Sparkles',
    _count: { courses: 0 },
  },
];

const CORE_PILLARS = [
  {
    icon: Video,
    title: 'Phòng học thông minh chuẩn F8',
    desc: 'Lưu đúng từng giây đang xem (Resume Playback), chế độ rạp phim Dark Mode, tốc độ 0.75x–2x và Watermark động chống quay lén.',
  },
  {
    icon: BookMarked,
    title: 'Ghi chú mốc thời gian & Hỏi đáp bài học',
    desc: 'Lưu ghi chú gắn liền phút 04:32 — bấm lại video nhảy đúng giây đó. Thảo luận Q&A theo từng bài có huy hiệu Giảng viên.',
  },
  {
    icon: Lock,
    title: 'Mở khóa tuần tự chống gian lận',
    desc: 'Kiểm tra thời lượng xem thực tế ≥ 80% và vượt qua Quiz cuối chương ở phía Server trước khi mở bài kế tiếp.',
  },
  {
    icon: Layers,
    title: 'Course Builder kéo thả chuyên nghiệp',
    desc: 'Dành cho Giảng viên: kéo thả Chương & Bài học (Video, Markdown/Code, Quiz), crop ảnh bìa 16:9, upload trực tiếp lên Cloud.',
  },
  {
    icon: QrCode,
    title: 'Thanh toán VietQR & Chứng chỉ QR',
    desc: 'Quét VietQR tự động kích hoạt khóa học qua Webhook. Hoàn thành 100% tự xuất Chứng chỉ PDF kèm trang xác thực công khai.',
  },
  {
    icon: BarChart3,
    title: 'Thống kê Doanh thu & Biểu đồ Drop-off',
    desc: 'Theo dõi sổ cái doanh thu chia sẻ minh bạch và biết chính xác học viên thường dừng lại ở bài học nào nhất để tối ưu.',
  },
];

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const { openLogin, openRegister } = useAuthModalStore();
  const openProfileModal = useProfileModalStore((s) => s.open);
  const [previewTarget, setPreviewTarget] = React.useState<{
    slug: string;
    lessonId: string;
    thumbnailUrl?: string | null;
    instructorName?: string;
  } | null>(null);

  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['public-categories'],
    queryFn: () => api.get<CategoryItem[]>('/categories'),
    retry: false,
  });

  const { data: featuredCourses, isLoading: loadingCourses } = useQuery({
    queryKey: ['home-featured-courses'],
    queryFn: () =>
      api.get<PaginatedResult<CatalogCourseCardItem>>('/catalog/courses?limit=6&sort=POPULAR', {
        skipAuthRefresh: true,
      }),
    retry: false,
  });

  const displayCategories = categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES;

  return (
    <div className="relative overflow-x-clip">
      {/* HERO SECTION */}
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-6">
            <Badge variant="outline" className="px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Try4T LMS Marketplace — Tùy biến giao diện theo gu của bạn
            </Badge>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Học công nghệ{' '}
              <span className="text-primary underline decoration-primary/30 decoration-4 underline-offset-4">
                thực chiến &amp; bài bản
              </span>
              , nhận chứng chỉ xác thực.
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Kết hợp trải nghiệm phòng học tối dịu mắt, ghi chú theo mốc thời gian video, bài tập
              Quiz chuyên sâu và thanh toán VietQR tự động kích hoạt ngay lập tức.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {user ? (
                <Link href="/my-courses">
                  <Button size="lg" className="gap-2">
                    Vào không gian học tập
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Button size="lg" className="gap-2" onClick={openRegister}>
                    Bắt đầu học miễn phí
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="lg" onClick={openLogin}>
                    Đăng nhập / Demo RBAC
                  </Button>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-border pt-6">
              <div>
                <p className="font-mono text-2xl font-bold">100%</p>
                <p className="text-xs text-muted-foreground">Chứng chỉ PDF + QR</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold">0.75–2x</p>
                <p className="text-xs text-muted-foreground">Resume từng giây</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold">24/7</p>
                <p className="text-xs text-muted-foreground">Kích hoạt VietQR tự động</p>
              </div>
            </div>
          </div>

          {/* Smart Learning Room Visual Preview */}
          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-[#0d0d12] text-zinc-100 shadow-2xl">
              {/* Mock Window Bar */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-xs text-zinc-400">
                    try4t.dev/learn/fullstack-nextjs-nestjs
                  </span>
                </div>
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
                  SMART PLAYER
                </span>
              </div>

              {/* Mock Video Area */}
              <div className="relative aspect-video bg-gradient-to-br from-zinc-900 via-indigo-950/50 to-zinc-950 p-6">
                {/* Dynamic watermark preview */}
                <span className="pointer-events-none absolute right-6 top-6 select-none font-mono text-[11px] text-white/25">
                  student@try4t.dev • #TR4T-8492
                </span>

                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                    <Play className="ml-0.5 h-6 w-6 fill-current" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-zinc-200">
                    Bài 04: Thiết kế Clean Architecture &amp; Anti-Cheat Progress
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-400">
                    Đang tiếp tục từ 04:32 / 18:45 • Tốc độ 1.25x
                  </p>
                </div>

                {/* Progress bar */}
                <div className="absolute inset-x-5 bottom-4 space-y-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" />
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px] text-zinc-400">
                    <span>04:32</span>
                    <span className="text-emerald-400">✓ Đạt 82% — Đã mở khóa bài kế tiếp</span>
                  </div>
                </div>
              </div>

              {/* Timestamped Note Preview */}
              <div className="grid gap-3 border-t border-zinc-800 bg-zinc-950/80 p-4 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <div className="flex items-center gap-2 text-xs text-indigo-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="font-mono font-semibold">Ghi chú @ 04:32</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-300">
                    Merge interval watched_ranges trên server để chống tua nhanh video.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <Award className="h-3.5 w-3.5" />
                    <span className="font-semibold">Tiến độ khóa học: 85%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-300">
                    Còn 2 bài nữa để tự động cấp Chứng chỉ PDF + mã xác thực QR.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PUBLISHED COURSES */}
      <section className="border-t border-border bg-card/30 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <Badge variant="outline">Khóa học nổi bật</Badge>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Học thử miễn phí &amp; Bắt đầu ngay hôm nay
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Bấm nút <strong>Học thử</strong> trên bất kỳ khóa học nào để xem trước bài giảng
                ngay không cần đăng nhập.
              </p>
            </div>
            <Link href="/courses">
              <Button variant="outline" size="sm" className="gap-1.5">
                Xem tất cả khóa học
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {loadingCourses ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-[370px] w-full rounded-2xl" />
              ))
            ) : featuredCourses && featuredCourses.items.length > 0 ? (
              featuredCourses.items.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onOpenPreview={(c) => {
                    if (c.firstPreviewLesson) {
                      setPreviewTarget({
                        slug: c.slug,
                        lessonId: c.firstPreviewLesson.id,
                        thumbnailUrl: c.thumbnailUrl,
                        instructorName: c.instructor.fullName,
                      });
                    }
                  }}
                />
              ))
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Chưa có khóa học nào được xuất bản. Chạy <code className="font-mono">pnpm db:seed</code>{' '}
                hoặc duyệt khóa học trong Admin Console để hiển thị tại đây!
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section id="explore" className="border-y border-border bg-card/40 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Lĩnh vực đào tạo trên Try4T</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Chọn lĩnh vực quan tâm để lọc ngay lộ trình khóa học phù hợp.
              </p>
            </div>
            <Link href="/courses">
              <Button variant="ghost" size="sm" className="gap-1 text-primary">
                Khám phá kho khóa học <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loadingCategories
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-20 w-full rounded-xl" />
                ))
              : displayCategories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/courses?category=${encodeURIComponent(cat.slug)}`}
                    className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                  >
                    <div>
                      <p className="font-semibold tracking-tight group-hover:text-primary">
                        {cat.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {cat._count.courses} khóa học đang mở
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </Link>
                ))}
          </div>
        </div>
      </section>

      {/* CORE PILLARS */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <Badge variant="secondary">Kiến trúc sản phẩm thực chiến</Badge>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            Mọi công cụ tinh túy nhất cho Học viên &amp; Giảng viên
          </h2>
          <p className="mt-2 text-muted-foreground">
            Thiết kế đồng bộ từ trải nghiệm xem video mượt mà đến hệ thống thương mại hóa và đối
            soát doanh thu minh bạch.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CORE_PILLARS.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription className="pt-1 leading-relaxed">{item.desc}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      {/* INSTRUCTOR CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <Card className="overflow-hidden border-border bg-card">
          <CardContent className="flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center md:p-10">
            <div className="max-w-xl space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                HỆ SINH THÁI GIẢNG VIÊN TRY4T
              </div>
              <h3 className="text-2xl font-bold tracking-tight">
                Chia sẻ tri thức, nhận 70% doanh thu minh bạch theo sổ cái
              </h3>
              <p className="text-sm text-muted-foreground">
                Sở hữu ngay Course Builder kéo thả, mã Coupon tiếp thị riêng, biểu đồ Drop-off từng
                bài học và hệ thống yêu cầu rút tiền trực tiếp về tài khoản ngân hàng.
              </p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Direct Cloud Upload
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Chống quay lén Watermark
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Thanh toán tự động 24/7
                </span>
              </div>
            </div>
            {!user ? (
              <Button size="lg" className="shrink-0" onClick={openRegister}>
                Đăng ký làm Giảng viên
              </Button>
            ) : user.role === Role.STUDENT ? (
              <Button
                size="lg"
                className="shrink-0"
                onClick={() => openProfileModal('instructor')}
              >
                Nộp hồ sơ Giảng viên
              </Button>
            ) : (
              <Link href="/instructor/dashboard" className="shrink-0">
                <Button size="lg">Vào Kênh Giảng viên</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
      {/* Free Preview Cinema Pop-up */}
      <FreePreviewModal
        courseSlug={previewTarget?.slug ?? null}
        initialLessonId={previewTarget?.lessonId ?? null}
        courseThumbnail={previewTarget?.thumbnailUrl}
        instructorName={previewTarget?.instructorName}
        onClose={() => setPreviewTarget(null)}
      />
    </div>
  );
}
