'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[Try4T Error Boundary]', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Ối! Đã có sự cố nhỏ xảy ra</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Giao diện vừa gặp lỗi không mong muốn. Đừng lo, dữ liệu của bạn vẫn an toàn — bấm tải lại
        để tiếp tục ngay nhé.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Thử lại ngay
        </Button>
        <Link href="/">
          <Button variant="outline">
            <Home className="h-4 w-4" />
            Về trang chủ
          </Button>
        </Link>
      </div>
    </div>
  );
}
