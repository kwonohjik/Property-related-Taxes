/**
 * 재개발 §166 — **토지만 출자한 조합원입주권의 §89①4호 비과세** 보조 (#13 · 2026-10-11 사용자 결정 B).
 *
 * 「소득세법」 §89①4호 본문은 「조합원입주권을 1개 보유한 1세대[관리처분계획의 인가일(인가일 전에 기존주택이 철거되는 때에는
 * 기존주택의 철거일) 현재 제3호가목에 해당하는 기존주택을 소유하는 세대]」를 요건으로 한다. 주체가 「세대」이므로
 * 본인이 토지만 출자했어도 **같은 세대원이 그 건물을 소유**했다면 성립할 여지가 있다(재산세과-1748, 2008.7.17. —
 * 기존주택을 소유한 자와 동일세대를 구성하는 1세대에 적용). 그래서 기본은 불성립이고, 「인가일·양도일 두 시점 모두
 * 같은 세대가 건물을 소유」했다는 선언이 「예」일 때만 기존 인가일 요건 선언(`exemptionEligibleAtApproval`)대로 판정한다.
 *
 * 판정 규칙은 `resolveOneRightExemptionClause`(단일 소스) 안의 `landContributionBlocksOneRight` 한 곳이다. 이 파일은
 * 그 결과를 **사용자에게 말하는** 고지만 만든다 — 결론을 가르는 경우에만(모름 = 혜택 불성립 + 확인 필요).
 *
 * ⚠️ 장기보유특별공제 표2(§95②)는 이 선언과 별개 축이다 — 토지 출자 입주권은 표2 진입을 계속 막는다.
 *    「세대원 건물 소유」 예외 사안의 표2 적용 여부는 입주권 표2 기준(#14)과 함께 정한다.
 */
import { resolveOneRightExemptionClause } from "./transfer-tax-redevelopment-transforms";
import type { TransferTaxInput, RedevelopmentResult } from "./types/transfer.types";

const LAND_RIGHT_RULING = "재산세과-1748(2008.7.17.)";

/**
 * 토지 출자 입주권 고지 — 토지 출자 입주권이 아니거나 인가일 요건 선언이 없으면 빈 배열.
 *
 *  · 선언 없음(모름) + 선언했다면 4호가 성립했을 사안 → 불성립으로 계산했고 **확인 필요**
 *  · 「아니오」 선언 + 선언했다면 성립했을 사안 → 불성립으로 계산했다(사실 확정이라 확인 필요 없음)
 *  · 「예」 + 12억 초과 안분이 걸림 → 토지 출자 산식이 세대 단일 입주권의 건물분을 반영하지 못할 수 있어 **확인 필요**
 *    (「소득세법 시행령」 §166)
 */
export function oneRightLandContributionNotices(
  input: TransferTaxInput,
  redevAfterRight: Pick<RedevelopmentResult, "oneRightHighValueApplied">,
): string[] {
  const redev = input.redevelopment;
  if (redev?.subject !== "right" || redev.originalAssetType !== "land") return [];
  if (redev.exemptionEligibleAtApproval !== true) return [];

  const owned = redev.landHouseholdOwnedBuilding;
  if (owned === true) {
    return redevAfterRight.oneRightHighValueApplied === true
      ? [
          "토지만 출자한 입주권을 세대원 건물 소유로 선언해 §89①4호 비과세를 적용했습니다. 양도가액이 고가 기준금액을 넘어 안분 과세했는데, " +
            "이 계산기의 토지 출자 산식(「소득세법 시행령」 §166)은 같은 세대가 가진 건물분을 반영하지 못할 수 있습니다 — 확인 필요.",
        ]
      : [];
  }

  // 선언했다면 4호가 성립했을 사안인가 — 같은 판정 leaf에 「예」를 넣어 본다(규칙을 복제하지 않는다).
  const wouldHold = resolveOneRightExemptionClause({ ...redev, landHouseholdOwnedBuilding: true }, input) !== undefined;
  if (!wouldHold) return [];

  return owned === false
    ? [
        `토지만 출자한 입주권이고 인가일·양도일 현재 같은 세대가 철거 대상 건물(기존주택)을 소유하지 않는다고 선언해 §89①4호 비과세·고가 안분을 적용하지 않았습니다(「소득세법」 §89①4호 본문 · ${LAND_RIGHT_RULING}).`,
      ]
    : [
        `토지만 출자한 입주권은 인가일·양도일 현재 같은 세대가 철거 대상 건물(기존주택)을 소유한 경우에만 §89①4호 비과세가 성립합니다(「소득세법」 §89①4호 본문 · ${LAND_RIGHT_RULING}). ` +
          "판정 메뉴 §89①4호 카드에서 세대원 건물 소유를 선언하지 않아 비과세·고가 안분을 적용하지 않았습니다 — 확인 필요.",
      ];
}
