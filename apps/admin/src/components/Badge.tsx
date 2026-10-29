import { STATUS_LABELS } from '@/lib/format';

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}
