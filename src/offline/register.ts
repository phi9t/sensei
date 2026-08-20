export type OfflineStatus = 'ready' | 'unavailable' | 'unsupported';

type ServiceWorkerContainerLike = {
  register(scriptUrl: string): Promise<unknown>;
};

type NavigatorLike = {
  serviceWorker?: ServiceWorkerContainerLike | undefined;
};

interface RegisterOfflineSupportOptions {
  readonly isProduction?: boolean;
  readonly navigator?: NavigatorLike | undefined;
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
    return { status: 'ready' };
  } catch {
    return { status: 'unavailable' };
  }
}
