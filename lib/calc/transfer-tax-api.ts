/**
 * 양도소득세 계산 API 호출 함수
 * TransferFormData (assets[] 기반) → POST /api/calc/transfer → TransferAPIResult
 *
 * Phase 1: 서버 Zod 스키마 미변경 — 클라이언트에서 기존 포맷으로 변환하여 전송.
 * assets.length === 1 → single 엔드포인트, >= 2 → bundled 엔드포인트.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { clampResidenceToHousingPeriod } from "@/lib/stores/calc-wizard-asset-residence";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import {
  buildHouseholdSpecialPayload,
  buildPenaltyAmendmentPayload,
  buildPreHousingDisclosurePayload,
  buildNewConstructionPayload,
} from "./transfer-tax-api-body-blocks";
import { toEngineReductions, toSelfCultivatedExpropriatedLand, buildAssetPayload, getOwnershipRatio, applyRatio, toRentalHousingExceptionApi, buildCommercialBuildingValuation, buildCommercialAppurtenantLand, buildGeneralBuildingValuation, buildRedevelopmentPayload, buildExpropriationInput, buildReplacementHousePayload, buildRightThreeYearExceptionPayload, buildMergedHouseholdFirstHousePayload, buildPre1990LandPayload, provisoGate, effectiveProvisoReason, deriveEngineInheritanceAssetKind, isFullFractionalBundle, mergePrimaryBasic } from "./transfer-tax-api-helpers";
import { buildGeneralBuildingShares } from "./transfer-tax-api-gb-shares";
// ⚠️ 신규 import는 한 라인에 한 named만 — lint-staged `eslint --fix`가 미사용 import 정리 시
//    같은 라인의 사용 중인 named까지 제거하는 함정이 있다(루트 CLAUDE.md).
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { isSec163_9Cause } from "./transfer-163-9-base-date";
import { isSuccessorRightTransfer } from "./transfer-successor-right";
import { successorRightAcquisitionTotal } from "./transfer-successor-right";
import { buildPresaleRightsPayload } from "./presale-rights-payload";
import { isReceiveOnlyFiling } from "./redev-field-scope";
import { successorRightStdPriceAtAcq } from "./transfer-successor-right";
import { successorRightStdPriceAtTransfer } from "./transfer-successor-right";
import { buildParcelsPayload } from "./transfer-tax-api-parcels";
import { buildSplitPayload, makeRatioed, isSplitPayloadActive } from "./transfer-tax-api-split";
import { buildHousesPayload } from "./transfer-tax-api-houses";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { buildNonBusinessLandRaw } from "./non-business-land-request";
import { buildMixedUsePayload } from "./transfer-tax-api-mixed-use";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { buildSameAdjustmentPeriodInput } from "./transfer-same-adjustment-period-input";
import {
  buildInheritedAcquisitionPayload,
  buildInheritedHouseValuationPayload,
  buildCommercialInheritanceValuationPayload,
} from "./transfer-tax-api-inheritance";

// 하위 호환 재수출 — 기존 import 경로 유지
export { toEngineReductions } from "./transfer-tax-api-helpers";

export type SingleTransferResult = { mode: "single"; result: TransferTaxResult };
export type BundledTransferResult = {
  mode: "bundled";
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
  /** 부담부증여 §159·증여세 통합 명세 (일반건물 + 부담부증여 모드에서만 포함). */
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
};
export type MixedUseTransferResult = { mode: "mixed-use"; result: MixedUseGainBreakdown };
export type TransferAPIResult = SingleTransferResult | BundledTransferResult | MixedUseTransferResult;

/** 엔진이 이해하는 3종 assetKind (right_to_move_in / presale_right → housing) */

export async function callTransferTaxAPI(form: TransferFormData): Promise<TransferAPIResult> {
  const primary = form.assets[0];
  if (!primary) throw new Error("자산이 없습니다.");

  // 지분 모드(같은 물건 분할취득) 여부 — companion basic을 primary에서 병합할지 게이트.
  const fractionalBundleMerge = isFullFractionalBundle(form.assets);

  // ── 대표 자산 감면 (자산별 reductions 배열에서 빌드) ──
  const reductions = toEngineReductions(primary.reductions ?? [], primary.acquisitionCause, primary.expropriationNoticeDate);

  // ── ④⑬ 비사업용 토지 정밀판정 raw 페이로드 (서버 buildNblEngineInput이 nested+Date 변환) ──
  const nblRaw = buildNonBusinessLandRaw(primary, form.transferDate);

  // ── 다른 보유 주택 목록 (④⑬ 헬퍼로 위임 — transfer-tax-api-houses.ts) ──
  // 분양권/입주권만 있고 다른 주택은 없는 경우(양도주택 + 분양권)도 정밀 판정되도록 게이트 확장.
  const housesPayload = buildHousesPayload(
    primary,
    form.houses,
    form.presaleRights.length,
    form.sellingHouseExclusion,
  );

  // ── 세대 보유 분양권·입주권 (취득일 입력분만 — §104⑦2호·4호 주택수 산입) ──
  // 다건 ⑬과 **같은 leaf**를 쓴다 — 종전에는 다건에 이 규칙이 아예 없어 침묵 소실했다(P1-02).
  const presaleRightsPayload = buildPresaleRightsPayload(primary.assetKind, form.presaleRights);

  // 취득가 산정방식은 자산-수준 플래그에서 도출 (Step1↔Step3 통합 후).
  // 폼-전역 form.acquisitionMethod / form.appraisalValue 는 더 이상 사용하지 않음.
  /**
   * 조합원입주권 — 추계 3형 중 **감정가액·매매사례가액은 입력 경로 자체가 없다**(2026-08-23).
   *
   * 원조합원(§166①)의 취득가액은 「기존건물과 그 부수토지의 취득가액」이고, 확인할 수 없는 경우의
   * 대체수단은 §166③ **환산**으로 법이 이미 정해 두었다. 승계조합원(§97①1호 가목)은 승계 매입가가
   * 실지거래가액이다. 어느 쪽도 §176의2③ 감정·매매사례 추계를 쓰지 않으며, 엔진도 §166 경로에서
   * `appraisalValue`·`similarSalesValue`를 **읽지 않는다**(`transfer-tax-redevelopment.ts:90`).
   *
   * 종전에는 상단 축 A 라디오로 그 두 방식을 고를 수 있었고, 고르면 `acquisitionPrice`가 **0**이 되어
   * 「인가전 양도차익 = 권리가액 − 0」으로 **오류 없이 과대과세**됐다. 상단 축 A는 UI에서 제거하되,
   * 이미 저장된 stale 플래그가 남아 있어도 계산이 틀어지지 않도록 여기서 무력화한다.
   * (완공APT는 본 PR 범위 밖 — 현행 동작을 유지한다. anchor A-8이 트립와이어다.)
   */
  const isRightToMoveIn = primary.assetKind === "right_to_move_in";
  /** 승계조합원 입주권 — §166 미적용(§97①1호 가목). 술어는 `transfer-successor-right.ts` 단일 소스. */
  const isSuccessorRight = isSuccessorRightTransfer(primary);
  /**
   * 추계 게이트 — **원조합원 입주권만** 막는다 (R-12, 2026-08-23).
   *
   * 종전에는 `!isRightToMoveIn`이라 승계조합원까지 함께 막혔다. 원조합원(§166①)은 취득가액
   * 확인 불가 시의 대체수단을 §166③ **환산으로 법이 이미 정해 두었고**, 엔진도 §166 경로에서
   * `appraisalValue`·`similarSalesValue`를 읽지 않는다 ⇒ 계속 막는다(R-9에서 §166③ 전속 확정).
   *
   * 승계조합원은 §166을 타지 않고 §97①1호 일반 경로로 가므로 §176의2③ 추계 3종이 그대로
   * 적용된다. 기준시가는 §99①2호 가목 → 영 **§165①**(납입액 + 프리미엄)이 명문으로 정한다.
   */
  /**
   * ⚠️ **두 게이트는 범위가 다르다** — 종전 코드가 그랬고, R-12도 그 구분을 지킨다.
   *
   * | | 종전 | 현행(R-12) |
   * |---|---|---|
   * | 감정·매매사례 | `!isRightToMoveIn` — **입주권 전체** 차단 | 원조합원만 차단 |
   * | 환산 | `!isSuccessorRight` — **승계만** 차단 | 차단 없음 |
   *
   * 원조합원의 `useEstimatedAcquisition`은 §166③ 환산(종전 부동산)을 켜는 플래그라
   * **원래부터 통과해야 한다**. 이것을 `blocksEstimation` 하나로 묶으면 §166③ 환산이 꺼진다
   * (P-9 ⑦ 실측에서 `useEst=false`로 잡혔다).
   */
  const blocksAppraisalSalesCase = isRightToMoveIn && !isSuccessorRight;
  const isSalesCase = !blocksAppraisalSalesCase && primary.isSalesCaseAcquisition === true;
  const isAppraisal =
    !blocksAppraisalSalesCase && !isSalesCase && primary.isAppraisalAcquisition === true;
  // 승계 입주권 환산은 §176의2②2호(입주권 자체) · 원조합원 환산은 §166③(종전 부동산) — 둘 다 통과.
  const isEstimated = !isSalesCase && !isAppraisal && primary.useEstimatedAcquisition;
  // pre1990 토지등급 환산은 §176의2④ 의제취득(pre-1985) 영역. post-1985 증여는 §163⑨ 신고가액이
  // 취득당시 실지거래가액으로 확인 가능 → 토지등급 환산 배제. pre1990Enabled은 환산 클릭 시 set되는
  // uncleaable 래치(CompanionAcqPurchaseBlock:92)라 gift 실거래가 전환 후 stale true로 남을 수 있으므로
  // 정의 자체에서 게이트(validate-asset.ts:462 동일 소스식). pre-1985 gift·비-gift는 기존 동작 유지.
  const hasPre1990 =
    (primary.pre1990Enabled ?? false) &&
    primary.assetKind === "land" &&
    !(primary.acquisitionCause === "gift" && (primary.acquisitionDate ?? "") >= "1985-01-01");
  /**
   * §164④ **②(가목) 산출 전용** 게이트 — 「환산 모드 전환」과 분리한다 (G-1 · 2026-08-06).
   *
   * 위 `hasPre1990`은 `pre1990Land` payload 생성과 **환산 모드 전환**(`acquisitionPrice: 0` ·
   * `expenses: 0` · `acquisitionMethod: "estimated"` 등 6개 필드 override)을 **한 값으로** 제어한다.
   * 그런데 §163⑨1호의 ②(§164④)는 법 §97①1호 **가목**이라 환산(나목)과 무관하게 필요하다 —
   * 증여는 ①(증여 신고가액)이 확인되므로 환산으로 전환되면 안 되지만 ②와는 **비교해야** 한다
   * ("평가한 가액**과** §164④ 가액 **중 많은 금액**").
   *
   * ⇒ payload 생성만 이 게이트로 넓힌다. override 6곳은 `hasPre1990` 그대로 두므로
   *   post-1985 증여의 신고가액 경로가 깨지지 않는다. 엔진은 `pre1990Land`로 ②를 산출하고
   *   `runInheritedAcquisitionStep`이 max(①,②)를 결정한다
   *   (anchor `gift-land-164-4-max.anchor.test.ts` G1-A·G1-B).
   *
   * ⚠️ **`pre1990Enabled` 래치를 조건에 넣지 않는다.** 그 플래그는 환산 클릭 시 set되는 uncleaable
   *    래치라 §163⑨ 경로의 opt-in 신호로 부적절하다. 대신 `buildPre1990LandPayload`가 등급 3종·면적·
   *    1990 ㎡당가를 **모두** 요구하므로(`transfer-tax-api-helpers.ts:400`) **등급을 실제로 입력한
   *    경우에만** payload가 생긴다 — 상가 §164⑥·주택 §164⑤~⑦과 같은 all-or-nothing opt-in이다.
   *    ⇒ PR#731이 막으려던 stale 래치 오염은 재발하지 않는다(이 게이트는 override를 켜지 않는다).
   */
  const hasPre1990ForSec164 =
    primary.assetKind === "land" && isSec163_9Cause(primary.acquisitionCause);
  // §164⑤ PHD 모드: standardPriceAt* 는 3-시점 입력으로 자동 도출 → API body에서 제외
  // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(공동주택 사례 23 등)해도 PHD 경로는 표준시가 직접 입력 불요.
  const usesPhd = primary.usePreHousingDisclosure === true;
  // 이월과세 "general" 환산 모드: donorStandardPrice*를 최상위 standardPrice*로 override.
  // PHD/APD 모드와 달리 preHousingDisclosure 없이 기준시가를 직접 입력하므로 usesPhd=false 필요.
  const isCarryoverGeneral =
    primary.acquisitionCause === "carryover_gift" &&
    primary.carryover?.useEstimatedAcquisition === true &&
    primary.carryover?.estimationMode === "general";
  const parcelModeActive =
    primary.parcelMode && primary.assetKind === "land" && (primary.parcels?.length ?? 0) > 0;
  const firstParcelAcqDate = parcelModeActive
    ? (primary.parcels[0]?.acquisitionDate || form.transferDate)
    : primary.acquisitionDate;

  // ⑬ 상업용건물·오피스텔 환산취득가 서브객체 빌드 (TypeScript 미감지 영역 — grep 자가 점검 완료)
  const isCommercialBuilding = primary.assetKind === "commercial_building";
  // §163⑨: 상속 취득 상가는 상속개시일 평가액 직접(환산 아님) → 환산 payload 미빌드.
  const cbValuation = isCommercialBuilding && primary.useEstimatedAcquisition && primary.acquisitionCause !== "inheritance"
    ? buildCommercialBuildingValuation(primary, form.transferDate)
    : undefined;
  // ⑬ 부수토지 초과분 판정 payload — 위 환산과 달리 **취득방법 무관**(상속 포함)이라 게이트가 없다.
  const cbAppurtenantLand = buildCommercialAppurtenantLand(primary);

  // ⑬ 일반건물(토지+건물 일괄) 환산취득가 서브객체 빌드 (TypeScript 미감지 영역 — grep 자가 점검 완료)
  const isGeneralBuilding = primary.assetKind === "general_building";
  const gbValuation = isGeneralBuilding
    ? buildGeneralBuildingValuation(primary, form.transferDate)
    : undefined;

  /**
   * ⑬ 일반건물 × **지분(%) 분할 취득** — 지분별 완결 payload 배열.
   *
   * 조건 미충족 시 `undefined`라 기존 경로가 그대로 돈다(회귀 0).
   * 성립하면 아래에서 **`companionAssets`·`totalSalePrice` 등을 보내지 않는다** —
   * 보내면 route의 `bundledOk`가 참이 되어 5-a(일괄)가 먼저 잡는다.
   */
  const gbShares = isGeneralBuilding
    ? buildGeneralBuildingShares(form.assets, form.transferDate)
    : undefined;

  // ⑬ 재개발/재건축 (시행령 §166) — assetKind "redevelopment_apt" 또는 "right_to_move_in" 시 빌드.
  // redevSubject는 buildRedevelopmentPayload에서 UI display fallback("apt"/"right")과 동일하게 보정.
  // assetKind 자체가 전용 분기이므로 추가 enum 입력은 요구하지 않는다(3중 패턴 정합).
  //
  // ⚠️ **승계조합원 입주권은 제외한다** (2026-08-23). §166①은 「조합에 기존건물과 그 부수토지를
  //    **제공하고 취득한**」 조합원으로 요건을 한정하므로 승계자는 대상이 아니다 — 재개발 페이로드
  //    자체를 만들지 않아 엔진이 일반 분기(§97①1호 가목)를 타게 한다(`isSuccessorRight` 위에서 정의).
  const isRedevelopment =
    !isSuccessorRight &&
    (primary.assetKind === "redevelopment_apt" || isRightToMoveIn);
  const redevPayload = isRedevelopment ? buildRedevelopmentPayload(primary) : undefined;

  // ⑬ 부담부증여 (소령 §159) — Phase 2 (2026-05-12): transferType 분기 + 모든 propertyType 지원
  // 호환성: 레거시 acquisitionCause === "burdened_gift"는 normalize에서 transferType로 이전되나
  //         혹시 누락된 경우 OR 조건으로 fallback.
  const isBurdenedGift =
    primary.transferType === "burdened_gift" ||
    primary.acquisitionCause === "burdened_gift";
  const bgInfo = isBurdenedGift ? buildBurdenedGiftInfo(primary) : undefined;

  // 겸용주택 분리계산 payload 빌드
  const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;

  // 🚨 이슈 8: silent skip 방지 — 토글 ON & direction 미선택 시 명시적 throw
  if (isMixed && primary.hasPartialUsageChange && !primary.partialChangeDirection) {
    throw new Error("보유 중 일부 용도변경: 취득시 자산 구성을 선택하세요.");
  }

  const mixedUsePayload = buildMixedUsePayload(primary, form);

  // 공유 지분 — primary 자산의 지분 모드 처리 (다자산 일괄양도는 buildAssetPayload에서 별도 처리)
  const primaryRatio = getOwnershipRatio(primary);
  const primaryFractional = primaryRatio < 1.0;
  // 지분 스케일 적용기 — 금액 필드 전용 단일 진입점 (transfer-tax-api-split.ts).
  const ratioed = makeRatioed(primaryRatio, primaryFractional);
  /**
   * 지분(공유) 모드 스케일러 — **숫자 금액용**.
   *
   * 화면 규약은 「모든 금액을 100% 기준으로 입력하고 시스템이 지분율을 적용한다」이다
   * (`OwnershipRatioInput.tsx:13`). 종전 `acquisitionPrice` 삼항은 이 규칙을 **가장 마지막
   * 갈래에만** 붙여 두어 승계조합원 입주권·§166 재개발 갈래가 100%로 새 나갔다(U2-03).
   * ⇒ 삼항 **전체를 한 번** 감싸 갈래가 늘어도 규칙이 따라오게 한다.
   */
  const shareOf = (v: number): number => (primaryFractional ? applyRatio(v, primaryRatio) : v);
  // 파트 필드 전송은 buildSplitPayload 담당 — 여기선 §166⑥ 안분 3요소 게이트로만 쓴다.
  const isSplitActive = isSplitPayloadActive(primary, isBurdenedGift);
  // 개산공제(§163⑥) base 축소용 지분율 — 금액 필드와 달리 **기준시가는 raw 100% 유지**하고,
  // 엔진이 개산공제 계산 지점에서만 적용한다(설계 transfer-fractional-lump-sum-deduction).
  const ownershipRatioForDeduction = primaryFractional ? primaryRatio : undefined;
  const totalContractPrice = parseAmount(form.contractTotalPrice);
  // 폼-수준 총 양도비 (B3) — 지분 모드 자동 안분의 분자 sourcing.
  // primary.transferExpense가 직접 입력되면 그것이 우선, 미입력시 form.totalTransferExpense × ratio 사용.
  const formTotalTransferExpense = parseAmount(form.totalTransferExpense || "0");
  const primaryTransferExpenseDirect = parseAmount(primary.transferExpense);
  const primaryEffectiveTransferExpense =
    primaryTransferExpenseDirect > 0
      ? primaryFractional
        ? applyRatio(primaryTransferExpenseDirect, primaryRatio)
        : primaryTransferExpenseDirect
      : primaryFractional && formTotalTransferExpense > 0
        ? applyRatio(formTotalTransferExpense, primaryRatio)
        : formTotalTransferExpense; // 단독 모드: form-level이 있으면 사용, 없으면 0

  // 부담부증여 (소령 §159) — 양도가액은 엔진 STEP 0.48에서 채무 안분 후 자동 override.
  // 단, Zod schema는 transferPrice >0 요구이므로 채무 합계를 placeholder로 전달 (엔진에서 다시 계산).
  const isBurdenedGiftPrimary = primary.transferType === "burdened_gift";
  const burdenedGiftPlaceholderTransferPrice = isBurdenedGiftPrimary
    ? (parseAmount(primary.bgLendingDepositTotal) || 0) +
      (parseAmount(primary.bgMortgageDebtAmount) || 0)
    : 0;

  // 사례 46 — receiveOnly 모드: transferPrice = settlementAmount, transferDate = settlementSaleDate 자동 미러
  // memory `mirror-pattern` 3중 패턴 (UI display + API + validate). 엔진은 receiveOnly 분기에서 transferPrice 무시 — 2중 안전망.
  //
  // ⚠️ **완공 APT 양도(subject="apt") 전용이다.** 엔진의 receiveOnly 구현은 `computeAptReceive`
  //    (redevelopment-split.ts) 안에만 있어 입주권(subject="right") 분기에는 대응 산식이 없다.
  //    subject 가드 없이 두면 「양도차익 0 강제」는 걸리지 않은 채 여기서 양도가액만 청산금 수령액으로
  //    교체돼 **양도차익이 조용히 사라진다**(실측: 4.2억 양도 → 청산금 분 양도차익 1.7억 → 0).
  //    subject는 `redevPayload`가 단일 소스 — UI display fallback과 같은 값이다(복제 금지).
  // 술어는 `redev-field-scope.ts` 단일 소스 — ⑥ 사이드바가 **같은 함수**를 쓴다(C1-05).
  // 종전에는 여기에만 있어 사이드바가 계약 총액을 신고단위 양도가액으로 표시했다.
  const isReceiveOnly = isReceiveOnlyFiling(primary);
  const receiveOnlySettlementAmount = isReceiveOnly ? parseAmount(primary.redevSettlementAmount) : 0;
  const receiveOnlyTransferDate = isReceiveOnly && primary.redevSettlementSaleDate
    ? primary.redevSettlementSaleDate
    : null;

  // 부정합 조합(assetKind="redevelopment_apt" + redevSubject="right") 방어 remap.
  //
  //   - 엔진 `isRedevelopmentActive`(lib/tax-engine/redevelopment.ts:786-789)는 propertyType ↔ subject
  //     1:1 매핑을 요구한다: redevelopment_apt → "apt" / right_to_move_in → "right".
  //     어긋나면 엔진이 일반 양도 분기로 routing돼 redevelopmentDetail 미생성 +
  //     LTHD가 전체 양도차익에 일괄 적용되는 회귀가 난다.
  //
  //   - **양도 대상 축은 2026-08-13(PR #1245)부터 자산 종류가 단독으로 결정한다.**
  //     종전 주석의 「assetKind는 사업 분류이고 redevSubject가 실제 양도 객체」 모델은 폐지됐다.
  //     ① 라디오가 사라졌고 `redevSubjectPatchForAssetKind`가 자산 종류에서 파생하며,
  //     저장값은 `calc-wizard-asset-migrate.ts`가 자산 종류를 승격시켜 흡수한다
  //     (store persist merge · legacy migration · 이력 복원 3경로 모두 `migrateAsset` 경유).
  //     ⇒ 정상 경로에서는 **도달하지 않는다**. 마이그레이션을 거치지 않고 조립된 입력
  //     (직접 fixture 등)만을 위한 안전망으로 남긴다.
  const isRedevelopmentRightTransfer =
    primary.assetKind === "redevelopment_apt" && primary.redevSubject === "right";

  // ④ 비주택 → 주택 용도변경 (§95⑤·⑥ · 시행령 §154⑤ 단서).
  // 술어는 단일 소스 — UI·validation과 같은 함수를 쓴다.
  const usageConversionOn = isUsageConversionActive(primary);
  // §95⑤2호 — 주택으로 보유한 기간 중의 거주기간만 산입한다. 구간 입력이면 여기서 잘라낸다.
  // (`direct` 모드는 시점 정보가 없어 클램프 불가 — 원값 유지 + Step4 안내. 계획 C-10b)
  const residence = clampResidenceToHousingPeriod(
    primary,
    form.transferDate,
    form.residencePeriodMonths,
    usageConversionOn ? primary.residentialUseStartDate : undefined,
  );

  const body = {
    // commercial_building/general_building은 그대로 송신 — 엔진 진입 조건 충족
    // 추가로 서브객체(commercialBuildingValuation/generalBuildingValuation)로 환산취득가 데이터 전달
    propertyType: isMixed
      ? ("mixed-use-house" as const)
      : isRedevelopmentRightTransfer
        ? ("right_to_move_in" as const)
        : (primary.assetKind as "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building" | "general_building" | "redevelopment_apt"),
    transferPrice: isReceiveOnly && receiveOnlySettlementAmount > 0
      ? receiveOnlySettlementAmount
      : isBurdenedGiftPrimary
        ? burdenedGiftPlaceholderTransferPrice
        : primaryFractional
          ? applyRatio(totalContractPrice, primaryRatio)
          : totalContractPrice,
    /** 12억 안분 분모용 총 물건 양도가액 — primary 지분 모드 전용 */
    totalPropertyTransferPrice: primaryFractional ? totalContractPrice : undefined,
    transferDate: receiveOnlyTransferDate || form.transferDate,
    // ⚠️ 지분 안분(`shareOf`)은 **삼항 전체**에 건다 — 갈래별로 붙이면 새 갈래가 규칙을 빠뜨린다(U2-03).
    acquisitionPrice: shareOf(
      // 승계조합원 입주권 — §97①1호 가목 실지거래가액 = 승계취득가 + 취득 후 추가분담금
      // (기준-2025-법규재산-0057). §166 3분할을 타지 않으므로 청산금이 별도 차감되지 않는다.
      // 승계 + **추계**면 실가 2칸을 보내지 않는다 — 엔진이 `appraisalValue ?? acquisitionPrice`
      // 로 후퇴할 때 실가가 남아 있으면 고른 추계값 대신 그것이 취득가액이 된다(R-12).
      isSuccessorRight && !(isEstimated || isAppraisal || isSalesCase)
        ? successorRightAcquisitionTotal(primary)
        : hasPre1990 || isEstimated || isAppraisal || isSalesCase || parcelModeActive
        ? 0
        : isRedevelopment
          ? // 재개발 + 실가 모드 — 두 경로 분기:
            //  · 사례 48 승계조합원(완공APT): 자산 카드 fixedAcquisitionPrice 사용
            //  · 그 외(사례 45/46 원조합원): §166 섹션 내부의 redevActualAcquisitionPrice 사용
            primary.redevIsSuccessorMember === "yes"
              ? parseAmount(primary.fixedAcquisitionPrice)
              : parseAmount(primary.redevActualAcquisitionPrice)
          : parseAmount(primary.fixedAcquisitionPrice),
    ),
    acquisitionDate: parcelModeActive
      ? firstParcelAcqDate
      : primary.acquisitionCause === "carryover_gift"
        ? (primary.acquisitionDate || primary.carryover?.giftRegistryDate || "")
        : primary.acquisitionDate,
    // Round 9 (2026-05-06): 자산-수준 매매계약일 — §99의3 등 13개 매매계약일 기준 조문 시한 판정용
    assetContractDate: primary.assetContractDate || undefined,
    expenses:
      hasPre1990 || isEstimated || isAppraisal || isSalesCase || parcelModeActive
        ? 0
        : primaryFractional
          ? applyRatio(parseAmount(primary.directExpenses), primaryRatio)
          : parseAmount(primary.directExpenses),
    // §97② 단서 swap 분리 입력 — 두 필드가 명시되면 엔진이 swap 비교 수행.
    // 둘 다 0이면 undefined로 보내 swapEligible=false (legacy 동작 유지).
    // 지분 모드: 자본적지출은 100% 기준 입력 → × ratio 자동 적용 (자산별 자체 지출이므로 자산 카드에서 입력)
    // 양도비는 폼-수준 totalTransferExpense에서 자산별 안분 (B3) — primary.transferExpense는 fallback
    capitalExpenditure:
      parcelModeActive ? undefined :
      (parseAmount(primary.capitalExpenditure) || parseAmount(primary.transferExpense))
        ? primaryFractional
          ? applyRatio(parseAmount(primary.capitalExpenditure), primaryRatio)
          : parseAmount(primary.capitalExpenditure)
        : undefined,
    transferExpense:
      parcelModeActive ? undefined :
      (parseAmount(primary.capitalExpenditure) || primaryEffectiveTransferExpense)
        ? primaryEffectiveTransferExpense || undefined
        : undefined,
    // 겸용주택은 calcMixedUseTransferTax 별도 엔진에서 처리 → 일반 환산 검증 우회 위해 false 송신
    // 상업용건물·일반건물 환산 모드는 STEP 0.35 진입 조건이 useEstimatedAcquisition === true 이므로 true 송신
    // 매매사례가액 추계(salesCase)는 useEstimatedAcquisition과 별개 경로 — false 송신
    useEstimatedAcquisition: hasPre1990 || parcelModeActive || isMixed || isSalesCase ? false
      // §163⑨: 상속 상가는 환산 미적용 → false 송신(STEP 0.35 게이트 무력화·엔진 가드와 이중).
      : isCommercialBuilding ? (primary.acquisitionCause === "inheritance" ? false : primary.useEstimatedAcquisition)
      : isGeneralBuilding ? primary.useEstimatedAcquisition
      : isCarryoverGeneral ? true
      : isEstimated,
    standardPriceAtAcquisition: hasPre1990 || usesPhd
      ? undefined
      : isCarryoverGeneral
        ? (parseAmount(primary.carryover?.donorStandardPriceAtAcquisition ?? "") || undefined)
        // 승계 입주권은 §99①2호 가목 → 영 §165①(납입액 + 프리미엄) — **다른 칸**이다 (R-12).
        // 추계 3종 모두 개산공제(§163⑥4호 1%) base로 취득당시 기준시가를 쓴다.
        : isSuccessorRight && (isEstimated || isAppraisal || isSalesCase)
          ? successorRightStdPriceAtAcq(primary) || undefined
        : isEstimated || isSplitActive
          // 분리 모드(토지·건물 취득일/소유자 상이) 추가 전송 — §166⑥ 안분 비율(calcApportionRatio,
          // split-gain.ts:26-36)이 취득시 기준시가 3요소를 요구한다. 종전에는 isEstimated에서만
          // 전송돼, 실거래가·감정·매매사례 분리 모드에서 ratio=null → calcSplitGain 전체가 null →
          // 토지·건물 분리 계산이 **오류 없이 조용히 비활성**됐다(계획서 §3.1, probe 실측).
          ? parseAmount(primary.standardPriceAtAcq) || undefined
          : undefined,
    // pre1990 모드: 취득시 기준시가는 서브엔진(pre1990Land)이 산출하므로 undefined.
    // 양도시 기준시가는 form 입력값(standardPriceAtTransfer)을 그대로 전달 — 서브엔진은 산출하지 않음.
    standardPriceAtTransfer: usesPhd
      ? undefined
      : hasPre1990
        ? parseAmount(primary.standardPriceAtTransfer) || undefined
        : isCarryoverGeneral
          ? (parseAmount(primary.carryover?.donorStandardPriceAtTransfer ?? "") || undefined)
          // 승계 입주권 환산 분모 — §165①(양도일까지 납입액 + 양도일 프리미엄) (R-12).
          // 감정·매매사례는 분모가 필요 없어 보내지 않는다.
          : isSuccessorRight && isEstimated
            ? successorRightStdPriceAtTransfer(primary) || undefined
          : isEstimated
            ? parseAmount(primary.standardPriceAtTransfer) || undefined
            : undefined,
    // ⑬ §164⑧ 동일조정기간 양도당시 기준시가 환산 (소령 §164⑧·소칙 §80①~⑤)
    sameAdjustmentPeriod: buildSameAdjustmentPeriodInput(primary),
    // ⑬ 공익수용 양도당시 기준시가 차감 특례 (소득세법 시행령 §164⑨ 1호)
    ...buildExpropriationInput(primary),
    acquisitionMethod: hasPre1990 || isMixed
      ? ("actual" as const)
      : isSalesCase ? "salesCase"
      : (isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"),
    // 감정·매매사례 모드는 `acquisitionPrice`가 0이고 이 값이 취득가액이 된다 →
    // 총액과 동일하게 지분 스케일을 적용해야 한다(종전 raw → 지분 자산 취득가 과대 = 세액 과소).
    ownershipRatio: ownershipRatioForDeduction,
    appraisalValue: !isMixed && isAppraisal ? (ratioed(primary.fixedAcquisitionPrice) ?? 0) : undefined,
    // ④⑬ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 엔진에 전달
    similarSalesValue: isSalesCase ? ratioed(primary.similarSalesValue) : undefined,
    isSelfBuilt: !isMixed && primary.isSelfBuilt || undefined,
    buildingType: primary.buildingType || undefined,
    constructionDate:
      primary.isSelfBuilt && primary.constructionDate ? primary.constructionDate : undefined,
    extensionFloorArea:
      primary.buildingType === "extension" && primary.extensionFloorArea
        ? parseFloat(primary.extensionFloorArea)
        : undefined,
    extensionStdPriceAtAcquisition:
      primary.buildingType === "extension"
        ? parseAmount(primary.extensionStdPriceAtAcquisition) || undefined
        : undefined,
    // ④⑬ 토지·건물 분리 축 (소령 §166⑥·§168②) — 게이트·파트 필드 전체를 sibling 빌더에 위임.
    ...buildSplitPayload(primary, { isBurdenedGift, usesPhd, ratioed }),
    standardPricePerSqmAtAcquisition:
      primary.standardPricePerSqmAtAcq
        ? parseFloat(primary.standardPricePerSqmAtAcq) || undefined
        : undefined,
    /**
     * 엔진 `acquisitionArea` — **취득 당시 단가에 곱할 면적**이며, 일부양도(`partial`)에서는
     * 취득 전체 면적이 아니라 **양도한 부분의 면적**이다.
     *
     * 근거: 「소득세법 시행령」 제176조의2 제2항 제2호의 "취득당시의 기준시가"는
     * 법 제114조 제7항 문맥상 **양도자산의** 것이고, 일부양도에서는 양도한 부분이 그 자산이다.
     * 조심 2018부0572(2018.05.03, 기각)도 "**각 필지의** 취득 당시 기준시가"를 쓴다.
     *
     * 전체 면적을 넣으면 분자(취득 기준시가)만 과대해져 환산비율이 부풀고 환산취득가가
     * 과대 계상된다 — 면적비가 단가비를 상쇄해 **양도차익이 0이 되는** 사례까지 나온다
     * (anchor `basic-info-building-area.anchor.test.ts` B-4).
     *
     * 두 소비처 모두 양도분을 요구한다:
     *   `transfer-tax-split-gain.ts:52`      토지분 취득 기준시가 = 단가 × 이 면적
     *   `transfer-tax-rate-calc.ts:189`      §154⑦ 한도 비교 대상 = **양도하는** 부수토지 면적
     *
     * ⚠️ 부분별 단가가 다르면(용도지역 상이 등) 사용자가 `standardPricePerSqmAtAcq`에
     *    그 부분의 취득 당시 단가를 입력해야 한다 — 면적비 안분은 단가가 같을 때만
     *    기준시가비 안분과 일치한다(조심 2018부0572는 공시지가가 동일한 사안이었다).
     *
     * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-6 · §3.3 L-4
     */
    acquisitionArea: resolveAcqAreaForStdPrice(primary),
    householdHousingCount: parseInt(form.householdHousingCount) || 0,
    // 사례 36 §89①4호 가목 1세대1입주권 비과세 — 조합원입주권 수 (양도일 현재)
    // right_to_move_in 자산 유형에서만 의미. 기본 "0" fallback.
    householdRightCount: parseInt(form.householdRightCount ?? "0") || 0,
    // 거주기간 — 공용 헬퍼 도출(interval 합산 / direct·form-global fallback). UI 메시지②와 단일 진실.
    // 용도변경 시에는 §95⑤2호 클램프가 적용된 값이다(위 `residence` 참조).
    residencePeriodMonths: residence.months,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    // ④ regionCode — primary 자산 법정동코드(AddressSearch PNU 앞10) 우선, 없으면 form-global fallback.
    // 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정, 미제공 시 isRegulatedArea boolean fallback.
    regionCode: primary.regionCode || form.regionCode || undefined,
    isUnregistered: form.isUnregistered,
    // 「비사업용 **토지**」는 「소득세법」 제104조의3이 **토지**에만 규정한 개념이다.
    // 토글은 `assetKind === "land"`에서만 렌더되는데(Step4.tsx) 종류를 바꿔도 폼 값은 남으므로,
    // 여기서 막지 않으면 **화면에 없는 값이** §104①8호 +10%p 중과를 붙인다(과대과세).
    // 폼 값 자체는 보존한다 — 토지로 되돌리면 그대로 복귀.
    isNonBusinessLand: primary.assetKind === "land" ? (primary.isNonBusinessLand ?? false) : false,
    /**
     * §77 공익수용 감면의 **농어촌특별세 비과세** 판정값(농특세령 §4①1호 괄호).
     * 감면 항목에 붙어 있는 사실을 **자산 수준**으로 올려 보낸다 — 엔진은 감면 유형이 확정된
     * 뒤(STEP 8.8·집계 M-8 후)에 이 값을 보므로 감면 payload 안이 아니라 자산 축이 맞다.
     * 체크하지 않았으면 `undefined`로 둔다(엔진이 「입증되지 않음 = 과세」로 처리한다).
     */
    isSelfCultivatedExpropriatedLand: toSelfCultivatedExpropriatedLand(primary.reductions),
    isSuccessorRightToMoveIn:
      primary.assetKind === "right_to_move_in"
        ? primary.isSuccessorRightToMoveIn
        : undefined,
    acquisitionCause: primary.acquisitionCause,
    // ⑬ Phase 2 (2026-05-12): transferType 패스스루 — TypeScript 미감지 영역 (ui-engine-sync-checker 발견)
    // 부담부증여 분기 활성화에 필수. body에 미포함 시 Zod parse → undefined → 엔진 isBurdenedGiftEngine=false
    // → §159 분기 비활성 → 일반 양도로 잘못 계산됨.
    transferType: primary.transferType || undefined,
    decedentAcquisitionDate:
      primary.acquisitionCause === "inheritance" && primary.decedentAcquisitionDate
        ? primary.decedentAcquisitionDate
        : undefined,
    // §104②1·2호를 **토지 파트**에 적용 (G-4) — 건물과 취득원인이 다른 경우.
    // 원인이 비면 전송하지 않는다: 엔진이 자산 단위 원인을 그대로 쓰도록(회귀 0).
    ...(primary.landAcquisitionCause
      ? {
          landAcquisitionCause: primary.landAcquisitionCause,
          ...(primary.landAcquisitionCause === "inheritance" && primary.landDecedentAcquisitionDate
            ? { landDecedentAcquisitionDate: primary.landDecedentAcquisitionDate }
            : {}),
          ...(primary.landAcquisitionCause === "gift" && primary.landDonorAcquisitionDate
            ? { landDonorAcquisitionDate: primary.landDonorAcquisitionDate }
            : {}),
        }
      : {}),
    // ⑬ 비주택 → 주택 용도변경 §95⑤·⑥ — 미정의 시 침묵 stripping 방지를 위해 명시 선언.
    // `residenceMonthsTrimmed`는 결과 화면 절사 안내 전용이며 계산에는 쓰이지 않는다.
    nonHousingToHousingConversion: usageConversionOn
      ? {
          residentialUseStartDate: primary.residentialUseStartDate,
          residenceMonthsTrimmed: residence.trimmed,
        }
      : undefined,
    // §154⑧3호 상속주택 자체 양도 보유기간 통산
    decedentSameHouseholdBeforeInheritance:
      primary.acquisitionCause === "inheritance"
        ? primary.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationHoldingStartDate:
      primary.acquisitionCause === "inheritance" && primary.decedentCohabitationHoldingStartDate
        ? primary.decedentCohabitationHoldingStartDate
        : undefined,
    decedentCohabitationResidenceMonths:
      primary.acquisitionCause === "inheritance" && primary.decedentSameHouseholdBeforeInheritance
        ? parseInt(primary.decedentCohabitationResidenceMonths) || 0
        : undefined,
    donorAcquisitionDate:
      primary.acquisitionCause === "gift" && primary.donorAcquisitionDate
        ? primary.donorAcquisitionDate
        : undefined,
    isOneHousehold: form.isOneHousehold,
    reductions,
    annualBasicDeductionUsed: parseAmount(form.annualBasicDeductionUsed),
    // ⑬ §133 5년 누적 한도 — 과거 4개 과세연도 감면 이력 (TypeScript 미감지 영역 — 누락 시 침묵 stripping)
    priorReductionUsage: form.priorReductionUsage ?? [],
    // ⑬ P5 모드 2 — 보유 감면주택 주택수 제외 (행: article·취득일 입력분만 전달)
    specialHouseExclusions: (form.specialHouseExclusions ?? [])
      .filter((e) => e.article)
      .map((e) => ({
        article: e.article,
        houseAcquisitionDate: e.houseAcquisitionDate || undefined,
        houseContractDate: e.houseContractDate || undefined,
        isNationalHousing: e.isNationalHousing,
        requirementsConfirmed: e.requirementsConfirmed,
      })),
    // ④⑬ §155⑤ 일시적 2주택 · §155⑧ 수도권 밖 부득이 · §155⑦ 농어촌주택 (body-blocks로 분리)
    ...buildHouseholdSpecialPayload(form, primary),
    // ④⑬ §156의2⑤ 대체주택 비과세 특례 FLAT → nested (helpers로 분리, 800줄 정책)
    ...buildReplacementHousePayload(form),
    ...buildRightThreeYearExceptionPayload(form),
    ...buildMergedHouseholdFirstHousePayload(form),
    ...(nblRaw ? { nonBusinessLandRaw: nblRaw } : {}),
    ...(housesPayload ? { houses: housesPayload, sellingHouseId: "selling" } : {}),
    ...(presaleRightsPayload ? { presaleRights: presaleRightsPayload } : {}),
    ...(form.marriageDate ? { marriageMerge: { marriageDate: form.marriageDate } } : {}),
    ...(form.parentalCareMergeDate
      ? { parentalCareMerge: { mergeDate: form.parentalCareMergeDate } }
      : {}),
    ...(form.isFirstTransferredInMerge ? { isFirstTransferredInMerge: true } : {}),
    ...(form.generalHouseGiftedFromDecedentWithin2yr ? { generalHouseGiftedFromDecedentWithin2yr: true } : {}),
    // ⑬ §156의2⑥·⑦ · §156의3④·⑤ 상속 권리 예외 축 — 긍정 선언·⑮ 선택
    ...(form.generalHouseHeldAtInheritance ? { generalHouseHeldAtInheritance: true } : {}),
    ...(form.inheritedRightChoiceWhenBothHeld
      ? { inheritedRightChoiceWhenBothHeld: form.inheritedRightChoiceWhenBothHeld }
      : {}),
    ...(() => {
      // §154① 단서 reason 정규화 — 카드 숨김(mode=null)·temp-two-house 무효 reason(나·다목·5호)은 미전송 (Part D 게이트, mirror)
      const provisoMode = provisoGate({
        isOneHousehold: form.isOneHousehold,
        isHousing: primary.assetKind === "housing",
        householdHousingCount: form.householdHousingCount,
        temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
      }).mode;
      const reason = effectiveProvisoReason(provisoMode, form.provisoReason);
      return reason
        ? {
            oneHouseExemptionProviso: {
              reason,
              ...(form.provisoDepartureDate ? { departureDate: form.provisoDepartureDate } : {}),
              ...(form.provisoExpropriationDate ? { expropriationDate: form.provisoExpropriationDate } : {}),
              ...(form.provisoBusinessApprovalDate ? { businessApprovalDate: form.provisoBusinessApprovalDate } : {}),
            },
          }
        : {};
    })(),
    // ⑬ 다주택 중과 한시 유예 — houses 제공 시에만 엔진이 소비 (form-global gracePeriod)
    ...(housesPayload && form.gracePeriod ? { gracePeriod: form.gracePeriod } : {}),
    ...buildPenaltyAmendmentPayload(form),
    // ⑬ 다필지(§114⑦) — 필지별 페이로드 조립은 `transfer-tax-api-parcels.ts`로 분리(2026-08-23, 800줄 정책).
    ...(parcelModeActive
      ? { parcels: buildParcelsPayload(primary.parcels, primaryFractional, primaryRatio) }
      : {}),
    ...buildPreHousingDisclosurePayload(primary, isMixed),
    // ── landNature (토지 자산 성격 — 부수토지 vs 독립 나대지) ──
    // 폼 enum("appurtenant"/"standalone") → 엔진 enum("appurtenant_to_housing"/"non_appurtenant") 변환.
    // undefined이면 엔진에 전달하지 않음.
    ...(primary.assetKind === "land" && primary.landNature !== undefined
      ? {
          landNature:
            primary.landNature === "appurtenant"
              ? ("appurtenant_to_housing" as const)
              : ("non_appurtenant" as const),
        }
      : {}),
    // ⑬ 상업용건물·오피스텔 환산취득가 서브객체 (TypeScript 미감지 — 명시 spread 필수)
    // cbValuation === undefined 이면 키 자체를 포함하지 않음 (Zod optional 통과)
    ...(cbValuation !== undefined ? { commercialBuildingValuation: cbValuation } : {}),
    // ⑬ 상업용건물 부수토지 초과분 판정 (TypeScript 미감지 — 누락 시 침묵 stripping)
    ...(cbAppurtenantLand !== undefined ? { commercialAppurtenantLand: cbAppurtenantLand } : {}),
    // ⑬ 일반건물 환산취득가 body spread (TypeScript 미감지 영역 — 누락 시 서브객체 미도달)
    ...(gbValuation !== undefined ? { generalBuildingValuation: gbValuation } : {}),
    // ⑬ 부담부증여 body spread (TypeScript 미감지 영역 — 누락 시 침묵 stripping)
    ...(bgInfo !== undefined ? { burdenedGiftInfo: bgInfo } : {}),
    // ⑬ 재개발/재건축 spread (시행령 §166) — 누락 시 silent stripping
    ...(redevPayload !== undefined ? { redevelopment: redevPayload } : {}),
    // ⑬ 가업상속공제 §97의2④ 의제 취득가액 spread (TypeScript 미감지 영역 — 누락 시 침묵 stripping)
    ...(primary.familyBusinessInheritance !== undefined
      ? { familyBusinessInheritance: primary.familyBusinessInheritance }
      : {}),
    /**
     * ⑬ 일반건물 × 지분 분할 — 전용 배열. 존재하면 route가 5-a보다 앞에서 가로챈다.
     * 누락 시 침묵 stripping (TypeScript 미감지 영역).
     */
    ...(gbShares !== undefined ? { generalBuildingShares: gbShares } : {}),
    // ── 일괄양도 (assets 2건 이상) ──
    //
    // 🔴 **지분 분할 일반건물은 제외**한다. 이 블록을 함께 보내면 `totalSalePrice`+`companionAssets`로
    //    route의 `bundledOk`가 참이 되는데, 새 분기가 앞에 있어 도달하지는 않더라도
    //    payload에 **두 개의 서로 다른 계산 지시**가 실리는 모순 상태가 된다.
    //    companion 경로를 아예 쓰지 않는 것이 이 설계의 회귀 0 근거다(설계 D1-1).
    ...(form.assets.length > 1 && gbShares === undefined
      ? {
          totalSalePrice: parseAmount(form.contractTotalPrice),
          standardPriceAtTransferForApportion:
            parseAmount(primary.standardPriceAtTransfer) > 0
              ? parseAmount(primary.standardPriceAtTransfer)
              : undefined,
          primaryInheritanceValuation:
            primary.acquisitionCause === "inheritance"
              ? {
                  inheritanceDate: primary.acquisitionDate,
                  // 보충적평가 자산 구분 — 상단 assetKind 기준 파생(land vs 非land; housing은 개별/공동).
                  // 상속 자산구분 라디오 폐지 대응(deriveEngineInheritanceAssetKind). 결과는 schema enum 값.
                  assetKind: deriveEngineInheritanceAssetKind(primary),
                  landAreaM2: primary.acquisitionArea ? parseFloat(primary.acquisitionArea) : undefined,
                  // 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
                  publishedValueAtInheritance: primaryFractional
                    ? applyRatio(parseAmount(primary.publishedValueAtInheritance), primaryRatio)
                    : parseAmount(primary.publishedValueAtInheritance),
                }
              : undefined,
          companionAssets: form.assets
            .slice(1)
            // 지분 모드(같은 물건 분할취득): companion ① 기본정보를 UI에서 숨기므로
            // primary basic(자산종류·면적·토지성격)을 병합해 엔진에 전달 (mergePrimaryBasic).
            .map((a) => buildAssetPayload(fractionalBundleMerge ? mergePrimaryBasic(a, primary) : a, form.assets.some((x) => x.isReplotIncrement) ? "apportioned" : form.bundledSaleMode, form.transferDate, totalContractPrice, formTotalTransferExpense || undefined, form.assets[0], form.isOneHousehold)),
          bundledSaleMode: form.bundledSaleMode,
          // primary 확정 양도가액.
          //  - 지분 모드: 총계약가 × ratio 자동 결정 (bundledSaleMode 무관, actualSalePrice 무시 —
          //    companion buildAssetPayload:428 정책과 일관). route가 fixedSalePrice로 주입해
          //    기준시가 안분 없이 지분율 안분 성립.
          //  - actual 모드(비지분): 계약서상 양도가액.
          //  - apportioned 비지분: undefined (양도시 기준시가 비율 안분).
          primaryActualSalePrice: primaryFractional
            ? applyRatio(totalContractPrice, primaryRatio)
            : form.bundledSaleMode === "actual" && primary.actualSalePrice
              ? parseAmount(primary.actualSalePrice)
              : undefined,
        }
      : {}),
    // ── 상속 취득가액 의제 (소령 §176조의2 ④ pre-deemed / §163 ⑨ post-deemed) — sibling 격리 ──
    ...buildInheritedAcquisitionPayload(primary, primaryRatio, primaryFractional),
    // ── 상속 주택 환산취득가 보조 입력 (3-시점, < 2005-04-30) — sibling 격리 ──
    ...buildInheritedHouseValuationPayload(primary, form.transferDate),
    // ── 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 (< 2005-01-01, §163⑨2호 max) — sibling 격리 ──
    ...buildCommercialInheritanceValuationPayload(primary),
    // ── 1990.8.30. 이전 취득 토지 기준시가 환산 (자산-수준 필드 사용, 단건·다건 공용 헬퍼) ──
    // ⑬ pre1990 토지등급 — 환산 모드(`hasPre1990`)뿐 아니라 §163⑨1호 ②(가목) 산출에도 필요하다.
    //    `hasPre1990ForSec164`는 override를 켜지 않고 payload만 공급한다(G-1 입력 계층 분리).
    ...(hasPre1990 || hasPre1990ForSec164
      ? buildPre1990LandPayload(primary, form.transferDate)
      : {}),
    // 겸용주택 분리계산 입력
    ...(mixedUsePayload ? { mixedUse: mixedUsePayload } : {}),
    // 배우자등 이월과세 (§97조의2)
    ...(primary.acquisitionCause === "carryover_gift" && primary.carryover
      ? (() => {
          const payload = buildCarryoverPayload(primary, form.transferDate, primaryRatio);
          return payload ? { carryoverTaxation: payload.carryoverTaxation } : {};
        })()
      : {}),
    // ⑬ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 토글 OFF 시 undefined, body에서 제외
    ...((() => {
      const rhPayload = toRentalHousingExceptionApi(primary);
      return rhPayload ? { rentalHousingException: rhPayload } : {};
    })()),
    ...buildNewConstructionPayload(primary),
  };

  const res = await fetch("/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
    const fieldErrors = json?.error?.fieldErrors as
      | Record<string, string[]>
      | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      const { logFieldErrorsResponse } = await import("./transfer-tax-api-error-log");
      logFieldErrorsResponse(fieldErrors, json, body);
      const { formatFieldErrors } = await import("./transfer-tax-error-format");
      throw new Error(formatFieldErrors(fieldErrors, msg));
    }
    const { logNoFieldErrorsResponse } = await import("./transfer-tax-api-error-log");
    const detailedMsg = logNoFieldErrorsResponse(json, res, body) ?? msg;
    throw new Error(detailedMsg);
  }
  return json.data as TransferAPIResult;
}

// 거주요건 판정 입력 빌드 — transfer-tax-api-residence.ts로 격리 (800줄 정책)
export { buildResidenceReqInput } from "./transfer-tax-api-residence";
