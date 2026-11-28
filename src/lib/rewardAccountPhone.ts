export function rewardAccountPhone(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  const local = digits.length === 12 && digits.startsWith('252') ? digits.slice(3) : digits;
  return /^\d{9}$/.test(local) ? local : null;
}
