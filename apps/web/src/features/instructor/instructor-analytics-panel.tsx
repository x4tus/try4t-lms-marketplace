'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, TrendingUp, Users } from 'lucide-react';
import { formatVnd } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';

interface InstructorOverviewData {
  kpis: {
    totalRevenueNetVnd: number;
    totalGrossSalesVnd: number;
    availableBalanceVnd: number;
    pendingHoldVnd: number;
    totalWithdrawnVnd: number;
    totalPaidSales: number;
    publishedCoursesCount: number;
    totalEnrollments: number;
  };
  monthlyRevenue: Array<{
    month: string;
    key: string;
    revenueVnd: number;
    grossVnd: number;
    salesCount: number;
  }>;
  courses: Array<{
    id: string;
    slug: string;
    title: string;
    enrollmentCount: number;
    salesCount: number;
    revenueNetVnd: number;
  }>;
}

interface DropOffResponse {
  course: { id: string; title: string };
  summary: {
    totalEnrollments: number;
    completedEnrollments: number;
    overallCompletionRate: number;
    highestDropLesson: {
      index: number;
      title: string;
      dropOffCount: number;
      dropOffRate: number;
    } | null;
  };
  funnel: Array<{
    index: number;
    shortLabel: string;
    lessonId: string;
    sectionTitle: string;
    title: string;
    startedCount: number;
    completedCount: number;
    completionRate: number;
    dropOffCount: number;
    dropOffRate: number;
  }>;
}

export function InstructorAnalyticsPanel() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['instructor-analytics-overview'],
    queryFn: () => api.get<InstructorOverviewData>('/analytics/instructor/overview'),
  });

  const [selectedCourseId, setSelectedCourseId] = React.useState<string>('');

  React.useEffect(() => {
    if (!selectedCourseId && overview?.courses.length) {
      setSelectedCourseId(overview.courses[0]!.id);
    }
  }, [overview, selectedCourseId]);

  const { data: dropOff, isLoading: loadingDropOff } = useQuery({
    queryKey: ['instructor-dropoff', selectedCourseId],
    queryFn: () => api.get<DropOffResponse>(`/analytics/instructor/courses/${selectedCourseId}/dropoff`),
    enabled: Boolean(selectedCourseId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              Thực nhận tích lũy (Sau phí)
            </CardDescription>
            <CardTitle className="font-mono text-2xl text-primary">
              {formatVnd(overview?.kpis.totalRevenueNetVnd ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng doanh số bán (Gross)</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatVnd(overview?.kpis.totalGrossSalesVnd ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-emerald-500" />
              Tổng lượt ghi danh / Đơn đã bán
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {overview?.kpis.totalEnrollments ?? 0}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({overview?.kpis.totalPaidSales ?? 0} đơn)
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Revenue Area Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Doanh thu thực nhận 6 tháng gần nhất
          </CardTitle>
          <CardDescription>
            Cập nhật tự động từ các giao dịch VietQR &amp; Sandbox đã đối soát thành công.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview?.monthlyRevenue ?? []}>
                <defs>
                  <linearGradient id="try4tRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`
                  }
                />
                <Tooltip
                  formatter={(value: unknown) => [formatVnd(Number(value ?? 0)), 'Thực nhận']}
                />
                <Area
                  type="monotone"
                  dataKey="revenueVnd"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#try4tRevGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Drop-off Funnel Chart */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Biểu đồ phễu tỷ lệ bỏ học (Lesson Drop-off Funnel)
            </CardTitle>
            <CardDescription>
              Phát hiện chính xác bài học nào khiến nhiều học viên dừng lại nhất để tối ưu giáo
              trình.
            </CardDescription>
          </div>
          {overview?.courses && overview.courses.length > 0 && (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              aria-label="Chọn khóa học xem biểu đồ drop-off"
              className="h-9 max-w-xs rounded-lg border border-input bg-card px-3 text-xs font-medium"
            >
              {overview.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.enrollmentCount} HV)
                </option>
              ))}
            </select>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {loadingDropOff ? (
            <Skeleton className="h-64 w-full" />
          ) : !dropOff || dropOff.funnel.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Khóa học này chưa có bài học để lập biểu đồ phễu.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Badge variant="secondary">
                  Tổng học viên: <strong className="ml-1 font-mono">{dropOff.summary.totalEnrollments}</strong>
                </Badge>
                <Badge variant="success">
                  Hoàn thành 100%:{' '}
                  <strong className="ml-1 font-mono">
                    {dropOff.summary.completedEnrollments} ({dropOff.summary.overallCompletionRate}%)
                  </strong>
                </Badge>
                {dropOff.summary.highestDropLesson && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Điểm rơi cao nhất: <strong>Bài {dropOff.summary.highestDropLesson.index}</strong> (
                    {dropOff.summary.highestDropLesson.title}) — rớt{' '}
                    <strong>{dropOff.summary.highestDropLesson.dropOffRate}%</strong>
                  </div>
                )}
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dropOff.funnel}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(_label, payload) => {
                        const item = payload?.[0]?.payload as { title?: string; sectionTitle?: string } | undefined;
                        return item ? `${item.sectionTitle} — ${item.title}` : '';
                      }}
                      formatter={(value: unknown, name: unknown) => [
                        `${Number(value ?? 0)}%`,
                        name === 'completionRate' ? 'Tỷ lệ hoàn thành' : 'Tỷ lệ bỏ qua (Drop-off)',
                      ]}
                    />
                    <Bar dataKey="completionRate" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="dropOffRate" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
