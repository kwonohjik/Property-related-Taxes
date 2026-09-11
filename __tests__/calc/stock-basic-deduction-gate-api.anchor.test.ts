/**
 * anchor — ④ API 변환이 ⑤와 **같은 술어**로 기본공제 두 필드를 게이트한다
 *
 * 계획서: `docs/00-pm/stock-basic-deduction-group-gate.plan.md` §4-3
 *
 * ⑤(Step3)만 게이트하고 ④를 두면, 기타자산에서 값을 넣고 시장유형을 되돌렸을 때
 * **화면에 없는 값이 body에 실린다**(전환 patch가 없어 폼에 stale로 남는다).
 * 세액은 엔진이 무시해 불변이지만, 그 값이 그대로 **이력에 저장**돼 교차 합산 경로에서
 * 오해될 수 있다. 두 층이 같은 leaf를 부르는 것이 이 파일이 지키는 것이다
 * (memory `feedback_ui_gate_two_conditions_downstream_one`).
 */
import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function body(patch: Partial<StockTransferFormData>): Record<string, unknown> {
  return buildStockTransferApiBody({ ...createInitialStockFormData(), ...patch });
}

describe("④ 기본공제 그룹 게이트", () => {
  it("A-1: 코스피 + stale 250만 — 0으로 전송 (Zod required라 키를 빼면 400)", () => {
    const b = body({ marketType: "kospi", realEstateGroupBasicDeductionUsed: "2500000" });
    expect(b.realEstateGroupBasicDeductionUsed).toBe(0);
  });

  it("A-2: 기타자산 + 250만 — 그대로 전송 (A-1의 양성 쌍둥이)", () => {
    const b = body({ marketType: "other_asset", realEstateGroupBasicDeductionUsed: "2500000" });
    expect(b.realEstateGroupBasicDeductionUsed).toBe(2_500_000);
  });

  it("A-2b: 코스피 + 과점주주(§94② 발동) + 250만 — 그대로 전송", () => {
    const b = body({
      marketType: "kospi",
      isQualifyingBlockShareholder: true,
      realEstateGroupBasicDeductionUsed: "2500000",
    });
    expect(b.realEstateGroupBasicDeductionUsed).toBe(2_500_000);
  });

  it("A-3: 코스피 + stale crossClause8TaxBase — body에 키 자체가 없다", () => {
    const b = body({ marketType: "kospi", crossClause8TaxBase: "300000000" });
    expect("crossClause8TaxBase" in b).toBe(false);
  });

  it("A-3b: 기타자산이지만 nbl 49% — 9호 미해당이라 키 부재", () => {
    const b = body({
      marketType: "other_asset",
      isQualifyingBlockShareholder: true,
      nblRatioOfCorpAssets: "49",
      crossClause8TaxBase: "300000000",
    });
    expect("crossClause8TaxBase" in b).toBe(false);
  });

  it("A-4: 기타자산 + nbl 60% — 전송 (A-3의 양성 쌍둥이)", () => {
    const b = body({
      marketType: "other_asset",
      isQualifyingBlockShareholder: true,
      nblRatioOfCorpAssets: "60",
      crossClause8TaxBase: "300000000",
    });
    expect(b.crossClause8TaxBase).toBe(300_000_000);
  });

  it("A-5: 해외주식은 조기 반환이라 이 필드 축에 애초에 닿지 않는다", () => {
    // `buildStockTransferApiBody:88`가 `buildForeignStockApiBody`로 빠진다.
    const b = body({
      marketType: "foreign_stock",
      realEstateGroupBasicDeductionUsed: "2500000",
      crossClause8TaxBase: "300000000",
    });
    expect(b.realEstateGroupBasicDeductionUsed).toBeUndefined();
    expect("crossClause8TaxBase" in b).toBe(false);
  });
});
