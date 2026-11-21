'use client';

import Link from 'next/link';
import {
  BookOpen,
  Clock,
  Eye,
  Play,
  ShoppingCart,
  Star,
  Users,
} from 'lucide-react';
import { CourseLevel, formatDuration, formatVnd } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/auth.store';
import { useCartStore } from '@/features/cart/cart.store';
import type { CatalogCourseCardItem } from './types';

const LEVEL_LABELS: Record<CourseLevel, string> = {
  ALL: 'Mọi trình độ',
  BEGINNER: 'Cơ bản',
  INTERMEDIATE: 'Trung cấp',
  ADVANCED: 'Nâng cao',
};

interface CourseCardProps {
  course: CatalogCourseCardItem;
  onOpenPreview?: (course: CatalogCourseCardItem) => void;
}

export function CourseCard({ course, onOpenPreview }: CourseCardProps) {
  const user = useAuthStore((s) => s.user);
  const { items, addItem, openDrawer } = useCartStore();
  const inCart = items.some((i) => i.id === course.id);

  const effectivePrice = course.salePriceVnd ?? course.priceVnd;
  const hasDiscount =
    course.salePriceVnd !== null &&
    course.priceVnd > 0 &&
    course.salePriceVnd < course.priceVnd;
  const discountPercent = hasDiscount
    ? Math.round(((course.priceVnd - course.salePriceVnd!) / course.priceVnd) * 100)
    : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
      {/* 16:9 Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        <Link href={`/courses/${course.slug}`} className="block h-full w-full">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Try4T Course
            </div>
          )}
        </Link>

        {/* Top Badges */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          {course.category && (
            <Badge className="bg-background/85 text-foreground backdrop-blur-md">
              {course.category.name}
            </Badge>
          )}
          {discountPercent !== null && (
            <Badge variant="destructive" className="font-mono font-bold">
              -{discountPercent}%
            </Badge>
          )}
          {effectivePrice === 0 && (
            <Badge variant="success" className="font-semibold">
              MIỄN PHÍ
            </Badge>
          )}
        </div>

        {/* Instant Free Preview Hover/Corner Button */}
        {course.firstPreviewLesson && onOpenPreview && (
          <button
            type="button"
            onClick={() => onOpenPreview(course)}
            className="absolute bottom-3 right-3 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground"
          >
            <Play className="h-3 w-3 fill-current" />
            Học thử ({course.freePreviewCount})
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{LEVEL_LABELS[course.level]}</span>
          <span className="inline-flex items-center gap-1 font-medium text-amber-500">
            <Star className="h-3.5 w-3.5 fill-current" />
            {course.ratingAvg > 0 ? course.ratingAvg.toFixed(1) : 'Mới'}
            {course.ratingCount > 0 && (
              <span className="text-muted-foreground">({course.ratingCount})</span>
            )}
          </span>
        </div>

        <Link href={`/courses/${course.slug}`} className="mt-2 block">
          <h3 className="line-clamp-2 text-base font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">
            {course.title}
          </h3>
        </Link>

        {course.subtitle && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {course.subtitle}
          </p>
        )}

        {/* Instructor */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {course.instructor.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.instructor.avatarUrl}
              alt={course.instructor.fullName}
              referrerPolicy="no-referrer"
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              {course.instructor.fullName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate font-medium text-foreground/85">
            {course.instructor.fullName}
          </span>
        </div>

        {/* Meta stats */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> {course.totalLessons} bài
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {formatDuration(course.totalDurationSec)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {course.enrollmentCount} HV
          </span>
          {course.freePreviewCount > 0 && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Eye className="h-3.5 w-3.5" /> Học thử
            </span>
          )}
        </div>

        {/* Footer Price & Cart */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3.5 mt-4">
          <div>
            <p className="font-mono text-base font-bold text-primary">
              {formatVnd(effectivePrice)}
            </p>
            {hasDiscount && (
              <p className="font-mono text-[11px] text-muted-foreground line-through">
                {formatVnd(course.priceVnd)}
              </p>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant={inCart ? 'secondary' : 'default'}
            onClick={() => {
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
            }}
            className="h-8 gap-1.5 text-xs"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {inCart ? 'Trong giỏ' : 'Thêm giỏ'}
          </Button>
        </div>
      </div>
    </article>
  );
}
