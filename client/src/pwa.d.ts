/// <reference types="vite/client" />

declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react';

  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: any) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean | { value: boolean }, Dispatch<SetStateAction<boolean | { value: boolean }>>];
    offlineReady: [boolean | { value: boolean }, Dispatch<SetStateAction<boolean | { value: boolean }>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<boolean>;
  };
}
