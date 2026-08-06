/**
 * anchor: 증여 토지 §163⑨**1호** — max(① 상증법 평가액, ② §164④ 취득당시 기준시가) (G-1).
 *
 * 「소득세법 시행령」 §163⑨1호: "1990년 8월 30일 개별공시지가가 고시되기 전에 **상속 또는 증여**받은
 * 토지의 경우에는 … 평가한 가액과 **제164조제4항의 규정에 의한 가액 중 많은 금액**"
 *
 * ⭐ **엔진은 이미 이 비교를 수행한다** — 2026-08-06 실측으로 확인. 계획서 §10은
 *    "`pre1990Land` payload가 있으면 엔진이 환산 모드로 전환해 증여의 신고가액 경로가 깨진다"고
 *    진단했으나 **그렇지 않다**: STEP 0.4가 `acquisitionPrice: 0`·`useEstimatedAcquisition: true`로
 *    override해도, STEP 0.45(`runInheritedAcquisitionStep` → `applyResultToInput`)가
 *    `acquisitionPrice`를 max 결과로 **덮어쓴다**. ③ 환산은 가목이 확인되면 채택되지 않는다
 *    (법 §97①1호 단서).
 *
 * ⇒ G-1의 실제 갭은 **입력 계층**뿐이다 — API `hasPre1990` 게이트의 gift 배제와,
 *   증여 토지에 §164④ 등급 입력 UI가 없는 것.
 *
 * 이 anchor는 그 엔진 계약을 고정한다 — 입력 계층을 고치는 동안 깨지지 않아야 한다.
 *
 * 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md §4 G-1 · §10
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const TRANSFER_STD = 1_243_350_000;

/** 실측 고정값 — 위 등급·면적 조합의 §164④ 취득당시 기준시가(②). */
const SEC_164_4_AMOUNT = 84_443_174;

function landInput(reportedValue: number, over: Record<string, unknown> = {}) {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1987-05-01"), // 의제취득일 後 · 1990.8.30. 前
    acquisitionPrice: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtTransfer: TRANSFER_STD,
    pre1990Land: {
      acquisitionDate: new Date("1987-05-01"),
      transferDate: new Date("2023-02-16"),
      areaSqm: 184.2,
      pricePerSqm_1990: 1_100_000,
      pricePerSqm_atTransfer: 6_750_000,
      grade_1990_0830: 218,
      gradePrev_1990_0830: 218,
      gradeAtAcquisition: 200,
    },
    inheritedAcquisition: {
      inheritanceDate: new Date("1987-05-01"), // = 증여일
      assetKind: "land",
      reportedValue, // ① 증여 신고가액 (`fixedAcquisitionPrice`에서 온다)
      standardPriceAtTransfer: TRANSFER_STD,
      transferDate: new Date("2023-02-16"),
      transferPrice: 920_000_000,
    },
    ...over,
  });
}

describe("증여 토지 §163⑨1호 — max(①, ② §164④)", () => {
  it("G1-A: ① > ② → ① 상증법 평가액 채택", () => {
    const r = calculateTransferTax(landInput(100_000_000), mockRates);
    const d = r.inheritedAcquisitionDetail!;
    expect(d.acquisitionPrice).toBe(100_000_000);
    expect(d.legalBasis).toContain("§163 ⑨ 1호");
    expect(d.legalBasis).toContain("§164 ④");
    expect(d.formula).toContain("84,443,174"); // ②가 실제로 비교됐다
  });

  it("G1-B: ② > ① → ② §164④ 취득당시 기준시가 채택 (납세자 신고액보다 클 수 있다)", () => {
    const r = calculateTransferTax(landInput(50_000_000), mockRates);
    const d = r.inheritedAcquisitionDetail!;
    expect(d.acquisitionPrice).toBe(SEC_164_4_AMOUNT);
    expect(d.formula).toContain("§164④");
  });

  it("G1-C(불변식): ③ 환산으로 가지 않는다 — 가목이 확인되면 나목 미도달(법 §97①1호 단서)", () => {
    // STEP 0.4가 acquisitionPrice=0·useEstimatedAcquisition=true로 override해도
    // STEP 0.45가 max 결과로 덮으므로 환산취득가가 채택되지 않는다.
    const r = calculateTransferTax(landInput(100_000_000), mockRates);
    const d = r.inheritedAcquisitionDetail!;
    expect(d.method).not.toBe("converted");
    expect(d.acquisitionPrice).toBeGreaterThan(0);
  });

  it("G1-D(회귀): pre1990Land 미공급 시 ②가 비교되지 않는다 — ② 주입은 payload에 종속", () => {
    // pre1990Land가 없으면 ②(landValuationStdPrice) 주입 자체가 일어나지 않는다
    // (`shouldInjectLandMax`가 `!!pre1990LandResult`를 요구 — inheritance-acquisition-helpers.ts:191).
    // 보충적평가 경로로 떨어지므로 면적을 함께 공급한다.
    const r = calculateTransferTax(
      landInput(100_000_000, {
        pre1990Land: undefined,
        inheritedAcquisition: {
          inheritanceDate: new Date("1987-05-01"),
          assetKind: "land",
          reportedValue: 100_000_000,
          landAreaM2: 184.2,
          publishedValueAtInheritance: 500_000,
          standardPriceAtTransfer: TRANSFER_STD,
          transferDate: new Date("2023-02-16"),
          transferPrice: 920_000_000,
        },
      }),
      mockRates,
    );
    const d = r.inheritedAcquisitionDetail!;
    expect(d.formula).not.toContain("84,443,174");
  });
});
