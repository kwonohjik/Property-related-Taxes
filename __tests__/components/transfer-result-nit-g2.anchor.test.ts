/**
 * 양도세 결과뷰 NIT 묶음 2 (c04~c07) — 표시·근거 문구 anchor. 세액·엔진 값은 바뀌지 않는다.
 *  · R-c04-09 일자 그룹(미렌더)의 거주기간 근거가 §161(직전거주주택보유주택)이 아니라 §159의4(장특 표2 거주 요건)
 */
import { describe, it, expect } from "vitest";
import { setDateAndResidenceItems } from "@/components/calc/results/transfer/DetailedStatementDateItems";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementConfig";

describe("R-c04-09 — 거주기간 근거 조문", () => {
  it("moveOut·moveIn·residencePeriod의 근거에 §159의4가 있고 §161은 없다", () => {
    const items = new Map<string, StatementItem>();
    setDateAndResidenceItems(items, {
      isAggregate: false,
      properties: [],
      primary: undefined,
      transferDate: "2025-06-01",
      residenceMs: 24,
      acquisitionDateLabel: undefined,
      acquisitionDateOverride: undefined,
      transferDateOf: () => "",
      acqDateOf: () => "",
    });
    for (const key of ["moveOut", "moveIn", "residencePeriod"]) {
      const basis = items.get(key)?.legalBasis ?? "";
      expect(basis, key).toContain("§159의4");
      expect(basis, key).not.toContain("§161");
    }
  });
});
