/**
 * IG-120 — 원천징수율 0%를 저장할 수 있다.
 *
 * `v === "" ? undefined : parseDecimal(v) || undefined` — 두 번째 `|| undefined`가
 * `parseDecimal("0") === 0`(falsy)을 삼켜 store에 undefined가 저장됐고, 표시 fallback이
 * 즉시 「14」로 되돌렸다. 그래서 비과세종합저축처럼 원천징수율 0%인 예금을 §63④ 자동
 * 계산 모드로 입력할 수 없었고, 항상 14%(+지방소득세 1.4%)가 미수이자에서 차감돼
 * 평가액이 과소 산출됐다(엔진 fallback `item.savingsWithholdingRate ?? 14`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { EstateBodyFinancial } from "@/components/calc/inheritance/estate-card/variants/EstateBodyFinancial";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

function renderBody(patch: Record<string, unknown> = {}) {
  const onUpdate = vi.fn();
  const item = {
    id: "f1",
    category: "deposit",
    name: "예금",
    // §63④ 자동 계산 모드에서만 원천징수율 칸이 열린다
    savingsValuationMode: "auto",
    savingsPrincipal: 100_000_000,
    ...patch,
  } as unknown as EstateItem;
  render(
    <EstateBodyFinancial
      item={item}
      onUpdate={onUpdate}
      valuationDate="2026-01-01"
      mode="inheritance"
      showCollateralDeductToggle={false}
    />,
  );
  return onUpdate;
}

const rateInput = () => screen.getByTestId("savings-withholding-rate-f1") as HTMLInputElement;

describe("[G3-V] IG-120 — 원천징수율 0%", () => {
  it("V-1: 🔴 0을 입력하면 store에 0이 저장된다 (종전엔 undefined → 「14」 복귀)", () => {
    const onUpdate = renderBody();
    fireEvent.change(rateInput(), { target: { value: "0" } });
    expect(onUpdate.mock.calls.at(-1)?.[0].savingsWithholdingRate).toBe(0);
  });

  it("V-2: 양성 쌍둥이 — 빈 문자열은 undefined다 (미입력 = 기본 14% 적용)", () => {
    const onUpdate = renderBody({ savingsWithholdingRate: 15.4 });
    fireEvent.change(rateInput(), { target: { value: "" } });
    expect(onUpdate.mock.calls.at(-1)?.[0].savingsWithholdingRate).toBeUndefined();
  });

  it("V-3: 양성 쌍둥이 — 일반 요율은 그대로 저장된다 (회귀 0)", () => {
    const onUpdate = renderBody();
    fireEvent.change(rateInput(), { target: { value: "15.4" } });
    expect(onUpdate.mock.calls.at(-1)?.[0].savingsWithholdingRate).toBe(15.4);
  });

  it("V-4: 미입력 상태의 표시 fallback은 종전대로 「14」다", () => {
    renderBody();
    expect(rateInput().value).toBe("14");
  });
});
