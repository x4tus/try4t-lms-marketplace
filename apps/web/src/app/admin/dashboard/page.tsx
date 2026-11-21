'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Eye,
  FolderTree,
  Loader2,
  Lock,
  Plus,
  Presentation,
  Search,
  Trash2,
  Unlock,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CourseStatus,
  formatVnd,
  InstructorApplicationStatus,
  PayoutStatus,
  Role,
  type AuthUser,
  type PaginatedResult,
} from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AdminOrdersPanel,
  AdminOverviewPanel,
  AdminPayoutsPanel,
} from '@/features/admin/admin-finance-panels';
import { InstructorAppInspectModal } from '@/features/admin/instructor-app-inspect-modal';
import { ModerationInspectModal } from '@/features/admin/moderation-inspect-modal';
import { useAuthStore } from '@/features/auth/auth.store';
import { RoleGuard } from '@/features/auth/role-guard';
import type { CategoryOption, InstructorCourseSummary } from '@/features/course-builder/types';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

type AdminTab =
  | 'overview'
  | 'moderation'
  | 'instructors'
  | 'orders'
  | 'payouts'
  | 'categories'
  | 'users';

interface ModerationListResponse {
  statusCounts: Record<string, number>;
  items: InstructorCourseSummary[];
}

interface InstructorAppsResponse {
  statusCounts: Record<string, number>;
  items: AuthUser[];
}

function AdminDashboardContent() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<AdminTab>('overview');
  const [modStatusFilter, setModStatusFilter] = React.useState<string>(CourseStatus.PENDING_REVIEW);
  const [inspectCourseId, setInspectCourseId] = React.useState<string | null>(null);

  const [appStatusFilter, setAppStatusFilter] = React.useState<string>(
    InstructorApplicationStatus.PENDING,
  );
  const [inspectApplicant, setInspectApplicant] = React.useState<AuthUser | null>(null);

  // Category Modal
  const [catModalOpen, setCatModalOpen] = React.useState(false);
  const [catName, setCatName] = React.useState('');
  const [catSortOrder, setCatSortOrder] = React.useState(0);

  // Users search
  const [userSearch, setUserSearch] = React.useState('');

  const { data: modData, isLoading: loadingMod } = useQuery({
    queryKey: ['admin-moderation', modStatusFilter],
    queryFn: () => {
      const qs = modStatusFilter ? `?status=${modStatusFilter}` : '';
      return api.get<ModerationListResponse>(`/admin/moderation/courses${qs}`);
    },
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ['admin-instructor-apps', appStatusFilter],
    queryFn: () => {
      const qs = appStatusFilter ? `?status=${appStatusFilter}` : '';
      return api.get<InstructorAppsResponse>(`/users/instructor-applications${qs}`);
    },
  });

  const { data: payoutsSummary } = useQuery({
    queryKey: ['admin-payouts', PayoutStatus.PENDING],
    queryFn: () =>
      api.get<{ statusCounts: Record<string, number> }>(`/payouts/admin?status=${PayoutStatus.PENDING}`),
  });

  const { data: categories, isLoading: loadingCats } = useQuery({
    queryKey: ['public-categories'],
    queryFn: () => api.get<CategoryOption[]>('/categories'),
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users', userSearch],
    queryFn: () => {
      const qs = userSearch.trim() ? `?search=${encodeURIComponent(userSearch.trim())}` : '';
      return api.get<PaginatedResult<AuthUser>>(`/users${qs}`);
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () => api.post('/categories', { name: catName.trim(), sortOrder: catSortOrder }),
    onSuccess: () => {
      notify.success('Đã thêm danh mục mới');
      setCatName('');
      setCatSortOrder(0);
      setCatModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['public-categories'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Tạo danh mục thất bại');
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      notify.success('Đã xóa danh mục');
      void queryClient.invalidateQueries({ queryKey: ['public-categories'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Xóa danh mục thất bại');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { role?: Role; isActive?: boolean } }) =>
      api.patch<AuthUser>(`/users/${id}`, payload),
    onSuccess: () => {
      notify.success('Đã cập nhật trạng thái người dùng');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật thất bại');
    },
  });

  const pendingCoursesCount = modData?.statusCounts?.PENDING_REVIEW ?? 0;
  const pendingInstructorsCount = appsData?.statusCounts?.PENDING ?? 0;
  const pendingPayoutsCount = payoutsSummary?.statusCounts?.PENDING ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Try4T Admin Console</h1>
          <p className="text-sm text-muted-foreground">
            Trung tâm điều hành doanh thu GMV, kiểm duyệt khóa học, duyệt giảng viên, đối soát VietQR
            và giải ngân rút tiền.
          </p>
        </div>

        {/* Navigation Pills */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-secondary/50 p-1">
          {[
            { id: 'overview' as const, label: 'Tổng quan', icon: BarChart3 },
            {
              id: 'moderation' as const,
              label: 'Duyệt khóa học',
              icon: ClipboardCheck,
              badge: pendingCoursesCount > 0 ? String(pendingCoursesCount) : undefined,
            },
            {
              id: 'instructors' as const,
              label: 'Duyệt Giảng viên',
              icon: Presentation,
              badge: pendingInstructorsCount > 0 ? String(pendingInstructorsCount) : undefined,
            },
            { id: 'orders' as const, label: 'Đơn hàng & VietQR', icon: CreditCard },
            {
              id: 'payouts' as const,
              label: 'Rút tiền',
              icon: Wallet,
              badge: pendingPayoutsCount > 0 ? String(pendingPayoutsCount) : undefined,
            },
            { id: 'categories' as const, label: 'Danh mục', icon: FolderTree },
            { id: 'users' as const, label: 'Người dùng & RBAC', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all',
                  activeTab === tab.id
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.badge && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 0: OVERVIEW */}
      {activeTab === 'overview' && <AdminOverviewPanel />}

      {/* TAB 1: COURSE MODERATION */}
      {activeTab === 'moderation' && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Hàng đợi kiểm duyệt khóa học</CardTitle>
              <CardDescription>
                Bấm &ldquo;Kiểm duyệt&rdquo; để xem toàn bộ video, Markdown &amp; Quiz ngay trong Pop-up.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: CourseStatus.PENDING_REVIEW, label: 'Chờ duyệt' },
                { key: CourseStatus.PUBLISHED, label: 'Đã xuất bản' },
                { key: CourseStatus.REJECTED, label: 'Đã từ chối' },
                { key: '', label: 'Tất cả' },
              ].map((st) => (
                <Button
                  key={st.label}
                  size="sm"
                  variant={modStatusFilter === st.key ? 'default' : 'outline'}
                  onClick={() => setModStatusFilter(st.key)}
                  className="h-8 text-xs"
                >
                  {st.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loadingMod ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !modData?.items.length ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Không có khóa học nào trong trạng thái này.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {modData.items.map((course) => (
                  <div
                    key={course.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                        {course.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={course.thumbnailUrl}
                            alt={course.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{course.title}</p>
                        <p className="text-xs text-muted-foreground">
                          GV: {course.instructor.fullName} • {course.totalLessons} bài •{' '}
                          <span className="font-mono">
                            {formatVnd(course.salePriceVnd ?? course.priceVnd)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          course.status === CourseStatus.PUBLISHED
                            ? 'success'
                            : course.status === CourseStatus.PENDING_REVIEW
                              ? 'warning'
                              : course.status === CourseStatus.REJECTED
                                ? 'destructive'
                                : 'secondary'
                        }
                      >
                        {course.status}
                      </Badge>
                      <Button size="sm" onClick={() => setInspectCourseId(course.id)}>
                        <Eye className="h-3.5 w-3.5" />
                        Kiểm duyệt
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 2: INSTRUCTOR APPLICATIONS */}
      {activeTab === 'instructors' && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Hồ sơ đăng ký trở thành Giảng viên</CardTitle>
              <CardDescription>
                Xem chi tiết kinh nghiệm, Portfolio, video dạy thử và kế hoạch khóa học trước khi phê
                duyệt.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: InstructorApplicationStatus.PENDING, label: 'Chờ duyệt' },
                { key: InstructorApplicationStatus.APPROVED, label: 'Đã duyệt' },
                { key: InstructorApplicationStatus.REJECTED, label: 'Đã từ chối' },
                { key: '', label: 'Tất cả' },
              ].map((st) => (
                <Button
                  key={st.label}
                  size="sm"
                  variant={appStatusFilter === st.key ? 'default' : 'outline'}
                  onClick={() => setAppStatusFilter(st.key)}
                  className="h-8 text-xs"
                >
                  {st.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loadingApps ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !appsData?.items.length ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Không có hồ sơ Giảng viên nào trong trạng thái này.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {appsData.items.map((applicant) => {
                  const status = applicant.instructorProfile?.applicationStatus;
                  return (
                    <div
                      key={applicant.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {applicant.fullName}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({applicant.email})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {applicant.headline || 'Chưa có chức danh'} •{' '}
                          {applicant.instructorProfile?.yearsOfExperience ?? 0} năm kinh nghiệm •
                          SĐT: {applicant.instructorProfile?.phone || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            status === InstructorApplicationStatus.APPROVED
                              ? 'success'
                              : status === InstructorApplicationStatus.PENDING
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {status}
                        </Badge>
                        <Button size="sm" onClick={() => setInspectApplicant(applicant)}>
                          <Eye className="h-3.5 w-3.5" />
                          Xem hồ sơ
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: ORDERS RECONCILIATION */}
      {activeTab === 'orders' && <AdminOrdersPanel />}

      {/* TAB 4: PAYOUTS */}
      {activeTab === 'payouts' && <AdminPayoutsPanel />}

      {/* TAB 5: CATEGORIES */}
      {activeTab === 'categories' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Quản lý danh mục khóa học</CardTitle>
              <CardDescription>Hiển thị trên Trang chủ và bộ lọc khóa học.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCatModalOpen(true)}>
              <Plus className="h-4 w-4" /> Thêm danh mục
            </Button>
          </CardHeader>
          <CardContent>
            {loadingCats ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="divide-y divide-border">
                {categories?.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{cat.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        /{cat.slug} • Thứ tự: {cat.sortOrder} • {cat._count?.courses ?? 0} khóa đã
                        xuất bản
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={deleteCategoryMutation.isPending}
                      onClick={async () => {
                        const ok = await confirmAction({
                          title: `Xóa danh mục "${cat.name}"?`,
                          description:
                            'Các khóa học thuộc danh mục này sẽ được giữ lại (không gán danh mục).',
                          confirmLabel: 'Xóa danh mục',
                          destructive: true,
                        });
                        if (ok) deleteCategoryMutation.mutate(cat.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 6: USERS & RBAC */}
      {activeTab === 'users' && (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Danh sách người dùng &amp; RBAC</CardTitle>
              <CardDescription>
                Đổi vai trò hoặc khóa/mở khóa tài khoản theo thời gian thực.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Tìm tên hoặc email..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-3 font-medium">Người dùng</th>
                      <th className="pb-3 font-medium">Vai trò</th>
                      <th className="pb-3 font-medium">Trạng thái</th>
                      <th className="pb-3 text-right font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usersData?.items.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      return (
                        <tr key={u.id} className="hover:bg-secondary/40">
                          <td className="py-3 pr-4">
                            <p className="font-medium">{u.fullName}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </td>
                          <td className="py-3 pr-4">
                            <select
                              aria-label={`Vai trò của ${u.fullName}`}
                              disabled={isSelf || updateUserMutation.isPending}
                              value={u.role}
                              onChange={(e) =>
                                updateUserMutation.mutate({
                                  id: u.id,
                                  payload: { role: e.target.value as Role },
                                })
                              }
                              className="rounded-md border border-input bg-card px-2 py-1 font-mono text-xs"
                            >
                              <option value={Role.STUDENT}>STUDENT</option>
                              <option value={Role.INSTRUCTOR}>INSTRUCTOR</option>
                              <option value={Role.ADMIN}>ADMIN</option>
                            </select>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant={u.isActive ? 'success' : 'destructive'}>
                              {u.isActive ? 'Hoạt động' : 'Đã khóa'}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSelf || updateUserMutation.isPending}
                              onClick={() =>
                                updateUserMutation.mutate({
                                  id: u.id,
                                  payload: { isActive: !u.isActive },
                                })
                              }
                            >
                              {u.isActive ? (
                                <>
                                  <Lock className="h-3.5 w-3.5" /> Khóa
                                </>
                              ) : (
                                <>
                                  <Unlock className="h-3.5 w-3.5" /> Mở
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <ModerationInspectModal
        courseId={inspectCourseId}
        onClose={() => setInspectCourseId(null)}
        onDecided={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin-moderation'] });
          void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
          void queryClient.invalidateQueries({ queryKey: ['admin-analytics-overview'] });
        }}
      />

      <InstructorAppInspectModal
        applicant={inspectApplicant}
        onClose={() => setInspectApplicant(null)}
        onDecided={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin-instructor-apps'] });
          void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          void queryClient.invalidateQueries({ queryKey: ['admin-analytics-overview'] });
        }}
      />

      <Dialog
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="Thêm danh mục khóa học"
        maxWidthClass="max-w-sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (catName.trim().length < 2) {
              notify.error('Tên danh mục tối thiểu 2 ký tự');
              return;
            }
            createCategoryMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Tên danh mục</Label>
            <Input
              id="cat-name"
              placeholder="VD: An ninh mạng & Pentest"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-order">Thứ tự hiển thị</Label>
            <Input
              id="cat-order"
              type="number"
              min={0}
              value={catSortOrder}
              onChange={(e) => setCatSortOrder(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCatModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={createCategoryMutation.isPending}>
              {createCategoryMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tạo danh mục
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <RoleGuard allowedRoles={[Role.ADMIN]}>
      <AdminDashboardContent />
    </RoleGuard>
  );
}
