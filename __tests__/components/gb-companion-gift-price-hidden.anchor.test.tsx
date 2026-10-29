/**
 * anchor — 일반건물 분리 ON 증여: 쓰이지 않는 「증여 신고가액」 칸을 숨긴다 (계획서 `docs/00-pm/gb-companion-gift-fixed-acq-price.plan.md` Q-2 a)
 *
 * 분리 ON 은 파트 카드의 취득가액이 취득가액을 정하고 자산 전체 값은 세액에 쓰이지 않는다(⑧도 요구하지 않는다 · ⑫ 도 면제). 필수로 표시된 쓰이지 않는 칸은 사용자를 헷갈리게 한다.
 * 분리 OFF 일괄 증여는 그 칸이 취득가액이므로 그대로 둔다. 부담부증여는 종전 안내 카드. 날짜 두 칸은 보유기간 기산에 쓰이므로 남긴다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "../../components/calc/transfer/GeneralBuildingAcquisitionCards";
import { CompanionAcqGiftBlock } from "../../components/calc/transfer/CompanionAcqGiftBlock";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-store";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const base = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1), assetKind: "general_building", acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift",
    landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual", ...over,
  }) as unknown as AssetForm;
const draw = (a: AssetForm) => render(<GeneralBuildingAcquisitionCards asset={a} onChange={vi.fn()} transferDate="2026-02-16" />);
const priceFields = (c: HTMLElement) => c.querySelectorAll("[data-field='fixedAcquisitionPrice']").length;

describe("GP-1 일반건물 증여 — 「증여 신고가액」 칸 노출", () => {
  it.each([
    ["분리 OFF 증여(일괄 취득가액이므로 그대로)", { hasSeperateLandAcquisitionDate: false }, 1],
    ["분리 ON 토지·건물 증여 — 숨김", { hasSeperateLandAcquisitionDate: true }, 0],
    ["분리 ON 토지만 증여 — 숨김", { hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase" }, 0],
    ["분리 ON 건물만 증여(토지 매매) — 증여 블록 없음", { hasSeperateLandAcquisitionDate: true, acquisitionCause: "purchase" }, 0],
    ["분리 ON 부담부증여 — 종전 안내 카드(입력 칸 없음)", { hasSeperateLandAcquisitionDate: true, transferType: "burdened_gift" }, 0],
  ])("%s", (_n, over, expected) => {
    const { container } = draw(base(over));
    expect(priceFields(container)).toBe(expected);
  });

  it("분리 ON 에서도 증여일·증여자 취득일 칸은 남는다(보유기간 기산 · 짝)", () => {
    const { container } = draw(base({ hasSeperateLandAcquisitionDate: true }));
    expect(container.querySelector("[data-field='landAcquisitionDate']")).not.toBeNull();
    expect(container.querySelector("[data-field='donorAcquisitionDate']")).not.toBeNull();
  });
});

describe("GP-2 증여 블록 단독 — prop 기본값은 종전 그대로(주택·토지 컴패니언)", () => {
  const props = { acquisitionDate: "2010-05-01", onAcquisitionDateChange: vi.fn(), donorAcquisitionDate: "", onDonorAcquisitionDateChange: vi.fn(), fixedAcquisitionPrice: "", onFixedAcquisitionPriceChange: vi.fn() };
  it("hideFixedAcquisitionPrice 없음 → 칸 있음", () => {
    expect(priceFields(render(<CompanionAcqGiftBlock {...props} />).container)).toBe(1);
  });
  it("hideFixedAcquisitionPrice → 칸 없음", () => {
    expect(priceFields(render(<CompanionAcqGiftBlock {...props} hideFixedAcquisitionPrice />).container)).toBe(0);
  });
  it("부담부증여는 숨김 prop 과 무관하게 안내 카드(종전)", () => {
    const { container } = render(<CompanionAcqGiftBlock {...props} isBurdenedGift hideFixedAcquisitionPrice />);
    expect(priceFields(container)).toBe(0);
    expect(container.textContent).toContain("부담부증여 §159 자동 산정");
  });
});
