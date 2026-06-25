/**
 * 파일 다운로드 유틸 — Blob + a[download] 표준 패턴 단일화.
 *
 * 클라이언트 전용(document·URL.createObjectURL 사용). 서버에서 호출 금지.
 */

/** JSON 데이터를 파일로 다운로드 (들여쓰기 2). */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, filename);
}

/** Blob을 파일로 다운로드. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** YYYY-MM-DD 스탬프 — 파일명용. */
export function formatIsoStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
