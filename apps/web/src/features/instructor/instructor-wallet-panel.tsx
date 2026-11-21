'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Loader2,
  Send,
  Wallet,
} from 'lucide-react';
import { formatVnd, PayoutStatus } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface WalletData {
  balance: {
    totalEarnedVnd: number;
    totalWithdrawnVnd: number;
    ledgerBalanceVnd: number;
    pendingHoldVnd: number;
    availableBalanceVnd: number;
  };
  bankInfo: {
    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;
    platformFeeRate: number;
  };
  transactions: Array<{
    id: string;
    type: string;
    amountVnd: number;
    note: string | null;
    createdAt: string;
  }>;
  payoutRequests: Array<{
    id: string;
    amountVnd: number;
    status: PayoutStatus;
    adminNote: string | null;
    transferProofUrl: string | null;
    createdAt: string;
    processedAt: string | null;
  }>;
}

function payoutBadge(status: PayoutStatus) {
  switch (status) {
    case PayoutStatus.PAID:
      return <Badge variant="success">Đã giải ngân</Badge>;
    case PayoutStatus.PENDING:
      return <Badge variant="warning">Đang chờ duyệt</Badge>;
    case PayoutStatus.APPROVED:
      return <Badge variant="secondary">Đã duyệt</Badge>;
    case PayoutStatus.REJECTED:
      return <Badge variant="destructive">Từ chối</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function InstructorWalletPanel() {
  const queryClient = useQueryClient();
  const [bankModalOpen, setBankModalOpen] = React.useState(false);
  const [payoutModalOpen, setPayoutModalOpen] = React.useState(false);

  const [bankName, setBankName] = React.useState('');
  const [bankAccountNo, setBankAccountNo] = React.useState('');
  const [bankAccountName, setBankAccountName] = React.useState('');
  const [amountVnd, setAmountVnd] = React.useState('');

  const { data: wallet, isLoading } = useQuery({
    queryKey: ['instructor-wallet'],
    queryFn: () => api.get<WalletData>('/payouts/instructor/wallet'),
  });

  React.useEffect(() => {
    if (wallet?.bankInfo) {
      setBankName(wallet.bankInfo.bankName);
      setBankAccountNo(wallet.bankInfo.bankAccountNo);
      setBankAccountName(wallet.bankInfo.bankAccountName);
    }
  }, [wallet?.bankInfo]);

  const updateBankMutation = useMutation({
    mutationFn: () =>
      api.patch('/payouts/instructor/bank', {
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.trim(),
        bankAccountName: bankAccountName.trim().toUpperCase(),
      }),
    onSuccess: () => {
      notify.success('Đã cập nhật tài khoản ngân hàng nhận tiền!');
      setBankModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['instructor-wallet'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật thất bại');
    },
  });

  const requestPayoutMutation = useMutation({
    mutationFn: () =>
      api.post('/payouts/instructor/request', {
        amountVnd: Math.floor(Number(amountVnd)),
      }),
    onSuccess: () => {
      notify.success('Đã gửi lệnh rút tiền! Admin sẽ đối soát và giải ngân sớm.');
      setPayoutModalOpen(false);
      setAmountVnd('');
      void queryClient.invalidateQueries({ queryKey: ['instructor-wallet'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Gửi lệnh rút thất bại');
    },
  });

  if (isLoading || !wallet) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  const hasBankConfigured = Boolean(
    wallet.bankInfo.bankName && wallet.bankInfo.bankAccountNo && wallet.bankInfo.bankAccountName,
  );
  const available = wallet.balance.availableBalanceVnd;

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary">
              <Wallet className="h-4 w-4" /> Số dư khả dụng
            </CardDescription>
            <CardTitle className="font-mono text-2xl text-primary">
              {formatVnd(available)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Đang giữ (Chờ giải ngân)</CardDescription>
            <CardTitle className="font-mono text-2xl text-amber-600 dark:text-amber-400">
              {formatVnd(wallet.balance.pendingHoldVnd)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng đã rút về ngân hàng</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatVnd(wallet.balance.totalWithdrawnVnd)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng thu nhập bán khóa</CardDescription>
            <CardTitle className="font-mono text-2xl text-emerald-600 dark:text-emerald-400">
              {formatVnd(wallet.balance.totalEarnedVnd)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Bank Profile + Payout CTA */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">Tài khoản ngân hàng nhận giải ngân</p>
              {hasBankConfigured ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <strong>{wallet.bankInfo.bankName}</strong> • STK:{' '}
                  <span className="font-mono font-semibold text-foreground">
                    {wallet.bankInfo.bankAccountNo}
                  </span>{' '}
                  • {wallet.bankInfo.bankAccountName}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                  Chưa cấu hình tài khoản ngân hàng. Cập nhật ngay để gửi yêu cầu rút tiền.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setBankModalOpen(true)}>
              {hasBankConfigured ? 'Đổi ngân hàng' : 'Thêm ngân hàng'}
            </Button>
            <Button
              size="sm"
              disabled={!hasBankConfigured || available < 100_000}
              onClick={() => {
                setAmountVnd(String(available));
                setPayoutModalOpen(true);
              }}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Yêu cầu rút tiền
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payout Requests & Wallet Ledger */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lịch sử lệnh rút tiền</CardTitle>
            <CardDescription>Hạn mức tối thiểu mỗi lệnh: 100.000 ₫</CardDescription>
          </CardHeader>
          <CardContent>
            {wallet.payoutRequests.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Chưa có yêu cầu rút tiền nào.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {wallet.payoutRequests.map((req) => (
                  <div key={req.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold">
                        {formatVnd(req.amountVnd)}
                      </span>
                      {payoutBadge(req.status)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Tạo lúc {new Date(req.createdAt).toLocaleString('vi-VN')}
                    </p>
                    {req.adminNote && (
                      <p className="text-[11px] text-foreground/85">Ghi chú Admin: {req.adminNote}</p>
                    )}
                    {req.transferProofUrl && (
                      <a
                        href={req.transferProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        Xem ảnh chứng từ chuyển khoản <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sổ cái biến động ví (Ledger)</CardTitle>
            <CardDescription>Ghi nhận bất biến từng giao dịch cộng/trừ doanh thu.</CardDescription>
          </CardHeader>
          <CardContent>
            {wallet.transactions.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Chưa phát sinh biến động số dư nào.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {wallet.transactions.map((tx) => {
                  const isCredit = tx.amountVnd >= 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-xs"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={
                            isCredit
                              ? 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600'
                              : 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive'
                          }
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{tx.note || tx.type}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleString('vi-VN')}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 font-mono font-bold ${
                          isCredit
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-destructive'
                        }`}
                      >
                        {isCredit ? '+' : ''}
                        {formatVnd(tx.amountVnd)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bank Info Pop-up */}
      <Dialog
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        title="Thông tin tài khoản ngân hàng"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateBankMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="bk-name">Tên ngân hàng</Label>
            <Input
              id="bk-name"
              placeholder="VD: MB Bank, Vietcombank, Techcombank..."
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-no">Số tài khoản</Label>
            <Input
              id="bk-no"
              placeholder="VD: 090123456789"
              className="font-mono"
              value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-holder">Tên chủ tài khoản (viết hoa không dấu)</Label>
            <Input
              id="bk-holder"
              placeholder="VD: NGUYEN VAN A"
              className="uppercase"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setBankModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={updateBankMutation.isPending}>
              {updateBankMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu tài khoản
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Request Payout Pop-up */}
      <Dialog
        open={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        title="Tạo yêu cầu rút tiền"
        description={`Số dư khả dụng hiện tại: ${formatVnd(available)}`}
        maxWidthClass="max-w-md"
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const val = Math.floor(Number(amountVnd));
            if (val < 100_000) {
              notify.error('Số tiền rút tối thiểu là 100.000 ₫');
              return;
            }
            if (val > available) {
              notify.error('Số tiền rút vượt quá số dư khả dụng');
              return;
            }
            requestPayoutMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
            <p className="text-muted-foreground">Chuyển về tài khoản:</p>
            <p className="mt-0.5 font-semibold">
              {wallet.bankInfo.bankName} — {wallet.bankInfo.bankAccountNo} (
              {wallet.bankInfo.bankAccountName})
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-amt">Số tiền muốn rút (VNĐ)</Label>
            <Input
              id="po-amt"
              type="number"
              step={1}
              min={100_000}
              max={available}
              value={amountVnd}
              onChange={(e) => setAmountVnd(e.target.value)}
              className="font-mono"
            />
            <div className="flex gap-1.5 pt-1">
              {[0.25, 0.5, 1].map((ratio) => {
                const amt = Math.floor(available * ratio);
                return (
                  <Button
                    key={ratio}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={amt < 100_000}
                    onClick={() => setAmountVnd(String(amt))}
                    className="h-7 text-[11px]"
                  >
                    {ratio === 1 ? 'Rút toàn bộ' : `${ratio * 100}%`}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPayoutModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={requestPayoutMutation.isPending}>
              {requestPayoutMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Gửi yêu cầu rút tiền
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
