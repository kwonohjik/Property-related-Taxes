// D6-01 anchor — 조특법 §98의8① 괄호 「2015.12.31 이전 임대계약 체결」 한정
//
// 법 §98의8①: 「… 5년 이상 임대한 주택(거주자가 「소득세법」 제168조에 따른 사업자등록과
//   「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 하고 **2015년 12월 31일
//   이전에 임대계약을 체결한 경우로 한정한다**)을 양도하는 경우에는 …」.
// 위임 시행령(령 §98의7⑤ → 령 §98의5⑤)은 임대기간 **계산**(기산일·상속합산)만 정하고
//   이 시한을 대체하지 않는다 — 즉 위임 체인 어디에도 이를 완화하는 규정이 없다.
//
// 종전에는 엔진·⑤⑧⑫⑬⑭ 어디에도 임대계약 체결일이 없어, 2016년 임대계약분도 임대기간
//   60개월만 채우면 적격이 되어 5년 발생분 50%가 부당하게 공제됐다.
// 동일 구조의 §98의6①2호는 `UNSOLD_98_6_RENTAL_CONTRACT_TO`(2011.12.31)로 이미 차단한다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  evaluateUnsold988,
  UNSOLD_98_8_RENTAL_CONTRACT_TO,
  type Unsold988Input,
} from "@/lib/tax-engine/transfer-reductions/unsold-98-8";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

/** 2015.6 계약·7월 취득, 임대 78개월, 2022.7 양도 (5년 후 안분 경로) */
function base988(overrides: Partial<Unsold988Input> = {}): Unsold988Input {
  return {
    transferDate: D("2022-07-01"),
    acquisitionDate: D("2015-07-01"),
    contractDate: D("2015-06-01"),
    acquisitionPrice: 550_000_000,
    exclusiveAreaSqm: 84.5,
    rentalContractDate: D("2015-12-20"),
    rentalStartDate: D("2016-01-01"),
    isUnsoldAfterCompletion: true,
    isFirstContract: true,
    isNotRecontract: true,
    transferIncome: 200_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...overrides,
  };
}

describe("D6-01 §98의8① 임대계약 체결 시한 (2015.12.31)", () => {
  it("D6-01-1: 시한 상수는 2015-12-31 (UTC 자정 — §98의9 선례와 동일 파싱)", () => {
    expect(UNSOLD_98_8_RENTAL_CONTRACT_TO.getTime()).toBe(new Date("2015-12-31").getTime());
  });

  it("D6-01-2 경계 적격: 2015-12-31 체결 → 적격", () => {
    const r = evaluateUnsold988(base988({ rentalContractDate: D("2015-12-31") }));
    expect(r.isEligible).toBe(true);
  });

  it("D6-01-3 경계 배제: 2016-01-01 체결 → RENTAL_CONTRACT_TOO_LATE", () => {
    const r = evaluateUnsold988(base988({ rentalContractDate: D("2016-01-01") }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("RENTAL_CONTRACT_TOO_LATE");
    expect(r.reducibleTransferIncome).toBe(0);
  });

  it("D6-01-4: 미입력 → MISSING_RENTAL_CONTRACT_DATE (자동 fallback 없음)", () => {
    const r = evaluateUnsold988(base988({ rentalContractDate: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("MISSING_RENTAL_CONTRACT_DATE");
  });

  it("D6-01-5: 배제사유 근거는 법 §98의8", () => {
    const r = evaluateUnsold988(base988({ rentalContractDate: D("2016-02-20") }));
    const reason = r.ineligibleReasons.find((x) => x.code === "RENTAL_CONTRACT_TOO_LATE");
    expect(reason?.legalBasis).toContain("98의8");
    expect(reason?.message).toContain("2015.12.31");
  });

  it("D6-01-6: 임대기간 60개월을 채워도 시한 초과면 차단된다 (종전 결함의 핵심)", () => {
    // 임대개시 2016-03-01 → 2022-07-01 = 76개월. 기간 요건은 충족하지만 계약이 2016년이다.
    const r = evaluateUnsold988(
      base988({ rentalContractDate: D("2016-02-20"), rentalStartDate: D("2016-03-01") }),
    );
    expect(r.rentalMonths).toBeGreaterThanOrEqual(60);
    expect(r.ineligibleReasons.map((x) => x.code)).not.toContain("RENTAL_PERIOD_SHORT");
    expect(r.isEligible).toBe(false);
  });

  it("D6-01-7 5년 내 경로(전액 기준)에도 동일하게 적용", () => {
    const r = evaluateUnsold988(
      base988({
        acquisitionDate: D("2016-02-01"),
        transferDate: D("2021-01-20"),
        rentalContractDate: D("2016-01-02"),
        rentalStartDate: D("2016-01-05"),
      }),
    );
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("RENTAL_CONTRACT_TOO_LATE");
  });
});

describe("D6-01 풀 파이프라인 — 세액 영향", () => {
  const RED = {
    type: "unsold_98_8" as const,
    contractDate988: new Date("2015-11-01"),
    acquisitionPrice988: 500_000_000,
    exclusiveAreaSqm988: 84,
    rentalStartDate988: new Date("2016-03-01"),
    isUnsoldAfterCompletion988: true,
    isFirstContract988: true,
    isNotRecontract988: true,
    standardPriceAtAcquisition988: 200_000_000,
    standardPriceAt5Years988: 300_000_000,
    standardPriceAtTransfer988: 400_000_000,
  };

  function run(rentalContractDate988: Date) {
    return calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2016-02-01"),
        transferDate: new Date("2022-04-01"),
        householdHousingCount: 2,
        reductions: [{ ...RED, rentalContractDate988 }],
      }),
      makeMockRates(),
    );
  }

  it("D6-01-8: 2016-02-20 임대계약 → 불적격 · 소득 차감 0", () => {
    const r = run(new Date("2016-02-20"));
    expect(r.unsold988Detail?.isEligible).toBe(false);
    expect(r.unsold988Detail?.reducibleTransferIncome ?? 0).toBe(0);
  });

  it("D6-01-9 대조군: 2015-12-20 임대계약 → 적격 · 차감이 결정세액을 낮춘다", () => {
    const late = run(new Date("2016-02-20"));
    const ok = run(new Date("2015-12-20"));
    expect(ok.unsold988Detail?.isEligible).toBe(true);
    expect(ok.unsold988Detail!.reducibleTransferIncome).toBeGreaterThan(0);
    expect(ok.determinedTax).toBeLessThan(late.determinedTax);
  });
});

describe("D6-01 ④⑧⑫ 배관", () => {
  const form = (v: string): AssetReductionForm =>
    ({
      ...getReductionDefault("unsold_98_8"),
      contractDate988: "2015-11-01",
      acquisitionPrice988: "500000000",
      exclusiveAreaSqm988: "84",
      rentalContractDate988: v,
      rentalStartDate988: "2016-03-01",
      isUnsoldAfterCompletion988: true,
      isFirstContract988: true,
      isNotRecontract988: true,
    }) as AssetReductionForm;

  it("D6-01-10 ②기본값: 빈 문자열 — 미입력이 요건 충족으로 읽히지 않는다", () => {
    const d = getReductionDefault("unsold_98_8") as { rentalContractDate988?: string };
    expect(d.rentalContractDate988).toBe("");
  });

  it("D6-01-11 ④: toEngineReductions가 rentalContractDate988을 실어 보낸다", () => {
    const [r] = toEngineReductions([form("2015-12-20")], "purchase") as Array<Record<string, unknown>>;
    expect(r.rentalContractDate988).toBe("2015-12-20");
  });

  it("D6-01-12 ⑫: Zod가 rentalContractDate988을 stripping하지 않는다", () => {
    const parsed = reductionSchema.parse({
      type: "unsold_98_8",
      contractDate988: "2015-11-01",
      rentalContractDate988: "2015-12-20",
      rentalStartDate988: "2016-03-01",
    }) as Record<string, unknown>;
    expect(parsed.rentalContractDate988).toBe("2015-12-20");
  });

  it("D6-01-13 ⑧: 미입력이면 validate가 차단한다 (엔진 MISSING과 대칭)", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionDate: "2016-02-01",
      reductions: [form("")],
    };
    const issue = validateStep2Reductions(2, {
      assets: [asset],
      transferDate: "2022-04-01",
    } as unknown as TransferFormData);
    expect(issue?.message).toContain("임대계약 체결일");
  });
});
