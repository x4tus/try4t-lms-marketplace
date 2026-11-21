import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CourseStatus as PrismaCourseStatus,
  DiscountType as PrismaDiscountType,
  OrderStatus as PrismaOrderStatus,
  PaymentMethod as PrismaPaymentMethod,
  PaymentProvider as PrismaPaymentProvider,
  Prisma,
  Role as PrismaRole,
  WalletTxType,
} from '@prisma/client';
import {
  Role,
  type CreateCouponInput,
  type CreateOrderInput,
  type SandboxPayInput,
  type ToggleCouponInput,
  type ValidateCouponInput,
} from '@try4t/shared';
import { randomBytes, randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

interface PricedCourse {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  instructorId: string;
  instructorName: string;
  priceVnd: number;
  salePriceVnd: number | null;
  effectivePriceVnd: number;
  platformFeeRate: number;
}

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  private readonly defaultFeeRate: number;
  private readonly sandboxEnabled: boolean;
  private readonly sepayWebhookSecret: string;
  private readonly vietQrBankCode: string;
  private readonly vietQrAccountNo: string;
  private readonly vietQrAccountName: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.defaultFeeRate = configService.get<number>('PLATFORM_DEFAULT_FEE_RATE') ?? 0.3;
    this.sandboxEnabled = configService.get<boolean>('PAYMENT_SANDBOX_ENABLED') ?? true;
    this.sepayWebhookSecret = configService.get<string>('SEPAY_WEBHOOK_SECRET') ?? '';
    this.vietQrBankCode = configService.get<string>('VIETQR_BANK_CODE') ?? 'MB';
    this.vietQrAccountNo = configService.get<string>('VIETQR_ACCOUNT_NO') ?? '090123456789';
    this.vietQrAccountName = configService.get<string>('VIETQR_ACCOUNT_NAME') ?? 'TRY4T EDUCATION';
  }

  private generateOrderCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars[bytes[i]! % chars.length];
    }
    return `TRY4T${suffix}`;
  }

  buildVietQrInfo(orderCode: string, totalVnd: number) {
    const qrImageUrl =
      totalVnd > 0
        ? `https://img.vietqr.io/image/${encodeURIComponent(this.vietQrBankCode)}-${encodeURIComponent(this.vietQrAccountNo)}-compact2.png?amount=${totalVnd}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(this.vietQrAccountName)}`
        : null;

    return {
      bankCode: this.vietQrBankCode,
      accountNo: this.vietQrAccountNo,
      accountName: this.vietQrAccountName,
      amountVnd: totalVnd,
      transferContent: orderCode,
      qrImageUrl,
    };
  }

  // ============================================================================
  // CART (DB + GUEST MERGE + LAYER 1 ANTI-DUPLICATE)
  // ============================================================================

  private formatCartItems(
    rows: Array<{
      course: {
        id: string;
        slug: string;
        title: string;
        thumbnailUrl: string | null;
        priceVnd: number;
        salePriceVnd: number | null;
        instructor: { fullName: string };
      };
    }>,
  ) {
    return rows.map((row) => ({
      id: row.course.id,
      slug: row.course.slug,
      title: row.course.title,
      thumbnailUrl: row.course.thumbnailUrl,
      instructorName: row.course.instructor.fullName,
      priceVnd: row.course.priceVnd,
      salePriceVnd: row.course.salePriceVnd,
    }));
  }

  async getCart(userId: string) {
    const [cartRows, enrollments] = await Promise.all([
      this.prisma.cartItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          course: {
            select: {
              id: true,
              slug: true,
              title: true,
              thumbnailUrl: true,
              priceVnd: true,
              salePriceVnd: true,
              status: true,
              instructorId: true,
              instructor: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true },
      }),
    ]);

    const enrolledSet = new Set(enrollments.map((e) => e.courseId));
    const staleIds: string[] = [];
    const validRows: typeof cartRows = [];

    for (const row of cartRows) {
      if (
        row.course.status !== PrismaCourseStatus.PUBLISHED ||
        row.course.instructorId === userId ||
        enrolledSet.has(row.courseId)
      ) {
        staleIds.push(row.id);
      } else {
        validRows.push(row);
      }
    }

    if (staleIds.length > 0) {
      await this.prisma.cartItem.deleteMany({ where: { id: { in: staleIds } } });
    }

    return this.formatCartItems(validRows);
  }

  async addToCart(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        status: true,
        instructorId: true,
      },
    });

    if (!course || course.status !== PrismaCourseStatus.PUBLISHED) {
      throw new NotFoundException('Khóa học không tồn tại hoặc chưa được xuất bản.');
    }

    if (course.instructorId === userId) {
      throw new BadRequestException('Bạn là giảng viên của khóa học này nên không cần mua.');
    }

    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true },
    });

    if (existingEnrollment) {
      throw new ConflictException({
        code: 'ALREADY_ENROLLED',
        message: 'Bạn đã sở hữu khóa học này rồi. Hãy vào phòng học ngay!',
      });
    }

    await this.prisma.cartItem.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });

    return this.getCart(userId);
  }

  async removeFromCart(userId: string, courseId: string) {
    await this.prisma.cartItem.deleteMany({
      where: { userId, courseId },
    });
    return this.getCart(userId);
  }

  async syncGuestCart(userId: string, guestCourseIds: string[]) {
    const uniqueIds = Array.from(new Set(guestCourseIds));
    const removedReasons: string[] = [];

    if (uniqueIds.length > 0) {
      const [courses, enrollments] = await Promise.all([
        this.prisma.course.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, title: true, status: true, instructorId: true },
        }),
        this.prisma.enrollment.findMany({
          where: { userId, courseId: { in: uniqueIds } },
          select: { courseId: true },
        }),
      ]);

      const courseMap = new Map(courses.map((c) => [c.id, c]));
      const enrolledSet = new Set(enrollments.map((e) => e.courseId));
      const eligibleIds: string[] = [];

      for (const cid of uniqueIds) {
        const course = courseMap.get(cid);
        if (!course || course.status !== PrismaCourseStatus.PUBLISHED) {
          removedReasons.push('Một khóa học trong giỏ hiện không còn mở bán.');
          continue;
        }
        if (course.instructorId === userId) {
          removedReasons.push(`Đã gỡ "${course.title}" vì bạn là giảng viên của khóa này.`);
          continue;
        }
        if (enrolledSet.has(cid)) {
          removedReasons.push(`Đã gỡ "${course.title}" vì bạn đã sở hữu khóa học này.`);
          continue;
        }
        eligibleIds.push(cid);
      }

      if (eligibleIds.length > 0) {
        await this.prisma.cartItem.createMany({
          data: eligibleIds.map((courseId) => ({ userId, courseId })),
          skipDuplicates: true,
        });
      }
    }

    const items = await this.getCart(userId);
    return {
      items,
      removedReasons,
    };
  }

  // ============================================================================
  // COUPON PRICING ENGINE (ZERO ROUNDING DRIFT)
  // ============================================================================

  private async loadAndValidateCoursesForCheckout(
    userId: string,
    rawCourseIds: string[],
  ): Promise<PricedCourse[]> {
    const uniqueIds = Array.from(new Set(rawCourseIds));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Giỏ hàng không có khóa học nào để thanh toán.');
    }

    const [courses, enrollments] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          slug: true,
          title: true,
          thumbnailUrl: true,
          status: true,
          instructorId: true,
          priceVnd: true,
          salePriceVnd: true,
          instructor: {
            select: {
              fullName: true,
              instructorProfile: { select: { platformFeeRate: true } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId, courseId: { in: uniqueIds } },
        select: { courseId: true },
      }),
    ]);

    if (courses.length !== uniqueIds.length) {
      throw new NotFoundException('Có khóa học không tồn tại trong hệ thống.');
    }

    const enrolledSet = new Set(enrollments.map((e) => e.courseId));

    for (const c of courses) {
      if (c.status !== PrismaCourseStatus.PUBLISHED) {
        throw new BadRequestException(`Khóa học "${c.title}" hiện chưa mở bán.`);
      }
      if (c.instructorId === userId) {
        throw new BadRequestException(`Bạn không thể tự mua khóa học "${c.title}" của chính mình.`);
      }
      if (enrolledSet.has(c.id)) {
        throw new ConflictException({
          code: 'ALREADY_ENROLLED',
          message: `Bạn đã sở hữu khóa học "${c.title}". Vui lòng gỡ khỏi giỏ hàng trước khi thanh toán.`,
        });
      }
    }

    return courses.map((c) => {
      const effectivePriceVnd = Math.max(0, c.salePriceVnd ?? c.priceVnd);
      const platformFeeRate = Number(c.instructor.instructorProfile?.platformFeeRate ?? this.defaultFeeRate);
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        thumbnailUrl: c.thumbnailUrl,
        instructorId: c.instructorId,
        instructorName: c.instructor.fullName,
        priceVnd: c.priceVnd,
        salePriceVnd: c.salePriceVnd,
        effectivePriceVnd,
        platformFeeRate,
      };
    });
  }

  private async evaluateCouponOnCourses(code: string, courses: PricedCourse[]) {
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
      include: {
        createdBy: { select: { id: true, role: true } },
        course: { select: { id: true, title: true } },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Mã giảm giá không tồn tại.');
    }
    if (!coupon.isActive) {
      throw new BadRequestException('Mã giảm giá này đã bị tạm khóa.');
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('Mã giảm giá chưa đến thời gian áp dụng.');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new BadRequestException('Mã giảm giá đã hết hạn sử dụng.');
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng.');
    }

    // Xác định các khóa học hợp lệ trong giỏ
    const eligibleCourses = courses.filter((c) => {
      if (c.effectivePriceVnd <= 0) return false;
      if (coupon.courseId) {
        return c.id === coupon.courseId;
      }
      if (coupon.createdBy.role === PrismaRole.INSTRUCTOR) {
        return c.instructorId === coupon.createdById;
      }
      // Admin site-wide coupon
      return true;
    });

    if (eligibleCourses.length === 0) {
      if (coupon.course) {
        throw new BadRequestException(
          `Mã ${coupon.code} chỉ áp dụng cho khóa học "${coupon.course.title}".`,
        );
      }
      throw new BadRequestException(
        'Mã giảm giá này không áp dụng cho các khóa học đang có trong giỏ hàng của bạn.',
      );
    }

    const eligibleSubtotal = eligibleCourses.reduce((sum, c) => sum + c.effectivePriceVnd, 0);
    let totalDiscountVnd = 0;

    if (coupon.discountType === PrismaDiscountType.PERCENT) {
      totalDiscountVnd = Math.round((eligibleSubtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountVnd !== null) {
        totalDiscountVnd = Math.min(totalDiscountVnd, coupon.maxDiscountVnd);
      }
    } else {
      totalDiscountVnd = coupon.discountValue;
    }

    totalDiscountVnd = Math.max(0, Math.min(totalDiscountVnd, eligibleSubtotal));

    // Phân bổ discount chính xác về từng item, triệt tiêu sai số làm tròn ±1đ
    const itemDiscountMap = new Map<string, number>();
    let allocated = 0;

    eligibleCourses.forEach((course, idx) => {
      let itemDiscount = 0;
      if (idx === eligibleCourses.length - 1) {
        itemDiscount = Math.min(course.effectivePriceVnd, Math.max(0, totalDiscountVnd - allocated));
      } else {
        itemDiscount = Math.min(
          course.effectivePriceVnd,
          Math.floor((totalDiscountVnd * course.effectivePriceVnd) / eligibleSubtotal),
        );
      }
      allocated += itemDiscount;
      itemDiscountMap.set(course.id, itemDiscount);
    });

    return {
      coupon,
      totalDiscountVnd: allocated,
      itemDiscountMap,
      eligibleCourseIds: eligibleCourses.map((c) => c.id),
    };
  }

  async validateCoupon(userId: string, input: ValidateCouponInput) {
    const courses = await this.loadAndValidateCoursesForCheckout(userId, input.courseIds);
    const subtotalVnd = courses.reduce((sum, c) => sum + c.effectivePriceVnd, 0);
    const evaluated = await this.evaluateCouponOnCourses(input.code, courses);
    const totalVnd = Math.max(0, subtotalVnd - evaluated.totalDiscountVnd);

    return {
      code: evaluated.coupon.code,
      discountType: evaluated.coupon.discountType,
      discountValue: evaluated.coupon.discountValue,
      maxDiscountVnd: evaluated.coupon.maxDiscountVnd,
      subtotalVnd,
      discountVnd: evaluated.totalDiscountVnd,
      totalVnd,
      eligibleCourseIds: evaluated.eligibleCourseIds,
    };
  }

  // ============================================================================
  // ORDERS, VIETQR, SANDBOX & SEPAY WEBHOOK
  // ============================================================================

  private async expireStaleOrders(userId?: string) {
    await this.prisma.order.updateMany({
      where: {
        ...(userId ? { userId } : {}),
        status: PrismaOrderStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: PrismaOrderStatus.EXPIRED },
    });
  }

  async createOrder(user: AuthenticatedUser, input: CreateOrderInput) {
    await this.expireStaleOrders(user.id);

    const courses = await this.loadAndValidateCoursesForCheckout(user.id, input.courseIds);
    const subtotalVnd = courses.reduce((sum, c) => sum + c.effectivePriceVnd, 0);

    let couponId: string | null = null;
    let totalDiscountVnd = 0;
    let itemDiscountMap = new Map<string, number>();

    if (input.couponCode && input.couponCode.trim().length > 0) {
      const evaluated = await this.evaluateCouponOnCourses(input.couponCode, courses);
      couponId = evaluated.coupon.id;
      totalDiscountVnd = evaluated.totalDiscountVnd;
      itemDiscountMap = evaluated.itemDiscountMap;
    }

    const totalVnd = Math.max(0, subtotalVnd - totalDiscountVnd);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút

    // Tạo mã đơn hàng duy nhất (retry nếu trùng cực hiếm)
    let orderCode = this.generateOrderCode();
    for (let i = 0; i < 5; i++) {
      const exists = await this.prisma.order.findUnique({
        where: { orderCode },
        select: { id: true },
      });
      if (!exists) break;
      orderCode = this.generateOrderCode();
    }

    const orderItemsData = courses.map((course) => {
      const discountVnd = itemDiscountMap.get(course.id) ?? 0;
      const netPriceVnd = Math.max(0, course.effectivePriceVnd - discountVnd);
      const platformFeeVnd = Math.round(netPriceVnd * course.platformFeeRate);
      const instructorEarningVnd = Math.max(0, netPriceVnd - platformFeeVnd);

      return {
        courseId: course.id,
        instructorId: course.instructorId,
        unitPriceVnd: course.effectivePriceVnd,
        discountVnd,
        netPriceVnd,
        platformFeeVnd,
        instructorEarningVnd,
      };
    });

    const createdOrder = await this.prisma.order.create({
      data: {
        orderCode,
        userId: user.id,
        couponId,
        subtotalVnd,
        discountVnd: totalDiscountVnd,
        totalVnd,
        status: PrismaOrderStatus.PENDING,
        paymentMethod:
          totalVnd === 0
            ? PrismaPaymentMethod.SANDBOX
            : (input.paymentMethod as PrismaPaymentMethod),
        expiresAt,
        items: {
          create: orderItemsData,
        },
      },
      select: { id: true },
    });

    // Edge-case quan trọng: Khóa miễn phí hoặc mã giảm 100% -> mở khóa ngay lập tức!
    if (totalVnd === 0) {
      await this.fulfillOrderPaid({
        orderId: createdOrder.id,
        provider: PrismaPaymentProvider.SANDBOX,
        providerTxId: `free-${createdOrder.id}`,
        paidAmountVnd: 0,
        rawPayload: { mode: 'FREE_OR_100_PERCENT_COUPON' },
      });
    }

    return this.getOrderDetail(user, createdOrder.id);
  }

  async getOrderDetail(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        coupon: { select: { code: true, discountType: true, discountValue: true } },
        items: {
          include: {
            course: {
              select: {
                id: true,
                slug: true,
                title: true,
                thumbnailUrl: true,
              },
            },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            provider: true,
            providerTxId: true,
            amountVnd: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    if (order.userId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền xem đơn hàng này.');
    }

    let status = order.status;
    if (status === PrismaOrderStatus.PENDING && order.expiresAt < new Date()) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: PrismaOrderStatus.EXPIRED },
      });
      status = PrismaOrderStatus.EXPIRED;
    }

    return {
      ...order,
      status,
      vietQr: this.buildVietQrInfo(order.orderCode, order.totalVnd),
      sandboxEnabled: this.sandboxEnabled,
    };
  }

  async listMyOrders(userId: string) {
    await this.expireStaleOrders(userId);
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        coupon: { select: { code: true } },
        items: {
          include: {
            course: {
              select: { id: true, slug: true, title: true, thumbnailUrl: true },
            },
          },
        },
      },
    });

    return orders.map((order) => ({
      ...order,
      vietQr: this.buildVietQrInfo(order.orderCode, order.totalVnd),
    }));
  }

  async sandboxPay(user: AuthenticatedUser, orderId: string, input: SandboxPayInput) {
    if (!this.sandboxEnabled) {
      throw new ForbiddenException('Chế độ Sandbox Payment đang bị tắt trên môi trường này.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, totalVnd: true, expiresAt: true },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    if (order.userId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên đơn hàng này.');
    }

    if (order.status === PrismaOrderStatus.PAID) {
      return this.getOrderDetail(user, order.id);
    }

    if (order.status !== PrismaOrderStatus.PENDING) {
      throw new BadRequestException(`Đơn hàng đang ở trạng thái ${order.status}, không thể thanh toán.`);
    }

    if (order.expiresAt < new Date()) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: PrismaOrderStatus.EXPIRED },
      });
      throw new BadRequestException('Đơn hàng đã hết hạn 15 phút. Vui lòng tạo đơn mới.');
    }

    if (input.outcome === 'EXPIRE') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: PrismaOrderStatus.EXPIRED },
      });
      return this.getOrderDetail(user, order.id);
    }

    if (input.outcome === 'FAIL') {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: PrismaOrderStatus.FAILED },
        });
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            provider: PrismaPaymentProvider.SANDBOX,
            providerTxId: `sandbox-fail-${randomUUID()}`,
            amountVnd: order.totalVnd,
            status: 'FAILED',
            rawPayload: { simulatedOutcome: 'FAIL', actorId: user.id },
          },
        });
      });
      return this.getOrderDetail(user, order.id);
    }

    // SUCCEED
    await this.fulfillOrderPaid({
      orderId: order.id,
      provider: PrismaPaymentProvider.SANDBOX,
      providerTxId: `sandbox-ok-${order.id}-${Date.now()}`,
      paidAmountVnd: order.totalVnd,
      rawPayload: { simulatedOutcome: 'SUCCEED', actorId: user.id },
    });

    return this.getOrderDetail(user, order.id);
  }

  /**
   * SePay VietQR Webhook (Public endpoint, kiểm tra Apikey secret & chạy ACID transaction).
   */
  async handleSepayWebhook(
    payload: Record<string, unknown>,
    authorizationHeader?: string,
    xSecretHeader?: string,
  ) {
    if (this.sepayWebhookSecret) {
      const expectedBearer = `Apikey ${this.sepayWebhookSecret}`;
      const provided = authorizationHeader?.trim() || '';
      const providedAlt = xSecretHeader?.trim() || '';
      if (provided !== expectedBearer && provided !== this.sepayWebhookSecret && providedAlt !== this.sepayWebhookSecret) {
        throw new UnauthorizedException('Sai chữ ký xác thực Webhook SePay.');
      }
    }

    const transferType = String(payload.transferType ?? 'in').toLowerCase();
    if (transferType !== 'in') {
      return { accepted: true, ignored: true, reason: 'OUTGOING_TRANSFER' };
    }

    const rawText = `${String(payload.content ?? '')} ${String(payload.description ?? '')}`.toUpperCase();
    const match = rawText.match(/TRY4T[A-Z0-9]{8}/);
    if (!match) {
      return { accepted: true, ignored: true, reason: 'ORDER_CODE_NOT_FOUND' };
    }

    const orderCode = match[0];
    const transferAmount = Math.round(Number(payload.transferAmount ?? payload.amount ?? 0));
    const providerTxId = `sepay-${String(payload.id ?? payload.referenceCode ?? randomUUID())}`;

    const order = await this.prisma.order.findUnique({
      where: { orderCode },
      select: { id: true },
    });

    if (!order) {
      this.logger.warn(`SePay webhook nhận được mã ${orderCode} nhưng không có trong DB`);
      return { accepted: true, ignored: true, reason: 'ORDER_NOT_FOUND', orderCode };
    }

    return this.fulfillOrderPaid({
      orderId: order.id,
      provider: PrismaPaymentProvider.SEPAY_VIETQR,
      providerTxId,
      paidAmountVnd: transferAmount,
      rawPayload: payload,
    });
  }

  /**
   * ACID Fulfillment: khóa dòng Order (FOR UPDATE), chống idempotency trùng lặp,
   * chống chuyển thiếu tiền (UNDERPAID), tạo Enrollment + ghi Ledger giảng viên + xóa giỏ hàng.
   */
  private async fulfillOrderPaid(params: {
    orderId: string;
    provider: PrismaPaymentProvider;
    providerTxId: string;
    paidAmountVnd: number;
    rawPayload: Record<string, unknown>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Idempotency trên providerTxId
      const existingTx = await tx.paymentTransaction.findUnique({
        where: { providerTxId: params.providerTxId },
        select: { id: true, status: true },
      });
      if (existingTx) {
        return { accepted: true, duplicate: true, status: existingTx.status };
      }

      // Khóa dòng đơn hàng để tránh race condition khi webhook gửi song song
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          order_code: string;
          status: string;
          total_vnd: number;
          user_id: string;
          coupon_id: string | null;
        }>
      >`SELECT id, order_code, status, total_vnd, user_id, coupon_id FROM orders WHERE id = ${params.orderId}::uuid FOR UPDATE`;

      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy đơn hàng để xác nhận.');
      }

      if (locked.status === PrismaOrderStatus.PAID) {
        return { accepted: true, duplicate: true, status: 'ALREADY_PAID' };
      }

      // Kiểm tra chuyển thiếu tiền (chống gian lận sửa số tiền QR)
      if (params.paidAmountVnd < locked.total_vnd) {
        await tx.paymentTransaction.create({
          data: {
            orderId: locked.id,
            provider: params.provider,
            providerTxId: params.providerTxId,
            amountVnd: params.paidAmountVnd,
            status: 'UNDERPAID',
            rawPayload: params.rawPayload as Prisma.InputJsonValue,
          },
        });
        this.logger.warn(
          `Đơn ${locked.order_code} nhận thiếu tiền: ${params.paidAmountVnd}/${locked.total_vnd}đ`,
        );
        return {
          accepted: true,
          status: 'UNDERPAID',
          receivedVnd: params.paidAmountVnd,
          expectedVnd: locked.total_vnd,
        };
      }

      // Ghi log giao dịch thanh toán thành công
      await tx.paymentTransaction.create({
        data: {
          orderId: locked.id,
          provider: params.provider,
          providerTxId: params.providerTxId,
          amountVnd: params.paidAmountVnd,
          status: 'SUCCESS',
          rawPayload: params.rawPayload as Prisma.InputJsonValue,
        },
      });

      // Đánh dấu đơn hàng PAID
      await tx.order.update({
        where: { id: locked.id },
        data: {
          status: PrismaOrderStatus.PAID,
          paidAt: new Date(),
        },
      });

      // Tăng lượt dùng Coupon nguyên tử (không vượt usageLimit)
      if (locked.coupon_id) {
        await tx.$executeRaw`
          UPDATE coupons
          SET used_count = used_count + 1
          WHERE id = ${locked.coupon_id}::uuid
            AND (usage_limit IS NULL OR used_count < usage_limit)
        `;
      }

      const orderItems = await tx.orderItem.findMany({
        where: { orderId: locked.id },
        include: {
          course: { select: { title: true } },
        },
      });

      const purchasedCourseIds: string[] = [];

      for (const item of orderItems) {
        purchasedCourseIds.push(item.courseId);

        // Layer 3 Anti-Duplicate: kiểm tra enrollment trước khi cộng tiền ví
        const existingEnrollment = await tx.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: locked.user_id,
              courseId: item.courseId,
            },
          },
          select: { id: true },
        });

        if (!existingEnrollment) {
          await tx.enrollment.create({
            data: {
              userId: locked.user_id,
              courseId: item.courseId,
              orderItemId: item.id,
            },
          });

          await tx.course.update({
            where: { id: item.courseId },
            data: { enrollmentCount: { increment: 1 } },
          });

          await tx.instructorProfile.updateMany({
            where: { userId: item.instructorId },
            data: { totalStudents: { increment: 1 } },
          });

          if (item.instructorEarningVnd > 0) {
            await tx.walletTransaction.create({
              data: {
                instructorId: item.instructorId,
                type: WalletTxType.COURSE_SALE,
                amountVnd: item.instructorEarningVnd,
                referenceId: item.id,
                note: `Bán khóa học "${item.course.title}" — Đơn #${locked.order_code}`,
              },
            });
          }
        }
      }

      // Dọn sạch các khóa đã mua khỏi giỏ hàng
      if (purchasedCourseIds.length > 0) {
        await tx.cartItem.deleteMany({
          where: {
            userId: locked.user_id,
            courseId: { in: purchasedCourseIds },
          },
        });
      }

      return {
        accepted: true,
        status: 'PAID',
        orderCode: locked.order_code,
        enrolledCount: purchasedCourseIds.length,
      };
    });
  }

  // ============================================================================
  // COUPONS MANAGEMENT (INSTRUCTOR / ADMIN)
  // ============================================================================

  async listCoupons(user: AuthenticatedUser) {
    const where: Prisma.CouponWhereInput =
      user.role === Role.ADMIN ? {} : { createdById: user.id };

    return this.prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
  }

  async createCoupon(user: AuthenticatedUser, input: CreateCouponInput) {
    const code = input.code.trim().toUpperCase();

    const exists = await this.prisma.coupon.findUnique({
      where: { code },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(`Mã giảm giá "${code}" đã tồn tại trong hệ thống.`);
    }

    if (input.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, instructorId: true },
      });
      if (!course) {
        throw new NotFoundException('Không tìm thấy khóa học áp dụng Coupon.');
      }
      if (user.role !== Role.ADMIN && course.instructorId !== user.id) {
        throw new ForbiddenException('Bạn chỉ có thể tạo mã giảm giá cho khóa học của chính mình.');
      }
    }

    return this.prisma.coupon.create({
      data: {
        code,
        createdById: user.id,
        courseId: input.courseId ?? null,
        discountType: input.discountType as PrismaDiscountType,
        discountValue: input.discountValue,
        maxDiscountVnd:
          input.discountType === 'PERCENT' ? (input.maxDiscountVnd ?? null) : null,
        usageLimit: input.usageLimit ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        isActive: input.isActive,
      },
      include: {
        course: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  async toggleCoupon(user: AuthenticatedUser, couponId: string, input: ToggleCouponInput) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      select: { id: true, createdById: true },
    });
    if (!coupon) throw new NotFoundException('Không tìm thấy mã giảm giá.');
    if (user.role !== Role.ADMIN && coupon.createdById !== user.id) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa mã giảm giá này.');
    }

    return this.prisma.coupon.update({
      where: { id: couponId },
      data: { isActive: input.isActive },
    });
  }

  async deleteCoupon(user: AuthenticatedUser, couponId: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      select: { id: true, createdById: true },
    });
    if (!coupon) throw new NotFoundException('Không tìm thấy mã giảm giá.');
    if (user.role !== Role.ADMIN && coupon.createdById !== user.id) {
      throw new ForbiddenException('Bạn không có quyền xóa mã giảm giá này.');
    }

    await this.prisma.coupon.delete({ where: { id: couponId } });
    return { deleted: true };
  }

  // ============================================================================
  // ADMIN ORDER RECONCILIATION
  // ============================================================================

  async listAdminOrders(status?: string, search?: string) {
    await this.expireStaleOrders();

    const where: Prisma.OrderWhereInput = {
      ...(status && Object.values(PrismaOrderStatus).includes(status as PrismaOrderStatus)
        ? { status: status as PrismaOrderStatus }
        : {}),
      ...(search?.trim()
        ? {
            OR: [
              { orderCode: { contains: search.trim(), mode: 'insensitive' } },
              { user: { email: { contains: search.trim(), mode: 'insensitive' } } },
              { user: { fullName: { contains: search.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          coupon: { select: { code: true } },
          items: {
            include: {
              course: { select: { id: true, title: true, slug: true } },
            },
          },
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              id: true,
              provider: true,
              providerTxId: true,
              amountVnd: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const c of counts) {
      statusCounts[c.status] = c._count.id;
    }

    return { statusCounts, items };
  }

  async adminManualConfirmOrder(admin: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, totalVnd: true, status: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    if (order.status === PrismaOrderStatus.PAID) {
      return this.getOrderDetail(admin, orderId);
    }

    await this.fulfillOrderPaid({
      orderId: order.id,
      provider: PrismaPaymentProvider.SEPAY_VIETQR,
      providerTxId: `admin-reconcile-${order.id}-${Date.now()}`,
      paidAmountVnd: order.totalVnd,
      rawPayload: { reconciledByAdminId: admin.id, note: 'Manual Admin Verification' },
    });

    return this.getOrderDetail(admin, orderId);
  }
}
