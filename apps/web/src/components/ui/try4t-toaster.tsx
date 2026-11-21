'use client';

import { Toaster } from 'sonner';

export function Try4TToaster() {
  return (
    <Toaster
      position="top-center"
      offset={74}
      visibleToasts={3}
      gap={10}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex justify-center w-full',
        },
      }}
    />
  );
}
