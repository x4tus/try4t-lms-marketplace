import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InstructorApplicationStatus,
  PayoutStatus as PrismaPayoutStatus,
  Prisma,
  WalletTxType,
} from '@prisma/client';
import type { CreatePayoutRequestInput, DecidePayoutInput } from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface UpdateBankInfoInput {
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  private async computeWalletSnapshot(
    tx: Prisma.TransactionClient | PrismaService,
    instructorId: string,
  ) {
    const [walletAgg, pendingAgg] = await Promise.all([
      tx.walletTransaction.groupBy({
        by: ['type'],
        where: { instructorId },
        _sum: { amountVnd: true },
      }),
      tx.payoutRequest.aggregate({
        where: {
          instructorId,
          status: { in: [PrismaPayoutStatus.PENDING, PrismaPayoutStatus.APPROVED] },
        },
        _sum: { amountVnd: true },
      }),
    ]);

    let totalEarnedVnd = 0;
    let totalWithdrawnVnd = 0;
    let ledgerBalanceVnd = 0;

    for (const row of walletAgg) {
      const sum = row._sum.amountVnd ?? 0;
      ledgerBalanceVnd += sum;
      if (row.type === WalletTxType.COURSE_SALE) {
        totalEarnedVnd += sum;
      } else if (row.type === WalletTxType.PAYOUT_DEBIT) {
        totalWithdrawnVnd += Math.abs(sum);
      }
    }

    const pendingHoldVnd = pendingAgg._sum.amountVnd ?? 0;
    const availableBalanceVnd = Math.max(0, ledgerBalanceVnd - pendingHoldVnd);

    return {
      totalEarnedVnd,
      totalWithdrawnVnd,
      ledgerBalanceVnd,
      pendingHoldVnd,
      availableBalanceVnd,
    };
  }

  async getInstructorWallet(user: AuthenticatedUser) {
    const [balance, profile, transactions, payoutRequests] = await Promise.all([
      this.computeWalletSnapshot(this.prisma, user.id),
      this.prisma.instructorProfile.findUnique({
        where: { userId: user.id },
        select: {
          bankName: true,
          bankAccountNo: true,
          bankAccountName: true,
          platformFeeRate: true,
        },
      }),
      this.prisma.walletTransaction.findMany({
        where: { instructorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.payoutRequest.findMany({
        where: { instructorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    return {
      balance,
      bankInfo: {
        bankName: profile?.bankName ?? '',
        bankAccountNo: profile?.bankAccountNo ?? '',
        bankAccountName: profile?.bankAccountName ?? '',
        platformFeeRate: Number(profile?.platformFeeRate ?? 0.3),
      },
      transactions,
      payoutRequests,
    };
  }

  async updateBankInfo(user: AuthenticatedUser, input: UpdateBankInfoInput) {
    const profile = await this.prisma.instructorProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        applicationStatus: InstructorApplicationStatus.APPROVED,
        bankName: input.bankName.trim(),
        bankAccountNo: input.bankAccountNo.trim(),
        bankAccountName: input.bankAccountName.trim().toUpperCase(),
      },
      update: {
        bankName: input.bankName.trim(),
        bankAccountNo: input.bankAccountNo.trim(),
        bankAccountName: input.bankAccountName.trim().toUpperCase(),
      },
      select: {
        bankName: true,
        bankAccountNo: true,
        bankAccountName: true,
      },
    });

    return profile;
  }

  /**
   * Tạo lệnh rút tiền với khóa hàng (FOR UPDATE) chống double-withdrawal khi bấm gửi song song.
   */
  async createPayoutRequest(user: AuthenticatedUser, input: CreatePayoutRequestInput) {
    return this.prisma.$transaction(async (tx) => {
      // Đảm bảo hồ sơ tồn tại & khóa hàng chống gửi 2 lệnh rút cùng lúc
      const locked = await tx.$queryRaw<
        Array<{
          user_id: string;
          bank_name: string | null;
          bank_account_no: string | null;
          bank_account_name: string | null;
        }>
      >`SELECT user_id, bank_name, bank_account_no, bank_account_name FROM instructor_profiles WHERE user_id = ${user.id}::uuid FOR UPDATE`;

      const profile = locked[0];
      if (!profile || !profile.bank_name || !profile.bank_account_no || !profile.bank_account_name) {
        throw new BadRequestException({
          code: 'BANK_INFO_REQUIRED',
          message: 'Vui lòng cập nhật đầy đủ thông tin tài khoản ngân hàng nhận tiền trước khi gửi lệnh rút.',
        });
      }

      const snapshot = await this.computeWalletSnapshot(tx, user.id);
      if (input.amountVnd > snapshot.availableBalanceVnd) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_BALANCE',
          message: `Số dư khả dụng hiện tại là ${snapshot.availableBalanceVnd.toLocaleString('vi-VN')} ₫, không đủ cho lệnh rút ${input.amountVnd.toLocaleString('vi-VN')} ₫.`,
        });
      }

      return tx.payoutRequest.create({
        data: {
          instructorId: user.id,
          amountVnd: input.amountVnd,
          status: PrismaPayoutStatus.PENDING,
          bankSnapshotJson: {
            bankName: profile.bank_name,
            bankAccountNo: profile.bank_account_no,
            bankAccountName: profile.bank_account_name,
          },
        },
      });
    });
  }

  async listAdminPayouts(status?: string) {
    const where: Prisma.PayoutRequestWhereInput =
      status && Object.values(PrismaPayoutStatus).includes(status as PrismaPayoutStatus)
        ? { status: status as PrismaPayoutStatus }
        : {};

    const [items, counts] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: {
          instructor: { select: { id: true, fullName: true, email: true } },
          reviewedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.payoutRequest.groupBy({
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

  async decidePayout(admin: AuthenticatedUser, payoutId: string, input: DecidePayoutInput) {
    return this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          instructor_id: string;
          amount_vnd: number;
          status: string;
        }>
      >`SELECT id, instructor_id, amount_vnd, status FROM payout_requests WHERE id = ${payoutId}::uuid FOR UPDATE`;

      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy lệnh rút tiền.');
      }

      if (
        locked.status !== PrismaPayoutStatus.PENDING &&
        locked.status !== PrismaPayoutStatus.APPROVED
      ) {
        throw new ConflictException(`Lệnh rút tiền đã được xử lý ở trạng thái ${locked.status}.`);
      }

      const now = new Date();
      if (input.action === 'PAID') {
        const updated = await tx.payoutRequest.update({
          where: { id: locked.id },
          data: {
            status: PrismaPayoutStatus.PAID,
            reviewedByAdminId: admin.id,
            adminNote: input.adminNote ?? 'Đã chuyển khoản thanh toán cho giảng viên.',
            transferProofUrl: input.transferProofUrl ?? null,
            processedAt: now,
          },
        });

        await tx.walletTransaction.create({
          data: {
            instructorId: locked.instructor_id,
            type: WalletTxType.PAYOUT_DEBIT,
            amountVnd: -locked.amount_vnd,
            referenceId: locked.id,
            note: input.adminNote
              ? `Giải ngân rút tiền: ${input.adminNote}`
              : 'Giải ngân lệnh rút tiền đã được Admin duyệt',
          },
        });

        return updated;
      }

      return tx.payoutRequest.update({
        where: { id: locked.id },
        data: {
          status: PrismaPayoutStatus.REJECTED,
          reviewedByAdminId: admin.id,
          adminNote: input.adminNote ?? 'Lệnh rút tiền bị từ chối.',
          processedAt: now,
        },
      });
    });
  }
}
