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

  it("R-3 키가 없던 구 세션 행은 팩토리 기본값으로 채운다", () => {
    const legacy = { id: "old-1", stockName: "구 종목", shareCount: "10" };
    const [n] = normalizeExitTaxHoldings([legacy]);
    const base = createEmptyExitTaxHolding();
    expect(n).toEqual({ ...base, id: "old-1", stockName: "구 종목", shareCount: "10" });
  });
});
