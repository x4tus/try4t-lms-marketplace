import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createPayoutRequestSchema,
  decidePayoutSchema,
  Role,
  type CreatePayoutRequestInput,
  type DecidePayoutInput,
} from '@try4t/shared';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayoutsService } from './payouts.service';

const updateBankSchema = z.object({
  bankName: z.string().trim().min(2, 'Tên ngân hàng tối thiểu 2 ký tự').max(80),
  bankAccountNo: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{6,25}$/, 'Số tài khoản ngân hàng gồm 6–25 ký tự số/chữ'),
  bankAccountName: z.string().trim().min(2, 'Tên chủ tài khoản tối thiểu 2 ký tự').max(120),
});

@ApiTags('Payouts & Wallet')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('instructor/wallet')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Xem số dư khả dụng, lịch sử sổ cái ví và các lệnh rút tiền' })
  getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.payoutsService.getInstructorWallet(user);
  }

  @Patch('instructor/bank')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật tài khoản ngân hàng nhận tiền của Giảng viên' })
  updateBank(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateBankSchema)) body: z.infer<typeof updateBankSchema>,
  ) {
    return this.payoutsService.updateBankInfo(user, body);
  }

  @Post('instructor/request')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Gửi yêu cầu rút tiền về tài khoản ngân hàng (tối thiểu 100.000đ)' })
  requestPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPayoutRequestSchema)) body: CreatePayoutRequestInput,
  ) {
    return this.payoutsService.createPayoutRequest(user, body);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin xem toàn bộ yêu cầu rút tiền của Giảng viên' })
  listAdminPayouts(@Query('status') status?: string) {
    return this.payoutsService.listAdminPayouts(status);
  }

  @Post('admin/:id/decision')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin giải ngân (PAID + chứng từ) hoặc từ chối (REJECTED) lệnh rút' })
  decidePayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decidePayoutSchema)) body: DecidePayoutInput,
  ) {
    return this.payoutsService.decidePayout(user, id, body);
  }
}
