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
  let housingGainSplit = calcHousingGainSplit(
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
  let commercialGainSplit = calcCommercialGainSplit(
    apportionment.commercialTransferPrice,
    asset,
    derived,
    transferDate,
    acqDerived,
    housingAcqResult,
    acqApportionment?.commercialAcqPrice,
  );

  /**
   * 🔴 **STEP 7.5 — §97②2호 단서**: 가목·나목 택일 (2026-08-07 W-8).
   *
   * > 「다만, 제1항제1호나목에 따라 취득가액을 **환산취득가액**으로 하는 경우로서
   * >  **가목의 금액이 나목의 금액보다 적은 경우**에는 나목의 금액을 필요경비로 할 수 있다.」
   *
   *   · **가목** = (주택분 + 상가분) 환산취득가액 + 개산공제  ← 필요경비 **전체**
   *   · **나목** = 자산 단위 자본적지출 + 양도비
   *
   * ⚠️ **비교 단위는 자산 단위**다. 근거는 `general-building-swap.ts:144-148`의 확립된 규칙
   *    — 「**파트별로 취득모드가 갈리면** 파트 단위, 아니면 자산 단위」. 겸용의 취득모드 플래그
   *    (`useActualAcquisition`·`acquisitionByInheritance` 등)는 전부 **자산 단위**라 갈리지 않는다.
   *
   * ⚠️ **환산 경로 전용**이다 — 실가·상속·증여(`usesDeemedAcq`)는 §97②**1호** 가산이거나
   *    §163⑨ 의제라 단서 대상이 아니다.
   *
   * ⚠️ **감정가액·매매사례가액(`useAppraisalSalesAcquisition`)도 단서 대상이 아니다**(2026-08-13 F19).
   *    단서는 「취득가액을 **환산취득가액**으로 하는 경우」 한정이고, 감정가액·매매사례가액
   *    (「소득세법 시행령」 §176의2②③)은 같은 호 **본문**이다. 겸용의 감정·매매사례 경로는
   *    취득가액 총액을 법 §100②로 안분해 **직접 차감**하는 경로라, 단서가 발동하면 그 안분값이
   *    통째로 0이 되어 취득가액이 소멸한다(과소과세 실측 129,309,577). 단건 엔진
   *    (`transfer-tax-helpers.ts` `isConversionMode = useEstimatedAcquisition === true`)과
   *    일반건물(`general-building-swap.ts` — appraisal·salesCase는 무동작)이 이미 같은 규칙이다.
   *
   * 🔑 **재호출은 3개면 된다** — `calcExcessLandRatio`(STEP 5·6)는 gain에 의존하지 않고
   *    `(asset, derived, transferDate)`만 받으므로 다시 돌릴 필요가 없다.
   */
  const provisoEligible =
    !asset.acquisitionByInheritance &&
    !asset.acquisitionByGift &&
    !asset.useActualAcquisition &&
    !asset.useAppraisalSalesAcquisition;
  const provisoDeclared =
    asset.capitalExpenditure !== undefined || asset.transferExpense !== undefined;
  let necessaryExpenseProviso: MixedUseGainBreakdown["necessaryExpenseProviso"];
  if (provisoEligible && provisoDeclared) {
    const gamok =
      housingGainSplit.landAcqPrice + housingGainSplit.buildingAcqPrice +
      housingGainSplit.landAppraisalDed + housingGainSplit.buildingAppraisalDed +
      commercialGainSplit.landAcqPrice + commercialGainSplit.buildingAcqPrice +
      commercialGainSplit.landAppraisalDed + commercialGainSplit.buildingAppraisalDed;
    const namok = (asset.capitalExpenditure ?? 0) + (asset.transferExpense ?? 0);
    // 동률(==)은 본문 — 단서가 「적은 경우」로 명시한다(일반건물·상업용·부담부증여와 같은 판정).
    const chosen: "estimated" | "direct" = namok > gamok ? "direct" : "estimated";
    necessaryExpenseProviso = { estimatedSide: gamok, directSide: namok, chosen };
    if (chosen === "direct") {
      housingGainSplit = calcHousingGainSplit(
        apportionment.housingTransferPrice, housingAcqResult, asset, derived, transferDate,
        acqDerived, true,
      );
      commercialGainSplit = calcCommercialGainSplit(
        apportionment.commercialTransferPrice, asset, derived, transferDate, acqDerived,
        housingAcqResult, acqApportionment?.commercialAcqPrice, true,
      );
    }
  }

  // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 — 미제공 시 실거주로 fallback(비상속·별도세대 = 실거주).
  const table2ResidenceYears = asset.table2ResidencePeriodYears ?? asset.residencePeriodYears;

  // ─── 🔴 2026-08-10 — 용도변경일 기반 LTHD **시간 비례 분할을 폐지**했다 ───
  //
  // 종전에는 `usageChangeDate`가 있으면 양도차익을 t1:t2로 쪼개고 각 조각에 **부분 보유연수**로
  // LTHD를 매겼다(`applyUsagePeriodSplit`). 근거로 「집행기준 89-154-24 취지」를 달았으나
  // **그 집행기준은 존재하지 않는다**. 법문·예규는 정반대다:
  //
  //   ① 「소득세법」 §95④ — "제2항에서 규정하는 자산의 **보유기간은 그 자산의 취득일부터
  //      양도일까지**로 한다." 예외는 §97의2①(이월과세)과 가업상속공제 **둘뿐**이다.
  //   ② **사전-2021-법령해석재산-0333**(법령해석과-4781, 2021.12.31.) — 겸용주택의 **주택부분을
  //      상가로 용도변경**하여 양도한 사안에서 "§95②  장기보유특별공제율 적용을 위한
  //      **보유기간 기산일은 해당 겸용주택의 취득일**로 하는 것임".
  //   ③ **사전-2022-법규재산-0427**(법규과-1472, 2022.06.12.) — 고가 겸용주택에서
  //      "**보유기간(해당 겸용주택의 취득일부터 양도일까지 기간)**" 이라 못박고, 표2는
  //      "**주택 부분에 해당하는 건물 및 부수토지에 한정**"해 적용한다 ⇒ 나누는 축은
  //      **기간이 아니라 부분(면적)**이다.
  //   ④ 입법자는 기간을 나눌 때 **명문으로** 나눈다 — 재개발 §166⑤(구성요소별 보유기간),
  //      §95⑤(비주택→주택: 기간별 **공제율 합산**, 양도차익 분할이 아니다).
  //
  // ✅ **「용도변경일 기산」(사전-2022-법규재산-0684·0881)은 겸용에 적용하지 않는다** — 2026-08-11 확정.
  //    ❌ 「미구현이니 언젠가 넣자」로 읽지 말 것. 근거 셋:
  //    ① 두 예규는 **양도 시점 주택 부분이 0**인 사안이다(0881도 「건물 전체가 근린생활시설」).
  //       이 앱에선 겸용이 아니라 **일반건물 경로**로 흐르고, 거기엔 구현돼 있다(PR #1185).
  //    ② 겸용을 다룬 예규는 반대 축을 반복 확인한다 — 사전-2022-법규재산-0427 · 서면-2018-부동산-0115:
  //       「보유기간은 취득일부터 양도일까지」이고 **나누는 축은 부분(면적)**이다.
  //    ③ §95④ 단서의 기산일 예외는 §97의2①·가업상속공제 **둘뿐**이고, 겸용 유지 사안 해석례는
  //       **0건**이다. 근거 없이 공제를 줄이는 방향으로 확장할 수 없다.
  //    ⇒ 주택분이 §104⑦ 각 호에 해당하면 **기산일이 아니라 배제**이고, 그건 위
  //       `surchargeLthdExcluded`가 이미 담당한다. anchor UC-4·UC-5.
  const housingPart = buildHousingPart(
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
  const commercialPart = buildCommercialPart(commercialGainSplit, isUnregistered);

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

  // P6(계획서 D-8) — 배율초과 비사업용 토지도 §104⑤2호 파트로 들어가므로 종전의
  // 「중과 세율 가산 미적용」 경고는 더 이상 사실이 아니다. 삭제했다.
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
          // §104⑤ 본문 후단 — 배율 초과분(비사업용 토지)은 **별개 자산**으로 보아
          // §104①8호(§55① 세율 + 10%p)를 자기 과세표준에만 적용한다. 2년 미만이면
          // `buildTotalTax`가 §104① 후단으로 토지 단기세율(50%/40%)과 큰 것을 취한다.
          // 보유연수 기산은 **주택 부수토지의 토지 보유연수** — 배율 초과분도 같은 필지다.
          ...((nonBusinessLandPart?.incomeAmount ?? 0) > 0
            ? [
                {
                  kind: "non_business_land" as const,
                  income: nonBusinessLandPart!.incomeAmount,
                  holdingYears: housingGainSplit.landHoldingYears,
                  surchargeAddon: nonBusinessLandPart!.additionalRate,
                },
              ]
            : []),
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
    ...(necessaryExpenseProviso ? { necessaryExpenseProviso } : {}),
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

// ── 800줄 정책 분리(2026-08-07 W-8) — 표시용 빌더는 별도 파일 ──
import {
  buildCalculationRoute,
  collectWarnings,
  buildRejectionResult,
  buildApportionmentStep,
  buildHousingStep,
  buildCommercialStep,
  buildNonBusinessStep,
  buildTotalStep,
} from "./transfer-tax-mixed-use-steps";
