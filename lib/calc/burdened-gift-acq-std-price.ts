/**
 * 부담부증여 기준시가 모드 — 「취득시 기준시가」 입력 술어·해석 (단일 출처).
 *
 * ## 왜 함수로 뽑는가
 *
 * 이 값은 §159①1호 A괄호의 취득가액(= 취득시 기준시가 × 채무비율)을 가른다. 종전에는
 * **입력 화면이 없고 validate도 검사하지 않아** 0이 그대로 엔진에 실렸다(실측: 취득가액 0 ·
 * 개산공제 0 → 양도차익 257,500,000원 과대). 그 결함을 고치면서 UI 게이트(⑤)와 validate(⑧)가
 * 생겼는데, 두 술어가 갈리면 **「칸은 뜨는데 계산은 막힌다」** 또는 그 반대가 된다.
 *
 * ⇒ 노출 조건과 값 해석을 여기 한 곳에 둔다. 호출부는 판단하지 않는다.
 *
 * 설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount } from "@/lib/calc/number-parse";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { redevPreApprovalAcqMode } from "./redev-pre-approval-acq-mode";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";

type AcqStdAsset = Partial<Pick<AssetForm, "acquisitionCause" | "redevIsSuccessorMember" | "isMixedUseHouse">> & Pick<
  AssetForm,
  | "assetKind"
  | "transferType"
  | "bgValuationMode"
  | "bgAcquisitionMethod"
  | "standardPriceAtAcq"
  | "standardPricePerSqmAtAcq"
  | "acquisitionArea"
>;

/**
 * 「취득시 기준시가」를 **직접 입력받아야 하는** 상태인가 — UI 노출·validate 공용 게이트.
 *
 * 제외 이유:
 *  · 시가 모드 + K-4(실지) — 취득가액이 실지취득가액 안분으로 간다(§100①). 이 값을 쓰지 않는다.
 *    ⚠️ **K-6(매매사례가액)·K-7(감정가액)도 쓴다** — 취득가액은 입력한 금액이지만 필요경비 **개산공제의 base**가
 *    「취득시 기준시가 × 채무비율 × 율」이다(소령 §163⑥ · `burdened-gift-apportionment.ts` STEP 5). 이 칸이
 *    안 뜨면 개산공제가 0이 된다(계획서 §4 IN 3).
 *    ⚠️ **K-5(환산)는 쓴다** — 환산취득가액 = 양도가액 × 취득시 기준시가 ÷ 양도시 기준시가
 *    (소령 §176의2②2호 · `burdened-gift-apportionment.ts` K-5). 종전에는 시가 모드 전체를 제외해
 *    ⑧(K-5)이 요구하는데 **칸이 없었다**(2026-09-30 B2).
 *  · **이월과세 × K-6/K-7** — 양도인(증여받은 사람) 쪽은 증여일 평가액(실지)이고 당초 증여자 쪽은 이월과세 박스의 당초 증여자 취득 당시
 *    기준시가를 개산공제 base로 쓴다(`applyCarryoverDonorBasis`가 치환). 양도인의 취득시 기준시가는 어느 시나리오에서도 읽지 않는다.
 *  · `general_building` — `gbAcqLandPricePerSqm`·`gbAcqBuildingValue` 전용 입력이 있고 API가
 *    그것을 쓴다(`transfer-tax-api-burdened-gift.ts`). 여기 칸을 만들면 **엔진이
 *    쓰지 않는 값**을 입력하게 되고, validate가 그걸 요구하면 gb*를 채운 사용자가 막힌다.
 *  · `right_to_move_in` — **K-4 전용이라 이 칸을 쓰지 않는다**(2026-09-08). 조합원입주권의
 *    증여재산 평가는 상증법 §61③이고, §159①1호 A괄호의 열거(§61①②⑤·§66)에 **없어**
 *    괄호가 발동하지 않는다 ⇒ 취득가액은 §97①1호 실지거래가액이다. ④ API 변환도
 *    `buildingStdPriceAtAcquisition: 0`을 보낸다 — 칸을 띄우면 **엔진이 버리는 값**을 요구하게 된다.
 *  · **재개발 완공 아파트 × K-5** — 취득가액은 종전 부동산의 취득가액이라 시행령 §166③으로 환산하고, 그 분자·분모와
 *    개산공제 base는 재개발 블록 ⑤의 §166③ 칸이 받는다(`redevPreApprovalAcqMode`). 이 칸(일반 환산 분자)은 엔진이 쓰지 않는다(2026-10-16).
 *
 * 포함(예외의 예외): **시가 모드 · 담보 승**(`bgCollateralForcesStdAcq` — 단독 소유 단건)은 위 시가 모드 제외가 풀린다. 엔진이 §159①1호 괄호로
 * 취득가액을 취득시 기준시가로 강제하고, 이 칸이 비면 400을 낸다(`burdened-gift-residuals-o3-o5-o8.plan.md` O-5).
 */
export function needsBgAcqStdPriceInput(asset: AcqStdAsset, isFractionalSplit = false): boolean {
  return (
    asset.transferType === "burdened_gift" &&
    (asset.bgValuationMode !== "sangjeungbeop_market" ||
      asset.bgAcquisitionMethod === "converted" ||
      (isBgPresumedMethod(asset.bgAcquisitionMethod) && asset.acquisitionCause !== "carryover_gift") ||
      // 시가 모드 · 담보 승(상증법 §66) — 산정방식과 무관하게 취득가액이 취득시 기준시가 × 채무비율이다(엔진 `acqStdPriceForced`). 실지(K-4)여도 이 칸을 쓴다.
      bgCollateralForcesStdAcq(asset as AssetForm, isFractionalSplit)) &&
    asset.assetKind !== "general_building" &&
    asset.assetKind !== "right_to_move_in" &&
    // 겸용주택 — 취득시 기준시가는 4부분 겸용 패널(`mixedAcq*`)이 정본이다. 총액 칸을 띄우면 엔진이 읽지 않는 값을 받는다(설계 UI R2 §4 DUP-2).
    !isMixedBurdenedGift({ assetKind: asset.assetKind, transferType: asset.transferType, isMixedUseHouse: asset.isMixedUseHouse }) &&
    !(asset.assetKind === "redevelopment_apt" && redevPreApprovalAcqMode(asset) === "estimated") &&
    // 의제취득일 전 상속·증여 토지·주택·상가·건물 — 취득시 기준시가는 의제취득일 기준시가이고 상속·증여 의제 섹션의 칸(등급·3시점 자동값 포함)이 받는다
    //   (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §18 · ⑧ `bgPreDeemedError`).
    !isBgPreDeemedAsset(asset as AssetForm)
  );
}

/**
 * 이월과세(§97의2) 부담부증여 — 「당초 증여자 취득 당시 토지·건물 기준시가」를 받아야 하는가 (⑤ 이월과세 박스 · ⑧ `missingCoDonorBasisLabel` 공용).
 * K-1~K-3(기준시가 모드) · K-5(환산 분자) · K-6/K-7(개산공제 base) — 엔진 `describeRequiredDonorFields`와 같은 분기다.
 * 둘째 지분부터는 ②가 숨겨져 `BurdenedGiftTrancheBasisBlock`이 같은 박스를 연다 — 두 화면이 각자 판정하면 칸과 검증이 갈린다(PR-2).
 */
export function bgCoDonorNeedsStdPrice(asset: AssetForm, isFractionalSplit = false): boolean {
  return (
    asset.bgValuationMode === "sangjeungbeop_standard" ||
    // 시가 모드 · 담보 승 — 괄호가 발동해 두 시나리오 모두 취득시 기준시가를 읽는다(방식별 당초 증여자 값은 읽히지 않는다).
    bgCollateralForcesStdAcq(asset, isFractionalSplit) ||
    asset.bgAcquisitionMethod === "converted" ||
    (asset.bgValuationMode === "sangjeungbeop_market" && isBgPresumedMethod(asset.bgAcquisitionMethod))
  );
}

/**
 * 엔진에 실릴 취득시 기준시가(원) — **API 변환과 같은 fallback**을 쓴다.
 *
 * ⚠️ `land`는 총액이 없으면 `㎡당 공시지가 × 취득면적`으로 도출된다
 * (`transfer-tax-api-burdened-gift.ts:192-194`). validate가 총액만 보면 단가·면적을 채운
 * 토지 사용자가 부당하게 막힌다(UI 통과 ↔ validate 차단 모순 — components/calc/CLAUDE.md ⑧).
 */
export function resolveBgAcqStdPrice(asset: AcqStdAsset): number {
  const total = parseAmount(asset.standardPriceAtAcq) || 0;
  if (total > 0) return total;
  if (asset.assetKind !== "land") return 0;
  const perSqm = parseAmount(asset.standardPricePerSqmAtAcq) || 0;
  const area = parseFloat((asset.acquisitionArea || "").replace(/,/g, "")) || 0;
  return multiplyByArea(perSqm, area);
}
