import { apiFetch } from './api-client';

export type PushNotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function arrayBufferToUrlBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function subscriptionMatchesPublicKey(subscription: PushSubscription, publicKey: string) {
  const key = subscription.options.applicationServerKey;
  if (!key) return false;
  return arrayBufferToUrlBase64(key) === publicKey;
}

async function getServerPublicKey() {
  const { publicKey } = await apiFetch<{ publicKey: string }>('/push/vapid-public-key');
  return publicKey;
}

export function supportsPushNotifications() {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!supportsPushNotifications()) return 'unsupported';
  const permission = Notification.permission;
  if (permission !== 'granted') return permission;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'granted';
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return 'granted';

  try {
    const publicKey = await getServerPublicKey();
    return subscriptionMatchesPublicKey(subscription, publicKey) ? 'subscribed' : 'granted';
  } catch {
    return 'subscribed';
  }
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  const registration = existing ?? await navigator.serviceWorker.register('/sw.js');
  try {
    await registration.update();
  } catch {
    // Updating is best-effort; subscribing can still continue with the active
    // worker when the browser temporarily refuses an update check.
  }
  return navigator.serviceWorker.ready;
}

export async function subscribeToPushNotifications() {
  if (!supportsPushNotifications()) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const publicKey = await getServerPublicKey();
  if (!publicKey) {
    throw new Error('Push notifications are not configured on the server.');
  }

  const registration = await getServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing && !subscriptionMatchesPublicKey(existing, publicKey)) {
    await apiFetch('/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: existing.endpoint }),
    }).catch(() => {});
    await existing.unsubscribe();
  }

  const current = await registration.pushManager.getSubscription();
  const subscription = current ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) {
    throw new Error('Push subscription is missing browser keys.');
  }

  await apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    }),
  });

  return subscription;
}

export async function unsubscribeFromPushNotifications() {
  if (!supportsPushNotifications() || Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await apiFetch('/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
