/**
 * anchor: 단건 **부분 비사업용토지**(한 필지 중 일부) — §104⑤ 비교과세 (P8 / D-10)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md
 *   §D-10 · §4.6(적용 지점 지도) · §5 매트릭스 #17~#19 · §6 B-25~B-27·B-30
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 종전 `calcTax` T-2는 한 필지 중 일부만 비사업용일 때(`nonBusinessLandAreaRatio < 1`)
 *     누진(**전체** taxBase) + 10%p × (taxBase × ratio)
 * 를 냈다(모델 A). 이는 「소득세법」 §104⑤ 어느 호도 아니며 항상 MAX를 초과한다.
 *
 * [법령 — §104⑤ 본문 **후단**, MST 280405 · 시행 2026-07-01 · 2026-08-02 법제처 실측]
 *   "이 경우 제2호의 금액을 계산할 때 … **한 필지의 토지가 제104조의3에 따른 비사업용 토지와
 *    그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아** 양도소득 산출세액을
 *    계산한다."
 *   2018.4.1. 이후 양도분 — 대법원 2014.10.30. 선고 2012두15371("비교과세 규정은 해당 자산이
 *   하나의 자산임을 전제로 하는 규정")의 취지를 반영해 신설됐다.
 *   실무 교재가 든 예시: 「1필지 농지 중 경작 부분/그렇지 않은 부분」·「1필지 농지 중
 *   주거·상업·공업지역 경계선 안과 밖」 — 정확히 이 국면이다.
 *
 * ⚠️ **취득일 함정** — 부칙 §9270호 §14①(2009.3.16~2012.12.31 취득 비사업용 토지 중과배제)에
 *   걸리면 `additionalRate = 0`이 되어 모델 A와 §104⑤ MAX가 같아진다. 조사 첫 probe가 취득일을
 *   2010-01-01로 잡아 차액 0을 얻었다. 아래 케이스는 **B-27을 제외하고 전부 위기구간 밖**이다.
 */
import { describe, it, expect } from "vitest";
import { resolveSplitAwareTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const parsedRates = parseRatesFromMap(makeMockRates());
const D = (s: string) => new Date(s);

/** 위기취득 배제(2009.3.16~2012.12.31) **밖** */
const NORMAL_ACQ = "2015-01-01";

/**
 * 단건 STEP 7 세액 확정 경로. `splitDetail`이 없는 = 토지·건물 분리취득이 아닌 일반 자산.
 * `nonBusinessLandAreaRatio`는 `judgeNonBusinessLand`가 파생해 주입하는 값이라
 * (`transfer-tax.ts:241`) 여기서는 직접 넣어 분기만 관측한다.
 */
function run(taxBase: number, ratio: number | undefined, acq = NORMAL_ACQ) {
  return resolveSplitAwareTax({
    taxBase,
    transferIncome: taxBase,
    basicDeduction: 0,
    splitDetail: undefined,
    parsedRates,
    taxRateInput: baseTransferInput({
      propertyType: "land",
      acquisitionDate: D(acq),
      transferDate: D("2026-07-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      isNonBusinessLand: true,
      nonBusinessLandAreaRatio: ratio,
    }),
  });
}

describe("P8 / D-10 — 부분 비사업용토지는 §104⑤ MAX로 계산한다", () => {
  it("B-25: 과세표준 6억 · 비사토 면적비율 0.5 — **2호(별개 자산)가 이긴다**", () => {
    // 1호 = 누진(600,000,000) = 600,000,000×42% − 35,940,000 = 216,060,000
    // 2호 = [비사토 300,000,000: 누진 94,060,000 + 10% 30,000,000 = 124,060,000]
    //      + [그 외 300,000,000: 누진 94,060,000]
    //     = 218,120,000  ← 2호 승
    // 종전 모델 A = 216,060,000 + 30,000,000 = 246,060,000 (27,940,000 과다)
    expect(run(600_000_000, 0.5).calculatedTax).toBe(218_120_000);
  });

  it("B-26: 과세표준 6억 · 비율 0.2 — **1호(합산 누진)가 이긴다**", () => {
    // 2호 = [비사토 120,000,000: 26,560,000 + 12,000,000] + [그 외 480,000,000: 166,060,000]
    //     = 204,620,000 < 1호 216,060,000
    // 종전 모델 A = 228,060,000 (12,000,000 과다)
    expect(run(600_000_000, 0.2).calculatedTax).toBe(216_060_000);
  });

  it("B-26b: 과세표준 10억 · 비율 0.3 — 1호 승", () => {
    // 종전 모델 A = 414,060,000 (30,000,000 과다)
    expect(run(1_000_000_000, 0.3).calculatedTax).toBe(384_060_000);
  });

  it("B-26c: 과세표준 3억 · 비율 0.4 — 1호 승", () => {
    // 종전 모델 A = 106,060,000 (12,000,000 과다)
    expect(run(300_000_000, 0.4).calculatedTax).toBe(94_060_000);
  });
});

describe("P8 회귀 — 바꾸지 않은 경로", () => {
  it("B-30: `ratio = 1`(전량 비사토)은 **불변** — 파트가 하나뿐이라 2호 = 현행", () => {
    // 별개 자산으로 나눌 대상이 없다. 2호 = 누진(전체) + 10%×전체 = 현행이고 2호 ≥ 1호.
    // 압도적 다수 경로가 여기라 D-10 정정의 blast radius가 `ratio < 1`로 닫힌다(§5 #19).
    const r = run(600_000_000, 1);
    expect(r.calculatedTax).toBe(216_060_000 + 60_000_000);
    expect(r.surchargeType).toBe("non_business_land");
  });

  it("B-30b: `ratio` 미지정(undefined)도 전량 비사토와 동일 — 불변", () => {
    expect(run(600_000_000, undefined).calculatedTax).toBe(276_060_000);
  });

  it("B-27: 위기취득(2009.3.16~2012.12.31)은 **불변** — 가산 0이라 모델 A = 1호", () => {
    // 부칙 §9270호 §14①로 `additionalRate = 0` → 2호 = 누진 분할 합 ≤ 1호 = 누진(전체).
    // MAX가 1호를 고르고 그 값이 현행과 같다.
    const r = run(600_000_000, 0.2, "2010-01-01");
    expect(r.calculatedTax).toBe(216_060_000);
    expect(r.nblSurchargeExcluded).toBe(true);
  });

  it("B-27b: 비사업용토지가 아니면 진입하지 않는다 — 일반 누진 불변", () => {
    const r = resolveSplitAwareTax({
      taxBase: 600_000_000,
      transferIncome: 600_000_000,
      basicDeduction: 0,
      splitDetail: undefined,
      parsedRates,
      taxRateInput: baseTransferInput({
        propertyType: "land",
        acquisitionDate: D(NORMAL_ACQ),
        transferDate: D("2026-07-01"),
        isOneHousehold: false,
        householdHousingCount: 0,
        isNonBusinessLand: false,
      }),
    });
    expect(r.calculatedTax).toBe(216_060_000);
  });
});
