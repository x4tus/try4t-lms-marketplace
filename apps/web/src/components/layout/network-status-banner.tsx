'use client';

import * as React from 'react';
import { WifiOff } from 'lucide-react';
import { notify } from '@/lib/notify';

export function NetworkStatusBanner() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    setOffline(!navigator.onLine);

    const onOffline = () => {
      setOffline(true);
      notify.warning('Mất kết nối mạng', {
        description: 'Vui lòng kiểm tra Wi-Fi hoặc mạng internet để tiếp tục lưu dữ liệu.',
      });
    };

    const onOnline = () => {
      setOffline(false);
      notify.success('Đã khôi phục kết nối mạng');
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-16 z-40 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-700 backdrop-blur-md dark:text-amber-300">
      <WifiOff className="h-3.5 w-3.5" />
      Bạn đang ngoại tuyến — các thay đổi có thể không được lưu cho đến khi có mạng trở lại.
    </div>
  );
}
