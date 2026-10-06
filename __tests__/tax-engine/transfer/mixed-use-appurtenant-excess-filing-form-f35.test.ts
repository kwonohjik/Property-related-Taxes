/**
 * F35 — 겸용주택 **배율초과 비사업용토지** × 신고서 양식 4열 표 **회귀 anchor**.
 *
 * ✅ F35 수정 완료. 이 파일은 이제 **「이래야 맞다」를 단언**한다 — 신설 시점의
 *    characterization(오분류 고정) 역할은 끝났고, 기대값은 **정정된 표시 동작**이다.
 *
 * ── 종전 결함 (표시 축. 세액은 불변이었다) ──────────────────────────────────
 * 겸용주택 부수토지가 배율(수도권 주·상·공 3배)을 초과하면 엔진은 그 초과분 양도차익을
 * `nonBusinessLandPart`로 **분리**하고 「소득세법」 제104조 제5항 본문 후단에 따라
 * **별개 자산**으로 과세한다(과세표준에 그대로 들어간다). 그런데 신고서 어댑터
 * `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts`가
 *   · `transferGain` = 주택분 + 상가분   ← 비사토 차익이 **주택분 안에 그대로 남아 있다**
 *   · `taxableGain`  = 주택분 안분과세분 + 상가분   ← 비사토 차익이 **빠졌다**
 * 로 조립했다. 표의 「비과세 양도차익」은 `FilingFormTableHelpers.ts`에서
 * `전체 양도차익 − 과세대상 양도차익`으로 유도되므로, **과세되는 비사업용토지 양도차익이
 * 통째로 「비과세」로 계상**됐다.
 *
 * ── 채택한 정정 (나) — 주택분 토지 열 안에서 과세/비과세 분해 ────────────────
 * 비사토 전용 열을 신설하지 않는다. §104⑤ 후단의 「각각을 별개의 자산으로 보아」는
 * 「**제2호의 금액을 계산할 때**」로 명시 한정된 의제여서 산출세액 계산 전용이고,
 * 양도차익·필요경비 기재 단계까지 미치지 않는다. 배율초과분은 주택 부수토지와 **같은 필지**이므로
 * 「주택분 토지」 열 안에서 갈리는 것이 이 표(주택분·상가분 × 토지·건물)의 축과 맞다.
 *
 *   · 어댑터 `taxableGain`·`longTermHoldingDeduction`에 비사토분 가산 (`transferGain`은 **이미 gross**라 제외)
 *   · `FilingFormTableFinancials.fourPartFinancials`의 안분 분모를 **비사토를 뺀** 주택분 차익으로 바꾸고,
 *     비사토 차익·장특·양도소득금액을 주택분 토지 열에 전액 과세로 되돌림
 *   · `FilingFormTableHelpers`의 `ltHoldingPart`(보유 기간분) 합계·주택분 토지 칸에도 비사토 장특 가산
 *
 * ── 신설 이유 — 회귀 감지가 0이었다 ─────────────────────────────────────────
 * 신고서 표를 보는 기존 anchor 4건은 **전부 배율초과가 없는** 픽스처다:
 *   · `__tests__/components/mixed-use-filing-form-4col.anchor.test.tsx`        → `mixedUseCase14()` (토지 168.3㎡)
 *   · `__tests__/components/mixed-use-filing-form-per-part-date.anchor.test.tsx` → `mixedUseCase14()`
 *   · `__tests__/components/mixed-use-statement-acquisition-actual.anchor.test.ts` → 인라인(토지 200㎡ · 정착 100㎡)
 *   · `__tests__/components/calc/detailed-statement-lthd-fallback.test.tsx`     → 인라인(토지 200㎡ · 정착 100㎡)
 * 실측(2026-08): 어댑터 `taxableGain`·`longTermHoldingDeduction`에 `nonBusinessLandPart`를
 * 가산하는 변이를 넣고 `npm run test:transfer`(596파일 6,598테스트)를 돌려도 **0건**이 빨개졌다.
 *
 * ── 배율초과 발동 조건 (`transfer-tax-mixed-use-helpers.ts:426-443`) ─────────
 *   주택 부수토지면적 > 주택 정착면적 × 배율
 *   · 주택 부수토지면적 = round2(전체토지 × 주택연면적비율)
 *   · 주택 정착면적     = round2(건물정착면적 × 주택연면적비율)
 *   · 배율 = `non-business-land/urban-area.ts:112-116` 수도권 도시지역 주·상·공 **3배**
 *   ⇒ 주택연면적비율이 양변에 같이 곱해지므로(round2 반올림 오차만 남는다) 실질 조건은
 *     **`전체토지면적 > 건물정착면적 × 배율`** 이다 — 주택/상가 면적비와 무관하다.
 *     사례14 기본값(전체토지 168.3 · 정착 100 · 3배 → 300㎡ 필요)은 **미발동**,
 *     `mixedUseExcessLand()`(전체토지 1,000)는 **발동**.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUseCase14,
  mixedUseExcessLand,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
  CASE14_HOUSING_PRICE_AT_TRANSFER,
  CASE14_COMMERCIAL_BUILDING_AT_TRANSFER,
  CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER,
} from "../_helpers/mixed-use-fixture";

const rates = makeMockRates();

const ROW_LABELS = {
  transferGain: "전체 양도차익",
  exemptGain: "비과세 양도차익",
  taxableGain: "과세대상 양도차익",
  ltDeduction: "장기보유특별공제",
  incomeAmount: "양도소득금액",
  basicDeduction: "기본공제",
  taxBase: "과세표준",
} as const;

const PART_COLS = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;

/** 픽스처 1건을 엔진 → 어댑터 → 신고서 표까지 관통시켜 관측 지점을 모아준다. */
function observe(transferPrice: number, asset: ReturnType<typeof mixedUseCase14>) {
  const breakdown = calcMixedUseTransferTax(transferPrice, CASE14_TRANSFER_DATE, asset, rates);
  const result = mixedUseToFilingResult(breakdown);
  const { mode, columns } = deriveColumns(result);
  const rows = buildRows(result, mode, undefined, undefined, transferPrice);
  const cell = (key: keyof typeof ROW_LABELS, col: string): number => {
    const row = rows.find((r) => r.label === ROW_LABELS[key]);
    if (!row) throw new Error(`row not found: ${ROW_LABELS[key]}`);
    const value = row.values[col];
    return typeof value === "number" ? value : 0;
  };
  const partSum = (key: keyof typeof ROW_LABELS): number =>
    PART_COLS.reduce((sum, col) => sum + cell(key, col), 0);
  return { breakdown, result, mode, columns, rows, cell, partSum };
}

// ══════════════════════════════════════════════════════════════════════
// 전제 — 배율초과가 실제로 발동하는가 / 기존 픽스처는 왜 못 잡는가
// ══════════════════════════════════════════════════════════════════════

describe("F35 전제: 배율초과 발동 조건", () => {
  it("P-1 기준 사례14(전체토지 168.3㎡)는 배율초과 **미발동** — 기존 anchor가 이 축을 못 본다", () => {
    const { breakdown } = observe(CASE14_TRANSFER_PRICE, mixedUseCase14());
    expect(breakdown.nonBusinessLandPart).toBeNull();
    expect(breakdown.housingPart.nonBusinessTransferRatio).toBe(0);
  });

  it("P-2 전체토지 1,000㎡ → 배율초과 발동 (수도권 주거지역 3배)", () => {
    const { breakdown } = observe(CASE14_TRANSFER_PRICE, mixedUseExcessLand());
    const nb = breakdown.nonBusinessLandPart;
    expect(nb).not.toBeNull();
    expect(nb!.appliedMultiplier).toBe(3);
    // 주택 부수토지 216.03㎡ − 허용 64.80㎡(= 정착 21.60 × 3) = 151.23㎡
    expect(nb!.excessArea).toBeCloseTo(151.23, 2);
    expect(breakdown.housingPart.nonBusinessTransferRatio).toBeCloseTo(0.7000416608804332, 12);
  });

  it("P-3 신고서 표 모드는 배율초과 여부와 무관하게 mixed-4col 4열 — **비사토 전용 열이 없다**", () => {
    const { mode, columns } = observe(CASE14_TRANSFER_PRICE, mixedUseExcessLand());
    expect(mode).toBe("mixed-4col");
    expect(columns.map((c) => c.key)).toEqual([
      "total", "housingLand", "housingBuilding", "commercialLand", "commercialBuilding",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 케이스 A — 주택분 양도가액 12억 **이하**(전액 비과세) + 배율초과
//   양도가액 23억 · 전체토지 1,000㎡
//   주택분 양도가액 351,599,527원 ⇒ housingExemptRatio = 0 (분자 proratedTaxableGain = 0)
// ══════════════════════════════════════════════════════════════════════

/**
 * S3-2 — 케이스 A fixture는 「토지만 1,000㎡로 키운 변형」이라 양도시 가목(6,100,000 × 216.03㎡ = 1,317,783,000)이
 * 개별주택가격(872,000,000)을 넘는다. 종전 뺄셈은 건물분을 0으로 clamp(토지 100%)했지만 비례에는 clamp가 없어
 * **현실적 나목을 정해야** 한다. 건물(나목)은 토지를 키워도 그대로이므로 **사례14의 실제 건물** 값을 쓴다:
 * 872,000,000 − 6,100,000 × 36.36㎡(실제 주택부수토지, = 221,796,000) = **650,204,000**.
 * → 양도시 토지분 = floor(872,000,000 × 1,317,783,000 ÷ (1,317,783,000 + 650,204,000)) = 583,899,576 · 건물분 = 288,100,424
 *   (양도가액 351,599,527원은 이 비율로 토지 235,434,420 · 건물 116,165,106로 나뉜다).
 * 케이스 A의 기대값은 이 나목으로 재산출했다.
 *
 * S3-2 추가 — 사례14 fixture는 취득시 개별주택가격(H_A)이 비어 있어 종전엔 환산 분자 0(취득가액 0)이었다. 취득시 H는 상속·증여 외에는
 * 필수라 이 파일은 test helper(`mixed-use-identity-std.ts`)가 **항등 H = 가목 + 나목(= L_A + 1)** 으로 채운다. 그래서 취득가액·양도차익·세액 단언은
 * 모두 H가 있는 값으로 재산출됐고(주택분 양도차익 336,174,985 → 128,863,759 등), 4열 합·자기정합 불변식 단언은 그대로다.
 * 케이스 B는 H_T 50억 > 가목이라 clamp가 아니다 — 항등 나목(값 불변).
 */
const CASE_A_HOUSING_BUILDING_STD_AT_TRANSFER = 650_204_000;

describe("F35 케이스 A: 12억 이하 주택분(전액 비과세) + 배율초과", () => {
  const o = observe(
    CASE14_TRANSFER_PRICE,
    mixedUseExcessLand({
      transferStandardPrice: {
        housingPrice: CASE14_HOUSING_PRICE_AT_TRANSFER,
        commercialBuildingPrice: CASE14_COMMERCIAL_BUILDING_AT_TRANSFER,
        landPricePerSqm: CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER,
        housingBuildingPrice: CASE_A_HOUSING_BUILDING_STD_AT_TRANSFER,
      },
    }),
  );
  const nb = o.breakdown.nonBusinessLandPart!;

  it("A-0 엔진 관측값 (비사업용토지 파트)", () => {
    expect(nb.transferGain).toBe(8_889_586);
    expect(nb.longTermDeductionAmount).toBe(2_666_875);
    expect(nb.incomeAmount).toBe(6_222_711);
    expect(nb.additionalRate).toBe(0.1);
    // 비사토 차익은 주택분 토지차익 12,698,653원 **안에서** 잘려 나온 값이다.
    expect(o.breakdown.housingPart.landTransferGain).toBe(12_698_653);
    expect(o.breakdown.housingPart.proratedTaxableGain).toBe(0);
  });

  it("A-1 전체 양도차익 4열 — 실측 고정 · 4열 합 == 합계 (정확)", () => {
    expect(o.cell("transferGain", "housingLand")).toBe(12_698_653);
    expect(o.cell("transferGain", "housingBuilding")).toBe(116_165_106);
    expect(o.cell("transferGain", "commercialLand")).toBe(1_119_934_807);
    expect(o.cell("transferGain", "commercialBuilding")).toBe(7_164_209);
    expect(o.cell("transferGain", "total")).toBe(1_255_962_775);
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
  });

  it("A-2 과세대상 양도차익 4열 — 주택분 토지 칸이 비사토 차익 전액", () => {
    // ✅ F35 수정 완료: 주택분은 전액 비과세(안분 0)지만 배율초과 비사업용토지 8,889,586원은
    //    §104⑤ 대상으로 **과세**되므로 주택분 토지 칸에 그대로 남는다.
    expect(o.cell("taxableGain", "housingLand")).toBe(8_889_586);
    expect(o.cell("taxableGain", "housingBuilding")).toBe(0);
    expect(o.cell("taxableGain", "commercialLand")).toBe(1_119_934_807);
    expect(o.cell("taxableGain", "commercialBuilding")).toBe(7_164_209);
    // ✅ F35: 종전 1,127,099,016 → 비사토 가산 후 1,135,988,602.
    expect(o.cell("taxableGain", "total")).toBe(1_135_988_602);
  });

  it("A-3 비과세 양도차익 4열 — 비사토가 빠진 순수 비과세분", () => {
    // ✅ F35 수정 완료: 주택분 양도차익 128,863,759원(토지 12,698,653 + 건물 116,165,106)에 섞여 있던
    //    비사업용토지 8,889,586원이 빠져 119,974,173원(= 128,863,759 − 8,889,586)만 남는다.
    expect(o.cell("exemptGain", "housingLand")).toBe(3_809_067);
    expect(o.cell("exemptGain", "housingBuilding")).toBe(116_165_106);
    expect(o.cell("exemptGain", "commercialLand")).toBe(0);
    expect(o.cell("exemptGain", "commercialBuilding")).toBe(0);
    expect(o.cell("exemptGain", "total")).toBe(119_974_173);
  });

  it("A-4 ✅ 비사업용토지 양도차익(8,889,586원)이 과세대상에 계상된다", () => {
    // 종전 오분류 금액은 **정확히** nonBusinessLandPart.transferGain 이었다 —
    // 수정 후 그 금액이 비과세에서 빠지고 과세대상으로 옮겨 온 것을 양쪽에서 확인한다.
    const nbGain = nb.transferGain;
    expect(nbGain).toBe(8_889_586);
    // 비과세 = 주택분 양도차익 − 비사토 − 주택분 안분과세분
    expect(o.cell("exemptGain", "total")).toBe(
      o.breakdown.housingPart.transferGain - nbGain - o.breakdown.housingPart.proratedTaxableGain,
    );
    expect(o.cell("exemptGain", "total")).toBe(119_974_173);
    // 과세대상 = 주택분 안분과세분 + 상가분 + 비사토
    expect(o.cell("taxableGain", "total")).toBe(
      o.breakdown.housingPart.proratedTaxableGain + o.breakdown.commercialPart.transferGain + nbGain,
    );
    expect(o.cell("taxableGain", "total")).toBe(1_135_988_602);
  });

  it("A-5 장기보유특별공제 4열 — 비사토 장특 2,666,875원이 주택분 토지 칸에 계상", () => {
    // ✅ F35 수정 완료: 주택분 장특은 0(안분 과세분 없음)이고 비사토 표1 보유분만 남는다.
    expect(o.cell("ltDeduction", "housingLand")).toBe(2_666_875);
    expect(o.cell("ltDeduction", "housingBuilding")).toBe(0);
    expect(o.cell("ltDeduction", "commercialLand")).toBe(335_980_441);
    expect(o.cell("ltDeduction", "commercialBuilding")).toBe(2_149_262);
    // ✅ F35: 종전 338,129,704 → 비사토 장특 가산 후 340,796,579.
    expect(o.cell("ltDeduction", "total")).toBe(340_796_579);
    // 보유 기간분 행에도 같은 금액이 반영돼 「합계 = 보유분 + 거주분」이 성립한다.
    const ltHolding = o.rows.find((r) => r.label.includes("보유 기간분"))!;
    const ltResidence = o.rows.find((r) => r.label.includes("거주 기간분"))!;
    expect(ltHolding.values["total"]).toBe(340_796_579);
    expect(ltHolding.values["housingLand"]).toBe(2_666_875);
    expect(
      (ltHolding.values["total"] as number) + (ltResidence.values["total"] as number),
    ).toBe(o.cell("ltDeduction", "total"));
  });

  it("A-6 양도소득금액 4열 — 비사토 양도소득금액 6,222,711원 포함", () => {
    expect(o.cell("incomeAmount", "housingLand")).toBe(6_222_711);
    expect(o.cell("incomeAmount", "housingBuilding")).toBe(0);
    expect(o.cell("incomeAmount", "commercialLand")).toBe(783_954_365);
    expect(o.cell("incomeAmount", "commercialBuilding")).toBe(5_014_946);
    // ✅ F35: 종전 788,969,312 → 비사토 양도소득금액 가산 후 795,192,023.
    expect(o.cell("incomeAmount", "total")).toBe(795_192_023);
  });

  it("A-7 ✅ 표 내부 자기정합: 과세표준 == 양도소득금액 − 기본공제", () => {
    // 과세표준은 엔진값(비사토 포함)이다. 종전에는 양도소득금액 행이 어댑터값(비사토 제외)이라
    // 같은 표 안에서 두 행이 비사토 양도소득금액(6,222,711원)만큼 어긋났다 — 이제 0이다.
    expect(o.cell("basicDeduction", "total")).toBe(2_500_000);
    expect(o.cell("taxBase", "total")).toBe(792_692_023);
    const gap = o.cell("taxBase", "total") - (o.cell("incomeAmount", "total") - o.cell("basicDeduction", "total"));
    expect(gap).toBe(0);
    expect(nb.incomeAmount).toBe(6_222_711);
  });

  it("A-8 「4열 합 = 합계」 불변식 — 수정 후에도 유지", () => {
    // 전체 양도차익은 정확 일치, floor 안분 행은 ±4원(기존 4col anchor A4와 동일 tolerance).
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
    for (const key of ["taxableGain", "exemptGain", "ltDeduction", "incomeAmount"] as const) {
      expect(Math.abs(o.partSum(key) - o.cell(key, "total"))).toBeLessThanOrEqual(4);
    }
  });

  it("A-9 세액 불변 — 표시 축 정정이 세액에 닿지 않았음을 고정", () => {
    // 과세표준·결정세액은 엔진(`buildTotalTax`)이 비사토를 포함해 산정한 값 그대로다.
    // 아래 3값은 F35 **수정 전과 동일**해야 한다.
    expect(o.result.taxBase).toBe(792_692_023);
    expect(o.result.determinedTax).toBe(296_990_649);
    expect(o.result.totalTax).toBe(326_689_713);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 케이스 B — 주택분 양도가액 12억 **초과**(안분 과세) + 배율초과
//   양도가액 100억 · 전체토지 1,000㎡ · 주택 공시가격 50억
//   housingExemptRatio 가 0도 1도 아닌 중간값 ⇒ 4열 floor 안분이 실제로 동작하는 분기
// ══════════════════════════════════════════════════════════════════════

describe("F35 케이스 B: 12억 초과 주택분(안분 과세) + 배율초과", () => {
  const HIGH_VALUE_TRANSFER = 10_000_000_000;
  const o = observe(
    HIGH_VALUE_TRANSFER,
    mixedUseExcessLand({
      transferStandardPrice: {
        housingPrice: 5_000_000_000,
        commercialBuildingPrice: 100_000_000,
        landPricePerSqm: 6_100_000,
      },
    }),
  );
  const nb = o.breakdown.nonBusinessLandPart!;

  it("B-0 엔진 관측값 (비사업용토지 파트 + 12억 안분 발동)", () => {
    expect(o.breakdown.housingPart.isExempt).toBe(false);
    expect(o.breakdown.apportionment.housingTransferPrice).toBe(5_059_593_409);
    expect(nb.transferGain).toBe(558_482_938);
    expect(nb.longTermDeductionAmount).toBe(167_544_881);
    expect(nb.incomeAmount).toBe(390_938_057);
  });

  it("B-1 전체 양도차익 4열 — 실측 고정 · 4열 합 == 합계 (정확)", () => {
    expect(o.cell("transferGain", "housingLand")).toBe(797_785_289);
    expect(o.cell("transferGain", "housingBuilding")).toBe(3_726_104_171);
    expect(o.cell("transferGain", "commercialLand")).toBe(2_895_152_209);
    expect(o.cell("transferGain", "commercialBuilding")).toBe(69_934_308);
    expect(o.cell("transferGain", "total")).toBe(7_488_975_977);
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
  });

  it("B-2 과세대상 양도차익 4열 — 안분 분모에서 비사토 제외 + 비사토 전액 가산", () => {
    // ✅ F35 수정 완료: 안분 비율의 분모가 (주택분 양도차익 − 비사토)로 바뀌어 주택분 토지·건물
    //    두 칸이 함께 올라가고, 그 위에 비사토 558,482,938원이 주택분 토지 칸에 전액 가산된다.
    expect(o.cell("taxableGain", "housingLand")).toBe(741_029_182);
    expect(o.cell("taxableGain", "housingBuilding")).toBe(2_842_372_090);
    expect(o.cell("taxableGain", "commercialLand")).toBe(2_895_152_209);
    expect(o.cell("taxableGain", "commercialBuilding")).toBe(69_934_308);
    // ✅ F35: 종전 5,990,004,852 → 6,548,487,790 (= + 558,482,938).
    expect(o.cell("taxableGain", "total")).toBe(6_548_487_790);
  });

  it("B-3 비과세 양도차익 4열 — 흡수됐던 비사토 558,482,938원이 빠졌다", () => {
    // ✅ F35 수정 완료: 종전에는 `housingExemptRatio`가 비사토를 분모에만 남겨 주택분 토지·건물
    //    두 칸에 걸쳐 비사토가 「비과세」로 흡수됐다.
    expect(o.cell("exemptGain", "housingLand")).toBe(56_756_107);
    expect(o.cell("exemptGain", "housingBuilding")).toBe(883_732_081);
    expect(o.cell("exemptGain", "commercialLand")).toBe(0);
    expect(o.cell("exemptGain", "commercialBuilding")).toBe(0);
    // ✅ F35: 종전 1,498,971,125 → 940,488,187 (= − 558,482,938).
    expect(o.cell("exemptGain", "total")).toBe(940_488_187);
  });

  it("B-4 ✅ 비사업용토지 양도차익(558,482,938원)이 과세대상에 계상된다", () => {
    const nbGain = nb.transferGain;
    expect(nbGain).toBe(558_482_938);
    // 비과세 = 주택분 양도차익 − 비사토 이전분 − 주택분 안분과세분
    const properExempt =
      o.breakdown.housingPart.transferGain - nbGain - o.breakdown.housingPart.proratedTaxableGain;
    expect(properExempt).toBe(940_488_187);
    expect(o.cell("exemptGain", "total")).toBe(properExempt);
    expect(o.cell("taxableGain", "total")).toBe(
      o.breakdown.housingPart.proratedTaxableGain + o.breakdown.commercialPart.transferGain + nbGain,
    );
    expect(o.cell("taxableGain", "total")).toBe(6_548_487_790);
  });

  it("B-5 장기보유특별공제 4열 — 비사토 장특 167,544,881원이 주택분 토지 칸에 계상", () => {
    // ✅ F35 수정 완료: 426,754,078 + 167,544,881 = 594,298,959.
    expect(o.cell("ltDeduction", "housingLand")).toBe(594_298_959);
    expect(o.cell("ltDeduction", "housingBuilding")).toBe(1_993_180_588);
    expect(o.cell("ltDeduction", "commercialLand")).toBe(868_545_661);
    expect(o.cell("ltDeduction", "commercialBuilding")).toBe(20_980_292);
    // ✅ F35: 종전 3,309,460,621 → 3,477,005,502.
    expect(o.cell("ltDeduction", "total")).toBe(3_477_005_502);
    // 보유 기간분 행에도 같은 금액이 반영돼 「합계 = 보유분 + 거주분」이 성립한다.
    const ltHolding = o.rows.find((r) => r.label.includes("보유 기간분"))!;
    const ltResidence = o.rows.find((r) => r.label.includes("거주 기간분"))!;
    expect(ltHolding.values["total"]).toBe(3_477_005_502);
    expect(ltHolding.values["housingLand"]).toBe(594_298_959);
    expect(
      (ltHolding.values["total"] as number) + (ltResidence.values["total"] as number),
    ).toBe(o.cell("ltDeduction", "total"));
  });

  it("B-6 양도소득금액 4열 — 비사토 양도소득금액 390,938,057원 포함", () => {
    // ✅ F35 수정 완료: 106,688,519 + 390,938,057 = 497,626,576.
    expect(o.cell("incomeAmount", "housingLand")).toBe(497_626_576);
    expect(o.cell("incomeAmount", "housingBuilding")).toBe(498_295_148);
    expect(o.cell("incomeAmount", "commercialLand")).toBe(2_026_606_547);
    expect(o.cell("incomeAmount", "commercialBuilding")).toBe(48_954_015);
    // ✅ F35: 종전 2,680,544,231 → 3,071,482,288.
    expect(o.cell("incomeAmount", "total")).toBe(3_071_482_288);
  });

  it("B-7 ✅ 표 내부 자기정합: 과세표준 == 양도소득금액 − 기본공제", () => {
    expect(o.cell("basicDeduction", "total")).toBe(2_500_000);
    expect(o.cell("taxBase", "total")).toBe(3_068_982_288);
    const gap = o.cell("taxBase", "total") - (o.cell("incomeAmount", "total") - o.cell("basicDeduction", "total"));
    expect(gap).toBe(0);
    expect(nb.incomeAmount).toBe(390_938_057);
  });

  it("B-8 「4열 합 = 합계」 불변식 — 수정 후에도 유지", () => {
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
    for (const key of ["taxableGain", "exemptGain", "ltDeduction", "incomeAmount"] as const) {
      expect(Math.abs(o.partSum(key) - o.cell(key, "total"))).toBeLessThanOrEqual(4);
    }
  });

  it("B-9 세액 불변 — 표시 축 정정이 세액에 닿지 않았음을 고정", () => {
    expect(o.result.taxBase).toBe(3_068_982_288);
    expect(o.result.determinedTax).toBe(1_315_102_029);
    expect(o.result.totalTax).toBe(1_446_612_231);
  });
});
