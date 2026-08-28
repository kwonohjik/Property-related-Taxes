/**
 * anchor: 이월과세 비교과세에서 **채택된 시나리오가 전체 서식을 받는다** (결과탭 코드리뷰 Lane 5 — #023).
 *
 * ## 무엇이 섞여 있었나
 *
 * 결과탭의 2단 레이아웃은 [A] 자리에 **언제나** 완전한 `FilingFormTable`에 `result`를 넘겼다.
 * 그런데 `result`는 **채택된 시나리오**로 계산된 값이다
 * (`transfer-tax-carryover.ts` — `adoptedInput: adoptedScenario === "A" ? inputAFinal : inputB`).
 * 이 레이아웃은 B 채택 시에도 렌더된다(`isEligible: true` + `adoptedScenario: "B"` +
 * `exclusionReason: "tax_comparison"`을 함께 낸다).
 *
 * 결과적으로 B가 채택되면 [A] 표가
 *   머리 = A(증여자 취득일·보유기간) · 본문 = B(취득가액·양도차익·장특공제·결정세액)
 * 로 섞이고, **부제와 본문의 취득가액이 서로 달랐다**. 「보유 26년인데 장특공제율 6%(3년)」
 * 처럼 성립할 수 없는 서식이 나온다.
 *
 * ⇒ 채택된 쪽이 전체 서식을 받고, 미채택 쪽은 **자기 detail**로 그린 요약 카드를 받는다.
 *   A·B 카드가 표시 껍데기(`CarryoverScenarioSummaryCard`)를 공유해 좌우가 대칭이다.
 *
 * 법령: 소득세법 §97조의2 ②3호(비교과세) · §95②(보유기간 기산)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const TRANSFER = 1_000_000_000;
/** B 채택 격자 — 증여자 취득가가 커서 A 세액이 작다 ⇒ §97의2②3호가 B를 고른다. */
const GIFT_VALUATION = 300_000_000;
const DONOR_ACQ_PRICE = 900_000_000;
const DONOR_ACQ_DATE = "2000-01-01";
const GIFT_REGISTRY_DATE = "2023-01-01";
const TRANSFER_DATE = "2026-02-16";

function carryover() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: TRANSFER,
      transferDate: D(TRANSFER_DATE),
      acquisitionDate: D(GIFT_REGISTRY_DATE),
      acquisitionCause: "carryover_gift",
      acquisitionPrice: 0,
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      isRegulatedArea: false,
      isNonBusinessLand: false,
      carryoverTaxation: {
        giftRegistryDate: D(GIFT_REGISTRY_DATE),
        donorAcquisitionDate: D(DONOR_ACQ_DATE),
        donorAcquisitionPrice: DONOR_ACQ_PRICE,
        useEstimatedAcquisition: false,
        giftTaxAmount: 30_000_000,
        giftDateValuation: GIFT_VALUATION,
      },
    } as Partial<TransferTaxInput>),
    rates,
  );
}

function formData(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    contractTotalPrice: String(TRANSFER),
    assets: [
      {
        ...makeDefaultAsset(1),
        acquisitionDate: GIFT_REGISTRY_DATE,
        carryover: {
          donorAcquisitionDate: DONOR_ACQ_DATE,
          giftRegistryDate: GIFT_REGISTRY_DATE,
        },
      },
    ],
  } as unknown as TransferFormData;
}

function view() {
  return render(
    <TransferTaxResultView
      result={carryover()}
      formData={formData()}
      onReset={() => {}}
      onBack={() => {}}
    />,
  ).container;
}

/** 제목 문자열로 그 카드/표 덩어리를 집어낸다 — 화면에 표가 여럿이라 전역 검색은 위험하다. */
function blockByTitle(container: Element, title: string): Element {
  const el = [...container.querySelectorAll("h3")].find((h) =>
    (h.textContent ?? "").includes(title),
  );
  expect(el, `제목 「${title}」을 찾지 못했다`).toBeDefined();
  return el!.closest("div[data-print-section]") ?? el!.parentElement!.parentElement!;
}

// ── G-0 구별력 ──────────────────────────────────────────────────────
describe("G-0 격자 — 비교과세로 B가 채택된다", () => {
  it("isEligible이면서 adoptedScenario가 B이고, A·B 값이 다르다", () => {
    const d = carryover().carryoverTaxationDetail;
    expect(d, "이월과세 detail이 없으면 이 anchor는 아무것도 재지 못한다").toBeDefined();
    expect(d!.isEligible).toBe(true);
    expect(d!.adoptedScenario, "A가 채택되면 종전 코드도 정상이라 구별력이 0이다").toBe("B");
    expect(d!.scenarioA.acquisitionPrice).not.toBe(d!.scenarioB.acquisitionPrice);
    expect(d!.scenarioA.determinedTax).not.toBe(d!.scenarioB.determinedTax);
  });

  it("result는 채택된 B로 계산돼 있다", () => {
    const r = carryover();
    const d = r.carryoverTaxationDetail!;
    expect(r.determinedTax).toBe(d.scenarioB.determinedTax);
  });
});

// ── G-1 A 카드가 A 값을 그린다 ──────────────────────────────────────
describe("G-1 미채택 [A]가 자기 detail로 그려진다 (#023)", () => {
  it("🔴 A 카드의 취득가액이 A 값이다 (B 값이 아니다)", () => {
    const d = carryover().carryoverTaxationDetail!;
    const text = blockByTitle(view(), "[A] 이월과세 적용").textContent ?? "";
    expect(text).toContain(d.scenarioA.acquisitionPrice.toLocaleString());
    expect(
      text,
      "채택된 B의 취득가액이 [A] 표에 들어 있다 — 머리와 본문이 섞였다",
    ).not.toContain(d.scenarioB.acquisitionPrice.toLocaleString());
  });

  it("🔴 A 카드의 결정세액이 A 값이다", () => {
    const d = carryover().carryoverTaxationDetail!;
    const text = blockByTitle(view(), "[A] 이월과세 적용").textContent ?? "";
    expect(text).toContain(d.scenarioA.determinedTax.toLocaleString());
  });

  it("🔴 부제와 본문의 취득가액이 일치한다 (자기모순 없음)", () => {
    const d = carryover().carryoverTaxationDetail!;
    const text = blockByTitle(view(), "[A] 이월과세 적용").textContent ?? "";
    // 종전에는 부제 500,000,000(A) ↔ 본문 550,000,000(B)이 한 카드 안에 함께 있었다.
    const a = d.scenarioA.acquisitionPrice.toLocaleString();
    const b = d.scenarioB.acquisitionPrice.toLocaleString();
    expect(text.includes(a) && text.includes(b)).toBe(false);
  });

  it("🔴 보유기간은 증여자 기산(A)이다", () => {
    const d = carryover().carryoverTaxationDetail!;
    const text = blockByTitle(view(), "[A] 이월과세 적용").textContent ?? "";
    expect(text).toContain(`${d.scenarioA.holdingPeriodYears}년`);
    expect(text).toContain(DONOR_ACQ_DATE);
  });
});

// ── G-2 채택된 B가 전체 서식을 받는다 ───────────────────────────────
describe("G-2 채택된 [B]가 전체 신고서 서식을 받는다 (#023)", () => {
  it("🔴 B 표가 있고 그 결정세액이 result와 같다", () => {
    const r = carryover();
    const text = blockByTitle(view(), "[B] 이월과세 미적용").textContent ?? "";
    expect(text).toContain(r.determinedTax.toLocaleString());
    // 전체 서식이라 요약 카드에 없는 행이 있어야 한다.
    expect(text, "요약 카드가 그대로 남아 있다 — 채택된 쪽이 전체 서식을 못 받았다").toContain(
      "총결정세액",
    );
  });

  it("🔴 B의 취득일 머리는 증여 등기접수일이다", () => {
    const text = blockByTitle(view(), "[B] 이월과세 미적용").textContent ?? "";
    expect(text).toContain(GIFT_REGISTRY_DATE);
    expect(text, "증여자 취득일이 B 표에 들어 있다").not.toContain(DONOR_ACQ_DATE);
  });
});
