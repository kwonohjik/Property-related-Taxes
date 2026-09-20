/**
 * 판정 메뉴 — 재사용 섹션 **노출 게이트** (P4-2b-2)
 *
 * 계산기 Step4는 `form.householdHousingCount` 스칼라로 게이트하지만 판정 메뉴에는 그 위젯이
 * 없다(G-1). 여기서는 **명부 파생 주택 수**로 같은 판단을 내린다.
 *
 * 🔑 계산기 쪽 게이트 함수(`temporaryTwoHouseSectionVisible` 등)는 **건드리지 않는다** —
 *    다른 화면이 다른 정본을 쓰는 것은 D-3이 이미 승인한 설계다.
 */
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { deriveJudgmentHouseCount } from "@/lib/stores/one-house-judgment-form.types";

/**
 * §155①⑥⑦⑧⑯⑱ · §156의2⑤ 섹션 — 2주택 이상일 때만 의미가 있다.
 *
 * 계산기의 `temporaryTwoHouseSectionVisible({ primaryAssetKind, householdHousingCount })`와
 * 같은 취지다. 자산 종류 축은 판정 메뉴가 주택만 다루므로 빠진다.
 */
export function judgmentTemporaryTwoHouseVisible(form: OneHouseJudgmentFormData): boolean {
  return deriveJudgmentHouseCount(form) >= 2;
}

/**
 * ① 세대 단계가 **합가일 입력을 소유하는가**.
 *
 * 🔴 **배타 규약이다.** `MergedHouseholdRightSection`은 주택 수 < 2일 때
 *    `marriageDate`·`parentalCareMergeDate`·`isFirstTransferredInMerge`를 **직접 소유**한다
 *    (`MergedHouseholdRightSection.tsx:14-16·80-82`). 그 조건에서 `MergeDateSection`도 함께
 *    렌더하면 **같은 칸이 두 벌** 뜬다(F-3).
 *
 * 그 섹션은 `presaleRights.length === 0`이면 `null`을 반환하므로(`:77`), 실제로 소유하는
 * 조건은 **「분양권·입주권이 있고 + 주택 수 < 2」** 다. 그 밖에는 ①이 소유한다.
 */
export function judgmentMergeDateOwnedByStep1(form: OneHouseJudgmentFormData): boolean {
  const ownedByRightSection =
    (form.presaleRights?.length ?? 0) > 0 && deriveJudgmentHouseCount(form) < 2;
  return !ownedByRightSection;
}
