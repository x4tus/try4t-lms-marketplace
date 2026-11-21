'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { CourseLevel, type PaginatedResult } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CourseCard } from '@/features/catalog/course-card';
import { FreePreviewModal } from '@/features/catalog/free-preview-modal';
import type { CatalogCourseCardItem } from '@/features/catalog/types';
import type { CategoryOption } from '@/features/course-builder/types';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/cn';

function CoursesCatalogInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = React.useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = React.useState(searchParams.get('search') ?? '');
  const [category, setCategory] = React.useState(searchParams.get('category') ?? '');
  const [level, setLevel] = React.useState(searchParams.get('level') ?? '');
  const [price, setPrice] = React.useState<'ALL' | 'FREE' | 'PAID'>(
    (searchParams.get('price') as 'ALL' | 'FREE' | 'PAID') || 'ALL',
  );
  const [minRating, setMinRating] = React.useState(searchParams.get('minRating') ?? '');
  const [sort, setSort] = React.useState(searchParams.get('sort') || 'POPULAR');
  const [page, setPage] = React.useState(Number(searchParams.get('page')) || 1);

  const [previewTarget, setPreviewTarget] = React.useState<{
    slug: string;
    lessonId: string;
    thumbnailUrl?: string | null;
    instructorName?: string;
  } | null>(null);

  // Sync URL search param if navigated from Navbar search
  React.useEffect(() => {
    const urlSearch = searchParams.get('search') ?? '';
    const urlCategory = searchParams.get('category') ?? '';
    setSearchInput(urlSearch);
    setDebouncedSearch(urlSearch);
    setCategory(urlCategory);
  }, [searchParams]);

  // Debounce search typing
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Sync filters to URL
  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set('search', debouncedSearch);
    if (category) qs.set('category', category);
    if (level) qs.set('level', level);
    if (price !== 'ALL') qs.set('price', price);
    if (minRating) qs.set('minRating', minRating);
    if (sort !== 'POPULAR') qs.set('sort', sort);
    if (page > 1) qs.set('page', String(page));

    const queryStr = qs.toString();
    router.replace(queryStr ? `/courses?${queryStr}` : '/courses', { scroll: false });
  }, [debouncedSearch, category, level, price, minRating, sort, page, router]);

  const { data: categories } = useQuery({
    queryKey: ['public-categories'],
    queryFn: () => api.get<CategoryOption[]>('/categories', { skipAuthRefresh: true }),
  });

  const queryKeyParams = {
    search: debouncedSearch,
    category,
    level,
    price,
    minRating,
    sort,
    page,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['catalog-courses', queryKeyParams],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set('search', debouncedSearch);
      if (category) qs.set('category', category);
      if (level) qs.set('level', level);
      if (price !== 'ALL') qs.set('price', price);
      if (minRating) qs.set('minRating', minRating);
      qs.set('sort', sort);
      qs.set('page', String(page));
      qs.set('limit', '9');
      return api.get<PaginatedResult<CatalogCourseCardItem>>(
        `/catalog/courses?${qs.toString()}`,
        { skipAuthRefresh: true },
      );
    },
  });

  const hasActiveFilters = Boolean(
    debouncedSearch || category || level || price !== 'ALL' || minRating,
  );

  function resetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setCategory('');
    setLevel('');
    setPrice('ALL');
    setMinRating('');
    setSort('POPULAR');
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-center">
        <div>
          <Badge variant="outline" className="mb-2 gap-1">
            <Sparkles className="h-3 w-3 text-primary" /> Kho khóa học Try4T
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Khám phá lộ trình học thực chiến
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tìm kiếm theo chủ đề, cấp độ, học phí và xem ngay bài học thử miễn phí không cần đăng
            nhập.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm khóa học, công nghệ, giảng viên..."
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCategory('');
            setPage(1);
          }}
          className={cn(
            'cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
            category === ''
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          Tất cả lĩnh vực
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setCategory(cat.slug);
              setPage(1);
            }}
            className={cn(
              'cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
              category === cat.slug
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {cat.name}
            {typeof cat._count?.courses === 'number' && cat._count.courses > 0 && (
              <span className="ml-1.5 opacity-75">({cat._count.courses})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Bộ lọc:
          </span>

          <select
            aria-label="Lọc theo trình độ"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs"
          >
            <option value="">Mọi trình độ</option>
            <option value={CourseLevel.BEGINNER}>Cơ bản</option>
            <option value={CourseLevel.INTERMEDIATE}>Trung cấp</option>
            <option value={CourseLevel.ADVANCED}>Nâng cao</option>
          </select>

          <select
            aria-label="Lọc theo học phí"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value as 'ALL' | 'FREE' | 'PAID');
              setPage(1);
            }}
            className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs"
          >
            <option value="ALL">Mọi mức giá</option>
            <option value="FREE">Miễn phí (0đ)</option>
            <option value="PAID">Trả phí</option>
          </select>

          <select
            aria-label="Lọc theo đánh giá"
            value={minRating}
            onChange={(e) => {
              setMinRating(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs"
          >
            <option value="">Mọi đánh giá</option>
            <option value="4.5">Từ 4.5 ★ trở lên</option>
            <option value="4">Từ 4.0 ★ trở lên</option>
            <option value="3">Từ 3.0 ★ trở lên</option>
          </select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 gap-1 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Xóa lọc
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {data ? `${data.meta.total} kết quả` : ''}
          </span>
          <select
            aria-label="Sắp xếp"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-medium"
          >
            <option value="POPULAR">Phổ biến nhất</option>
            <option value="NEWEST">Mới xuất bản</option>
            <option value="RATING">Đánh giá cao nhất</option>
            <option value="PRICE_ASC">Giá thấp → cao</option>
            <option value="PRICE_DESC">Giá cao → thấp</option>
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-[370px] w-full rounded-2xl" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <p className="text-base font-semibold">Không tìm thấy khóa học phù hợp</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Thử đổi từ khóa tìm kiếm hoặc nới lỏng bộ lọc danh mục / trình độ nhé.
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">
              Đặt lại bộ lọc
            </Button>
          )}
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-70')}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((course) => (
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
            ))}
          </div>

          {/* Pagination */}
          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Trước
              </Button>
              <span className="px-3 font-mono text-xs text-muted-foreground">
                Trang {data.meta.page} / {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

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

export default function CoursesCatalogPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-[370px] rounded-2xl" />
            <Skeleton className="h-[370px] rounded-2xl" />
            <Skeleton className="h-[370px] rounded-2xl" />
          </div>
        </div>
      }
    >
      <CoursesCatalogInner />
    </React.Suspense>
  );
}
