/**
 * ⑧ 조합원입주권 「취득 경위」(원조합원 / 승계취득) 필수 — 계산기·판정 메뉴 공용.
 *
 * 기존주택 원조합원은 §155① 일시적 2주택, 상가·토지 원조합원·승계취득은 §156의2③·④다
 * (엔진 `one-house/original-member-right.ts`). 주택을 양도해 §89②를 판정할 때만
 * 결론을 가르므로 그때만 요구한다(호출부 게이트 — 계산기 `isOneHouseExemptionAsset` · 판정 메뉴 `judgmentSaleIsHousing`).
 * 칸(⑤ `PresaleRightsSection`)은 조합원입주권 행마다 늘 떠 있어 막다른 오류가 나지 않는다.
 */
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { temporaryTwoHouseEraInputRelevance } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";

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

/**
 * ⑤⑧ 기존주택 원조합원 행 — §155①2호 가목·단서(2019-12-17 체제) 칸을 여는가. 일시적 2주택 경로와 같은 술어
 * (`temporaryTwoHouseEraInputRelevance` — 신규 주택 = 기존주택, 취득일 = 행의 기존주택 취득일). 양도일을 모르면 닫는다.
 * 두 주택이 모두 조정대상지역인지는 엔진이 소재지로 판정한다(모르면 두 경우를 모두 계산) — 여기서는 열어 둔다.
 */
export function originalMemberMoveInRelevant(row: PresaleRightEntry, transferDate: string | undefined): boolean {
  if (row.type !== "redevelopment_right" || row.memberOrigin !== "original_house") return false;
  const acq = toOptionalDate(row.acquisitionDate);
  const transfer = toOptionalDate(transferDate);
  if (!acq || !transfer) return false;
  return temporaryTwoHouseEraInputRelevance({ newAcquisitionDate: acq, transferDate: transfer }).moveIn;
}

/**
 * ⑧ 기존주택 원조합원 행의 모순 차단 — 일시적 2주택 경로(`temporaryTwoHouseEraIssues`)와 같은 규칙·문구.
 * 기존 임차인 단서를 켰는데 종료일이 없거나 종료일이 기존주택 취득일 이하면 막는다. 칸이 닫힌 행은 보지 않는다.
 */
export function originalMemberFactErrors(
  rights: readonly PresaleRightEntry[],
  transferDate: string | undefined,
): { field: `presaleRights.${number}.originalMemberTenantLeaseEndDate`; message: string }[] {
  return rights.flatMap((r, i) => {
    if (!originalMemberMoveInRelevant(r, transferDate) || r.originalMemberExistingTenant !== true) return [];
    const field = `presaleRights.${i}.originalMemberTenantLeaseEndDate` as const;
    if (!r.originalMemberTenantLeaseEndDate) {
      return [{ field, message: `분양권·입주권 ${i + 1}: 기존 임차인 특례 — 전 소유자와 임차인 간 임대차계약 종료일을 입력하세요.` }];
    }
    if (r.acquisitionDate && r.originalMemberTenantLeaseEndDate <= r.acquisitionDate) {
      return [
        {
          field,
          message: `분양권·입주권 ${i + 1}: 기존 임차인 특례 — 임대차계약 종료일은 기존주택 취득일 뒤여야 합니다(취득일 현재 거주 중인 임차인).`,
        },
      ];
    }
    return [];
  });
}
