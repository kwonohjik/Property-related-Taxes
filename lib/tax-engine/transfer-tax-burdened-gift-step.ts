/**
 * STEP 0.48 — 부담부증여 §159 (Phase 2/F-1/F-2) step 모듈
 *
 * transfer-tax.ts 800줄 정책 분리 (P5, 2026-06-12). 로직 무변경 이전:
 * transferType OR legacy + propertyType 4종 + overshoot fail-fast + 5-a 해석 B + 케이스 12 안내.
 */

import { buildBurdenedGiftBreakdown, assertBurdenedGiftEligible } from "./burdened-gift-apportionment";
import {
  MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE,
  bgParenthesisEraNotice,
  apportionAcquisitionPrice,
  scaleBurdenedGiftInfo,
} from "./burdened-gift-valuation";
import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { BURDENED_GIFT_TRANSFER } from "./legal-codes/burdened-gift";
import { calculateBuildingPenalty } from "./transfer-tax-building-penalty";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

export function runBurdenedGiftStep(
  rawInput: TransferTaxInput,
  workingInputIn: TransferTaxInput,
  steps: CalculationStep[],
): { breakdown?: TransferBurdenedGiftBreakdown; workingInput: TransferTaxInput; notices: string[] } {
  let workingInput = workingInputIn;
  let transferBurdenedGiftBreakdown: TransferBurdenedGiftBreakdown | undefined;
  const notices: string[] = [];
  const isBurdenedGiftEngine =
    rawInput.transferType === "burdened_gift" ||
    rawInput.acquisitionCause === "burdened_gift";
  if (isBurdenedGiftEngine && rawInput.burdenedGiftInfo) {
    // Phase 2 게이트 — propertyType 허용 범위·overshoot fail-fast·고가주택 후속 PR 차단
    // 공유지분 — §159의 A·C를 지분분으로 축소(scaleBurdenedGiftInfo). 채무는 사용자 입력분 그대로.
    const ownershipRatio = rawInput.ownershipRatio;
    assertBurdenedGiftEligible({
      propertyType: workingInput.propertyType,
      isOneHousehold: workingInput.isOneHousehold,
      info: rawInput.burdenedGiftInfo,
      ownershipRatio,
    });
    // 재개발·재건축 완공 아파트(원조합원)의 취득가액은 종전 부동산의 취득가액이다 — 영 §166③이 확인 불가 시를 환산식으로 직접 정하고(조합원입주권과 같은 근거),
    // 같은 조 ④2호의 매매사례가액·감정가액은 「평가액」 산정용이다. §166 경로는 이 방식을 읽지 않아 필요경비도 개산공제로 바뀌지 않는다(실측: 실지와 같은 값). 승계조합원은 §166 밖이라 막지 않는다.
    if (
      workingInput.propertyType === "redevelopment_apt" &&
      rawInput.redevelopment?.isSuccessorMember !== true &&
      (rawInput.burdenedGiftInfo.acquisitionMethod === "appraisal" || rawInput.burdenedGiftInfo.acquisitionMethod === "salesCase")
    ) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "[burdened_gift] 재개발·재건축 완공 아파트의 취득가액은 종전 부동산(기존건물과 그 부수토지)의 취득가액이라 매매사례가액·감정가액을 쓸 수 없습니다 — " +
          "「소득세법 시행령」 제166조 제3항은 그 취득가액을 확인할 수 없는 경우를 기준시가 환산식으로 직접 정하고, 같은 조 제4항 제2호의 매매사례가액·감정가액은 " +
          "취득가액이 아니라 기존건물과 그 부수토지의 「평가액」(관리처분계획등 인가일 전후) 산정에 쓰입니다. 취득가액 산정방식을 「실지취득가액」으로 선택하세요.",
      );
    }
    transferBurdenedGiftBreakdown = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: rawInput.burdenedGiftInfo.landStdPriceAtTransfer,
      buildingStdPriceAtTransfer: rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer,
      landStdPriceAtAcquisition: rawInput.burdenedGiftInfo.landStdPriceAtAcquisition,
      buildingStdPriceAtAcquisition: rawInput.burdenedGiftInfo.buildingStdPriceAtAcquisition,
      info: rawInput.burdenedGiftInfo,
      giftDate: rawInput.transferDate, // Phase 2 — 증여일 = 양도일
      // K-4(실지취득가) 실비: 채무비율 안분 후 estimatedDeduction 슬롯에 반영
      // (workingInput.capitalExpenditure는 중복 방지 위해 undefined 유지).
      capitalExpenditure: rawInput.capitalExpenditure,
      transferExpense: rawInput.transferExpense,
      // §104③ 미등기양도자산 — 개산공제율 0.3% (소령 §163⑥1호 단서). transfer 미등기 토글 재사용. (H-25)
      isUnregistered: rawInput.isUnregistered,
      ownershipRatio,
    });
    /**
     * 재개발·재건축 완공 아파트(원조합원) × 시가 모드 × 환산(K-5) — 취득가액은 **종전 부동산**(기존건물과 그 부수토지)의 취득가액이고,
     * 그것을 확인할 수 없으면 「소득세법 시행령」 제166조 제3항의 환산식(평가액 × 취득일 기준시가 ÷ 관리처분계획등 인가일 기준시가)을 쓴다.
     * 필요경비는 같은 조 ①1호 「§97①2·3호 **또는** §163⑥」 — 환산이면 개산공제다.
     * ⇒ 위 §159 명세의 일반 환산(§176의2②2호 — 신축주택 기준시가 비율)은 이 자산에 쓰지 않고, §166 경로의 §166③ 분기를 켠다
     *   (`redevelopment-split.ts` Step A·B). 평가액은 β로 채무비율만큼 줄어 들어가므로 §166③ 결과도 §159①1호 안분값이 된다.
     * 승계조합원은 §166 밖이라 해당 없다.
     */
    const redevSec166Conversion =
      workingInput.propertyType === "redevelopment_apt" &&
      rawInput.redevelopment !== undefined &&
      rawInput.redevelopment.isSuccessorMember !== true &&
      transferBurdenedGiftBreakdown.acquisitionMethodUsed === "converted";
    const land = transferBurdenedGiftBreakdown.perAsset.land;
    const building = transferBurdenedGiftBreakdown.perAsset.building;
    const totalTransferPrice = land.transferPrice + building.transferPrice;
    const totalAcquisitionPrice = land.acquisitionPrice + building.acquisitionPrice;
    const totalEstimatedDeduction = land.estimatedDeduction + building.estimatedDeduction;
    // override: §159 산정값으로 본 계산 진행 (§114⑦ 환산경로와 분리).
    // F-1: burdenedGiftDenominator = giftValuation C — 12억 안분 해석 B 분모.
    // §114조의2: K-5(환산취득가) + 신축·증축 시 건물분 환산취득가(채무비율 안분 후)를
    // penalty base로 신호. estimatedBase·usedEstimatedAcquisition은 finalize STEP 10.5가
    // 읽는 penalty 전용 신호이며, 본 양도차익은 위 §159 안분값(useEstimatedAcquisition:false)으로 계산.
    // 발동 게이트(5년·85㎡·acquisitionMethod=estimated)는 calculateBuildingPenalty가 최종 판정.
    // 환산취득가액을 실제로 쓴 경우만 — 시가 평가인데 담보평가가 이겨 취득가액이 기준시가로 강제되면(1h-G1-2) 환산 가산세 신호를 세우지 않는다.
    // §114조의2 × 감정가액(K-7): 감정가액으로 신축·증축 건물 취득가액을 산정하면 5년 이내 양도 시 **건물 감정가액**의 5%가
    // 결정세액에 더해진다. 발동 조건(5년·2020.1.1 게이트·증축 85㎡)은 통상 경로의 단일 소스 `calculateBuildingPenalty`가 판정한다.
    // 신호는 `penaltyAxis`(일반건물 카드와 같은 파트-국소 축)로 싣는다 — `acquisitionMethod: "appraisal"`로 바꿔 싣지 않는 이유는
    // `calcTransferGain` 감정 분기가 §159 안분 취득가액을 `appraisalValue`로 덮어쓰기 때문이다(아래 acquisitionMethod 주석).
    // base = 채무비율 안분 **후** 건물 감정가액 (K-5의 `estimatedBase`와 같은 기준 — 계획서 §2.2의 「강한 해석」).
    // 매매사례가액은 조문(「감정가액 또는 환산취득가액」)에 없어 대상이 아니다.
    // 증축은 base가 「증축한 부분에 한정한 감정가액」이라 `presumedExtensionAppraisalValue`(물건 전체 기준·채무 안분 전)를 따로 받는다.
    // 건물 전체 감정가액으로 대신하면 과대부과라 미입력은 오류다. base = 입력값 × 채무비율(신축·K-5 증축과 같은 「안분 후」 기준 —
    // 계획서 docs/00-pm/burdened-gift-appraisal-extension-penalty.plan.md §2). 85㎡ 이하·5년 초과·2020 이전이면 대상이 아니라 읽지 않는다.
    const isAppraisalSelfBuilt =
      transferBurdenedGiftBreakdown.acquisitionMethodUsed === "appraisal" && rawInput.isSelfBuilt === true;
    let extensionAppraisalPenaltyBase: number | undefined;
    if (
      isAppraisalSelfBuilt &&
      rawInput.buildingType === "extension" &&
      calculateBuildingPenalty({ ...rawInput, acquisitionMethod: "appraisal" }, 1) !== null
    ) {
      const bgInfo = rawInput.burdenedGiftInfo;
      const extensionAppraisal = bgInfo.presumedExtensionAppraisalValue ?? 0;
      if (extensionAppraisal <= 0) {
        throw new TaxCalculationError(
          TaxErrorCode.INVALID_INPUT,
          "[burdened_gift] 건물을 증축하고 5년 이내에 양도하면서 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 " +
            "증축한 부분의 감정가액에 5% 가산세가 붙으므로 증축한 부분의 감정가액을 입력해야 합니다. " +
            "건물 전체 감정가액으로 대신할 수 없습니다(증축한 부분에 한정한 금액이 기준입니다).",
        );
      }
      // 부분이 전체를 넘을 수 없다 — 분리 입력이면 건물 감정가액, 총액 입력이면 총액(건물 몫은 기준시가 비율 분배라 그 파생값과는 비교하지 않는다).
      const isSplitInput =
        bgInfo.presumedLandAcquisitionPrice !== undefined || bgInfo.presumedBuildingAcquisitionPrice !== undefined;
      const extensionCap = isSplitInput
        ? (bgInfo.presumedBuildingAcquisitionPrice ?? 0)
        : (bgInfo.presumedAcquisitionTotal ?? 0);
      if (extensionAppraisal > extensionCap) {
        throw new TaxCalculationError(
          TaxErrorCode.INVALID_INPUT,
          isSplitInput
            ? `[burdened_gift] 증축한 부분의 감정가액이 건물 감정가액(${extensionCap.toLocaleString()}원)보다 클 수 없습니다.`
            : `[burdened_gift] 증축한 부분의 감정가액이 감정가액 총액(${extensionCap.toLocaleString()}원)보다 클 수 없습니다.`,
        );
      }
      extensionAppraisalPenaltyBase = apportionAcquisitionPrice(
        scaleBurdenedGiftInfo(bgInfo, rawInput.ownershipRatio).presumedExtensionAppraisalValue ?? 0,
        transferBurdenedGiftBreakdown.assumedDebtAmount,
        transferBurdenedGiftBreakdown.sangjeungbeopValuation.max,
      );
    }
    const isK5SelfBuilt =
      rawInput.burdenedGiftInfo.acquisitionMethod === "converted" &&
      transferBurdenedGiftBreakdown.acquisitionMethodUsed === "converted" &&
      rawInput.isSelfBuilt === true;
    // §114조의2① 증축: penalty base를 증축부분 한정 환산취득가로 교체 (건물 전체 base 과대부과 방지).
    // 증축부분 환산취득가 = 채무안분 건물양도가 × (증축부분 취득기준시가 ÷ 양도시 건물 기준시가).
    // 기존 환산취득가 헬퍼 재사용(single-source) — 통상 양도 경로와 동일 산식.
    const extensionPenaltyBase =
      isK5SelfBuilt &&
      rawInput.buildingType === "extension" &&
      (rawInput.extensionStdPriceAtAcquisition ?? 0) > 0 &&
      rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer > 0
        ? calculateEstimatedAcquisitionPrice(
            building.transferPrice,
            rawInput.extensionStdPriceAtAcquisition!,
            rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer,
          )
        : undefined;
    workingInput = {
      ...workingInput,
      transferPrice: totalTransferPrice,
      acquisitionPrice: totalAcquisitionPrice,
      expenses: totalEstimatedDeduction,
      capitalExpenditure: undefined,
      transferExpense: undefined,
      // §97③ 감가상각비는 부담부증여에서 미지원(Phase C) — §159 안분 취득가액에서 또 빼지 않는다. ⑧ validate가 먼저 막는다.
      depreciationAmount: undefined,
      // 재개발 완공 아파트 × K-5만 §166③ 환산 분기를 켠다(위 `redevSec166Conversion`). 그 밖은 §159 안분값을 그대로 쓴다.
      useEstimatedAcquisition: redevSec166Conversion,
      // §159 안분 취득가액을 **그대로** 쓴다는 신호. 부담부증여 UI는 일반 산정방식(환산·감정·매매사례)을
      // 숨기되 폼 상태는 보존하므로(CompanionAcqPurchaseBlock.tsx:338-341 — 재토글 복원) stale 값이 흘러든다.
      // 위 useEstimatedAcquisition:false는 **환산 분기만** 막고 acquisitionMethod 분기(helpers.ts:331·339)는
      // 무방비였다 → appraisalValue/similarSalesValue가 §159 안분값을 덮어써 과소납부.
      // 안분값은 buildBurdenedGiftBreakdown이 burdenedGiftInfo.acquisitionMethod(실지/환산)를 반영한 최종값이라
      // "actual"이 정확하다. 개산공제는 expenses로 별도 전달되어 이중 적용 없음.
      // ⚠️ 아래 isK5SelfBuilt spread가 "estimated"로 덮어쓴다(§114조의2 penalty 신호) — 의도된 순서, 재정렬 금지.
      // 계획서: docs/02-design/features/burdened-gift-stale-acquisition-method.plan.md
      acquisitionMethod: "actual" as const,
      // 12억 고가주택 판정·안분 분모.
      //   단독: 현행 그대로 C(= max) — 국세청 해석례 5건 기반 해석 B 유지.
      //   지분: 소령 §156① 문언대로 «지분 증여가액 ÷ 지분율» (1h-G1-14 · 결정 #28 A). 지분분 C를 그대로 쓰면 문턱이
      //         1/지분율만큼 올라 24억 물건의 1/2 지분이 비과세로 빠지고(A4/#849), 물건 전체 보충적평가액만 쓰면 담보·임대가
      //         이기는 지분이 더 낮게 판정된다. 보충적평가가 이기면 물건 전체 보충적평가액과 같다.
      burdenedGiftDenominator:
        transferBurdenedGiftBreakdown.fractionalHighValueDenominator ??
        transferBurdenedGiftBreakdown.sangjeungbeopValuation.max,
      // 신축은 건물 전체 감정가액의 안분값, 증축은 증축한 부분 감정가액의 안분값(대상 조합일 때만 위에서 채워진다).
      // 증축인데 대상이 아니면(85㎡ 이하·5년 초과) `calculateBuildingPenalty`가 어차피 null이라 base를 싣지 않아도 같다.
      ...(isAppraisalSelfBuilt && rawInput.buildingType !== "extension"
        ? { penaltyAxis: { acquisitionMethod: "appraisal" as const, base: building.acquisitionPrice } }
        : {}),
      ...(extensionAppraisalPenaltyBase !== undefined
        ? {
            penaltyAxis: { acquisitionMethod: "appraisal" as const, base: extensionAppraisalPenaltyBase },
            // 85㎡ 게이트(`calculateBuildingPenalty`)가 읽는 신호 — 신축 분기와 달리 spread에 의존하지 않고 명시 전달
            buildingType: rawInput.buildingType,
            extensionFloorArea: rawInput.extensionFloorArea,
          }
        : {}),
      ...(isK5SelfBuilt
        ? {
            acquisitionMethod: "estimated" as const,
            usedEstimatedAcquisition: true,
            // 증축: 증축부분 한정 base / 신축: 건물 전체 환산취득가 (기존 동작)
            //
            // 🔑 §97②2호 **단서**(W-6)가 발동하면 `building.acquisitionPrice`는 **0**이 된다
            //    (나목이 필요경비 전체 — 환산취득가액 별도 차감 금지). 그러나 §114조의2 가산세는
            //    「**환산취득가액을 썼다는 사실**」에 붙는 것이라 base가 0이 되면 안 된다
            //    ⇒ 스왑 전 값을 보존한 `convertedAcquisitionBeforeSwap`을 우선한다.
            estimatedBase:
              extensionPenaltyBase ??
              transferBurdenedGiftBreakdown.convertedAcquisitionBeforeSwap?.building ??
              building.acquisitionPrice,
            // 85㎡ 게이트(rate-calc)가 읽는 신호 — spread 의존 제거용 명시 전달(안전 강화)
            buildingType: rawInput.buildingType,
            extensionFloorArea: rawInput.extensionFloorArea,
          }
        : {}),
    };
    steps.push({
      label: "부담부증여 양도차익 산정 (소령 §159)",
      formula:
        `양도가 = 인수채무 ${transferBurdenedGiftBreakdown.assumedDebtAmount.toLocaleString()} ` +
        `(${transferBurdenedGiftBreakdown.sangjeungbeopValuation.selectedMode} 평가 ${transferBurdenedGiftBreakdown.sangjeungbeopValuation.max.toLocaleString()} 중 ` +
        `${(transferBurdenedGiftBreakdown.debtRatio * 100).toFixed(4)}% 안분)`,
      amount: totalTransferPrice,
      legalBasis: BURDENED_GIFT_TRANSFER.VALUATION_159,
    });
    // 다주택 중과 한시 배제 적용 고지는 중과 판정이 끝난 뒤 `transfer-tax.ts`가 붙인다(1h-G1-11 — 유예가 실제 적용된 결과에서만).
    // 양도일 당시 괄호에 그 평가 조문이 없었으면 시기 안내가 시가 모드 담보 승 안내를 대신한다 — 그 안내의 「괄호에 따라」가 그 시기엔 맞지 않는다.
    const eraNotice = bgParenthesisEraNotice(
      transferBurdenedGiftBreakdown.acquisitionMethodUsed,
      transferBurdenedGiftBreakdown.sangjeungbeopValuation.selectedMode,
      rawInput.transferDate,
    );
    if (eraNotice) notices.push(eraNotice);
    else if (transferBurdenedGiftBreakdown.acquisitionStdForcedByCollateral) notices.push(MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE);
  }
  return { breakdown: transferBurdenedGiftBreakdown, workingInput, notices };
}
