import { formatMicros } from '@kiqro/core';

export function usd(micros: bigint): string {
  const [whole, frac = '00'] = formatMicros(micros).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${grouped},${frac}`;
}

const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });

export function dateTime(value: Date | null | undefined): string {
  return value ? dateFormat.format(value) : '—';
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  in_review: 'İncelemede',
  active: 'Aktif',
  paused: 'Duraklatıldı',
  completed: 'Tamamlandı',
  archived: 'Arşiv',
  approved: 'Onaylandı',
  held: 'Bekliyor',
  rejected: 'Reddedildi',
  reversed: 'Geri alındı',
  pending: 'Bekliyor',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  suspended: 'Askıda',
};

export const REASON_LABELS: Record<string, string> = {
  ctit_too_short: 'Yükleme tıklamadan çok hızlı',
  outside_attribution_window: 'Atıf penceresi dışında',
  install_not_attributed: 'Önce yükleme atfedilmemiş',
  task_time_limit_exceeded: 'Görev süresi aşıldı',
  duplicate_user: 'Kullanıcı bu görevi zaten tamamlamış',
  country_mismatch: 'Ülke uyuşmuyor',
  no_price: 'Bu ülke için fiyat yok',
  insufficient_balance: 'Reklamveren bakiyesi yetersiz',
  manual_review: 'Manuel inceleme ile reddedildi',
};
