/**
 * @vitest-environment jsdom
 *
 * anchor: 감면 그룹 헤더 「활성 N / 전체 M」이 **실제로 선택할 수 있는 조문 수**다 (2026-11-11).
 *
 * 종전 헤더는 시한(`inPeriod`)만 세는 `countActiveReductionsByCategory`를 써서, 재개발 아파트의 미분양 그룹이 「활성 9 / 전체 9」인데
 * 목록에서 선택 가능한 조문은 §98의4 하나뿐이었다 — 자산 종류 조문 게이트(US-44 · §98의8 · §99의2)·취득 원인 게이트(US-07)·미구현은 세지 않았다.
 * 이제 목록의 `isDisabled`와 같은 술어(`gateOf`) 하나로 센다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2010-04-01", acquisitionCause: "purchase", ...over }) as AssetForm;

/** 그룹 헤더 버튼의 「활성 N / 전체 M」 텍스트 */
function counter(a: AssetForm, group: RegExp, transferDate = "2013-06-01"): string {
  const { container } = render(<UnifiedReductionPanel asset={a} transferDate={transferDate} onChange={() => {}} />);
  const header = within(container).getAllByRole("button").find((b) => group.test(b.textContent ?? "") && /활성 \d+/.test(b.textContent ?? ""));
  if (!header) throw new Error("그룹 헤더를 찾지 못했다");
  const m = (header.textContent ?? "").match(/활성 (\d+)\s*\/\s*전체 (\d+)/)!;
  return `활성 ${m[1]} / 전체 ${m[2]}`;
}

describe("미분양 그룹 헤더 카운터 — 선택 가능한 조문 수", () => {
  it("C-1: 🔴 재개발 아파트(2010.4. 취득 · 2013.6. 양도) — §98~§98의3·§98의5~§98의8·§99의2는 막히고 §98의4만 선택 가능 → 활성 1 / 전체 9", () => {
    expect(counter(asset({ assetKind: "redevelopment_apt" }), /^미분양주택/)).toBe("활성 1 / 전체 9");
  });

  it("C-2: 일반 주택은 시한이 맞는 조문만 센다(시한 외 조문 제외) — 재개발보다 많다", () => {
    const n = (s: string) => Number(s.match(/활성 (\d+)/)![1]);
    const house = counter(asset({}), /^미분양주택/);
    expect(house).toMatch(/전체 9$/);
    expect(n(house)).toBeGreaterThan(1);
    expect(n(house)).toBeLessThan(9); // 2013.6. 양도·2010.4. 취득이면 §98의7·§98의8 등 일부는 시한 밖
  });

  it("C-3: 자산 종류가 주택이 아니면(토지) 그룹 전체가 비활성 → 활성 0", () => {
    expect(counter(asset({ assetKind: "land" }), /^미분양주택/)).toMatch(/^활성 0 \/ 전체 9$/);
  });

  it("C-4: 취득 원인 게이트(US-07) — 증여 취득이면 §98·§98의2 등이 막혀 일반 구매 취득보다 적다", () => {
    const n = (s: string) => Number(s.match(/활성 (\d+)/)![1]);
    expect(n(counter(asset({ acquisitionCause: "gift" as never }), /^미분양주택/))).toBeLessThan(n(counter(asset({}), /^미분양주택/)));
  });
});
