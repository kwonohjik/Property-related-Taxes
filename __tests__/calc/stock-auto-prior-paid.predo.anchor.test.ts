/**
 * Pre-Do anchor — 합산 진입 시 **기납부세액 자동 채움**
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §10.4 (후속)
 *
 * ## 규칙 (사용자 지정)
 *
 * 기납부세액 = **마지막 예정신고서를 제외한** 나머지 예정신고서 산출세액 합계.
 *
 * 「예정신고서」 단위는 **신고일**이다 — §105①2호가 주식 예정신고 기한을 「양도일이 속하는
 * **반기**의 말일 + 2개월」로 정해, 같은 반기에 양도한 종목들은 **한 신고서**에 들어간다.
 * 신고일이 같은 종목은 함께 기신고분이 되거나 함께 제외된다(strict `<` 비교).
 *
 * 🔑 판정 자체는 부동산과 **같은 세목 중립 leaf**(`selectPriorFiledIndices`)를 쓴다 —
 *    「가장 늦은 신고일 = 이번 신고분」 규약을 두 세목이 공유해야 한다(dual truth 방지).
 *    부동산 파일은 **읽기만** 하고 고치지 않는다.
 *
 * ⚠️ 신고일이 비어 있으면 §105① **법정 기한**으로 대체한다(`calcPreliminaryDeadline`).
 *    비워 두면 그 종목이 필터에서 통째로 빠져 기납부가 과소 집계된다.
 */
import { describe, it, expect } from "vitest";
import { computeStockAutoPriorPaid } from "@/lib/calc/stock-prior-filed";
import { buildStockAggregateSession } from "@/lib/calc/stock-aggregate-entry";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(
  id: string,
  name: string,
  transferDate: string,
  filingDate: string,
  finalTax: number,
  localIncomeTax: number,
  marketType = "unlisted",
): CalculationRecord {
  return {
    id,
    userId: "local-user",
    taxType: "stock_transfer",
    title: `주식 양도세 — ${name}`,
    inputData: { securityName: name, marketType, transferDate, filingDate },
    resultData: { finalTax, localIncomeTax },
    taxLawVersion: transferDate,
    linkedCalculationId: null,
    clientId: null,
    createdAt: `${transferDate}T00:00:00.000Z`,
    updatedAt: `${transferDate}T00:00:00.000Z`,
  } as unknown as CalculationRecord;
}

describe("기납부세액 자동 채움 anchor", () => {
  it("AP-1 🔴 마지막 신고서를 제외한 나머지 산출세액을 합한다", () => {
    const r = computeStockAutoPriorPaid([
      { filingDate: "2024-08-31", national: 3_000_000, local: 300_000 },
      { filingDate: "2025-02-28", national: 5_000_000, local: 500_000 }, // 마지막 → 제외
    ]);
    expect(r).toEqual({ national: 3_000_000, local: 300_000 });
  });

  it("AP-2 신고일이 같으면 **한 신고서**다 — 함께 제외된다 (§105①2호 반기 단위)", () => {
    const r = computeStockAutoPriorPaid([
      { filingDate: "2024-08-31", national: 1_000_000, local: 100_000 },
      { filingDate: "2025-02-28", national: 5_000_000, local: 500_000 }, // 마지막 신고서
      { filingDate: "2025-02-28", national: 2_000_000, local: 200_000 }, // 같은 신고서 → 함께 제외
    ]);
    expect(r).toEqual({ national: 1_000_000, local: 100_000 });
  });

  it("AP-2a 같은 반기 종목 2건이 **함께 기신고분**이 되는 경우", () => {
    const r = computeStockAutoPriorPaid([
      { filingDate: "2024-08-31", national: 1_000_000, local: 100_000 },
      { filingDate: "2024-08-31", national: 2_000_000, local: 200_000 },
      { filingDate: "2025-02-28", national: 5_000_000, local: 500_000 },
    ]);
    expect(r).toEqual({ national: 3_000_000, local: 300_000 });
  });

  it("AP-3 신고서가 하나뿐이면 기납부가 없다 (제외하면 남는 게 없다)", () => {
    expect(
      computeStockAutoPriorPaid([{ filingDate: "2024-08-31", national: 3_000_000, local: 300_000 }]),
    ).toEqual({ national: 0, local: 0 });
  });

  it("AP-3a 빈 배열도 터지지 않는다", () => {
    expect(computeStockAutoPriorPaid([])).toEqual({ national: 0, local: 0 });
  });

  it("AP-4 🔴 합산 진입이 폼에 자동 채운다 — 마지막(2025-02-28) 제외", () => {
    const s = buildStockAggregateSession([
      rec("a", "삼성전자", "2024-09-01", "2025-02-28", 5_000_000, 500_000),
      rec("b", "SK하이닉스", "2024-02-01", "2024-08-31", 3_000_000, 300_000),
    ]);
    expect(s.formData.preliminaryPaidTax).toBe("3000000");
    expect(s.formData.preliminaryPaidLocalTax).toBe("300000");
  });

  it("AP-5 🔴 진입 시 **확정신고**로 둔다 — 아니면 입력란이 숨겨져 자동값이 no-op 이다", () => {
    const s = buildStockAggregateSession([
      rec("a", "삼성전자", "2024-09-01", "2025-02-28", 5_000_000, 500_000),
      rec("b", "SK하이닉스", "2024-02-01", "2024-08-31", 3_000_000, 300_000),
    ]);
    // 영 §173⑤3호 — 2회 이상 양도 + §103② 적용 시 산출세액이 달라지면 확정신고 의무
    expect(s.formData.filingType).toBe("final");
    for (const f of s.savedItems) expect(f.filingType).toBe("final");
  });

  it("AP-6 신고일이 비면 §105① **법정 기한**으로 대체한다 (필터에서 빠지지 않게)", () => {
    const s = buildStockAggregateSession([
      // 신고일 없음 → 2024-09-01 하반기 말일(12/31) + 2개월 = 2025-02-28
      rec("a", "삼성전자", "2024-09-01", "", 5_000_000, 500_000),
      // 신고일 없음 → 2024-02-01 상반기 말일(6/30) + 2개월 = 2024-08-31
      rec("b", "SK하이닉스", "2024-02-01", "", 3_000_000, 300_000),
    ]);
    expect(s.formData.preliminaryPaidTax).toBe("3000000");
  });

  it("AP-7 자동값은 **신고 단위**라 확정 목록에도 같은 값이 실린다", () => {
    const s = buildStockAggregateSession([
      rec("a", "삼성전자", "2024-09-01", "2025-02-28", 5_000_000, 500_000),
      rec("b", "SK하이닉스", "2024-02-01", "2024-08-31", 3_000_000, 300_000),
    ]);
    for (const f of s.savedItems) expect(f.preliminaryPaidTax).toBe("3000000");
  });

  it("AP-8 1건만 편입하면 자동값이 0이다 (합산이 아니다)", () => {
    const s = buildStockAggregateSession([
      rec("a", "삼성전자", "2024-09-01", "2025-02-28", 5_000_000, 500_000),
    ]);
    expect(s.formData.preliminaryPaidTax).toBe("0");
  });
});
