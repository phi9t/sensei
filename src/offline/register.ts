export type OfflineStatus = 'ready' | 'unavailable' | 'unsupported';

type ServiceWorkerContainerLike = {
  register(scriptUrl: string): Promise<unknown>;
  ready?: Promise<unknown>;
};

type NavigatorLike = {
  serviceWorker?: ServiceWorkerContainerLike | undefined;
};

type MinimalDocument = {
  readyState: DocumentReadyState;
};

type MinimalWindow = {
  addEventListener(
    type: 'load',
    listener: () => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(type: 'load', listener: () => void): void;
};

interface RegisterOfflineSupportOptions {
  readonly isProduction?: boolean;
  readonly navigator?: NavigatorLike | undefined;
}

interface ScheduleOfflineRegistrationOptions {
  readonly document?: MinimalDocument | undefined;
  readonly window?: MinimalWindow | undefined;
  readonly register?: () => Promise<{ status: OfflineStatus }>;
}

export async function registerOfflineSupport({
  isProduction = typeof import.meta !== 'undefined' ? import.meta.env.PROD : false,
  navigator: providedNavigator,
}: RegisterOfflineSupportOptions = {}): Promise<{ status: OfflineStatus }> {
  if (!isProduction) {
    return { status: 'unsupported' };
  }

  const resolvedNavigator =
    providedNavigator ?? (typeof globalThis !== 'undefined' ? globalThis.navigator : undefined);
  const serviceWorker = resolvedNavigator?.serviceWorker;

  if (!serviceWorker || typeof serviceWorker.register !== 'function') {
    return { status: 'unsupported' };
  }

  try {
    await serviceWorker.register('/sw.js');
    if (serviceWorker.ready) {
      await serviceWorker.ready;
    }
    return { status: 'ready' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function scheduleOfflineRegistration({
  document: providedDocument,
  window: providedWindow,
  register = () => registerOfflineSupport(),
}: ScheduleOfflineRegistrationOptions = {}): void {
  const resolvedDocument =
    providedDocument ?? (typeof globalThis !== 'undefined' ? globalThis.document : undefined);
  const resolvedWindow =
    providedWindow ?? (typeof globalThis !== 'undefined' ? globalThis.window : undefined);

  let didRegister = false;

  const runRegistration = () => {
    if (didRegister) {
      return;
    }
    didRegister = true;
    void register();
  };

  if (!resolvedDocument || !resolvedWindow) {
    return;
  }

  if (resolvedDocument.readyState === 'complete') {
    runRegistration();
    return;
  }

  const handleLoad = () => {
    resolvedWindow.removeEventListener('load', handleLoad);
    runRegistration();
  };

  resolvedWindow.addEventListener('load', handleLoad, { once: true });
}
