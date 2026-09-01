// CA-06 anchor — 조특령 §98①1호 괄호 「민간임대주택·공공임대주택 제외」
//
// 령 §98①1호: 「「주택법」에 의하여 사업계획승인을 얻어 건설하는 주택(「민간임대주택에 관한
//   특별법」 제2조에 따른 민간임대주택과 「공공주택 특별법」제2조제1호가목에 따른 공공임대주택을
//   제외한다. **이하 이 조에서 같다**)으로서 … 미분양주택임을 확인한 주택」.
// 괄호 말미의 「이하 이 조에서 같다」가 조 전체에 미치므로, 괄호 없는 ⑤1호(법 §98③ —
//   1998.3.1~12.31 취득 트랙)에도 동일한 제외가 적용된다.
//
// 종전에는 이 제외가 UI 안내 문구로만 고지되고 엔진 배제사유가 없어, 민간임대주택도
// §98 적격이 되어 §104① 세율이 20% 단일세율로 대체됐다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  evaluateUnsold98,
  type Unsold98Input,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(s);

/** 법 §98① 트랙(1995.11.1~1997.12.31 취득) 적격 기준선 */
function base98(overrides: Partial<Unsold98Input> = {}): Unsold98Input {
  return {
    transferDate: D("2005-06-15"),
    acquisitionDate: D("1996-06-15"),
    isResident: true,
    isNationalScale: true,
    isOutsideSeoul: true,
    isUnsoldConfirmed: true,
    isNotRentalHousing: true,
    isFirstBuyerNoOccupancy: true,
    rentedFor5Years: true,
    ...overrides,
  };
}

describe("CA-06 §98 민간임대주택·공공임대주택 제외 (령 §98①1호 괄호)", () => {
  it("CA-06-1: 제외 확인 미선언 → 불적격 (RENTAL_HOUSING_EXCLUDED)", () => {
    const r = evaluateUnsold98(base98({ isNotRentalHousing: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("RENTAL_HOUSING_EXCLUDED");
  });

  it("CA-06-2: 민간·공공임대주택임을 인정(false) → 불적격", () => {
    const r = evaluateUnsold98(base98({ isNotRentalHousing: false }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("RENTAL_HOUSING_EXCLUDED");
  });

  it("CA-06-3: 제외 확인 선언 → 적격 · 20% 단일세율 (법 §98①1호)", () => {
    const r = evaluateUnsold98(base98());
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("flat_rate_20");
    expect(r.taxReductionRate).toBe(0.2);
  });

  it("CA-06-4: ⑤1호 트랙(1998.3.1~12.31 취득)에도 동일하게 적용 — 「이하 이 조에서 같다」", () => {
    const track3 = base98({
      acquisitionDate: D("1998-06-15"),
      transferDate: D("2005-06-15"),
      isNotRentalHousing: undefined,
    });
    const r = evaluateUnsold98(track3);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("RENTAL_HOUSING_EXCLUDED");
    // 트랙 자체는 유효 — 취득기간 사유는 뜨지 않는다
    expect(r.ineligibleReasons?.map((x) => x.code)).not.toContain("OUT_OF_CONTRACT_PERIOD");
    expect(evaluateUnsold98({ ...track3, isNotRentalHousing: true }).isEligible).toBe(true);
  });

  it("CA-06-5: 배제사유는 조특령 §98①1호를 근거로 제시한다", () => {
    const r = evaluateUnsold98(base98({ isNotRentalHousing: false }));
    const reason = r.ineligibleReasons?.find((x) => x.code === "RENTAL_HOUSING_EXCLUDED");
    expect(reason?.legalBasis).toBe("조특령 §98①1호");
    expect(reason?.message).toContain("민간임대주택");
    expect(reason?.message).toContain("공공임대주택");
  });
});

describe("CA-06 풀 파이프라인 — 세율 20% 대체 여부", () => {
  const REDUCTION_98 = {
    type: "unsold_98" as const,
    isNationalScale98: true,
    isOutsideSeoul98: true,
    isUnsoldConfirmed98: true,
    isFirstBuyerNoOccupancy98: true,
    rentedFor5Years98: true,
  };

  function run(over: Record<string, unknown>) {
    return calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        acquisitionPrice: 380_000_000,
        acquisitionDate: new Date("1996-05-01"),
        transferDate: new Date("2005-06-15"),
        householdHousingCount: 2,
        reductions: [{ ...REDUCTION_98, ...over }],
      }),
      makeMockRates(),
    );
  }

  it("CA-06-6: 임대주택 제외 미확인 → §98 불적격 · 20% 단일세율 미적용", () => {
    const r = run({});
    expect(r.unsold98Detail?.isEligible).toBe(false);
    expect(r.appliedRate).not.toBe(0.2);
  });

  it("CA-06-7 대조군: 제외 확인 선언 → §98 적격 · 20% 단일세율", () => {
    const r = run({ isNotRentalHousing98: true });
    expect(r.unsold98Detail?.isEligible).toBe(true);
    expect(r.appliedRate).toBe(0.2);
  });

  it("CA-06-8: 두 경로의 산출세액 차 — 20% 대체가 실제 세액을 바꾼다", () => {
    const off = run({});
    const on = run({ isNotRentalHousing98: true });
    expect(on.calculatedTax).toBeLessThan(off.calculatedTax);
  });
});

describe("CA-06 ④·⑫ 배관 — 폼 값이 엔진까지 침묵 소실되지 않는다", () => {
  const form = (v: boolean): AssetReductionForm =>
    ({
      ...getReductionDefault("unsold_98"),
      isNationalScale98: true,
      isOutsideSeoul98: true,
      isUnsoldConfirmed98: true,
      isNotRentalHousing98: v,
      isFirstBuyerNoOccupancy98: true,
      rentedFor5Years98: true,
    }) as AssetReductionForm;

  it("CA-06-9 ②기본값: 폼 기본값은 false — 미입력이 요건 충족으로 읽히지 않는다", () => {
    const d = getReductionDefault("unsold_98") as { isNotRentalHousing98?: boolean };
    expect(d.isNotRentalHousing98).toBe(false);
  });

  it("CA-06-10 ④: toEngineReductions가 isNotRentalHousing98을 그대로 실어 보낸다", () => {
    const [on] = toEngineReductions([form(true)], "purchase") as Array<Record<string, unknown>>;
    const [off] = toEngineReductions([form(false)], "purchase") as Array<Record<string, unknown>>;
    expect(on.isNotRentalHousing98).toBe(true);
    expect(off.isNotRentalHousing98).toBe(false);
  });

  it("CA-06-11 ⑫: Zod 스키마가 isNotRentalHousing98을 stripping하지 않는다", () => {
    const parsed = reductionSchema.parse({
      type: "unsold_98",
      isNationalScale98: true,
      isOutsideSeoul98: true,
      isUnsoldConfirmed98: true,
      isNotRentalHousing98: true,
      isFirstBuyerNoOccupancy98: true,
      rentedFor5Years98: true,
    }) as Record<string, unknown>;
    expect(parsed.isNotRentalHousing98).toBe(true);
  });
});
