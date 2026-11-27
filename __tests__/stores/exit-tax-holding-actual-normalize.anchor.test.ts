/**
 * 종목별 실제 양도(PR-7b) normalize 왕복 anchor (③ 동기화 지점)
 *
 * `normalizeExitTaxActualTransfer`는 필드 나열로 새 객체를 만든다 — 나열에서 빠진 필드는 새로고침(rehydrate)마다 조용히 사라진다.
 * 종목 normalizer의 키 집합 왕복(`exit-tax-holding-normalize-roundtrip`)은 중첩 객체 안쪽을 보지 못하므로(`null`이거나 그대로 복사)
 * 안쪽 키 집합은 여기서 팩토리 기준으로 대조한다.
 *
 *  - A-1 객체 키 집합 = 팩토리 키 집합 (나열 누락·잉여 모두)
 *  - A-2 기본값과 다른 유효값 왕복 — 모든 필드 보존
 *  - A-3 null·비객체·구 세션(필드 없음) = 양도하지 않음(null) — 3중 패턴 default
 *  - A-4 일부 키만 있는 객체는 빠진 키를 팩토리 기본값으로 채운다 (외국납부세액 방식 none · 통화 USD)
 *  - A-5 잘못된 foreignTaxInput는 "none"으로 되돌린다
 *  - A-6 종목 normalizer를 거쳐도 중첩 객체가 보존된다 · etActualTransferMode 왕복
 */
import { describe, it, expect } from "vitest";
import {
  createEmptyExitTaxActualTransfer,
  createEmptyExitTaxHolding,
  createInitialStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import type { ExitTaxHoldingActualForm } from "@/lib/stores/calc-wizard-stock-store";
import {
  normalizeExitTaxActualTransfer,
  normalizeExitTaxFormExtras,
  normalizeExitTaxHoldings,
} from "@/lib/stores/calc-wizard-stock-normalize-exit";

function filled(): ExitTaxHoldingActualForm {
  const base = createEmptyExitTaxActualTransfer();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    out[k] = k === "foreignTaxInput" ? "foreign" : typeof v === "string" ? `v:${k}` : v;
  }
  return out as unknown as ExitTaxHoldingActualForm;
}

describe("normalizeExitTaxActualTransfer 왕복", () => {
  it("A-1 키 집합 = 팩토리 키 집합", () => {
    const n = normalizeExitTaxActualTransfer(createEmptyExitTaxActualTransfer());
    expect(Object.keys(n ?? {}).sort()).toEqual(Object.keys(createEmptyExitTaxActualTransfer()).sort());
  });

  it("A-2 기본값과 다른 유효값 왕복 — 모든 필드가 그대로다", () => {
    const input = filled();
    expect(normalizeExitTaxActualTransfer(input)).toEqual(input);
  });

  it("A-3 null · 비객체 · 필드 없음 = 양도하지 않음(null)", () => {
    expect(normalizeExitTaxActualTransfer(null)).toBeNull();
    expect(normalizeExitTaxActualTransfer(undefined)).toBeNull();
    expect(normalizeExitTaxActualTransfer("x")).toBeNull();
    expect(createEmptyExitTaxHolding().actualTransfer).toBeNull();
    const [old] = normalizeExitTaxHoldings([{ id: "old" }]);
    expect(old.actualTransfer).toBeNull();
  });

  it("A-4 일부 키만 있으면 빠진 키는 팩토리 기본값 — 외국납부세액 none · 통화 USD", () => {
    const n = normalizeExitTaxActualTransfer({ shareCount: "10" });
    expect(n).toEqual({ ...createEmptyExitTaxActualTransfer(), shareCount: "10" });
    expect(n?.foreignTaxInput).toBe("none");
    expect(n?.foreignTaxCurrencyCode).toBe("USD");
    // 빈 문자열 통화는 `||` 표시 fallback과 같은 값으로 복귀(3중 패턴)
    expect(normalizeExitTaxActualTransfer({ foreignTaxCurrencyCode: "" })?.foreignTaxCurrencyCode).toBe("USD");
  });

  it("A-5 잘못된 foreignTaxInput는 none", () => {
    expect(normalizeExitTaxActualTransfer({ foreignTaxInput: "both" })?.foreignTaxInput).toBe("none");
    expect(normalizeExitTaxActualTransfer({ foreignTaxInput: 3 })?.foreignTaxInput).toBe("none");
  });

  it("A-6 종목 normalizer를 거쳐도 중첩 객체가 보존된다 · 입력 방식 왕복", () => {
    const h = { ...createEmptyExitTaxHolding(), id: "h1", actualTransfer: filled() };
    const [n] = normalizeExitTaxHoldings([h]);
    expect(n.actualTransfer).toEqual(filled());

    const defaults = createInitialStockFormData();
    expect(normalizeExitTaxFormExtras({ etActualTransferMode: "per_holding" }, defaults).etActualTransferMode).toBe("per_holding");
    // 구 세션(키 없음)·알 수 없는 값은 factory default
    expect(normalizeExitTaxFormExtras({}, defaults).etActualTransferMode).toBe("global");
    expect(normalizeExitTaxFormExtras({ etActualTransferMode: "x" }, defaults).etActualTransferMode).toBe("global");
  });
});
