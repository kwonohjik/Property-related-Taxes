/**
 * PR-7b-5 ⑤⑦ — 함께 양도·축 B × 의제취득일(1985.1.1.) 전 상속 × 부담부증여 화면·결과 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * B-3(Q-34): 첫 지분이 의제취득일 전이어도 범위 밖 지분(매매)이 있으면 산정방식 라디오를 보이고 「다른 지분에만 쓴다」고 알린다.
 * D-3: 지분 카드 ③은 병합 자산과 같은 술어로 판정한다(종전 원본 카드 — 쓰이지 않는 ① 칸이 떴다) · 지분 카드 K-6/K-7 칸은 의제 지분에 없다.
 * D-1(Q-33) ⑦: 묶음 명세 카드는 카드별 결과 행과 합계를 그린다.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { BurdenedGiftTrancheBasisBlock } from "@/components/calc/transfer/BurdenedGiftTrancheBasisBlock";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { bgPreDeemedShareJudgmentFields } from "@/lib/calc/bg-pre-deemed-shares";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const LAND: Record<string, unknown> = {
  addressJibun: "서울 A 1",
  assetKind: "land",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "460000000",
  standardPriceAtTransfer: "1243350000",
  standardPriceAtAcq: "202620000",
  acquisitionArea: "184.2",
  transferArea: "184.2",
  landNature: "standalone",
  ownershipNumerator: "50",
  ownershipDenominator: "100",
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000" };
const STD = { bgValuationMode: "sangjeungbeop_standard" };
const PURCHASE = { acquisitionCause: "purchase", acquisitionDate: "1990-07-26", inheritanceStartDate: "" };
const a = (id: number, over: Record<string, unknown>) => ({ ...makeDefaultAsset(id), ...LAND, ...over }) as AssetForm;
/** 지분 카드 원본 — 지분 카드는 ①②를 숨겨 저장값의 양도 형태가 기본 「일반」이다 */
const rawShare = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(2), ...LAND, transferType: "regular", bgValuationMode: undefined, ...over }) as unknown as AssetForm;

function methodView(first: AssetForm, shares: AssetForm[] | undefined, fractional = true) {
  const { container } = render(<TransferModeBlock asset={first} onChange={() => {}} transferDate="2023-02-16" isFractionalSplit={fractional} fractionalShares={shares} />);
  const out = {
    method: container.querySelector('[data-field="bgAcquisitionMethod"]') !== null,
    notice: container.querySelector('[data-testid="bg-pre-deemed-share-method-notice"]') !== null,
  };
  cleanup();
  return out;
}

describe("B-3 첫 지분 카드 산정방식 (Q-34)", () => {
  it("U-1 의제 지분 + 매매 지분 → 라디오 + 「다른 지분에만」 안내 / 의제 지분만 → 숨김 / 지분 분할 아님 → 숨김", () => {
    const first = a(1, MARKET);
    expect(methodView(first, [first, a(2, { ...MARKET, ...PURCHASE })])).toEqual({ method: true, notice: true });
    expect(methodView(first, [first, a(2, MARKET)])).toEqual({ method: false, notice: false });
    expect(methodView(first, [first, a(2, { ...MARKET, ...PURCHASE })], false)).toEqual({ method: false, notice: false });
  });

  it("U-1c 의제 첫 지분 + 매매 지분 · 실지 선택 → 실지취득가액 칸이 뜬다(⑧이 매매 지분에 요구 — 리뷰 게이트 FAIL-3) / 의제 지분만이면 없다", () => {
    const first = a(1, { ...MARKET, bgAcquisitionMethod: "actual" });
    const has = (shares: AssetForm[]) => {
      const { container } = render(<TransferModeBlock asset={first} onChange={() => {}} transferDate="2023-02-16" isFractionalSplit fractionalShares={shares} />);
      const found = container.querySelector('[data-field="bgActualAcquisitionLand"], [data-field="bgActualAcquisitionTotal"]') !== null;
      cleanup();
      return found;
    };
    expect(has([first, a(2, { ...MARKET, ...PURCHASE })])).toBe(true);
    expect(has([first, a(2, MARKET)])).toBe(false);
  });

  it("U-1b 범위 밖 첫 카드(매매)는 종전 그대로 라디오 · 안내 없음", () => {
    const first = a(1, { ...MARKET, ...PURCHASE });
    expect(methodView(first, [first, a(2, MARKET)])).toEqual({ method: true, notice: false });
  });
});

describe("D-3 지분 카드 ③ 판정 · K-7 칸", () => {
  const acq = (asset: AssetForm) => {
    const { container } = render(
      <AssetSectionAcquisition asset={asset} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} isPrimary={false} splitMode={"fractional" as never} onFractionalToggle={() => {}} isFirst={false} hasSiblings />,
    );
    const out = {
      reported: container.querySelector('[data-field="publishedValueAtInheritance"]') !== null,
      bgNote: container.querySelector('[data-testid="pre-deemed-bg-note"]')?.textContent ?? null,
    };
    cleanup();
    return out;
  };

  it("U-2 기준시가 평가 · 의제 지분 카드 — 병합 판정이면 ① 칸이 없고 「의제취득일 기준시가 × 채무비율」 안내(종전 원본 판정은 ① 칸)", () => {
    const primary = a(1, STD);
    const share = rawShare({});
    expect(acq(share).reported).toBe(true);
    const merged = acq({ ...share, ...bgPreDeemedShareJudgmentFields(share, primary) });
    expect(merged.reported).toBe(false);
    expect(merged.bgNote).toContain("의제취득일 기준시가");
  });

  it("U-2b 범위 밖 지분(매매)은 덮지 않는다(빈 객체 — 종전 그대로)", () => {
    expect(bgPreDeemedShareJudgmentFields(rawShare(PURCHASE), a(1, STD))).toEqual({});
  });

  it("U-3 첫 카드 감정가액(K-7) — 의제 지분 카드에는 K-7 칸이 없고 매매 지분 카드에는 있다", () => {
    const primary = a(1, { ...MARKET, ...PURCHASE, bgAcquisitionMethod: "appraisal" });
    const block = (share: AssetForm) => {
      const { container } = render(<BurdenedGiftTrancheBasisBlock asset={share} primaryAsset={primary} onChange={() => {}} />);
      const has = container.querySelector('[data-testid="bg-tranche-basis"]') !== null;
      cleanup();
      return has;
    };
    expect(block(rawShare({}))).toBe(false);
    expect(block(rawShare(PURCHASE))).toBe(true);
  });
});

describe("D-1 ⑦ 묶음 명세 카드 — 카드별 행 (Q-33)", () => {
  it("R-1 축 B [상속 등급 · 매매] 기준시가 — 카드 2행(의제취득일 기준시가 · 기준시가 안분) · 합계 53,102,126 · 지분 카드 산식은 지분분 기준시가", async () => {
    const GRADE = { pre1990Enabled: true, pre1990Grade_current: "218", pre1990Grade_prev: "218", pre1990Grade_atAcq: "200", pre1990PricePerSqm_1990: "1100000", pre1990PricePerSqm_atTransfer: "6750000", pre1990GradeMode: "number" };
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2023-02-16",
      filingDate: "2023-04-30",
      totalTransferExpense: "0",
      householdHousingCount: "0",
      isOneHousehold: false,
      contractTotalPrice: "920000000",
      assets: [a(1, { ...STD, ...GRADE }), a(2, { ...STD, ...PURCHASE })],
    }) as TransferFormData;
    const r = await postTransfer(await captureBody(f));
    const data = r.json?.data as { transferBurdenedGiftBreakdown: TransferBurdenedGiftBreakdown; aggregated: AggregateTransferResult };
    const bg = data.transferBurdenedGiftBreakdown;
    const { container } = render(<BurdenedGiftDetailCard breakdown={bg} propertyType="land" />);
    const cards = [...container.querySelectorAll('[data-testid="bg-bundle-card"]')].map((e) => e.getAttribute("data-basis"));
    expect(cards).toEqual(["deemed_std", "standard_price"]);
    expect(container.querySelector('[data-testid="bg-bundle-acquisition-total"]')?.textContent).toContain("53,102,126");
    const rows = [...container.querySelectorAll('[data-testid="bg-bundle-card-acquisition"]')].map((e) => e.textContent ?? "");
    // 지분 카드 의제취득일 기준시가 = 등급 환산 84,443,174의 지분분(42,221,587) — echo `stdAtDeemed`(물건 전체)가 아니다
    expect(rows[0]).toContain("의제취득일(1985.1.1.) 기준시가 42,221,587");
    expect(rows[0]).toContain("15,620,645");
    // 단일 자산 분기(물건 전체 재계산의 「토지 취득가 = 취득기준시가 …」)는 그리지 않는다
    expect(container.textContent).not.toContain("토지 취득가 = 취득기준시가");
    cleanup();
    // 신고서 표 배지 — 명세의 방식 값(물건 전체 재계산의 standard_price)이 아니라 「자산별」 문구(`BundledAllocationCard`와 같은 입력)
    const t = render(
      <FilingFormTable
        result={{ ...aggregateToFilingResult(data.aggregated), transferBurdenedGiftBreakdown: bg } as never}
        formData={f}
        aggregate={{ properties: data.aggregated.properties, aggregated: data.aggregated, ownershipMap: new Map() } as never}
      />,
    );
    const badge = [...t.container.querySelectorAll("span[title]")].map((e) => e.getAttribute("title") ?? "").find((s) => s.includes("§159①"));
    expect(badge).toContain("자산별 §159①1호 취득가액");
    cleanup();
  });
});

describe("배선 — 자산 목록 → 지분 카드", () => {
  const section = (assets: AssetForm[]) => {
    const { container } = render(
      <CompanionAssetsSection assets={assets} bundledSaleMode="actual" onChange={() => {}} transferDate="2023-02-16" splitMode="fractional" onFractionalToggle={() => {}} />,
    );
    const out = {
      notice: container.querySelectorAll('[data-testid="bg-pre-deemed-share-method-notice"]').length,
      bgNotes: container.querySelectorAll('[data-testid="pre-deemed-bg-note"]').length,
    };
    cleanup();
    return out;
  };

  it("W-1 첫 지분 의제 + 지분 2 매매 → 첫 카드에 「다른 지분에만」 안내(목록이 BurdenedGiftBlock까지 닿는다)", () => {
    expect(section([a(1, MARKET), rawShare(PURCHASE)]).notice).toBe(1);
    expect(section([a(1, MARKET), rawShare({})]).notice).toBe(0);
  });

  it("W-2 기준시가 · 두 지분 모두 의제 — 지분 카드 ③도 부담부증여 의제 안내(종전 첫 카드만)", () => {
    expect(section([a(1, STD), rawShare({})]).bgNotes).toBe(2);
  });
});
