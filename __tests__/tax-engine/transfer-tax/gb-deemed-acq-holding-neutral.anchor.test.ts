/**
 * 일반건물 pre-1985 — **취득시기 의제(1985.1.1.)가 보유기간 축에 미치는 영향은 0**이다.
 *
 * `transfer-gb-pre1985-163-9.plan.md` §6이 「별도 확인 필요」로 남긴 항목의 종결 anchor다.
 * #1135는 취득**가액** 축만 고쳤고, 보유기간·세율·장기보유특별공제 축은 열려 있었다.
 *
 * ## 실측 (2026-08-07) — 차이가 사라지는 경계는 **2000-01-02**
 *
 * 같은 자산(1980-05-01 상속)의 취득일만 의제취득일로 바꿔 양도연도를 훑었다:
 *
 * | 양도일 | 현행(실제 취득일 1980) | 의제 반영(1985-01-01) | 차이 |
 * |---|---|---|---|
 * | 1990-06-30 | 388,335,000 | 445,260,000 | 56,925,000 |
 * | 1995-06-30 | 334,920,000 | 388,335,000 | 53,415,000 |
 * | 1999-12-31 | 334,920,000 | 345,546,000 | 10,626,000 |
 * | **2000-01-02** | 334,920,000 | 334,920,000 | **0** |
 * | 2026-02-16 | 334,920,000 | 334,920,000 | **0** |
 *
 * 경계의 정체는 **장기보유특별공제 표1의 상한**이다 — 「소득세법」 제95조 제2항 표1은
 * 「15년 이상 100분의 30」에서 멈춘다. 의제취득일(1985.1.1.)로 기산해도 2000.1.1.에 15년에
 * 닿으므로, 그 뒤 양도는 **어느 기산일을 쓰든 30%**다. 세율 축도 마찬가지다 — pre-1985
 * 취득이면 어느 양도일에도 2년을 넘으므로 단기세율 경계(1년·2년)에 걸리지 않는다.
 *
 * ⇒ 「소득세법」 제26조의2(국세기본법) 부과제척기간 안에 있는 어떤 양도에서도 **세액이 같다**.
 *
 * ## 남은 축도 GB에는 도달하지 않는다
 *
 * 총보유기간에 의존하는 판정이 하나 더 있다 — 비사업용 토지의 「보유기간의 100분의 60」
 * 기간요건(「소득세법」 제104조의3 제1항). 그런데 **GB 경로는 `judgeNonBusinessLand`를
 * 호출하지 않는다**(grep 0건 — `general-building-route-{helper,actual}.ts`·
 * `general-building-valuation.ts`). 비사업용 여부를 **입력 플래그로 직접 받아** 카드에 싣는다
 * (`general-building-route-actual.ts:438~453`). ⇒ 기간요건 축이 성립하지 않는다.
 *
 * ## 그래서 「고치지 않는다」 — 근거 두 가지
 *
 * 1. **영향이 0이다**(위 실측). 실익 없는 전역 변경은 회귀 위험만 남긴다 —
 *    `calculateHoldingPeriod`는 전 세목·전 자산이 공유하는 단일 진실이고
 *    (`tax-utils.ts:241`), 여기에 의제취득일을 넣으면 **GB만이 아니라 모든 경로**가 바뀐다.
 *    참고: 현재 의제취득일 보정을 하는 보유기간 경로는 **어디에도 없다** —
 *    `multi-parcel-transfer.ts`의 `effectiveAcquisitionDate`는 환지(換地) 전용이다.
 * 2. **법령 판정이 확정되지 않았다.** 문언은 적용 방향으로 읽힌다 —
 *    「소득세법」 부칙(1994.12.22. 법률 제4803호) **제8조**의 표제가
 *    「**양도자산의 취득시기에 관한 의제**」이고(취득가액 전용 규정이 아니다),
 *    「1984년 12월 31일 이전에 취득한 것은 1985년 1월 1일에 취득한 것으로 보며」라고 정한다
 *    (조심 2017광0251 〈별지〉 관련법령에 verbatim 수록). 그리고 「소득세법」 제95조 제4항은
 *    「보유기간은 그 자산의 **취득일**부터 양도일까지로 한다」고만 하고 예외를 이월과세·
 *    가업상속공제 둘로 한정한다.
 *    그러나 **반대 방향 실무해석의 유무를 확인하지 못했다** — 국세청 법령해석은 법제처
 *    OPEN API가 본문 조회를 제공하지 않고(`ntsCgmExpc`는 목록만), 조세심판례에서도
 *    「의제취득일 × 장기보유특별공제」를 정면으로 다룬 건을 찾지 못했다(검색 0건).
 *    ⇒ **본문 미확인 근거로 세액을 바꾸지 않는다**(memory
 *    `feedback_unverified_authority_blocks_tax_change`). 영향이 0이라 착수 조건도 아니다.
 *
 * ## 이 anchor가 지키는 것
 *
 * **해석 중립**이다 — 의제취득일을 반영하든 안 하든 2026년 양도의 세액은 같아야 한다.
 * 누군가 나중에 의제취득일을 넣더라도 이 단언은 통과해야 한다. 반대로 이것이 깨지면
 * **부과제척기간 안의 실사안 세액이 움직였다**는 뜻이므로 그 변경은 재검토 대상이다.
 *
 * 설계: `docs/02-design/features/transfer-gb-pre1985-163-9.plan.md` §6
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const T = 1_620_000_000;

/** 상속 취득 일반건물 — 취득일만 바꿔 가며 비교한다(그 외 입력은 P85 anchor와 동일). */
function inherited(acqDate: string): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: acqDate,
    acquisitionDate: acqDate,
    decedentAcquisitionDate: "1970-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    publishedValueAtInheritance: "50000000",
    gbBuildingInheritedValue: "20000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "150000000",
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    transferPrice: String(T),
    actualSalePrice: String(T),
  } as AssetForm;
}

function tax(acqDate: string, transferDate: string): number {
  const p = buildGeneralBuildingValuation(inherited(acqDate), transferDate) as
    | Record<string, unknown>
    | undefined;
  if (!p) throw new Error("④ API 변환이 payload를 drop했다");
  return dispatchGeneralBuilding(
    p,
    T,
    new Date(transferDate),
    new Date(acqDate),
    0,
    0,
    Number(transferDate.slice(0, 4)),
    0,
    [],
    makeMockRates(),
  ).aggregated.calculatedTax;
}

/** 현행 = 실제 취득일 기산 · 의제 = 1985-01-01 기산. 두 값이 같으면 해석이 세액을 가르지 않는다. */
const pair = (transferDate: string) => ({
  현행: tax("1980-05-01", transferDate),
  의제: tax("1985-01-01", transferDate),
});

describe("D-1 — 부과제척기간 안의 양도에서는 의제취득일 해석이 세액을 가르지 않는다", () => {
  it("2026-02-16 양도 — 두 기산일의 세액이 같다", () => {
    const { 현행, 의제 } = pair("2026-02-16");
    expect(현행).toBe(334_920_000);
    expect(의제).toBe(현행);
  });

  it("2010-06-30 양도 — 같다", () => {
    const { 현행, 의제 } = pair("2010-06-30");
    expect(의제).toBe(현행);
  });

  it("2000-01-02 양도 — 경계 당일부터 같다 (장특 표1 15년 상한 도달)", () => {
    const { 현행, 의제 } = pair("2000-01-02");
    expect(의제).toBe(현행);
  });
});

describe("D-2 — 경계 前에는 갈린다 (트레이드오프를 문서로 남긴다)", () => {
  /**
   * ⚠️ **금액을 단언하지 않는다.** 이 구간의 세액은 `makeMockRates()`의 단일 세율표에서 나오는데,
   * 그 표는 연도 축이 없어 1999년 실제 세법을 재현하지 않는다. 여기서 지킬 것은 「경계 前에는
   * 기산일이 세액을 가른다」는 **구조적 사실**이지 그 시절의 특정 금액이 아니다
   * (memory `feedback_anchor_correction_legal_priority` — 의미 없는 수치를 잠그지 않는다).
   */
  it("1999-12-31 양도 — 의제 기산이 더 크다 (보유 10년대 → 표1 상한 미도달)", () => {
    const { 현행, 의제 } = pair("1999-12-31");
    expect(의제).toBeGreaterThan(현행);
  });

  it("경계는 2000-01-02다 — 하루 차이로 갈림이 사라진다", () => {
    expect(pair("1999-12-31").의제).not.toBe(pair("1999-12-31").현행);
    expect(pair("2000-01-02").의제).toBe(pair("2000-01-02").현행);
  });
});
