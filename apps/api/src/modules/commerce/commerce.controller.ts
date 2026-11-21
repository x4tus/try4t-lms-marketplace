import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cartCourseIdSchema,
  createCouponSchema,
  createOrderSchema,
  Role,
  sandboxPaySchema,
  syncCartSchema,
  toggleCouponSchema,
  validateCouponSchema,
  type CreateCouponInput,
  type CreateOrderInput,
  type SandboxPayInput,
  type SyncCartInput,
  type ToggleCouponInput,
  type ValidateCouponInput,
} from '@try4t/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CommerceService } from './commerce.service';

@ApiTags('Commerce')
@Controller('commerce')
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  // ---- CART ----

  @Get('cart')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách giỏ hàng đã đồng bộ của người dùng' })
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.commerceService.getCart(user.id);
  }

  @Post('cart')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm 1 khóa học vào giỏ hàng DB (chặn trùng khóa đã sở hữu)' })
  addToCart(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(cartCourseIdSchema)) body: { courseId: string },
  ) {
    return this.commerceService.addToCart(user.id, body.courseId);
  }

  @Delete('cart/:courseId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gỡ 1 khóa học khỏi giỏ hàng DB' })
  removeFromCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.commerceService.removeFromCart(user.id, courseId);
  }

  @Post('cart/sync')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hợp nhất giỏ hàng khách vãng lai (localStorage) vào DB sau khi đăng nhập' })
  syncCart(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(syncCartSchema)) body: SyncCartInput,
  ) {
    return this.commerceService.syncGuestCart(user.id, body.courseIds);
  }

  // ---- COUPONS ----

  @Post('coupons/validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra & tính số tiền giảm giá cho mã Coupon' })
  validateCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(validateCouponSchema)) body: ValidateCouponInput,
  ) {
    return this.commerceService.validateCoupon(user.id, body);
  }

  @Get('coupons')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách mã Coupon (Giảng viên xem của mình, Admin xem tất cả)' })
  listCoupons(@CurrentUser() user: AuthenticatedUser) {
    return this.commerceService.listCoupons(user);
  }

  @Post('coupons')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo mã giảm giá mới' })
  createCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCouponSchema)) body: CreateCouponInput,
  ) {
    return this.commerceService.createCoupon(user, body);
  }

  @Patch('coupons/:id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bật / tắt trạng thái mã giảm giá' })
  toggleCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(toggleCouponSchema)) body: ToggleCouponInput,
  ) {
    return this.commerceService.toggleCoupon(user, id, body);
  }

  @Delete('coupons/:id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa mã giảm giá' })
  deleteCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commerceService.deleteCoupon(user, id);
  }

  // ---- ORDERS & PAYMENT ----

  @Post('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo đơn hàng mới (tự kích hoạt ngay nếu tổng tiền = 0đ, hoặc trả VietQR)' })
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ) {
    return this.commerceService.createOrder(user, body);
  }

  @Get('orders/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lịch sử đơn hàng của người dùng hiện tại' })
  listMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.commerceService.listMyOrders(user.id);
  }

  @Get('orders/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết đơn hàng + thông tin VietQR + trạng thái realtime (polling)' })
  getOrderDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commerceService.getOrderDetail(user, id);
  }

  @Post('orders/:id/sandbox-pay')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Giả lập kết quả thanh toán Sandbox (SUCCEED | FAIL | EXPIRE)' })
  sandboxPay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sandboxPaySchema)) body: SandboxPayInput,
  ) {
    return this.commerceService.sandboxPay(user, id, body);
  }

  @Public()
  @Post('webhooks/sepay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook nhận thông báo biến động số dư tự động từ SePay VietQR' })
  sepayWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
    @Headers('x-sepay-secret') xSecret?: string,
  ) {
    return this.commerceService.handleSepayWebhook(payload, authorization, xSecret);
  }

  // ---- ADMIN RECONCILIATION ----

  @Get('admin/orders')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin đối soát toàn bộ đơn hàng và giao dịch VietQR' })
  listAdminOrders(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.commerceService.listAdminOrders(status, search);
  }

  @Post('admin/orders/:id/confirm')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin đối soát thủ công xác nhận đơn hàng đã thanh toán' })
  adminConfirmOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commerceService.adminManualConfirmOrder(user, id);
  }
}
