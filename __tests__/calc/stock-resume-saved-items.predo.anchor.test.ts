/**
 * Pre-Do anchor — 주식 이력 **편집 복원**(resume)
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.1 (PR-1)
 *
 * 두 결함을 함께 고정한다.
 *
 * **G-B** 다종목 record를 편집하면 종목이 전부 복원돼야 한다 —
 *   `{ __multiStock, items }` → `savedItems` N-1건 + `formData` 1건(편집기).
 *
 * **G-E** 단건 record를 편집할 때 **직전 세션의 `savedItems`가 남으면 안 된다**.
 *   `savedItems`는 `partialize`로 sessionStorage에 영속되는데(`calc-wizard-stock-store.ts:232`)
 *   종전 resume(`HistoryClient.tsx:304`)은 `formData`만 덮어쓰고 목록을 비우지 않았다 —
 *   다종목 작업 뒤 단건을 편집하면 **직전 종목들이 그대로 합산에 섞였다**.
 */
import { describe, it, expect } from "vitest";
import { buildStockResumeState } from "@/lib/calc/stock-resume-entry";

const MULTI = {
  __multiStock: true,
  items: [
    { securityName: "삼성전자", transferDate: "2026-02-20" },
    { securityName: "SK하이닉스", transferDate: "2026-03-10" },
    { securityName: "네이버", transferDate: "2026-04-01" },
  ],
};

describe("주식 이력 편집 복원 anchor", () => {
  it("S-5 다종목 record → 앞 N-1건이 savedItems, 마지막이 편집기", () => {
    const s = buildStockResumeState(MULTI);
    expect(s.savedItems.map((f) => f.securityName)).toEqual(["삼성전자", "SK하이닉스"]);
    expect(s.formData.securityName).toBe("네이버");
  });

  it("S-5a 복원된 순서가 [...savedItems, formData] 규약을 만족한다", () => {
    const s = buildStockResumeState(MULTI);
    const roundTrip = [...s.savedItems, s.formData].map((f) => f.securityName);
    expect(roundTrip).toEqual(["삼성전자", "SK하이닉스", "네이버"]);
  });

  it("S-5b 종목이 1건뿐인 다종목 record도 깨지지 않는다", () => {
    const s = buildStockResumeState({ __multiStock: true, items: [{ securityName: "삼성전자" }] });
    expect(s.savedItems).toHaveLength(0);
    expect(s.formData.securityName).toBe("삼성전자");
  });

  it("S-6 🔴 단건 record → savedItems가 **비워진다**", () => {
    const s = buildStockResumeState({ securityName: "삼성전자", transferDate: "2026-02-20" });
    expect(s.savedItems).toEqual([]);
    expect(s.formData.securityName).toBe("삼성전자");
  });

  it("S-6a items가 비었거나 없는 손상 record도 단건처럼 안전하게 복원한다", () => {
    expect(buildStockResumeState({ __multiStock: true, items: [] }).savedItems).toEqual([]);
    expect(buildStockResumeState({ __multiStock: true }).savedItems).toEqual([]);
  });

  it("S-6b 복원 결과는 normalize를 거친다 (구형 sessionStorage 규약과 같은 층위)", () => {
    const s = buildStockResumeState({ securityName: "삼성전자" });
    // normalize가 3중 패턴 기본값을 채운다 — 어느 하나라도 undefined면 폼이 깨진다
    expect(s.formData.filingType).toBeDefined();
    expect(s.formData.marketType).toBeDefined();
  });
});
