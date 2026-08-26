/**
 * 세대 보유 분양권·조합원입주권 목록 → ⑬ payload — **단건·다건 공용 단일 소스**.
 *
 * ## 왜 뽑았나 (2026-08-25 · P1-02)
 *
 * 다건 마법사는 단건 마법사(`TransferTaxCalculator`)를 **그대로 임베드**하므로 Step4의
 * 「분양권·입주권」 위젯이 화면에 뜨고 `form.presaleRights`에 저장된다. ⑫ Zod
 * (`propertyBaseShape`)도 이 키를 수락한다. 그런데 다건 ⑬(`buildPropertyPayload`)은
 * `houses`만 싣고 이 키를 **아예 만들지 않았다** — 화면에는 입력된 것으로 보이는데
 * 엔진에는 도달하지 않는 침묵 소실이었다(실측 79,750,000원 과소).
 *
 * 같은 규칙이 두 곳에 복제되면 또 어긋나므로 leaf 하나를 양쪽이 부른다.
 *
 * ## 조문
 *
 * · 「소득세법」 §104⑦2호 — 「1세대가 1주택과 조합원입주권 또는 분양권을 1개 보유한 경우의
 *   해당 주택」 → §55① 세율 + 20%p.
 * · 같은 항 4호 — 「주택과 조합원입주권 또는 분양권을 보유한 경우로서 그 수의 합이 3 이상」 → +30%p.
 * · 「소득세법 시행령」 §167의11②1호 — 산입 제외는 「수도권·광역시·특별자치시 외 지역 +
 *   가액 3억 이하」뿐이다.
 *
 * ⚠️ **취득일 미입력분은 제외한다.** 주택 수 산입 판정이 취득일을 읽으므로 빈 문자열을 그대로
 *    보내면 ⑫에서 400이 나거나 엔진이 Invalid Date를 본다. 「입력 중인 빈 행」은 계산 대상이 아니다.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isHousingLike } from "@/lib/calc/housing-like-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

/** ⑬ payload의 presaleRights 항목 (⑫ `presaleRightSchema`와 1:1). */
export interface PresaleRightPayloadItem {
  id: string;
  type: PresaleRightEntry["type"];
  acquisitionDate: string;
  region: PresaleRightEntry["region"];
  regionCriteria?: PresaleRightEntry["regionCriteria"];
  rightValue?: number;
  isSpouseOwned?: boolean;
  regionCode?: string;
  managementDisposalApprovalDate?: string;
  isInherited?: boolean;
  isRankingDisqualifiedInheritedRight?: boolean;
  isCoInherited?: boolean;
  isLargestCoInheritedShareholder?: boolean;
  decedentOwnedHouseAtDeath?: boolean;
  decedentOwnedOtherRightTypeAtDeath?: boolean;
  decedentSameHouseholdAtInheritance?: boolean;
  parentalCareMergeInheritedRight?: boolean;
}

/**
 * 세대 보유 분양권·입주권 목록을 ⑬ payload 형태로 변환한다.
 *
 * @returns 게이트를 통과하지 못하면 `undefined` — 호출부가 조건부 spread로 키 자체를 만들지 않는다.
 *          게이트는 통과했으나 취득일 입력분이 없으면 **빈 배열**이다(종전 단건 동작 보존).
 */
export function buildPresaleRightsPayload(
  primaryAssetKind: AssetForm["assetKind"],
  presaleRights: PresaleRightEntry[],
): PresaleRightPayloadItem[] | undefined {
  if (!isHousingLike(primaryAssetKind) || presaleRights.length === 0) return undefined;
  return presaleRights
    .filter((p) => p.acquisitionDate)
    .map((p) => ({
      id: p.id,
      type: p.type,
      acquisitionDate: p.acquisitionDate,
      region: p.region,
      regionCriteria: p.regionCriteria,
      rightValue: p.rightValue ? parseAmount(p.rightValue) || undefined : undefined,
      isSpouseOwned: p.isSpouseOwned,
      regionCode: p.regionCode || undefined,
      // §89② 조합원입주권 축 시행일 게이트(법률 제7837호 부칙 §12①) — 빈 문자열은 미입력이다.
      managementDisposalApprovalDate: p.managementDisposalApprovalDate || undefined,
      isInherited: p.isInherited,
      isRankingDisqualifiedInheritedRight: p.isRankingDisqualifiedInheritedRight,
      isCoInherited: p.isCoInherited,
      isLargestCoInheritedShareholder: p.isLargestCoInheritedShareholder,
      decedentOwnedHouseAtDeath: p.decedentOwnedHouseAtDeath,
      decedentOwnedOtherRightTypeAtDeath: p.decedentOwnedOtherRightTypeAtDeath,
      decedentSameHouseholdAtInheritance: p.decedentSameHouseholdAtInheritance,
      parentalCareMergeInheritedRight: p.parentalCareMergeInheritedRight,
    }));
}
