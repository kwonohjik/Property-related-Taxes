/**
 * @vitest-environment jsdom
 *
 * PR1b S14b-6 앵커 — 분양권·입주권 목록 안내가 2021.1.1. 적용례를 조합원입주권까지 거는 것처럼 쓰지 않고,
 * 그 근거를 부칙(법률 제17477호 부칙 제4조 · 영 부칙 제31442호 제10조)으로 밝힌다.
 * 엔진(`isPresaleRightCounted`)은 날짜 게이트를 분양권에만 건다 — 문구가 엔진과 같아야 한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { isPresaleRightCounted } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const r = (type: PresaleRight["type"]) =>
  ({ id: "r", type, acquisitionDate: new Date("2020-06-01"), region: "capital" }) as PresaleRight;

describe("S14b-6 anchor draft", () => {
  it("엔진 전제 — 2020년 취득 입주권은 산입, 분양권은 미산입", () => {
    expect(isPresaleRightCounted(r("redevelopment_right"), new Date("2021-01-01"))).toBe(true);
    expect(isPresaleRightCounted(r("presale_right"), new Date("2021-01-01"))).toBe(false);
  });
  it("안내 문구 — 2021.1.1. 적용례를 두 권리 공통으로 쓰지 않고 부칙을 근거로 든다", () => {
    const { container } = render(
      <PresaleRightsSection rights={[]} onChange={() => {}} primaryKind="housing" transferDate="2026-06-01" />,
    );
    const text = Array.from(container.querySelectorAll("p"))
      .map((p) => p.textContent ?? "")
      .find((t) => t.includes("취득일과 무관하게"))!;
    expect(text).toBeDefined();
    expect(text).not.toContain("(2021.1.1 이후 취득분, 소령 §167의11)");
    expect(text).toMatch(/분양권[^。.]*2021\.\s?1\.\s?1/);
    expect(text).toMatch(/법률 제17477호 부칙 제4조/);
    expect(text).toMatch(/조합원입주권은 취득일과 무관하게 산입/);
  });
});
