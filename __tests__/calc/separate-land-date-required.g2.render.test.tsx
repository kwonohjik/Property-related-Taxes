/**
 * G2 후속 (⑤ 렌더) — 「토지·건물 취득일 다름」 ON이면 토지 취득일 칸에 필수 표시(`*`)가 붙는다. ⑧(`validateSeparateLandDateRequired`)과 같은 술어다.
 * 짝: `separate-land-date-required.g2.anchor.test.ts`(⑧·서버 격자).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2012-01-02",
    ...over,
  }) as AssetForm;

function landDateCard(a: AssetForm): HTMLElement | null {
  const { container } = render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2026-02-16" isNewConstruction={false} />);
  return container.querySelector('[data-field="landAcquisitionDate"]');
}
const hasStar = (el: HTMLElement | null) => !!el?.querySelector('label span[aria-hidden]');

describe("토지 취득일 칸 필수 표시", () => {
  it("🔑 토글 ON(빈칸) → 칸이 있고 `*` 표시 (수정 전: 표시 없음)", () => {
    const el = landDateCard(asset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "" }));
    expect(el).not.toBeNull();
    expect(hasStar(el)).toBe(true);
  });

  it("토글 ON(채움) → `*` 유지(필수 칸이라는 사실은 값과 무관)", () => {
    expect(hasStar(landDateCard(asset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-04" })))).toBe(true);
  });

  it("토글 OFF → 토지 취득일 칸 자체가 없다(건물 취득일 단독)", () => {
    expect(landDateCard(asset({ hasSeperateLandAcquisitionDate: false }))).toBeNull();
  });
});
