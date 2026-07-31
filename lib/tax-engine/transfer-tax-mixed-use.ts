/**
 * 겸용주택(1세대 1주택 + 상가) 양도소득세 분리계산 오케스트레이터
 *
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분:
 *   주택연면적 ≥ 상가연면적이라도 주택부분/상가부분/비사업용토지 강제 분리.
 *
 * 설계 문서: docs/02-design/features/transfer-tax-mixed-use-house.engine.design.md
 */

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "./transfer-tax-helpers";
import { calculateHoldingPeriod } from "./tax-utils";
import {
  meetsOneHouseHoldingResidence,
  resolveDeemedOneHouseBy155,
} from "./transfer-tax-exemption";
import { determineMultiHouseSurcharge } from "./multi-house-surcharge";
import { resolveSurchargeAddonRate } from "./data/multi-house-surcharge-rate-history";
import type { MixedUseRatePart } from "./transfer-tax-mixed-use-totals";
import { computeAmendment } from "./transfer-tax-amendment";
import type { AmendmentInput } from "./types/transfer-amendment.types";
import { MIXED_USE } from "./legal-codes/transfer";
import type {
  MixedUseAssetInput,
  MixedUseGainBreakdown,
  MixedUseApportionment,
  MixedUseStep,
  MixedUseCalculationRoute,
} from "./types/transfer-mixed-use.types";
import {
  computeDerivedAreas,
  computeAcqDerivedAreas,
  apportionTransferPrice,
  apportionAcquisitionPrice,
  calcHousingEstimatedAcq,
  calcHousingGainSplit,
  calcCommercialGainSplit,
  calcExcessLandRatio,
  buildHousingPart,
  buildCommercialPart,
  buildNonBusinessPart,
  buildTotalTax,
} from "./transfer-tax-mixed-use-helpers";
import {
  calcUsagePeriodInfo,
  applyUsagePeriodSplit,
} from "./transfer-tax-mixed-use-period-split";

// ──────────────────────────────────────────
// 상수
// ──────────────────────────────────────────

const MIXED_USE_EFFECTIVE_DATE = new Date("2022-01-01");

// ──────────────────────────────────────────
// 메인 함수
// ──────────────────────────────────────────

/**
 * 겸용주택 분리계산 메인 함수.
 *
 * @param transferPrice - 총 양도가액 (원)
 * @param transferDate  - 양도일
 * @param asset         - 겸용주택 자산 입력
 * @param rates         - Supabase에서 preload된 세율 맵
 * @param amendment     - 수정신고·경정청구 (국세기본법 §45·§45의2). 신고서 단위(폼-전역) — 자산-수준 아님.
 *                        미전달 시 기존 경로 불변. 2022.1.1 이전 양도(거부) 경로에는 부착하지 않음.
 */
export function calcMixedUseTransferTax(
  transferPrice: number,
  transferDate: Date,
  asset: MixedUseAssetInput,
  rates: TaxRatesMap,
  amendment?: AmendmentInput,
): MixedUseGainBreakdown {
  // STEP 1: 2022.1.1 이전 양도일 거부
  if (transferDate < MIXED_USE_EFFECTIVE_DATE) {
    return buildRejectionResult(
      "2022.1.1 이전 양도분은 겸용주택 분리계산 범위 외입니다. 단일 자산 모드로 재계산하세요.",
    );
  }

  const warnings: string[] = collectWarnings(asset);
  const steps: MixedUseStep[] = [];

  // 누진세율 brackets + 기본공제 한도 (DB 세율)
  const {
    brackets,
    basicDeductionRules,
    oneHouseSpecialRules,
    // §104⑦ 다주택 중과 판정용 — `houseCountExclusionRules`는 **optional**이다(DB 키 부재 시 undefined).
    houseCountExclusionRules,
    surchargeSpecialRules,
    regulatedAreaHistory,
  } = parseRatesFromMap(rates);

  // ── 영 §154① 본문 — 1세대1주택 비과세 **보유 2년** 요건 ─────────────────────────
  // 「소득세법」 제89조 제1항 제3호 가목이 위임한 같은 법 시행령 제154조 제1항 본문:
  //   "…해당 주택의 **보유기간이 2년 이상**인 것"
  //
  // 종전에는 호출부가 넘긴 `isOneHouseExempt`를 그대로 신뢰해, 「1세대 해당」 토글만 켜면
  // **보유 1일이어도 12억 비과세**가 적용됐다(과소과세). 일반 단건 엔진은 정본
  // `meetsOneHouseHoldingResidence`(transfer-tax-exemption.ts)로 이미 판정하고 있었다 —
  // 겸용만 그 규칙을 쓰지 않던 내부 불일치다.
  //
  // 기산일은 **건물 취득일**이다. §154①의 보유기간은 「해당 **주택**」의 보유기간이고,
  // 겸용 건물의 주택 부분 취득일이 곧 건물 취득일이기 때문이다.
  //
  // 본문 후단은 **취득 당시 조정대상지역**이면 거주 2년을 더 요구하고, **단서**는
  //   "제1호부터 제3호까지 … 그 **보유기간 및** 거주기간의 제한을 받지 않으며 제5호에 해당하는
  //    경우에는 거주기간의 제한을 받지 않는다"
  // 고 정한다(법제처 실측 2026-07-31 · 시행령 MST 286211).
  //
  // ⚠️ **판정을 쪼개지 않는다.** 종전 P3a는 보유 축만 따로 구현했다가 단서가 보유요건까지
  //    면제한다는 점을 놓쳐, 수용·해외이주 등에 해당하는데도 보유 2년 미만이면 비과세를
  //    배제했다(**과다과세**). 단서 면제는 정본의 `meetsHolding` **내부**에 있으므로
  //    거주 축을 AND로 덧붙이는 방식으로는 고칠 수 없다 — 정본 함수 하나를 부른다.
  const exemptionHolding = calculateHoldingPeriod(asset.buildingAcquisitionDate, transferDate);
  const exemptionReqInput = {
    // 주택 부분의 취득일 = 건물 취득일. §154①의 보유기간은 「해당 **주택**」의 보유기간이고
    // 겸용 건물의 주택 부분 취득일이 곧 건물 취득일이다.
    acquisitionDate: asset.buildingAcquisitionDate,
    transferDate,
    // 거주기간은 §154⑧3호 **통산값**(동일세대 상속분 포함)을 쓴다. API 변환
    // (`transfer-tax-api-mixed-use.ts:171`)이 `consolidateResidenceMonths`로 이미 통산해
    // 보내므로, 여기서 `acquisitionCause`·`decedent*`를 함께 넘기면 **통산이 두 번** 걸린다
    // → 의도적으로 미전달. 같은 미전달이 `resolveExemptionHoldingStartDate`의 backdate도
    // 막아 보유 기산일이 건물 취득일로 고정된다(겸용에는 그 입력 자체가 없다).
    residencePeriodMonths: (asset.table2ResidencePeriodYears ?? asset.residencePeriodYears) * 12,
    oneHouseExemptionProviso: asset.oneHouseExemptionProviso,
    regionCode: asset.regionCode,
    // 미주입 시 false — 조정대상지역이 아니면 거주요건 자체가 없다(종전 동작 불변).
    wasRegulatedAtAcquisition: asset.wasRegulatedAtAcquisition ?? false,
  };
  const meetsOneHouseRequirements = meetsOneHouseHoldingResidence(
    exemptionReqInput,
    oneHouseSpecialRules.one_house_exemption,
  );
  // §91① — 미등기양도자산에는 **비과세 규정을 적용하지 아니한다**. 주택분 12억 비과세도 배제.
  const isUnregistered = asset.isUnregistered === true;
  const isOneHouseExempt =
    (asset.isOneHouseExempt ?? true) && meetsOneHouseRequirements && !isUnregistered;
  if ((asset.isOneHouseExempt ?? true) && !meetsOneHouseRequirements) {
    // 어느 요건이 걸렸는지 사용자가 판별할 수 있도록 세 축을 모두 싣는다(침묵 과세 방지).
    const r = oneHouseSpecialRules.one_house_exemption;
    warnings.push(
      `건물 보유기간 ${exemptionHolding.years}년 ${exemptionHolding.months}개월 · ` +
        `거주기간 ${exemptionReqInput.residencePeriodMonths / 12}년 · ` +
        `취득 당시 조정대상지역 ${asset.wasRegulatedAtAcquisition ? "해당" : "미해당"} — ` +
        `1세대1주택 비과세 요건(보유 ${r.minHoldingYears}년, 조정대상지역 취득 시 거주 ` +
        `${r.regulatedAreaMinResidenceYears}년, 소득세법 시행령 §154①) 미충족으로 주택분도 과세됩니다.`,
    );
  }

  // ── 법 §104⑦ 다주택 중과 판정 ────────────────────────────────────────────────
  // 주택 수 산정·배제 주택·혼인합가 차감·한시 유예는 전부 정본
  // `determineMultiHouseSurcharge`가 갖고 있다. 겸용은 그 결과만 받아 쓴다.
  //
  // ⚠️ `houseCountExclusionRules`가 없으면(DB 키 부재) 판정을 **건너뛴다** — 단건 엔진
  //    (`transfer-tax.ts:184`)과 동일한 가드다. 예외를 던지지 않으므로 테스트에서
  //    `makeMockRates()`를 쓰면 중과가 조용히 스킵된다(계획서 R-9).
  const multiHouseSurcharge =
    asset.multiHouse && houseCountExclusionRules
      ? determineMultiHouseSurcharge(
          {
            ...asset.multiHouse,
            transferDate,
            // §155⑤ 1세대1주택 의제 중과배제(배제2) 게이트 — 위에서 만든 §154① 통합 판정을
            // 그대로 넘긴다. 단건이 `transfer-tax.ts:202`에서 넘기는 값과 **같은 함수의 결과**다.
            sellingHouseMeetsOneHouseRequirements: meetsOneHouseRequirements,
            // §167의10①15호 ① 요소 — §155① 의제 성립. 단건과 **같은 정본 함수**를 쓴다
            // (기한 규칙 재구현 금지 — 계획서 F-2). `temporaryTwoHouse` 미주입 시 undefined.
            deemedOneHouseBy155: resolveDeemedOneHouseBy155(
              {
                ...exemptionReqInput,
                isRegulatedArea: asset.multiHouse.isRegulatedArea,
                isOneHousehold: asset.multiHouse.isOneHousehold,
                temporaryTwoHouse: asset.temporaryTwoHouse,
                // 겸용은 §155⑦ 농어촌주택 입력을 받지 않는다(농어촌주택은 겸용주택이 아니다).
                //   `householdHousingCount`는 §155⑦ 판정의 「각각 1개씩」 게이트 전용이라
                //   중과 주택 수(`multiHouse.houses`)와 무관하다 — 2를 넣으면 오판정이 된다.
                householdHousingCount: 0,
                ruralHouse: undefined,
              },
              oneHouseSpecialRules,
            ),
          },
          houseCountExclusionRules,
          regulatedAreaHistory ?? null,
          surchargeSpecialRules,
          asset.multiHouse.isRegulatedArea,
        )
      : undefined;

  // §95② 본문 괄호 — 「제104조 제7항 각 호에 따른 자산」의 장기보유특별공제 **배제**.
  //
  // ⚠️ 술어가 `surchargeApplicable`이 **아니다**. 2008 위기취득 배제(부칙 §9270호 §14①)는
  //    **세율만** 배제하고 `surchargeType`은 유지하므로 §104⑦ 각 호 해당 자산인 것은 변함이 없다
  //    → 장특 배제는 존속한다(서울행정법원 2024구단72950 국승 ·
  //    `types/multi-house-surcharge.types.ts:410-412`). 반면 한시 유예(§167의3①12의2)는
  //    각 호에서 빼주는 것이라 장특이 살아난다. 단건 정본도 같은 조합이다
  //    (`transfer-tax-helpers.ts:458-461` — `isSurcharge && !isSuspended`).
  //
  // ⚠️ 적용 범위는 **주택분 한정**이다. §104⑦의 대상이 「주택(이에 딸린 토지를 포함한다)」이므로
  //    상가건물·상가부수토지, 배율초과 비사업용 토지(§104①8호 자산)에는 미치지 않는다.
  const surchargeLthdExcluded =
    multiHouseSurcharge !== undefined &&
    multiHouseSurcharge.surchargeType !== "none" &&
    !multiHouseSurcharge.isSurchargeSuspended;

  // 파생값 (면적 비율)
  const derived = computeDerivedAreas(asset);
  // 보유 중 일부 용도변경 시 취득시 면적 파생값 (시행령 §166⑥)
  const acqDerived = computeAcqDerivedAreas(asset, derived);

  // STEP 2: 양도가액 안분
  const apportionment = apportionTransferPrice(transferPrice, asset, derived);
  steps.push(buildApportionmentStep(apportionment));

  // STEP 2.5: 취득가액 총액 안분 (법 §100²) — 실거래가(R1) 또는 감정/매매사례(R-B) 총액을
  // 취득시 기준시가 비율로 주택분/상가분에 안분(양도가액 안분의 취득시 미러). 개산공제 차이는 각 part에서.
  const acqApportionment =
    asset.useActualAcquisition || asset.useAppraisalSalesAcquisition
      ? apportionAcquisitionPrice(asset.acquisitionActualTotalPrice ?? 0, asset, acqDerived)
      : undefined;

  // STEP 3: 주택부분 환산취득가액 (§97 또는 §164⑤ PHD, 또는 실가 안분분)
  // PHD + 보유 중 용도변경 케이스에서 시점별 면적 분리를 위해 acqDerived도 전달
  const housingAcqResult = calcHousingEstimatedAcq(
    apportionment.housingTransferPrice,
    asset,
    derived,
    transferDate,
    acqDerived,
    acqApportionment?.housingAcqPrice,
  );

  // STEP 4: 주택 양도차익 (토지/건물 분리)
  const housingGainSplit = calcHousingGainSplit(
    apportionment.housingTransferPrice,
    housingAcqResult,
    asset,
    derived,
    transferDate,
    acqDerived,
  );

  // STEP 5·6: 12억 초과 비과세 안분 + 주택부수토지 배율초과 분리
  // 🚨 Critical: isOneHouseExempt 인자 전달 — 다주택자(false) 시 12억 비과세 미적용·표1
  const excessResult = calcExcessLandRatio(asset, derived, transferDate);

  // STEP 7-prep: 상가부분 양도차익 (period-split에서도 housing 직전 commercial gain 필요)
  const commercialGainSplit = calcCommercialGainSplit(
    apportionment.commercialTransferPrice,
    asset,
    derived,
    transferDate,
    acqDerived,
    housingAcqResult,
    acqApportionment?.commercialAcqPrice,
  );

  // ─── 용도변경일 기반 LTHD 시간 비례 분할 (집행기준 89-154-24 취지) ───
  // partialUsageChange.usageChangeDate 입력 + 유효 시 period-split 모드로 LTHD 재계산.
  // 미입력·취득일 이전·양도일 이후이면 null 반환되어 표준 모드로 fallback.
  const acqDateForSplit =
    asset.landAcquisitionDate < asset.buildingAcquisitionDate
      ? asset.landAcquisitionDate
      : asset.buildingAcquisitionDate;
  const periodInfo = calcUsagePeriodInfo(
    acqDateForSplit,
    asset.partialUsageChange?.usageChangeDate,
    transferDate,
  );

  let housingPart: ReturnType<typeof buildHousingPart>;
  let commercialPart: ReturnType<typeof buildCommercialPart>;
  let usagePeriodSplit:
    | ReturnType<typeof applyUsagePeriodSplit>["usagePeriodSplit"]
    | undefined;

  // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 — 미제공 시 실거주로 fallback(비상속·별도세대 = 실거주).
  const table2ResidenceYears = asset.table2ResidencePeriodYears ?? asset.residencePeriodYears;

  // Case A 4부분 안분 활성화 시 period-split 건너뛰기 — 엑셀 기준 전체 보유기간 단일 LTHD 적용.
  const skipPeriodSplitForFourPart = !!housingAcqResult.phdResult?.fourPartApportionment;
  if (periodInfo && asset.partialUsageChange && !skipPeriodSplitForFourPart) {
    const split = applyUsagePeriodSplit(
      housingGainSplit,
      commercialGainSplit,
      apportionment,
      excessResult,
      asset.residencePeriodYears,
      table2ResidenceYears,
      isOneHouseExempt,
      periodInfo,
      asset.partialUsageChange.direction,
      housingAcqResult,
      isUnregistered,
      surchargeLthdExcluded,
    );
    housingPart = split.housingPart;
    commercialPart = split.commercialPart;
    usagePeriodSplit = split.usagePeriodSplit;
  } else {
    housingPart = buildHousingPart(
      apportionment,
      housingAcqResult,
      housingGainSplit,
      excessResult,
      asset.residencePeriodYears,
      table2ResidenceYears,
      isOneHouseExempt,
      isUnregistered,
      surchargeLthdExcluded,
    );
    // ⚠️ 상가분에는 `surchargeLthdExcluded`를 넘기지 않는다 — §104⑦의 대상은
    //    「주택(이에 딸린 토지 포함)」이라 상가건물·상가부수토지는 그 자산이 아니다.
    commercialPart = buildCommercialPart(commercialGainSplit, isUnregistered);
  }

  steps.push(buildHousingStep(housingPart, apportionment));
  steps.push(buildCommercialStep(commercialPart, apportionment));

  // STEP 8: 비사업용토지 부분 (배율초과 시)
  const nonBusinessLandPart = buildNonBusinessPart(
    housingPart,
    excessResult,
    housingGainSplit.landHoldingYears,
    isUnregistered,
  );
  if (nonBusinessLandPart) {
    steps.push(buildNonBusinessStep(nonBusinessLandPart, excessResult, derived));
  }

  // STEP 9: 합산 세액
  // §104①2·3호 단기세율 판정용 파트 — 주택분(주택+부수토지 **일체**, §104①2호 괄호) 1개 +
  // 상가 토지·건물 각 1개. 상가는 §94①1호상 토지·건물이 별개 자산이라 보유기간이 따로 간다.
  //
  // 주택분 기산은 **토지·건물 중 늦은 취득**(= 짧은 보유)이다 — 부수토지를 나중에 취득하면
  // 그 시점부터가 「주택과 그 부수토지」의 보유기간이다(선행 계획서 G-3 `max(취득일)` 규칙과 동일).
  const commercialLandIncome = commercialPart.landIncomeAmount;
  const commercialBuildingIncome = commercialPart.buildingIncomeAmount;

  // 「소득세법」 제104조 제7항 가산율 — **주택분 전용**.
  //
  // ⚠️ 세율의 술어는 `surchargeApplicable`이다(장특 배제와 **다르다**). 2008 위기취득
  //    (부칙 §9270호 §14①)은 **세율만** 배제하므로 여기서는 빠지고, 장특 배제는 존속한다.
  // ⚠️ `resolveSurchargeAddonRate`는 2018-04-01 이전 양도에 **null**을 돌려준다(중과 신설 전).
  const surchargeAddon =
    multiHouseSurcharge?.surchargeApplicable &&
    multiHouseSurcharge.surchargeType !== "none"
      ? resolveSurchargeAddonRate(transferDate, multiHouseSurcharge.surchargeType) ?? undefined
      : undefined;

  // 계획서 §5.5 — 배율초과 비사업용 토지가 있으면 `buildTotalTax`의 §104⑤ 경로가
  // 열리지 않아(D-8 세무 판단 대기) 세율 가산을 적용할 수 없다. **침묵하지 않는다.**
  // (§95② 장특 배제는 파트 조립 단계라 이 경계와 무관하게 이미 적용돼 있다.)
  if (surchargeAddon !== undefined && (nonBusinessLandPart?.incomeAmount ?? 0) > 0) {
    warnings.push(
      "주택 부수토지 배율 초과분(비사업용 토지)이 있어 다주택 중과 **세율** 가산" +
        `(${Math.round(surchargeAddon * 100)}%p, 소득세법 §104⑦)을 적용하지 않았습니다. ` +
        "장기보유특별공제 배제(§95②)는 반영되어 있습니다.",
    );
  }
  const rateParts: MixedUseRatePart[] | undefined =
    commercialLandIncome !== undefined &&
    commercialBuildingIncome !== undefined &&
    // 불변식 — 파트 합이 자산 소득금액과 어긋나면(음수 차익 clamp 등) 진입하지 않는다.
    commercialLandIncome + commercialBuildingIncome === commercialPart.incomeAmount
      ? [
          {
            kind: "housing" as const,
            income: housingPart.incomeAmount,
            holdingYears: Math.min(
              housingGainSplit.landHoldingYears,
              housingGainSplit.buildingHoldingYears,
            ),
            // §104⑦ — 상가 파트에는 붙이지 않는다(대상이 「주택+딸린 토지」).
            ...(surchargeAddon !== undefined ? { surchargeAddon } : {}),
          },
          {
            kind: "commercial_land" as const,
            income: commercialLandIncome,
            holdingYears: commercialGainSplit.landHoldingYears,
          },
          {
            kind: "commercial_building" as const,
            income: commercialBuildingIncome,
            holdingYears: commercialGainSplit.buildingHoldingYears,
          },
        ]
      : undefined;
  const total = buildTotalTax(
    housingPart.incomeAmount,
    commercialPart.incomeAmount,
    nonBusinessLandPart?.incomeAmount ?? 0,
    brackets,
    basicDeductionRules.annualLimit,
    rateParts,
    isUnregistered,
  );
  steps.push(buildTotalStep(total));

  // 계산 경로 메타 (학습·검증용) — 표2 사유 표시는 게이트에 쓴 통산 값(table2ResidenceYears)을 그대로 주입
  // (재계산 시 게이트와 drift 위험 — feedback_engine_result_display_drift).
  const calculationRoute = buildCalculationRoute(
    asset,
    housingPart,
    excessResult,
    commercialPart,
    table2ResidenceYears,
    isOneHouseExempt,
  );

  // 보유 중 일부 용도변경 메타 (결과 카드 표시용)
  const partialUsageChange = asset.partialUsageChange
    ? {
        direction: asset.partialUsageChange.direction,
        acqResidentialArea:
          asset.partialUsageChange.acqResidentialArea
          ?? (asset.partialUsageChange.direction === "house_to_commercial"
              ? asset.residentialFloorArea + asset.nonResidentialFloorArea
              : 0),
        acqCommercialArea:
          asset.partialUsageChange.acqCommercialArea
          ?? (asset.partialUsageChange.direction === "house_to_commercial"
              ? 0
              : asset.residentialFloorArea + asset.nonResidentialFloorArea),
        isAreaCustomized:
          asset.partialUsageChange.acqResidentialArea !== undefined
          || asset.partialUsageChange.acqCommercialArea !== undefined,
        // PHD §164⑤ 환산 분기 — calcHousingEstimatedAcq 가 산출
        phdScopeBranch: housingAcqResult.phdScopeBranch,
      }
    : undefined;

  // 수정신고(경정)·경정청구 — 끝단 append (국세기본법 §45·§45의2).
  // 기준값은 total.transferTax(본세) — 단건 finalize의 determinedTax와 동일 축(지방소득세 제외).
  // amendment 없으면 undefined → 무영향(additive). finalize STEP 12.5 · redevelopment Step H.5와 동일 패턴.
  // ⚠️ buildRejectionResult 경로에는 부착하지 않는다 — 계산 불가 상태이지 '세액 0'이라는 유효한 결과가 아니다
  //    (determinedTax=0으로 부착 시 refundTax = 당초 전액 오표시).
  const amendmentDetail = amendment
    ? computeAmendment(amendment, total.transferTax)
    : undefined;

  return {
    splitMode: "post-2022",
    apportionment,
    housingPart,
    commercialPart,
    nonBusinessLandPart,
    total,
    steps,
    calculationRoute,
    warnings,
    // §104⑦ 판정 echo — 세율·장특 배제와 결과 카드 표시가 **같은 값**을 보게 한다.
    multiHouseSurcharge,
    partialUsageChange,
    usagePeriodSplit,
    amendmentDetail,
    // 상속 취득 게이트 echo (소령 §163⑨) — UI 재판정 방지용 단일 소스.
    acquisitionByInheritance: asset.acquisitionByInheritance,
    // §164⑨1호 공익수용 특례 산출근거 (계획 P7/D8) — 주택분(라목 총액)·상가분(가목 토지). 적용 시만.
    expropriationDetail:
      housingAcqResult.expropriationDetail || commercialGainSplit.expropriationDetail
        ? {
            housing: housingAcqResult.expropriationDetail,
            commercialLand: commercialGainSplit.expropriationDetail,
          }
        : undefined,
  };
}

// ──────────────────────────────────────────
// 계산 경로 메타 빌더
// ──────────────────────────────────────────

function buildCalculationRoute(
  asset: MixedUseAssetInput,
  housingPart: ReturnType<typeof buildHousingPart>,
  excessResult: ReturnType<typeof calcExcessLandRatio>,
  commercialPart: ReturnType<typeof buildCommercialPart>,
  // 표2 게이트에 실제로 쓴 통산 거주 연수 — 재계산 없이 주입받아 표시-계산 drift 차단.
  table2ResidenceYears: number,
  /** §154① 보유요건까지 반영한 최종 비과세 적용 여부 — 오케스트레이터 1회 판정값. */
  isOneHouseExempt: boolean,
): MixedUseCalculationRoute {
  const acqHousing = asset.acquisitionStandardPrice.housingPrice;
  const housingAcqPriceSource =
    asset.usePreHousingDisclosure
      ? ("phd_auto" as const)
      : acqHousing && acqHousing > 0
        ? ("direct_input" as const)
        : ("missing" as const);

  // 취득가액 산정 경로 — 상속·증여(§163⑨)·매매실가(§100²)·환산(§176의2) 분기.
  // 매매실가(useActualAcquisition)는 PHD 미적용(실가 모드는 위 엔진에서 PHD 조합 throw)이라 단일 값.
  const acquisitionConversionRoute = asset.useActualAcquisition
    ? ("section97_actual" as const)
    : asset.useAppraisalSalesAcquisition
    ? ("section176_2_appraisal_sales" as const)
    : asset.acquisitionByInheritance
      ? asset.usePreHousingDisclosure
        ? ("inheritance_phd_max" as const)
        : ("inheritance_direct" as const)
      : asset.acquisitionByGift
        ? asset.usePreHousingDisclosure
          ? ("gift_phd_max" as const)
          : ("gift_direct" as const)
        : asset.usePreHousingDisclosure
          ? ("phd_corrected" as const)
          : ("section97_direct" as const);

  // 표2 게이트는 통산 거주(§154⑧3호) — 사유 서술도 게이트 값으로(통산 케이스에서 "실거주 0년 ≥2년" 모순 방지).
  const housingDeductionTableReason =
    housingPart.longTermDeductionTable === 2
      ? `거주(통산) ${table2ResidenceYears}년 ≥ 2년 → 표2 (보유×4% + 거주×4%, 최대 80%)`
      : `거주(통산) ${table2ResidenceYears}년 < 2년 → 표1 (보유×2%, 최대 30%)`;

  const zoneLabel = asset.zoneType ?? "residential";
  const metroLabel = asset.isMetropolitanArea === false ? "수도권 외" : "수도권";
  const landMultiplierReason = `${metroLabel} ${zoneLabel} → ${excessResult.multiplier}배 (시행령 §168의12)`;

  // 🚨 Critical: 다주택자·§154① 보유요건 미충족(isOneHouseExempt === false)
  //    → non_one_house_full_taxation. 판정은 오케스트레이터가 1회 수행해 주입받는다
  //    (재도출 시 표시-계산 drift — memory `feedback_engine_result_display_drift`).
  const highValueRule = !isOneHouseExempt
    ? ("non_one_house_full_taxation" as const)
    : housingPart.isExempt
      ? ("below_threshold_exempt" as const)
      : ("above_threshold_prorated" as const);

  // 보유 중 일부 용도변경 사유 (사전 정의 템플릿)
  const partialUsageChangeReason = asset.partialUsageChange
    ? buildPartialUsageChangeReason(
        asset.partialUsageChange.direction,
        commercialPart.acqStandardSource,
      )
    : undefined;

  return {
    housingAcqPriceSource,
    acquisitionConversionRoute,
    housingDeductionTableReason,
    landMultiplierReason,
    highValueRule,
    partialUsageChangeReason,
  };
}

/**
 * 보유 중 일부 용도변경 사유 — 산출 근거 안내 템플릿.
 *
 * - house_to_commercial: 취득시 전체 주택 → 양도시 일부 상가화. 사용자가 취득시 상가건물 기준시가 +
 *   개별공시지가를 직접 입력해야 함 (자동 안분 fallback 폐지, 2026-05-01).
 * - commercial_to_house: 취득시 전체 상가 → 양도시 일부 주택화 (미러).
 */
function buildPartialUsageChangeReason(
  direction: "house_to_commercial" | "commercial_to_house",
  _acqStandardSource: "user_input",
): string {
  if (direction === "house_to_commercial") {
    return (
      "양도시점에는 겸용주택이나 취득시점에는 전체 주택이었으므로 시행령 §166⑥에 따라, " +
      "사용자가 입력한 취득시 상가건물 기준시가와 개별공시지가(상가)로 취득시 상가부분 기준시가를 직접 산정"
    );
  }
  // commercial_to_house — 미러 (현재는 단일 메시지)
  return (
    "양도시점에는 겸용주택이나 취득시점에는 전체 상가였으므로 시행령 §166⑥에 따라 " +
    "환산취득가 산정 시 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분 — 직접 사례 제한적, 보수 검토 필요"
  );
}

// ──────────────────────────────────────────
// 경고 수집
// ──────────────────────────────────────────

function collectWarnings(asset: MixedUseAssetInput): string[] {
  const warnings: string[] = [];
  if (asset.isMetropolitanArea === undefined) {
    warnings.push(
      "수도권 여부 미입력 — 수도권(3배 배율)으로 보수 처리됩니다. 정확한 계산을 위해 수도권 여부를 입력하세요.",
    );
  }
  return warnings;
}

// ──────────────────────────────────────────
// 거부 결과 빌더
// ──────────────────────────────────────────

function buildRejectionResult(warning: string): MixedUseGainBreakdown {
  const zero = {
    housingStandardPrice: 0,
    commercialStandardPrice: 0,
    housingRatio: 0,
    housingTransferPrice: 0,
    commercialTransferPrice: 0,
  } satisfies MixedUseApportionment;
  return {
    splitMode: "pre-2022-rejected",
    apportionment: zero,
    housingPart: {
      estimatedAcquisitionPrice: 0,
      transferGain: 0,
      landTransferGain: 0,
      buildingTransferGain: 0,
      landTransferPrice: 0,
      landAcqPrice: 0,
      landAppraisalDed: 0,
      buildingTransferPrice: 0,
      buildingAcqPrice: 0,
      buildingAppraisalDed: 0,
      isExempt: false,
      proratedTaxableGain: 0,
      longTermDeductionTable: 1,
      longTermDeductionRate: 0,
      longTermDeductionAmount: 0,
      incomeAmount: 0,
      nonBusinessTransferRatio: 0,
      nonBusinessTransferredGain: 0,
    },
    commercialPart: {
      estimatedAcquisitionPrice: 0,
      transferGain: 0,
      landTransferGain: 0,
      buildingTransferGain: 0,
      landTransferPrice: 0,
      landAcqPrice: 0,
      landAppraisalDed: 0,
      buildingTransferPrice: 0,
      buildingAcqPrice: 0,
      buildingAppraisalDed: 0,
      longTermDeductionRate: 0,
      longTermDeductionAmount: 0,
      incomeAmount: 0,
      acqStandardSource: "user_input",
      acqStandardTotal: 0,
      acqStandardLand: 0,
      acqStandardBuilding: 0,
    },
    nonBusinessLandPart: null,
    total: {
      aggregateIncome: 0,
      basicDeduction: 0,
      taxBase: 0,
      taxByBasicRate: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      nonBusinessSurcharge: 0,
      transferTax: 0,
      localTax: 0,
      totalPayable: 0,
    },
    steps: [],
    calculationRoute: {
      housingAcqPriceSource: "missing",
      acquisitionConversionRoute: "section97_direct",
      housingDeductionTableReason: "계산 미진행",
      landMultiplierReason: "계산 미진행",
      highValueRule: "below_threshold_exempt",
    },
    warnings: [warning],
  };
}

// ──────────────────────────────────────────
// 결과 카드용 Step 빌더
// ──────────────────────────────────────────

function buildApportionmentStep(a: MixedUseApportionment): MixedUseStep {
  return {
    id: "step-2-apportionment",
    title: "양도가액 안분",
    legalBasis: MIXED_USE.APPORTIONMENT,
    values: [
      { label: "양도시 개별주택공시가격", value: a.housingStandardPrice },
      { label: "양도시 상가부분 기준시가 합계", value: a.commercialStandardPrice },
      { label: "주택비율", value: `${(a.housingRatio * 100).toFixed(2)}%` },
      { label: "주택 양도가액", value: a.housingTransferPrice, isResult: true },
      { label: "상가 양도가액", value: a.commercialTransferPrice, isResult: true },
    ],
  };
}

function buildHousingStep(
  h: ReturnType<typeof buildHousingPart>,
  a: MixedUseApportionment,
): MixedUseStep {
  return {
    id: "step-5-housing",
    title: "주택부분",
    legalBasis: MIXED_USE.HIGH_VALUE_HOUSE,
    values: [
      { label: "주택 환산취득가액", value: h.estimatedAcquisitionPrice },
      { label: "주택 양도차익", value: h.transferGain },
      { label: "12억 초과 비과세 적용 후 과세대상 양도차익", value: h.proratedTaxableGain },
      { label: `장기보유공제 (표${h.longTermDeductionTable}, ${(h.longTermDeductionRate * 100).toFixed(0)}%)`, value: h.longTermDeductionAmount },
      { label: "주택부분 양도소득금액", value: h.incomeAmount, isResult: true },
    ],
  };
}

function buildCommercialStep(
  c: ReturnType<typeof buildCommercialPart>,
  a: MixedUseApportionment,
): MixedUseStep {
  // 취득시 상가부분 기준시가는 항상 사용자 직접 입력 (자동 안분 fallback 폐지)
  const acqStdLabel = "취득시 상가부분 기준시가 합계";

  return {
    id: "step-7-commercial",
    title: "상가부분",
    legalBasis: MIXED_USE.APPORTIONMENT,
    values: [
      { label: acqStdLabel, value: c.acqStandardTotal },
      { label: "상가 환산취득가액", value: c.estimatedAcquisitionPrice },
      { label: "상가 양도차익", value: c.transferGain },
      { label: `장기보유공제 (표1, ${(c.longTermDeductionRate * 100).toFixed(0)}%)`, value: c.longTermDeductionAmount },
      { label: "상가부분 양도소득금액", value: c.incomeAmount, isResult: true },
    ],
  };
}

function buildNonBusinessStep(
  nb: NonNullable<ReturnType<typeof buildNonBusinessPart>>,
  excess: ReturnType<typeof calcExcessLandRatio>,
  derived: ReturnType<typeof computeDerivedAreas>,
): MixedUseStep {
  return {
    id: "step-6-non-business-land",
    title: "비사업용토지 부분 (주택부수토지 배율초과)",
    legalBasis: MIXED_USE.LAND_RATIO,
    values: [
      { label: "주택부수토지 면적", value: `${derived.residentialLandArea.toFixed(2)} ㎡` },
      { label: `적용 배율 (${excess.multiplier}배) × 주택 정착면적`, value: `${(derived.residentialFootprintArea * excess.multiplier).toFixed(2)} ㎡` },
      { label: "배율초과 면적", value: `${nb.excessArea.toFixed(2)} ㎡` },
      { label: "비사업용 양도차익", value: nb.transferGain },
      { label: `장기보유공제 (표1, ${(nb.longTermDeductionRate * 100).toFixed(0)}%)`, value: nb.longTermDeductionAmount },
      { label: "비사업용토지 양도소득금액 (+10%p 가산)", value: nb.incomeAmount, isResult: true },
    ],
  };
}

function buildTotalStep(t: ReturnType<typeof buildTotalTax>): MixedUseStep {
  return {
    id: "step-9-total",
    title: "합산 세액",
    legalBasis: "소득세법 §92~§107",
    values: [
      { label: "합산 양도소득금액", value: t.aggregateIncome },
      { label: "기본공제", value: t.basicDeduction },
      { label: "과세표준", value: t.taxBase },
      { label: "산출세액 (기본세율)", value: t.taxByBasicRate },
      { label: "비사업용토지 +10%p 가산세", value: t.nonBusinessSurcharge },
      { label: "양도소득세", value: t.transferTax },
      { label: "지방소득세 (10%)", value: t.localTax },
      { label: "총 납부세액", value: t.totalPayable, isResult: true },
    ],
  };
}
