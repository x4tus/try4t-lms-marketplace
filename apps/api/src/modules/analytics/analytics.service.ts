import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CourseStatus as PrismaCourseStatus,
  InstructorApplicationStatus,
  OrderStatus as PrismaOrderStatus,
  PayoutStatus,
  Role as PrismaRole,
  WalletTxType,
} from '@prisma/client';
import { Role } from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

function buildLastMonths(count = 6) {
  const now = new Date();
  const buckets: Array<{ key: string; label: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    buckets.push({ key: `${yyyy}-${mm}`, label: `T${Number(mm)}/${String(yyyy).slice(-2)}` });
  }
  return buckets;
}

function toMonthKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInstructorOverview(user: AuthenticatedUser) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [courses, paidItems, walletAgg, pendingPayoutAgg] = await Promise.all([
      this.prisma.course.findMany({
        where: { instructorId: user.id },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          enrollmentCount: true,
          ratingAvg: true,
          ratingCount: true,
          totalLessons: true,
        },
        orderBy: { enrollmentCount: 'desc' },
      }),
      this.prisma.orderItem.findMany({
        where: {
          instructorId: user.id,
          order: { status: PrismaOrderStatus.PAID },
        },
        select: {
          courseId: true,
          netPriceVnd: true,
          instructorEarningVnd: true,
          platformFeeVnd: true,
          order: { select: { paidAt: true, createdAt: true } },
        },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['type'],
        where: { instructorId: user.id },
        _sum: { amountVnd: true },
      }),
      this.prisma.payoutRequest.aggregate({
        where: {
          instructorId: user.id,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] },
        },
        _sum: { amountVnd: true },
      }),
    ]);

    const months = buildLastMonths(6);
    const monthMap = new Map(
      months.map((m) => [m.key, { month: m.label, key: m.key, revenueVnd: 0, grossVnd: 0, salesCount: 0 }]),
    );

    const courseRevenueMap = new Map<string, { revenueVnd: number; salesCount: number }>();
    let totalGrossSalesVnd = 0;
    let totalRevenueNetVnd = 0;

    for (const item of paidItems) {
      totalGrossSalesVnd += item.netPriceVnd;
      totalRevenueNetVnd += item.instructorEarningVnd;

      const prev = courseRevenueMap.get(item.courseId) ?? { revenueVnd: 0, salesCount: 0 };
      prev.revenueVnd += item.instructorEarningVnd;
      prev.salesCount += 1;
      courseRevenueMap.set(item.courseId, prev);

      const dt = item.order.paidAt ?? item.order.createdAt;
      const bucket = monthMap.get(toMonthKey(dt));
      if (bucket) {
        bucket.revenueVnd += item.instructorEarningVnd;
        bucket.grossVnd += item.netPriceVnd;
        bucket.salesCount += 1;
      }
    }

    let ledgerBalanceVnd = 0;
    let totalWithdrawnVnd = 0;
    for (const row of walletAgg) {
      const sum = row._sum.amountVnd ?? 0;
      ledgerBalanceVnd += sum;
      if (row.type === WalletTxType.PAYOUT_DEBIT) {
        totalWithdrawnVnd += Math.abs(sum);
      }
    }

    const pendingHoldVnd = pendingPayoutAgg._sum.amountVnd ?? 0;
    const availableBalanceVnd = Math.max(0, ledgerBalanceVnd - pendingHoldVnd);

    return {
      kpis: {
        totalRevenueNetVnd,
        totalGrossSalesVnd,
        availableBalanceVnd,
        pendingHoldVnd,
        totalWithdrawnVnd,
        totalPaidSales: paidItems.length,
        publishedCoursesCount: courses.filter((c) => c.status === PrismaCourseStatus.PUBLISHED).length,
        totalEnrollments: courses.reduce((sum, c) => sum + c.enrollmentCount, 0),
      },
      monthlyRevenue: Array.from(monthMap.values()),
      courses: courses.map((c) => {
        const rev = courseRevenueMap.get(c.id) ?? { revenueVnd: 0, salesCount: 0 };
        return {
          id: c.id,
          slug: c.slug,
          title: c.title,
          status: c.status,
          enrollmentCount: c.enrollmentCount,
          ratingAvg: Number(c.ratingAvg),
          ratingCount: c.ratingCount,
          totalLessons: c.totalLessons,
          salesCount: rev.salesCount,
          revenueNetVnd: rev.revenueVnd,
        };
      }),
    };
  }

  /**
   * Biểu đồ phễu Drop-off theo từng bài học (đặt đúng thứ tự Section -> Lesson).
   */
  async getCourseDropOff(user: AuthenticatedUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        slug: true,
        instructorId: true,
        enrollmentCount: true,
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học.');
    }

    if (course.instructorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền xem thống kê khóa học này.');
    }

    const [sections, totalEnrollments, completedEnrollments, startedGroup, completedGroup] =
      await Promise.all([
        this.prisma.courseSection.findMany({
          where: { courseId },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            sortOrder: true,
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true, type: true, sortOrder: true },
            },
          },
        }),
        this.prisma.enrollment.count({ where: { courseId } }),
        this.prisma.enrollment.count({
          where: { courseId, progressPercent: { gte: 100 } },
        }),
        this.prisma.lessonProgress.groupBy({
          by: ['lessonId'],
          where: { courseId },
          _count: { id: true },
        }),
        this.prisma.lessonProgress.groupBy({
          by: ['lessonId'],
          where: { courseId, isCompleted: true },
          _count: { id: true },
        }),
      ]);

    const startedMap = new Map(startedGroup.map((g) => [g.lessonId, g._count.id]));
    const completedMap = new Map(completedGroup.map((g) => [g.lessonId, g._count.id]));

    const flatLessons = sections.flatMap((sec, sIdx) =>
      sec.lessons.map((l) => ({
        lessonId: l.id,
        sectionTitle: sec.title,
        sectionIndex: sIdx + 1,
        title: l.title,
        type: l.type,
      })),
    );

    let prevReach = totalEnrollments;
    const funnel = flatLessons.map((lesson, idx) => {
      const startedCount = startedMap.get(lesson.lessonId) ?? 0;
      const completedCount = completedMap.get(lesson.lessonId) ?? 0;
      const completionRate =
        totalEnrollments > 0 ? Math.round((completedCount / totalEnrollments) * 100) : 0;

      const baseReach = idx === 0 ? totalEnrollments : prevReach;
      const dropOffCount = Math.max(0, baseReach - completedCount);
      const dropOffRate = baseReach > 0 ? Math.round((dropOffCount / baseReach) * 100) : 0;
      prevReach = completedCount;

      return {
        index: idx + 1,
        shortLabel: `B${idx + 1}`,
        lessonId: lesson.lessonId,
        sectionTitle: lesson.sectionTitle,
        title: lesson.title,
        type: lesson.type,
        startedCount,
        completedCount,
        completionRate,
        dropOffCount,
        dropOffRate,
      };
    });

    const highestDropLesson =
      funnel.length > 0
        ? funnel.reduce((max, curr) => (curr.dropOffRate > max.dropOffRate ? curr : max), funnel[0]!)
        : null;

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
      },
      summary: {
        totalEnrollments,
        completedEnrollments,
        overallCompletionRate:
          totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0,
        highestDropLesson:
          highestDropLesson && highestDropLesson.dropOffCount > 0 ? highestDropLesson : null,
      },
      funnel,
    };
  }

  async getAdminOverview() {
    const [
      paidOrders,
      userRoleCounts,
      courseStatusCounts,
      pendingInstructorsCount,
      pendingPayoutsCount,
      topCourses,
      certificatesCount,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: PrismaOrderStatus.PAID },
        select: {
          id: true,
          totalVnd: true,
          paidAt: true,
          createdAt: true,
          items: {
            select: {
              platformFeeVnd: true,
              instructorEarningVnd: true,
            },
          },
        },
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.course.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.instructorProfile.count({
        where: { applicationStatus: InstructorApplicationStatus.PENDING },
      }),
      this.prisma.payoutRequest.count({
        where: { status: PayoutStatus.PENDING },
      }),
      this.prisma.course.findMany({
        where: { status: PrismaCourseStatus.PUBLISHED },
        orderBy: [{ enrollmentCount: 'desc' }, { ratingAvg: 'desc' }],
        take: 6,
        select: {
          id: true,
          slug: true,
          title: true,
          enrollmentCount: true,
          ratingAvg: true,
          priceVnd: true,
          salePriceVnd: true,
          instructor: { select: { fullName: true } },
        },
      }),
      this.prisma.certificate.count(),
    ]);

    const months = buildLastMonths(6);
    const monthMap = new Map(
      months.map((m) => [
        m.key,
        { month: m.label, key: m.key, gmvVnd: 0, platformFeeVnd: 0, ordersCount: 0 },
      ]),
    );

    let totalGmvVnd = 0;
    let platformRevenueVnd = 0;
    let instructorEarningsVnd = 0;

    for (const order of paidOrders) {
      totalGmvVnd += order.totalVnd;
      const orderFee = order.items.reduce((s, it) => s + it.platformFeeVnd, 0);
      const orderInstructor = order.items.reduce((s, it) => s + it.instructorEarningVnd, 0);
      platformRevenueVnd += orderFee;
      instructorEarningsVnd += orderInstructor;

      const dt = order.paidAt ?? order.createdAt;
      const bucket = monthMap.get(toMonthKey(dt));
      if (bucket) {
        bucket.gmvVnd += order.totalVnd;
        bucket.platformFeeVnd += orderFee;
        bucket.ordersCount += 1;
      }
    }

    const roleCountMap = new Map(userRoleCounts.map((r) => [r.role, r._count.id]));
    const courseStatusMap = new Map(courseStatusCounts.map((c) => [c.status, c._count.id]));

    return {
      kpis: {
        totalGmvVnd,
        platformRevenueVnd,
        instructorEarningsVnd,
        paidOrdersCount: paidOrders.length,
        totalUsers: userRoleCounts.reduce((s, r) => s + r._count.id, 0),
        totalStudents: roleCountMap.get(PrismaRole.STUDENT) ?? 0,
        totalInstructors: roleCountMap.get(PrismaRole.INSTRUCTOR) ?? 0,
        publishedCoursesCount: courseStatusMap.get(PrismaCourseStatus.PUBLISHED) ?? 0,
        pendingCoursesCount: courseStatusMap.get(PrismaCourseStatus.PENDING_REVIEW) ?? 0,
        pendingInstructorsCount,
        pendingPayoutsCount,
        certificatesCount,
      },
      monthlySeries: Array.from(monthMap.values()),
      topCourses: topCourses.map((c) => ({
        ...c,
        ratingAvg: Number(c.ratingAvg),
      })),
    };
  }
}
