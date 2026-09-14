/**
 * 과점주주 기신고 이력 합산 — mediator anchor (영 §158② · §168②)
 *
 * 계획서 Phase C · A-20~A-26.
 * 순수 함수만 검증한다(repository 호출은 모달 책임 — `history-lookup-modal` 4-레이어 표준).
 */

import { describe, it, expect } from "vitest";
import {
  filterPriorStockTransferCandidates,
  aggregatePriorStockTransfers,
  computeCumulativeTransferRatioPercent,
  type PriorStockTransferCandidate,
} from "@/lib/calc/stock-prior-transfer-lookup";
import type { CalculationRecord } from "@/lib/storage/types";

// ============================================================
// 픽스처
// ============================================================

function rec(o: {
  id: string;
  transferDate: string;
  securityName?: string;
  securityCode?: string;
  shareCount?: number;
  transferPrice?: number;
  acquisitionPrice?: number;
  expenses?: number;
  calculatedTax?: number;
  appliedSection94?: string;
  clientId?: string | null;
  taxType?: CalculationRecord["taxType"];
}): CalculationRecord {
  return {
    id: o.id,
    userId: "local" as CalculationRecord["userId"],
    taxType: o.taxType ?? "stock_transfer",
    title: `${o.securityName ?? "㈜현조경"} ${o.transferDate}`,
    inputData: {
      securityName: o.securityName ?? "㈜현조경",
      securityCode: o.securityCode ?? "",
      transferDate: o.transferDate,
      /**
       * 🔴 주식수는 **폼(inputData)의 문자열**이다 — `calc-wizard-stock-form-types.ts:99`.
       *    종전 이 픽스처는 `resultData.shareCount`에 number 를 심었는데, 엔진 결과 타입에는
       *    2026-09-14 이전까지 그 키가 **없었다**. 실제 이력과 다른 형태라 19건이 전부 초록인 채
       *    기능이 죽어 있었다([[feedback_fixture_default_masks_gate_defect]]).
       *    ⇒ 여기서는 **echo 이전에 저장된 구 이력**(= 현존 레코드)을 재현하고,
       *      echo 경로는 `stock-prior-transfer-lookup-real-shape.anchor.test.ts`(PA-1)가 지킨다.
       */
      shareCount: String(o.shareCount ?? 30_000),
    },
    resultData: {
      transferPrice: o.transferPrice ?? 600_000_000,
      acquisitionPrice: o.acquisitionPrice ?? 450_000_000,
      expenses: o.expenses ?? 1_500_000,
      calculatedTax: o.calculatedTax ?? 29_200_000,
      appliedSection94: o.appliedSection94 ?? "①3나_본문",
    },
    taxLawVersion: o.transferDate,
    linkedCalculationId: null,
    clientId: o.clientId ?? null,
    createdAt: `${o.transferDate}T00:00:00.000Z`,
    updatedAt: `${o.transferDate}T00:00:00.000Z`,
  };
}

const CTX = {
  transferDate: new Date("2026-02-26"),
  securityName: "㈜현조경",
  clientId: null,
};

// ============================================================
// A-20·A-21 — 후보 필터
// ============================================================

describe("A-20·A-21 — 후보 필터 (영 §158② 5축)", () => {
  it("A-22 기반: 교재 1차(2023-06-20)는 후보다", () => {
    const { candidates } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20" })],
      CTX,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].shareCount).toBe(30_000);
    expect(candidates[0].wasAlreadyBlockShareholder).toBe(false);
  });

  it("A-20 🔴 3년 창 밖(2023-02-25 — 3년 1일 전)은 후보가 «아니다» + exceed_3y", () => {
    const { candidates, warnings } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-02-25" })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toContain("exceed_3y");
  });

  it("A-20b 🟢 경계: 정확히 3년 전 당일(2023-02-26)은 창 «안»", () => {
    const { candidates } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-02-26" })],
      CTX,
    );
    expect(candidates).toHaveLength(1);
  });

  it("A-21 🔴 다른 법인은 후보가 «아니다» + different_security", () => {
    const { candidates, warnings } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20", securityName: "㈜다른회사" })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toContain("different_security");
  });

  it("A-21b: 종목명 표기 흔들림(「(주)」·공백)은 같은 법인으로 본다", () => {
    const { candidates } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20", securityName: "(주) 현조경" })],
      CTX,
    );
    expect(candidates).toHaveLength(1);
  });

  it("A-21c: 종목코드가 «양쪽 다» 있으면 코드가 이긴다", () => {
    const { candidates } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20", securityName: "전혀다른이름", securityCode: "123456" })],
      { ...CTX, securityCode: "123456" },
    );
    expect(candidates).toHaveLength(1);
  });

  it("이번 양도일 «이후» 건은 제외 + future_date", () => {
    const { candidates, warnings } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2026-03-01" })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toContain("future_date");
  });

  it("다른 의뢰인 건은 제외 + different_client (세무사 모드 격리)", () => {
    const { candidates, warnings } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20", clientId: "client-A" })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toContain("different_client");
  });

  it("다른 세목은 «조용히» 제외한다 (경고도 만들지 않는다)", () => {
    const { candidates, warnings } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20", taxType: "transfer" })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("양도일 오름차순 정렬 — 「최초 양도일」이 맨 앞", () => {
    const { candidates } = filterPriorStockTransferCandidates(
      [
        rec({ id: "late", transferDate: "2025-01-01" }),
        rec({ id: "early", transferDate: "2023-06-20" }),
      ],
      CTX,
    );
    expect(candidates.map((c) => c.calculationId)).toEqual(["early", "late"]);
  });

  it("A-26 🔴 다건 신고 이력은 «대표 종목»만 남는다 — 비대표 법인은 후보 0건", () => {
    // 다건 신고에서 대표로 저장된 것은 B법인. A법인(이번 신고)은 이력에 없다.
    const { candidates } = filterPriorStockTransferCandidates(
      [rec({ id: "multi", transferDate: "2023-06-20", securityName: "㈜비대표" })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
  });
});

// ============================================================
// A-22·A-23 — 선택 → 합산
// ============================================================

describe("A-22·A-23 — 합산", () => {
  const pick = (recs: CalculationRecord[]) =>
    filterPriorStockTransferCandidates(recs, CTX).candidates;

  it("A-22 🔴 교재 1차 1건 선택 → 다섯 값이 «한 소스»에서 나온다", () => {
    const sel = pick([rec({ id: "r1", transferDate: "2023-06-20" })]);
    const agg = aggregatePriorStockTransfers(sel);
    expect(agg.priorTransferPrice).toBe(600_000_000);
    expect(agg.priorAcquisitionPrice).toBe(450_000_000);
    expect(agg.priorExpenses).toBe(1_500_000);
    expect(agg.priorShareCount).toBe(30_000);
    expect(agg.priorMajorShareholderTax).toBe(29_200_000);
    expect(agg.aggregationFirstTransferDate).toBe("2023-06-20");
    expect(agg.sourceIds).toEqual(["r1"]);

    // 당회차 40,000주(37,500원) 를 더하면 교재 합계와 같아진다.
    expect(agg.priorTransferPrice + 40_000 * 37_500).toBe(2_100_000_000);
    const ratio = computeCumulativeTransferRatioPercent(agg.priorShareCount, 40_000, 100_000);
    expect(ratio).toBe(70);
  });

  it("A-23 🔴 이미 `①4다` 인 이력도 «전부» 합산한다 — 조문으로 자동 배제하지 않는다", () => {
    const sel = pick([
      rec({ id: "r1", transferDate: "2023-06-20" }),
      rec({
        id: "r2",
        transferDate: "2024-06-20",
        appliedSection94: "①4다",
        shareCount: 10_000,
        transferPrice: 100_000_000,
        calculatedTax: 40_000_000,
      }),
    ]);
    const agg = aggregatePriorStockTransfers(sel);
    // 양도가액·주식수는 둘 다 들어간다
    expect(agg.priorTransferPrice).toBe(700_000_000);
    expect(agg.priorShareCount).toBe(40_000);
    /**
     * 🔴 **기납부세액도 둘 다** 들어간다(2026-09-14 결정 — 종전에는 `①4다` 건을 뺐다).
     *    §94①4 다목 요건 판정이 사용자 입력 축인 이상, 기신고를 어떤 조문으로 했는지를
     *    근거로 프로그램이 차감을 깎으면 **납세자에게 불리한 방향으로** 되돌릴 수 없다.
     *    빼는 것은 사용자가 **선택 해제**로 한다.
     */
    expect(agg.priorMajorShareholderTax).toBe(29_200_000 + 40_000_000);
    // 플래그는 남지만 «표시 전용» 이다 — 합산에는 영향이 없다.
    expect(agg.alreadyBlockShareholderIds).toEqual(["r2"]);
  });

  it("최초 양도일은 선택 건 중 «가장 이른» 날", () => {
    const sel = pick([
      rec({ id: "late", transferDate: "2025-01-01" }),
      rec({ id: "early", transferDate: "2023-06-20" }),
    ]);
    expect(aggregatePriorStockTransfers(sel).aggregationFirstTransferDate).toBe("2023-06-20");
  });
});

// ============================================================
// 누적 양도비율 — 분모는 「해당 법인의 주식등 합계액」
// ============================================================

describe("누적 양도비율 (요건③)", () => {
  it("분모는 발행주식 총수다 — (30,000 + 40,000) ÷ 100,000 = 70%", () => {
    expect(computeCumulativeTransferRatioPercent(30_000, 40_000, 100_000)).toBe(70);
  });

  it("🔴 발행주식 총수가 없으면 «계산하지 않는다» — 0 을 돌려주면 요건 미달로 오독된다", () => {
    expect(computeCumulativeTransferRatioPercent(30_000, 40_000, 0)).toBeUndefined();
  });
});

// ============================================================
// A-25 — 이력 0건
// ============================================================

describe("A-25 — 이력이 없어도 막히지 않는다", () => {
  it("레코드가 0건이면 후보·경고 둘 다 0건 (throw 하지 않는다)", () => {
    const r = filterPriorStockTransferCandidates([], CTX);
    expect(r.candidates).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("결과가 비어 있는 손상 레코드는 «사유를 남기고» 건너뛴다", () => {
    const { candidates, warnings } = filterPriorStockTransferCandidates(
      [rec({ id: "r1", transferDate: "2023-06-20", transferPrice: 0, shareCount: 0 })],
      CTX,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toContain("result_missing");
  });

  it("선택 0건이면 합계도 0 — 빈 배열에서 throw 하지 않는다", () => {
    const agg = aggregatePriorStockTransfers([] as PriorStockTransferCandidate[]);
    expect(agg.priorTransferPrice).toBe(0);
    expect(agg.priorMajorShareholderTax).toBe(0);
    expect(agg.aggregationFirstTransferDate).toBe("");
    expect(agg.sourceIds).toEqual([]);
  });
});
