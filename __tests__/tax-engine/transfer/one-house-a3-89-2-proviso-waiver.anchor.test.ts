/**
 * anchor (A3 · OH-47) — §156의2③④·§156의3②③ **후단**: §154①1호·2호가목·3호에 해당하면
 * 「종전의 주택을 취득한 날부터 1년 이상이 지난 후 … 취득하는 요건」을 적용하지 않는다.
 *
 * 법령(KoreanLaw MCP·법제처 DRF 실독):
 *   · 현행 MST 286211 §156의2③ 후단 「이 경우 제154조제1항제1호, 제2호가목 및 제3호에 해당하는 경우에는
 *     종전의 주택을 취득한 날부터 1년 이상이 지난 후 조합원입주권을 취득하는 요건을 적용하지 아니한다」
 *     (<개정 2012.6.29, 2013.2.15 …>). ④ 후단도 같은 문언(2022-02-15 시행본 MST 240685부터 1년 요건과 함께).
 *   · §156의3②·③ 후단(분양권) — 2024-05-17 시행본 MST 262425 실독, 같은 문언.
 *   · 형제 §155① 후단은 `evaluateTemporaryTwoHouseTiming`이 이미 구현(화이트리스트
 *     `TEMP_TWO_HOUSE_PROVISO_REASONS` — 1호·2호가목·3호).
 *
 * 결함: `resolveArticle89Clause2`가 1년 요건을 날짜로만 비교해, 수용·부득이 사유 세대가 권리를 1년 안에
 *   취득했으면 §89②로 비과세를 배제했다(리뷰 실패 시나리오 — totalTax 328,350,000).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { baseTransferInput, makeMockRates, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);

/** 리뷰 실패 시나리오 — 종전주택 2023-01-02 · 입주권 2023-06-01(1년 미경과) · 양도 2024-06-01 9억 */
function input(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: D("2023-01-02"),
    transferDate: D("2024-06-01"),
    residencePeriodMonths: 0,
    presaleRights: [
      { id: "r1", type: "redevelopment_right", acquisitionDate: D("2023-06-01"), region: "capital" } as PresaleRight,
    ],
    ...over,
  });
}

/** §154①2호가목 — 사업인정 고시 2023-03-01(취득 이후) · 수용일 2024-05-01(5년 내) */
const EXPROPRIATION = {
  oneHouseExemptionProviso: {
    reason: "expropriation" as const,
    businessApprovalDate: D("2023-03-01"),
    expropriationDate: D("2024-05-01"),
  },
};

describe("OH-47 — §156의2③ 후단 1년 요건 면제", () => {
  it("🔴 수용(2호가목) + 1년 미경과 입주권 → ③ 예외 충족 → 전액 비과세", () => {
    const r = calculateTransferTax(input(EXPROPRIATION), makeMockRates());
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("술어 — exception_met(③) · 3년 기한 산출", () => {
    const v = resolveArticle89Clause2(input(EXPROPRIATION), undefined);
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ③");
  });

  it("대조군 — 단서 미선언 + 1년 미경과 → 배제 확정(과세)", () => {
    expect(resolveArticle89Clause2(input(), undefined).status).toBe("excluded");
    expect(calculateTransferTax(input(), makeMockRates()).isExempt).toBe(false);
  });

  it("부정 짝 — 3호(부득이) 선언이어도 거주 1년 미만이면 §154① 단서 불충족 → 면제 없음(배제)", () => {
    const v = resolveArticle89Clause2(
      input({ oneHouseExemptionProviso: { reason: "unavoidable" }, residencePeriodMonths: 11 }),
      undefined,
    );
    expect(v.status).toBe("excluded");
  });

  it("긍정 짝 — 3호(부득이) + 거주 12개월 → 면제 → exception_met", () => {
    const v = resolveArticle89Clause2(
      input({ oneHouseExemptionProviso: { reason: "unavoidable" }, residencePeriodMonths: 12 }),
      undefined,
    );
    expect(v.status).toBe("exception_met");
  });

  it("부정 짝 — 화이트리스트 밖 사유(5호 공고 전 계약)는 1년 요건을 면제하지 않는다", () => {
    const v = resolveArticle89Clause2(
      input({ oneHouseExemptionProviso: { reason: "pre_designation_contract" } }),
      undefined,
    );
    expect(v.status).toBe("excluded");
  });
});

describe("OH-47 — §156의2④ 후단(3년 초과) · §156의3② 후단(분양권)", () => {
  it("🔴 ④ — 2022-02-15 이후 취득 권리 · 1년 미경과 · 3년 초과 + 수용 → ④ 판정 대상(선언 없으면 판정 불가)", () => {
    // 권리 2022-06-01(종전 2022-01-02 + 5개월) · 양도 2025-07-01(3년 초과) · 수용일 2025-06-01
    const v = resolveArticle89Clause2(
      input({
        acquisitionDate: D("2022-01-02"),
        transferDate: D("2025-07-01"),
        presaleRights: [
          { id: "r1", type: "redevelopment_right", acquisitionDate: D("2022-06-01"), region: "capital" } as PresaleRight,
        ],
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: D("2022-03-01"),
          expropriationDate: D("2025-06-01"),
        },
      }),
      undefined,
    );
    // 면제로 ③(1년)·④ 둘 다 열린다 — ④·§75① 선언이 없으니 판정 불가(종전: 배제 확정)
    expect(v.status).toBe("undetermined");
  });

  it("🔴 분양권(§156의3②) — 수용 + 1년 미경과 → exception_met", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      input({
        ...EXPROPRIATION,
        presaleRights: [
          { id: "p1", type: "presale_right", acquisitionDate: D("2023-06-01"), region: "capital" } as PresaleRight,
        ],
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("대조군 — 분양권 + 단서 없음 → 배제(과세)", () => {
    const r = calculateTransferTax(
      input({
        presaleRights: [
          { id: "p1", type: "presale_right", acquisitionDate: D("2023-06-01"), region: "capital" } as PresaleRight,
        ],
      }),
      makeMockRatesWithHouseEngine(),
    );
    expect(r.isExempt).toBe(false);
  });
});
