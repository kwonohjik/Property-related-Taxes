/**
 * 결함 **E3-06** (critical) — 재개발 분기 조기 반환이 **이월과세 detail·비과세 플래그를 통째로 버린다**
 *
 * ## 결함
 *
 * `transfer-tax.ts` STEP 0.475가 §97의2 A/B 시나리오를 계산해 `workingInput`을 채택 시나리오로
 * 교체하고 `carryoverDetail`을 만든다(`transfer-tax.ts:137-171`). 그런데 STEP 0.65의 재개발 분기는
 * `calculateRedevelopmentTax(...)`로 **조기 반환**하면서(`transfer-tax.ts:299`) 그 detail을
 * 결과에 담지 않는다 — `transfer-tax-redevelopment.ts:315`의 반환 블록에는
 * `carryoverTaxationDetail`·`isPartialExempt`·`exemptReason`·`warnings` **키 자체가 없다**
 * (grep 실측: 그 파일 전체에 네 이름이 한 번도 나오지 않는다).
 *
 * 정상 경로는 `buildTransferResultDetails`가 `carryoverTaxationDetail: ctx.carryoverDetail`로
 * 싣고(`transfer-tax-finalize.ts:592`), `isPartialExempt`/`exemptReason`은
 * `transfer-tax.ts:459`가 `checkExemption` 결과에서 싣는다.
 *
 * ### 파급 3가지
 *
 * 1. 결과 화면 `CarryoverComparisonCard`가 렌더되지 않아(`TransferTaxResultView.tsx:393` /
 *    `ValuationDetailCards.tsx:118`) 취득가액이 증여자 것으로 바뀐 근거를 볼 수 없다.
 * 2. 다건 집계가 `p.carryoverTaxationDetail?.isEligible === true`로 §97의2②3호 **신고단위 비교**
 *    대상을 추리므로(`transfer-tax-aggregate.ts:661-663`) 재개발·입주권 자산이 **조용히 빠진다**.
 * 3. `adoptedCarryoverAcquisitionPrice(...)`가 undefined가 되어(`transfer-tax-aggregate.ts:118·508`)
 *    신고서 표시 취득가액이 **수증자 취득가액으로 되돌아간다**.
 *
 * 4번째 파급 — `isPartialExempt` 부재는 **§97의2②2호 자동 판정을 구조적으로 죽인다**.
 *    `transfer-tax-carryover.ts:351`이 `scenarioAIsOneHouse: resultA.isExempt === true ||
 *    resultA.isPartialExempt === true`로 판정하는데, 재개발 자산의 시나리오 A 재귀 호출은
 *    고가주택이어도 두 값이 모두 falsy라 ②2호가 **영원히 발동하지 않는다**.
 *
 * ## 근거 조문 (KoreanLaw MCP 원문 확인 2026-08-25 · 소득세법 MST 280405 · 시행령 MST 286211)
 *
 * · 「소득세법」 §97조의2① — 「…증여받은 **제94조제1항제1호 및 제3호에 따른 자산이나 그 밖에
 *     대통령령으로 정하는 자산**의 양도차익을 계산할 때…」
 *   ⇒ 완공 신축APT는 **건물**이므로 §94①1호로 곧바로 대상이다.
 *     (조합원입주권도 「소득세법 시행령」 §163조의2① — 「법 제97조의2제1항 각 호 외의 부분에서
 *      "대통령령으로 정하는 자산"이란 **법 제94조제1항제2호가목** 및 같은 항 제4호나목의 자산을
 *      말한다」 — 로 대상이다. 즉 **재개발이라는 이유로 §97의2가 배제되는 근거는 없다**.)
 * · 「소득세법」 §97조의2② 3호 — 「제1항을 적용하여 계산한 양도소득 **결정세액**이 제1항을
 *     적용하지 아니하고 계산한 양도소득 결정세액보다 **적은 경우**」 ⇒ A/B 비교·채택.
 * · 「소득세법」 §97조의2③ + 부칙(법률 제19196호) — 2023-01-01 이후 증여분은 **10년**.
 * · 「소득세법」 §95③ — 「제89조제1항제3호에 따라 양도소득의 비과세대상에서 제외되는 **고가주택**
 *     …의 양도차익 및 장기보유 특별공제액은 …대통령령으로 정하는 바에 따라 계산한 금액으로 한다」
 *   + 「소득세법 시행령」 §160①1호 — 「양도차익 × (양도가액 − **12억원**) / 양도가액」
 *   ⇒ 1세대1주택 고가주택은 **전부 과세도 전부 비과세도 아닌 부분 비과세**다.
 *     재개발 분기도 이 안분을 실제로 수행한다(`highValueAllocation` 부착 — 아래 B-5가 실측한다).
 *     그렇다면 그 사실을 나르는 `isPartialExempt`·`exemptReason`이 **결과에 있어야 한다**.
 *
 * ## 입력 사실관계 (두 픽스처 공통)
 *
 *   증여자 종전주택 취득   2005-04-09 (취득가액 300,000,000)
 *   증여 등기접수일        2023-06-01 (증여 당시 평가액 800,000,000 · 증여세 상당액 50,000,000)
 *   관리처분계획 인가일    2024-10-23 (권리가액 900,000,000 · 청산금 100,000,000 납부)
 *   완공 신축APT 양도일    2026-02-16 (양도가액 1,500,000,000)
 *   → 증여 2023-06-01 ≥ 2023-01-01 이므로 §97의2③ 적용기간 **10년**, 양도일까지 2년 8개월
 *     ⇒ 기간·관계 요건 통과(적용배제 사유 없음).
 *
 *   F1: 다주택(1세대1주택 아님)  — §97의2②3호 비교에서 **A 채택**
 *   F2: 1세대1주택 + 15억(12억 초과) — §97의2②3호 비교에서 **B 채택**(tax_comparison)
 *
 *   대조군은 **같은 사실관계에서 `redevelopment`만 뺀 일반주택**이다.
 *
 * ## 현행 실측값 (2026-08-25 · 이 파일과 동일 픽스처의 throwaway probe)
 *
 * | | 재개발APT | 대조군 일반주택 |
 * |---|---|---|
 * | F1 `carryoverTaxationDetail` | **undefined (키 자체 없음)** | present · isEligible true · A 채택 |
 * | F1 `determinedTax`           | 292,710,000 | 301,110,000 |
 * | F2 `carryoverTaxationDetail` | **undefined (키 자체 없음)** | present · isEligible true · B 채택 |
 * | F2 `isPartialExempt`         | **undefined** | true |
 * | F2 `exemptReason`            | **undefined** | "1세대1주택 고가주택" |
 * | F2 `warnings` 키 존재         | **false** | true |
 *
 * ⭐ **엔진은 이미 계산했고, 세액에도 반영했다 — 버린 것은 detail뿐이다.**
 *   재개발 결과의 `steps`에 STEP 0.475가 남긴 줄이 그대로 살아 있다(`baseSteps` spread):
 *     F1: "Scenario A(결정세액 **292,710,000**) vs B(**215,010,000**) → **A** 채택"
 *     F2: "Scenario A(결정세액 **16,584,999**) vs B(**25,685,000**) → **B** 채택"
 *   그리고 실제 `determinedTax`가 각각 292,710,000 · 25,685,000으로 **채택 시나리오와 일치**한다.
 *   ⇒ 아래 기대값은 「현행 출력을 박아 넣은 것」이 아니라 **엔진이 이미 산출해 세액에 쓴 값**을
 *     결과 객체에도 실으라는 요구다(A-5·B-5가 그 사실을 독립 단언한다).
 *
 * ## 기대값 (법령상 옳은 값)
 *
 *   F1 재개발: carryoverTaxationDetail 존재 · isEligible **true** · applicablePeriodYears **10**
 *              · adoptedScenario **"A"** · comparisonExclusion **false** · exclusionReason **undefined**
 *              · scenarioA.determinedTax **292,710,000** / scenarioB.determinedTax **215,010,000**
 *              · scenarioA.acquisitionPrice **300,000,000**(§97의2①1호 증여자 취득 당시 금액)
 *              · scenarioB.acquisitionPrice **800,000,000**(증여 당시 평가액)
 *   F2 재개발: carryoverTaxationDetail 존재 · isEligible **true** · adoptedScenario **"B"**
 *              · comparisonExclusion **true** · exclusionReason **"tax_comparison"**(§97의2②3호)
 *              · isPartialExempt **true** · exemptReason 정의 + "고가주택" 포함(§95③·령 §160①)
 *              · `warnings` 키 존재(정상 경로와 동형 — 재개발이라고 경고를 못 담을 이유가 없다)
 *
 * ## 🔴 이 anchor는 수정 전 **실패한다**
 *
 *   A-1·A-2·A-3·A-4 / B-1·B-2·B-3 / C-1 이 실패한다.
 *   A-6·B-6(대조군 일반주택)과 A-5·B-5(엔진이 이미 계산했다는 증거)는 **현행에서도 통과**한다 —
 *   그 둘이 「무엇이 정상인지」를 고정해 이 anchor의 **판별력**을 만든다.
 *   대조군이 함께 빨개지면 픽스처가 깨진 것이지 이 결함이 아니다.
 *
 * ## ⚠️ `warnings`는 값 수준 판별이 이 픽스처에서 도달 불가라 **구조(키 존재)로 잰다**
 *
 *   STEP 0.65 앞에서 `warnings`에 실제로 push하는 지점은
 *   `transfer-tax-burdened-gift-step.ts:138`(부담부증여 다주택 안내) **하나뿐**이고,
 *   부담부증여 × 재개발은 설계만 있고 미구현이다(`project_burdened_gift_redevelopment_assets`).
 *   §155⑦3호 귀농(`transfer-tax.ts:313`)·§155⑳(`:447`)은 **재개발 분기보다 뒤**라 도달하지 않는다.
 *   ⇒ 값으로는 양쪽 다 undefined라 **구별력이 0**이다. 그래서 「반환 블록에 키가 있는가」를 잰다 —
 *     정상 경로는 shorthand `warnings,`(`transfer-tax.ts:652`)로 **항상 키가 있고**,
 *     재개발 반환 블록은 **키가 없다**. 이것이 이 픽스처에서 잴 수 있는 유일한 참값이다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

/** 재개발 페이로드 — 완공 신축APT 양도(§166①·subject "apt"), 청산금 납부. */
function redevInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2024-10-23"),
    rightsValue: 900_000_000,
    settlementDirection: "pay",
    settlementAmount: 100_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    priorHouseResidenceMonths: 60,
    newHouseResidenceMonths: 0,
  };
}

/**
 * `redevelopment` 유무만 다른 한 쌍을 만든다 — 그 외 이월과세 사실관계는 완전히 동일하다.
 * (대조군이 이월과세를 정상적으로 싣는다는 것이 이 anchor의 판별력이다.)
 */
function build(opts: { redevelopment: boolean; oneHouse: boolean }): TransferTaxInput {
  return baseTransferInput({
    propertyType: opts.redevelopment ? "redevelopment_apt" : "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2023-06-01"), // 수증자 취득일 = 증여 등기접수일
    acquisitionPrice: 800_000_000, // 증여 당시 평가액
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: opts.oneHouse,
    householdHousingCount: opts.oneHouse ? 1 : 2,
    residencePeriodMonths: 60,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: new Date("2023-06-01"),
      donorAcquisitionDate: new Date("2005-04-09"),
      donorAcquisitionPrice: 300_000_000,
      useEstimatedAcquisition: false,
      giftTaxAmount: 50_000_000,
      giftDateValuation: 800_000_000,
      donorRelation: "lineal",
    },
    ...(opts.redevelopment ? { redevelopment: redevInfo() } : {}),
  });
}

/** STEP 0.475가 남긴 "배우자등 이월과세 판정" step의 formula (재개발 결과에도 살아 있다). */
function carryoverStepFormula(r: { steps: { label: string; formula: string }[] }): string {
  return r.steps.find((s) => s.label.includes("배우자등 이월과세 판정"))?.formula ?? "";
}

// ════════════════════════════════════════════════════════════════════════════
// F1 — 다주택(1세대1주택 아님) · §97의2②3호 **A 채택**
// ════════════════════════════════════════════════════════════════════════════

describe("E3-06 / F1 — 재개발APT 이월과세 detail 배선 (A 채택)", () => {
  const redev = calculateTransferTax(build({ redevelopment: true, oneHouse: false }), rates);
  const control = calculateTransferTax(build({ redevelopment: false, oneHouse: false }), rates);

  it("A-1 🔴 재개발APT 결과에 carryoverTaxationDetail이 실린다 (현행 undefined)", () => {
    expect(redev.carryoverTaxationDetail).toBeDefined();
  });

  it("A-2 🔴 §97의2① 요건 통과 — isEligible true · 적용기간 10년 (§97의2③)", () => {
    expect(redev.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(redev.carryoverTaxationDetail?.applicablePeriodYears).toBe(10);
    // A가 더 크므로 ②3호 배제가 아니다 (「적은 경우」에만 배제).
    expect(redev.carryoverTaxationDetail?.exclusionReason).toBeUndefined();
    expect(redev.carryoverTaxationDetail?.comparisonExclusion).toBe(false);
  });

  it("A-3 🔴 §97의2②3호 A/B 비교 실적이 실린다 — A 292,710,000 vs B 215,010,000 → A 채택", () => {
    const d = redev.carryoverTaxationDetail;
    expect(d?.adoptedScenario).toBe("A");
    expect(d?.scenarioA.determinedTax).toBe(292_710_000);
    expect(d?.scenarioB.determinedTax).toBe(215_010_000);
  });

  it("A-4 🔴 §97의2①1호 취득가액이 실린다 — A 300,000,000(증여자) / B 800,000,000(증여평가)", () => {
    const d = redev.carryoverTaxationDetail;
    // 다건 집계의 `adoptedCarryoverAcquisitionPrice`가 읽는 값이다
    // (`transfer-tax-aggregate.ts:118·508`) — 없으면 수증자 취득가액으로 되돌아간다.
    expect(d?.scenarioA.acquisitionPrice).toBe(300_000_000);
    expect(d?.scenarioB.acquisitionPrice).toBe(800_000_000);
  });

  it("A-5 ✅ (증거) 엔진은 이미 A를 계산해 세액에 썼다 — steps·세액이 일치한다", () => {
    // 이 셋이 통과한다는 것이 「detail만 버려졌다」의 증명이다. 실패하면 픽스처가 깨진 것이다.
    expect(carryoverStepFormula(redev)).toContain("A 채택");
    expect(carryoverStepFormula(redev)).toContain("292,710,000");
    expect(redev.determinedTax).toBe(292_710_000);
  });

  it("A-6 ✅ (대조군) 같은 사실관계의 일반주택은 detail을 정상 적재한다 — 판별력", () => {
    expect(control.carryoverTaxationDetail).toBeDefined();
    expect(control.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(control.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(control.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(300_000_000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// F2 — 1세대1주택 + 15억(12억 초과) · §97의2②3호 **B 채택** + 고가주택 부분비과세
// ════════════════════════════════════════════════════════════════════════════

describe("E3-06 / F2 — 1세대1주택 고가주택 재개발APT (B 채택 · 부분비과세 플래그)", () => {
  const redev = calculateTransferTax(build({ redevelopment: true, oneHouse: true }), rates);
  const control = calculateTransferTax(build({ redevelopment: false, oneHouse: true }), rates);

  it("B-1 🔴 §95③·령 §160① 부분비과세 — isPartialExempt true (현행 undefined)", () => {
    // 12억 초과분만 과세되므로 「전부 과세」도 「전부 비과세」도 아니다.
    expect(redev.isExempt).toBe(false);
    expect(redev.isPartialExempt).toBe(true);
  });

  it("B-2 🔴 부분비과세 사유가 실린다 — exemptReason에 고가주택 (현행 undefined)", () => {
    expect(redev.exemptReason).toBeDefined();
    expect(redev.exemptReason).toContain("고가주택");
  });

  it("B-3 🔴 §97의2②3호 배제 실적이 실린다 — B 채택 · tax_comparison", () => {
    const d = redev.carryoverTaxationDetail;
    expect(d).toBeDefined();
    // ②3호 배제여도 요건 자체는 통과다 — 다건 집계가 이 값으로 비교 대상을 추린다
    // (`transfer-tax-aggregate.ts:661-663`).
    expect(d?.isEligible).toBe(true);
    expect(d?.adoptedScenario).toBe("B");
    expect(d?.comparisonExclusion).toBe(true);
    expect(d?.exclusionReason).toBe("tax_comparison");
    expect(d?.scenarioA.determinedTax).toBe(16_584_999);
    expect(d?.scenarioB.determinedTax).toBe(25_685_000);
  });

  it("B-5 ✅ (증거) 재개발 분기는 12억 안분을 실제로 수행했다 — 플래그만 없다", () => {
    // §95③·령 §160① 안분이 실제로 걸렸다는 실측. 실질이 부분비과세인데
    // B-1·B-2의 플래그만 비어 있다는 것이 결함의 형태다.
    expect(redev.redevelopmentDetail?.highValueAllocation).toBeDefined();
    expect(carryoverStepFormula(redev)).toContain("B 채택");
    expect(redev.determinedTax).toBe(25_685_000);
  });

  it("B-6 ✅ (대조군) 같은 사실관계의 일반주택은 셋 다 정상 적재한다 — 판별력", () => {
    expect(control.isPartialExempt).toBe(true);
    expect(control.exemptReason).toBe("1세대1주택 고가주택");
    expect(control.carryoverTaxationDetail?.exclusionReason).toBe("tax_comparison");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C — 반환 블록 구조: 네 키가 통째로 빠져 있다
// ════════════════════════════════════════════════════════════════════════════

describe("E3-06 / C — 재개발 반환 블록에 키 자체가 없다", () => {
  const redev = calculateTransferTax(build({ redevelopment: true, oneHouse: true }), rates);
  const control = calculateTransferTax(build({ redevelopment: false, oneHouse: true }), rates);
  const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

  it("C-1 🔴 warnings 키가 정상 경로와 동형으로 존재한다 (현행: 재개발만 키 부재)", () => {
    // 값 수준 판별이 도달 불가라 구조로 잰다 — 파일 상단 ⚠️ 절 참조.
    // 대조군이 true인 것이 이 단언의 판별력이다.
    expect(has(control, "warnings")).toBe(true);
    expect(has(redev, "warnings")).toBe(true);
  });

  it("C-2 ✅ (대조군) 정상 경로는 네 키를 모두 가진다 — 무엇이 정상인지 고정", () => {
    for (const k of ["carryoverTaxationDetail", "isPartialExempt", "exemptReason", "warnings"]) {
      expect(has(control, k)).toBe(true);
    }
  });
});
