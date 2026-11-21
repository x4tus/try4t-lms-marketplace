'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  ExternalLink,
  Play,
  QrCode,
  Receipt,
} from 'lucide-react';
import { formatDuration, formatVnd, OrderStatus } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/features/auth/auth.store';
import { RoleGuard } from '@/features/auth/role-guard';
import { useCartStore } from '@/features/cart/cart.store';
import { api, getApiBaseUrl } from '@/lib/api-client';
import { cn } from '@/lib/cn';

interface EnrolledCourseItem {
  id: string;
  courseId: string;
  progressPercent: number;
  completedLessonsCount: number;
  enrolledAt: string;
  completedAt: string | null;
  lastLesson: { id: string; title: string; type: string } | null;
  course: {
    id: string;
    slug: string;
    title: string;
    thumbnailUrl: string | null;
    totalLessons: number;
    totalDurationSec: number;
    category: { name: string } | null;
    instructor: { id: string; fullName: string; avatarUrl: string | null };
  };
  certificate: {
    certCode: string;
    issuedAt: string;
    verifyPath: string;
    pdfPath: string;
  } | null;
}

interface CertificateListItem {
  id: string;
  certCode: string;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  issuedAt: string;
  verifyPath: string;
  pdfPath: string;
  course: {
    slug: string;
    thumbnailUrl: string | null;
    category: { name: string } | null;
  };
}

interface OrderHistoryItem {
  id: string;
  orderCode: string;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  status: OrderStatus;
  paymentMethod: string;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  coupon: { code: string } | null;
  items: Array<{
    id: string;
    netPriceVnd: number;
    course: { id: string; slug: string; title: string };
  }>;
}

type HubTab = 'courses' | 'certificates' | 'orders';

function orderStatusBadge(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PAID:
      return <Badge variant="success">Đã thanh toán</Badge>;
    case OrderStatus.PENDING:
      return <Badge variant="warning">Chờ thanh toán</Badge>;
    case OrderStatus.EXPIRED:
      return <Badge variant="outline">Hết hạn</Badge>;
    case OrderStatus.FAILED:
      return <Badge variant="destructive">Thất bại</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function MyCoursesContent() {
  const user = useAuthStore((s) => s.user);
  const openCheckout = useCartStore((s) => s.openCheckout);
  const [activeTab, setActiveTab] = React.useState<HubTab>('courses');

  const { data: enrollments, isLoading: loadingEnr } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => api.get<EnrolledCourseItem[]>('/learning/enrollments/mine'),
  });

  const { data: certificates, isLoading: loadingCerts } = useQuery({
    queryKey: ['my-certificates'],
    queryFn: () => api.get<CertificateListItem[]>('/certificates/mine'),
  });

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get<OrderHistoryItem[]>('/commerce/orders/mine'),
  });

  const totalCompletedLessons =
    enrollments?.reduce((sum, e) => sum + e.completedLessonsCount, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Không gian học tập của {user?.fullName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tiếp tục phát đúng giây đang xem dở, tải chứng chỉ PDF + QR và tra cứu lịch sử đơn hàng.
          </p>
        </div>
        <Link href="/courses">
          <Button variant="outline" className="gap-2">
            <Compass className="h-4 w-4" />
            Khám phá thêm khóa học
          </Button>
        </Link>
      </div>

      {/* KPI Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Khóa học đã sở hữu
            </CardDescription>
            <CardTitle className="font-mono text-2xl">{enrollments?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Bài học đã hoàn thành
            </CardDescription>
            <CardTitle className="font-mono text-2xl">{totalCompletedLessons}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-500" />
              Chứng chỉ QR đã nhận
            </CardDescription>
            <CardTitle className="font-mono text-2xl text-emerald-600 dark:text-emerald-400">
              {certificates?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-secondary/40 p-1 w-fit">
        {[
          {
            id: 'courses' as const,
            label: `Khóa học (${enrollments?.length ?? 0})`,
            icon: BookOpen,
          },
          {
            id: 'certificates' as const,
            label: `Chứng chỉ (${certificates?.length ?? 0})`,
            icon: Award,
          },
          {
            id: 'orders' as const,
            label: `Đơn hàng (${orders?.length ?? 0})`,
            icon: Receipt,
          },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all',
                activeTab === t.id
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: ENROLLED COURSES */}
      {activeTab === 'courses' && (
        <>
          {loadingEnr ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-72 w-full rounded-2xl" />
              <Skeleton className="h-72 w-full rounded-2xl" />
              <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
          ) : !enrollments || enrollments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">Bạn chưa đăng ký khóa học nào</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Thêm khóa học yêu thích vào giỏ hàng, thanh toán VietQR hoặc Sandbox trong 3 giây
                  để vào Smart Learning Room ngay nhé.
                </p>
                <Link href="/courses" className="mt-5">
                  <Button>Khám phá kho khóa học</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {enrollments.map((enr) => (
                <Card key={enr.id} className="flex flex-col overflow-hidden">
                  <div className="relative aspect-video w-full bg-secondary">
                    {enr.course.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={enr.course.thumbnailUrl}
                        alt={enr.course.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {enr.certificate && (
                      <Badge variant="success" className="absolute right-3 top-3 gap-1 shadow-md">
                        <Award className="h-3 w-3" /> Đã cấp chứng chỉ
                      </Badge>
                    )}
                  </div>

                  <CardHeader className="flex-1 pb-3">
                    {enr.course.category && (
                      <span className="text-[11px] font-medium text-primary">
                        {enr.course.category.name}
                      </span>
                    )}
                    <CardTitle className="line-clamp-2 text-base leading-snug">
                      {enr.course.title}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      GV: {enr.course.instructor.fullName} • {formatDuration(enr.course.totalDurationSec)}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {enr.completedLessonsCount}/{enr.course.totalLessons} bài hoàn thành
                        </span>
                        <span className="font-mono font-bold text-primary">
                          {Math.round(enr.progressPercent)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.min(100, enr.progressPercent)}%` }}
                        />
                      </div>
                      {enr.lastLesson && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          Đang học: <span className="text-foreground">{enr.lastLesson.title}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/learn/${enr.course.slug}`} className="flex-1">
                        <Button size="sm" className="w-full gap-1.5">
                          <Play className="h-3.5 w-3.5 fill-current" />
                          {enr.progressPercent > 0 ? 'Tiếp tục học' : 'Bắt đầu học'}
                        </Button>
                      </Link>
                      {enr.certificate && (
                        <Link href={enr.certificate.verifyPath}>
                          <Button size="sm" variant="outline" title="Xem chứng chỉ">
                            <Award className="h-4 w-4 text-emerald-500" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 2: CERTIFICATES */}
      {activeTab === 'certificates' && (
        <>
          {loadingCerts ? (
            <Skeleton className="h-56 w-full rounded-2xl" />
          ) : !certificates || certificates.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <Award className="mb-3 h-10 w-10 text-muted-foreground" />
                <h2 className="text-base font-semibold">Chưa có chứng chỉ nào</h2>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Hoàn thành 100% các bài học (Video, Markdown &amp; Quiz) trong bất kỳ khóa học nào
                  để hệ thống tự động cấp chứng chỉ PDF kèm mã QR xác thực.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {certificates.map((cert) => (
                <Card
                  key={cert.id}
                  className="border-emerald-500/30 bg-gradient-to-br from-card to-emerald-500/5"
                >
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          <Award className="h-5 w-5" />
                        </span>
                        <div>
                          <Badge variant="success" className="font-mono text-[10px]">
                            {cert.certCode}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Cấp ngày {new Date(cert.issuedAt).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                      </div>
                      <QrCode className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div>
                      <h3 className="text-base font-bold leading-snug">{cert.courseTitle}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Học viên: <strong>{cert.recipientName}</strong> • GV: {cert.instructorName}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href={cert.verifyPath}>
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Trang xác thực công khai
                        </Button>
                      </Link>
                      <a
                        href={`${getApiBaseUrl()}/certificates/${encodeURIComponent(cert.certCode)}/pdf?download=1`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button size="sm" className="gap-1.5">
                          <Download className="h-3.5 w-3.5" />
                          Tải PDF + QR
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 3: ORDER HISTORY */}
      {activeTab === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử đơn hàng</CardTitle>
            <CardDescription>
              Theo dõi hóa đơn thanh toán VietQR, mã Coupon đã dùng và tiếp tục thanh toán đơn đang chờ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <Skeleton className="h-44 w-full" />
            ) : !orders || orders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                Bạn chưa có đơn hàng nào.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold">#{order.orderCode}</span>
                        {orderStatusBadge(order.status)}
                        {order.coupon && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Mã: {order.coupon.code}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {order.items.map((it) => it.course.title).join(' • ')}
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(order.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono">
                        <p className="text-sm font-bold text-primary">
                          {formatVnd(order.totalVnd)}
                        </p>
                        {order.discountVnd > 0 && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            Đã giảm {formatVnd(order.discountVnd)}
                          </p>
                        )}
                      </div>
                      {order.status === OrderStatus.PENDING && (
                        <Button size="sm" onClick={() => openCheckout(order.id)}>
                          Thanh toán ngay
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MyCoursesPage() {
  return (
    <RoleGuard>
      <MyCoursesContent />
    </RoleGuard>
  );
}
