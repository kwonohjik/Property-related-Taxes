/**
 * 국외전출세 보유 종목 normalize 왕복 anchor (③ 동기화 지점)
 *
 * `normalizeExitTaxHoldings`는 반환 객체를 **필드 나열로 새로 만든다**. 새 필드를 나열에서 빠뜨리면
 * 타입은 (optional이면) 통과하고, 새로고침(sessionStorage rehydrate)마다 그 필드가 조용히 사라진다.
 * 이 파일이 그 누락을 막는다 — 특정 필드명을 하드코딩하지 않고 **팩토리 키 집합**을 기준으로 삼아,
 * 팩토리에 필드가 늘어나면 자동으로 왕복 검증 대상이 된다.
 *
 * - R-1 normalize 결과의 키 집합 = 팩토리의 키 집합 (나열 누락·잉여 모두 잡는다)
 * - R-2 모든 필드를 기본값과 다른 유효값으로 채워 왕복하면 값이 그대로다 (조용한 기본값 복귀 차단)
 * - R-3 키가 없던 구 세션 행은 팩토리 기본값으로 채워진다
 */
import { describe, it, expect } from "vitest";
import { createEmptyExitTaxHolding } from "@/lib/stores/calc-wizard-stock-store";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeExitTaxHoldings } from "@/lib/stores/calc-wizard-stock-normalize-exit";

/** 열거형 필드 — 기본값과 다른 유효값 */
const ENUM_NON_DEFAULT: Record<string, string> = {
  marketType: "konex",
  departureDayValuationMode: "unlisted_std",
};
/** 2027.1.1. 이후 출국 · 국외주식 열거값 */
const ENUM_NON_DEFAULT_2027: Record<string, string> = {
  marketType: "foreign_stock",
  departureDayValuationMode: "foreign_decree_178_3",
};

function filled(enums: Record<string, string>): ExitTaxHoldingForm {
  const base = createEmptyExitTaxHolding();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (k === "id") out[k] = "fixed-id";
    else if (k in enums) out[k] = enums[k];
    else if (typeof v === "boolean") out[k] = !v;
    else if (typeof v === "string") out[k] = `v:${k}`;
    else out[k] = v;
  }
  return out as unknown as ExitTaxHoldingForm;
}

describe("normalizeExitTaxHoldings 왕복", () => {
  it("R-1 키 집합 = 팩토리 키 집합", () => {
    const [n] = normalizeExitTaxHoldings([createEmptyExitTaxHolding()]);
    expect(Object.keys(n).sort()).toEqual(Object.keys(createEmptyExitTaxHolding()).sort());
  });

  it("R-2 기본값과 다른 유효값 왕복 — 국내 열거값", () => {
    const input = filled(ENUM_NON_DEFAULT);
    expect(normalizeExitTaxHoldings([input])).toEqual([input]);
  });

  it("R-2 기본값과 다른 유효값 왕복 — 2027 국외주식 열거값·외화 필드", () => {
    const input = filled(ENUM_NON_DEFAULT_2027);
    expect(normalizeExitTaxHoldings([input])).toEqual([input]);
  });

  it("R-4 시장과 어긋난 시가 모드는 그 시장의 기본 모드로 되돌린다 (깨진 세션 복구)", () => {
    const base = createEmptyExitTaxHolding();
    const [domesticWithForeignMode] = normalizeExitTaxHoldings([
      { ...base, id: "a", marketType: "kosdaq", departureDayValuationMode: "foreign_market_price" },
    ]);
    expect(domesticWithForeignMode.departureDayValuationMode).toBe("market_price");
    const [foreignWithDomesticMode] = normalizeExitTaxHoldings([
      { ...base, id: "b", marketType: "foreign_stock", departureDayValuationMode: "unlisted_std" },
    ]);
    expect(foreignWithDomesticMode.departureDayValuationMode).toBe("foreign_market_price");
  });

  it("R-5 외화 필드 빈 기본값은 factory와 같다 — 국가 US · 통화 USD · 외국법인 true · 중소기업 false", () => {
    const [n] = normalizeExitTaxHoldings([{ id: "old" }]);
    expect(n.countryCode).toBe("US");
    expect(n.foreignCurrencyCode).toBe("USD");
    expect(n.isListedForeignCorp).toBe(true);
    expect(n.isSmallMediumEnterprise).toBe(false);
    // 빈 문자열이 저장돼 있었어도 기본값으로 복귀(3중 패턴 — `||` 표시 fallback과 같은 값)
    const [m] = normalizeExitTaxHoldings([{ id: "old2", countryCode: "", foreignCurrencyCode: "" }]);
    expect(m.countryCode).toBe("US");
    expect(m.foreignCurrencyCode).toBe("USD");
  });

  it("R-3 키가 없던 구 세션 행은 팩토리 기본값으로 채운다", () => {
    const legacy = { id: "old-1", stockName: "구 종목", shareCount: "10" };
    const [n] = normalizeExitTaxHoldings([legacy]);
    const base = createEmptyExitTaxHolding();
    expect(n).toEqual({ ...base, id: "old-1", stockName: "구 종목", shareCount: "10" });
  });
});
