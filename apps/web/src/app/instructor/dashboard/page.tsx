'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  BarChart3,
  BookOpen,
  BookPlus,
  Clock,
  Eye,
  Layers,
  LayoutDashboard,
  Pencil,
  TicketPercent,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { CourseStatus, formatDuration, formatVnd, Role } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { CourseThumbnail } from '@/components/ui/course-thumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/features/auth/auth.store';
import { RoleGuard } from '@/features/auth/role-guard';
import { CreateCourseModal } from '@/features/course-builder/create-course-modal';
import type { InstructorCourseSummary } from '@/features/course-builder/types';
import { InstructorAnalyticsPanel } from '@/features/instructor/instructor-analytics-panel';
import { InstructorCouponsPanel } from '@/features/instructor/instructor-coupons-panel';
import { InstructorWalletPanel } from '@/features/instructor/instructor-wallet-panel';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

type InstructorTab = 'courses' | 'coupons' | 'analytics' | 'payouts';

function getStatusBadge(status: CourseStatus) {
  switch (status) {
    case CourseStatus.PUBLISHED:
      return <Badge variant="success">Đã xuất bản</Badge>;
    case CourseStatus.PENDING_REVIEW:
      return <Badge variant="warning">Đang chờ duyệt</Badge>;
    case CourseStatus.REJECTED:
      return <Badge variant="destructive">Cần chỉnh sửa</Badge>;
    case CourseStatus.ARCHIVED:
      return <Badge variant="outline">Lưu trữ</Badge>;
    default:
      return <Badge variant="secondary">Bản nháp</Badge>;
  }
}

function InstructorDashboardContent() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<InstructorTab>('courses');
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data: courses, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => api.get<InstructorCourseSummary[]>('/instructor/courses'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ archived?: boolean; message?: string }>(`/instructor/courses/${id}`),
    onSuccess: (res) => {
      notify.success(res?.message || (res?.archived ? 'Đã ẩn khóa học khỏi sàn' : 'Đã xóa khóa học'));
      void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Xóa khóa học thất bại');
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.patch<{ status: CourseStatus; message: string }>(
        `/instructor/courses/${id}/visibility`,
        { archived },
      ),
    onMutate: async ({ id, archived }) => {
      await queryClient.cancelQueries({ queryKey: ['instructor-courses'] });
      const prev = queryClient.getQueryData<InstructorCourseSummary[]>(['instructor-courses']);
      if (prev) {
        queryClient.setQueryData<InstructorCourseSummary[]>(
          ['instructor-courses'],
          prev.map((c) =>
            c.id === id
              ? { ...c, status: archived ? CourseStatus.ARCHIVED : CourseStatus.PUBLISHED }
              : c,
          ),
        );
      }
      return { prev };
    },
    onSuccess: (res) => {
      notify.success(res.message);
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['instructor-courses'], ctx.prev);
      }
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật hiển thị thất bại');
    },
  });

  const feeRate = user?.instructorProfile?.platformFeeRate ?? 0.3;
  const keepPercent = Math.round((1 - feeRate) * 100);
  const publishedCount = courses?.filter((c) => c.status === CourseStatus.PUBLISHED).length ?? 0;
  const pendingCount = courses?.filter((c) => c.status === CourseStatus.PENDING_REVIEW).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Try4T Instructor Studio</h1>
          <p className="text-sm text-muted-foreground">
            Xin chào <strong>{user?.fullName}</strong> • Tỷ lệ thực nhận:{' '}
            <strong className="text-primary">{keepPercent}%</strong> (Phí nền tảng{' '}
            {Math.round(feeRate * 100)}%).
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <BookPlus className="h-4 w-4" />
          Tạo khóa học mới
        </Button>
      </div>

      {/* Seamless Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-secondary/50 p-1 w-fit">
        {[
          { id: 'courses' as const, label: 'Khóa học của tôi', icon: LayoutDashboard },
          { id: 'coupons' as const, label: 'Mã Coupon', icon: TicketPercent },
          { id: 'analytics' as const, label: 'Thống kê & Drop-off', icon: BarChart3 },
          { id: 'payouts' as const, label: 'Ví & Rút tiền', icon: Wallet },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: COURSES */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tổng khóa học</CardDescription>
                <CardTitle className="font-mono text-2xl">{courses?.length ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Đã xuất bản</CardDescription>
                <CardTitle className="font-mono text-2xl text-emerald-600 dark:text-emerald-400">
                  {publishedCount}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Đang chờ duyệt</CardDescription>
                <CardTitle className="font-mono text-2xl text-amber-600 dark:text-amber-400">
                  {pendingCount}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tổng học viên</CardDescription>
                <CardTitle className="font-mono text-2xl">
                  {user?.instructorProfile?.totalStudents ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : !courses || courses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-foreground">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold">Bạn chưa tạo khóa học nào</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Bắt đầu với Course Builder kéo thả: tạo chương, tải video lên Cloud, soạn Markdown
                  &amp; Quiz rồi gửi Admin duyệt xuất bản.
                </p>
                <Button className="mt-5" onClick={() => setCreateOpen(true)}>
                  <BookPlus className="h-4 w-4" />
                  Tạo khóa học đầu tiên
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => {
                const enrolledCount = Math.max(course.enrollmentCount, course._count.enrollments);
                const hasEnrolled = enrolledCount > 0;
                const canArchiveToggle =
                  course.status === CourseStatus.PUBLISHED ||
                  course.status === CourseStatus.ARCHIVED;

                return (
                  <Card key={course.id} className="flex flex-col overflow-hidden">
                    <CourseThumbnail src={course.thumbnailUrl} alt={course.title}>
                      <div className="absolute left-3 top-3">{getStatusBadge(course.status)}</div>
                      {hasEnrolled && (
                        <Badge
                          variant="secondary"
                          className="absolute right-3 top-3 gap-1 bg-background/85 font-mono text-[10px] backdrop-blur-xs"
                        >
                          <Users className="h-3 w-3 text-primary" /> {enrolledCount} HV
                        </Badge>
                      )}
                    </CourseThumbnail>

                    <CardHeader className="flex-1 pb-3">
                      <CardTitle className="line-clamp-2 min-h-[2.75rem] text-base leading-snug">
                        {course.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 min-h-[2.25rem]">
                        {course.subtitle || 'Chưa có mô tả ngắn cho khóa học này.'}
                      </CardDescription>

                      {course.status === CourseStatus.REJECTED && course.latestReviewLog?.note && (
                        <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong>Góp ý Admin:</strong> {course.latestReviewLog.note}
                          </span>
                        </div>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          {course._count.sections} chương • {course.totalLessons} bài
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(course.totalDurationSec)}
                        </span>
                        <span className="ml-auto font-mono font-semibold text-foreground">
                          {formatVnd(course.salePriceVnd ?? course.priceVnd)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 border-t border-border pt-3">
                        <Link href={`/instructor/courses/${course.id}/builder`} className="flex-1">
                          <Button size="sm" className="w-full">
                            <Pencil className="h-3.5 w-3.5" />
                            Course Builder
                          </Button>
                        </Link>
                        {hasEnrolled || canArchiveToggle ? (
                          <Button
                            size="sm"
                            variant="outline"
                            title={
                              course.status === CourseStatus.ARCHIVED
                                ? 'Mở bán lại khóa học trên sàn'
                                : 'Ẩn khỏi sàn (học viên đã mua vẫn học trọn đời)'
                            }
                            disabled={toggleVisibilityMutation.isPending}
                            onClick={async () => {
                              const archiving = course.status !== CourseStatus.ARCHIVED;
                              const ok = await confirmAction({
                                title: archiving
                                  ? `Ẩn khóa học "${course.title}" khỏi sàn?`
                                  : `Mở bán lại "${course.title}"?`,
                                description: archiving
                                  ? `Khóa học đang có ${enrolledCount} học viên. Ẩn sẽ ngừng bán mới, nhưng mọi học viên đã mua vẫn sở hữu vĩnh viễn và xem đủ bài học.`
                                  : 'Khóa học sẽ hiển thị công khai trở lại để học viên mới đăng ký.',
                                confirmLabel: archiving ? 'Ẩn khóa học' : 'Mở bán lại',
                              });
                              if (ok) {
                                toggleVisibilityMutation.mutate({
                                  id: course.id,
                                  archived: archiving,
                                });
                              }
                            }}
                          >
                            {course.status === CourseStatus.ARCHIVED ? (
                              <Eye className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Archive className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            title="Xóa khóa học nháp"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={async () => {
                              const ok = await confirmAction({
                                title: `Xóa khóa học "${course.title}"?`,
                                description:
                                  'Khóa học chưa có học viên sẽ bị xóa vĩnh viễn toàn bộ chương & bài học.',
                                confirmLabel: 'Xóa khóa học',
                                destructive: true,
                              });
                              if (ok) deleteMutation.mutate(course.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COUPONS */}
      {activeTab === 'coupons' && <InstructorCouponsPanel courses={courses ?? []} />}

      {/* TAB 3: ANALYTICS & DROP-OFF */}
      {activeTab === 'analytics' && <InstructorAnalyticsPanel />}

      {/* TAB 4: WALLET & PAYOUTS */}
      {activeTab === 'payouts' && <InstructorWalletPanel />}

      <CreateCourseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function InstructorDashboardPage() {
  return (
    <RoleGuard allowedRoles={[Role.INSTRUCTOR, Role.ADMIN]}>
      <InstructorDashboardContent />
    </RoleGuard>
  );
}
