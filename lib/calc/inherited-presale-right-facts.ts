/**
 * 상속 분양권 행의 피상속인 취득일(⑧) — 상속개시일(`acquisitionDate`)보다 늦으면 모순이다.
 * ④(`presale-rights-payload.ts`)가 싣는 행(분양권 · 상속 · 날짜 입력)만 본다.
 */
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

export function inheritedPresaleRightFactErrors(
  rights: readonly PresaleRightEntry[],
): { field: `presaleRights.${number}.decedentAcquisitionDate`; message: string }[] {
  return rights.flatMap((r, i) => {
    if (r.type !== "presale_right" || !r.isInherited || !r.decedentAcquisitionDate || !r.acquisitionDate) return [];
    if (r.decedentAcquisitionDate <= r.acquisitionDate) return [];
    return [
      {
        field: `presaleRights.${i}.decedentAcquisitionDate` as const,
        message: `분양권·입주권 ${i + 1}: 피상속인이 분양권을 취득한 날은 상속개시일(취득일 칸) 이전이어야 합니다.`,
      },
    ];
  });
}
