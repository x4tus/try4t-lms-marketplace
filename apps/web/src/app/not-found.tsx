import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground">
        <Compass className="h-7 w-7" />
      </div>
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        404 • Không tìm thấy trang
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Trang bạn tìm không tồn tại</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Đường dẫn có thể đã thay đổi hoặc nội dung đã được gỡ bỏ. Quay lại trang chủ để tiếp tục
        khám phá khóa học trên Try4T nhé.
      </p>
      <div className="mt-6">
        <Link href="/">
          <Button>
            <Home className="h-4 w-4" />
            Về trang chủ Try4T
          </Button>
        </Link>
      </div>
    </div>
  );
}
