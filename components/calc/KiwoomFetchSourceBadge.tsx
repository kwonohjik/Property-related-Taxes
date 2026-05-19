"use client";

/**
 * KiwoomFetchSourceBadge — F-12 키움 자동조회 출처 라벨링.
 *
 * 결과 카드에 마지막 자동조회 시각을 표시하여 회계 감사 추적성 확보.
 * kiwoomLastFetchedAt(ISO 8601)을 한국 시간 KST 표기로 변환.
 */

interface Props {
  /** ISO 8601 — 빈문자 또는 미입력 시 미렌더링 */
  fetchedAt?: string;
  /** 자동조회 종류 라벨 (기본: "키움 자동조회") */
  label?: string;
}

function formatKstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // KST = UTC+9
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function KiwoomFetchSourceBadge({ fetchedAt, label = "키움 자동조회" }: Props) {
  if (!fetchedAt) return null;
  const formatted = formatKstDateTime(fetchedAt);
  if (!formatted) return null;
  return (
    <div className="inline-flex items-center gap-1 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-0.5">
      <span>🔍</span>
      <span>
        {label} <strong>{formatted}</strong> KST
      </span>
    </div>
  );
}
