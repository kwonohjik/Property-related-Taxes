/**
 * ⑧ 조합원입주권 「취득 경위」(원조합원 / 승계취득) 필수 — 계산기·판정 메뉴 공용.
 *
 * 기존주택 원조합원은 §155① 일시적 2주택, 상가·토지 원조합원·승계취득은 §156의2③·④다
 * (엔진 `one-house/original-member-right.ts`). 주택을 양도해 §89②를 판정할 때만
 * 결론을 가르므로 그때만 요구한다(호출부 게이트 — 계산기 `isOneHouseExemptionAsset` · 판정 메뉴 `judgmentSaleIsHousing`).
 * 칸(⑤ `PresaleRightsSection`)은 조합원입주권 행마다 늘 떠 있어 막다른 오류가 나지 않는다.
 */
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export function memberOriginErrors(
  rights: readonly PresaleRightEntry[],
): { field: `presaleRights.${number}.memberOrigin`; message: string }[] {
  return rights.flatMap((r, i) =>
    r.type === "redevelopment_right" && !r.memberOrigin
      ? [
          {
            field: `presaleRights.${i}.memberOrigin` as const,
            message: `분양권·입주권 ${i + 1}: 조합원입주권 취득 경위가 원조합원(기존 주택·상가·토지 등)인지 승계취득인지 선택하세요.`,
          },
        ]
      : [],
  );
}
