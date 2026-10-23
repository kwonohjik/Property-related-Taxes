/**
 * PR-7b-4 ⑤⑦ — 재개발 완공 아파트(원조합원) × 의제취득일(1985.1.1.) 전 상속 × 부담부증여 화면·결과 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 시가 평가(Q-24 · ③ = §166③): 산정방식 라디오 대신 3자 max 안내 · ① 칸 · §166③ 칸이 늘 뜨고(라디오 없이) · 인가 전 실비 칸은 ①② 채택 때 쓰여 보인다.
 * 기준시가 평가(Q-25): 의제취득일 기준시가 칸(상속 의제 섹션)이 뜨고 §166③ 칸은 없다.
 * ⑦: ③ 라벨은 §166③ 산식이고, ③ 채택이면 취득가액 줄은 재개발 경로가 실제로 계산한 값(§159 명세 슬롯이 아니라)이다.
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
import { redevSec166DisplayOf } from "@/lib/calc/redev-pre-approval-acq-mode";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { BgPreDeemedThreeWayRows } from "@/components/calc/results/transfer/BgPreDeemedAcqRows";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const REDEV: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219,218,500",
  redevManagementDisposalHousingPrice: "132,000,000",
  redevAcquisitionHousingPrice: "85,034,988",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-01-01",
  inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "400,000,000",
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "525,000,000", bgMortgageDebtAmount: "210,000,000" };
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "160,000,000", standardPriceAtAcq: "50,000,000" };

function view(over: Record<string, unknown>) {
  const a = { ...makeDefaultAsset(1), ...REDEV, ...over } as AssetForm;
  const t = render(<TransferModeBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />);
  const transfer = {
    notice: t.container.querySelector('[data-testid="bg-pre-deemed-notice"]')?.getAttribute("data-basis") ?? null,
    redevNotice: t.container.querySelector('[data-testid="bg-pre-deemed-notice-redev"]')?.textContent ?? null,
    methodRadio: t.container.querySelector('[data-field="bgAcquisitionMethod"]') !== null,
  };
  cleanup();
  const s = render(
    <AssetSectionAcquisition asset={a} onChange={() => {}} transferDate="2026-02-16" isNewConstruction={false} isPrimary splitMode={"none" as never} onFractionalToggle={() => {}} isFirst hasSiblings={false} />,
  );
  const q = (sel: string) => s.container.querySelector(sel);
  const acq = {
    reported: q('[data-field="publishedValueAtInheritance"]') !== null,
    sec166: q('[data-field="redevAcquisitionHousingPrice"]') !== null,
    preExpense: q('[data-field="redevPreApprovalExpenses"]') !== null,
    deemedStd: q('[data-field="standardPriceAtAcq"]') !== null,
    sec166Notice: q('[data-testid="redev-bg-pre-deemed-sec166-3-notice"]') !== null,
    k5Notice: q('[data-testid="redev-bg-sec166-3-notice"]') !== null,
    priorityBg: q('[data-testid="redev-pre-deemed-166-3-notice-bg"]') !== null,
    text: s.container.textContent ?? "",
  };
  cleanup();
  return { ...transfer, ...acq };
}

describe("PR-7b-4 ⑤ 재개발 × 의제취득일 전 × 부담부증여", () => {
  it("U-1 시가 — 라디오 없음 · 재개발 3자 max 안내(③ §166③) · ① 칸 · §166③ 칸(라디오 없이) · 인가 전 실비 칸", () => {
    const v = view(MARKET);
    expect(v.methodRadio).toBe(false);
    expect(v.notice).toBe("three_way");
    expect(v.redevNotice).toContain("③ §166③ 환산취득가액");
    expect(v.reported).toBe(true);
    expect(v.sec166).toBe(true);
    expect(v.sec166Notice).toBe(true);
    expect(v.k5Notice).toBe(false);
    expect(v.priorityBg).toBe(true);
    expect(v.preExpense).toBe(true);
    expect(v.text).toContain("①·②가 채택되면 채무비율을 곱해 공제하고, ③(§166③ 환산)이 채택되면 개산공제");
    // 일반 양도용 「⑤에서 「환산취득가액」을 고르라」 문구와 일반 환산식(증여가액 × 의제취득일 기준시가 ÷ 양도시 기준시가)이 없다
    expect(v.text).not.toContain("「환산취득가액」을 고르고");
    expect(v.text).not.toContain("「환산취득가액」 선택 시");
    expect(v.text).not.toContain("③ 환산취득가 = 증여가액");
    expect(v.text).toContain("③ §166③ 환산취득가 = 평가액");
  });

  it("U-2 기준시가 — 의제취득일 기준시가 칸 · §166③ 칸과 ① 칸 없음 · 인가 전 실비는 개산공제 안내", () => {
    const v = view(STD);
    expect(v.notice).toBe("deemed_std");
    expect(v.deemedStd).toBe(true);
    expect(v.sec166).toBe(false);
    expect(v.reported).toBe(false);
    expect(v.preExpense).toBe(false);
  });

  it("U-3 범위 밖(1990 상속 · K-5) — 종전 화면(라디오 · K-5 §166③ 안내)", () => {
    const v = view({ ...MARKET, acquisitionDate: "1990-01-01", inheritanceStartDate: "1990-01-01", bgAcquisitionMethod: "converted" });
    expect(v.methodRadio).toBe(true);
    expect(v.notice).toBeNull();
    expect(v.k5Notice).toBe(true);
    expect(v.sec166Notice).toBe(false);
  });

  it("U-4 입주권 — 범위 밖(Q-30) · 3자 max 안내 없음", () => {
    const v = view({ ...MARKET, assetKind: "right_to_move_in", redevSubject: "right" });
    expect(v.notice).toBeNull();
  });
});

describe("PR-7b-4 ⑦ 결과 — 재개발 ③(§166③)", () => {
  const bg = (p: TransferBurdenedGiftBreakdown["preDeemed"], over: object = {}) =>
    ({
      preDeemed: p,
      debtRatio: 0.4,
      giftValuation: { max: 525_000_000 },
      perAsset: { land: { acquisitionPrice: 0 }, building: { acquisitionPrice: 0 } },
      necessaryExpenseSwap: { estimatedSide: 56_488_613, directSide: 64_000_000, chosen: "direct" },
      ...over,
    }) as unknown as TransferBurdenedGiftBreakdown;
  const three = (selected: "reported" | "converted", reported: number | null) =>
    ({ basis: "three_way", stdAtDeemed: 0, reported, sec164: null, converted: 141_221_534, selected, wholeAcquisition: selected === "converted" ? 141_221_534 : reported }) as TransferBurdenedGiftBreakdown["preDeemed"];
  const table = (el: React.ReactElement) => render(<table><tbody>{el}</tbody></table>).container;

  it("R-1 ③ 채택 — ③ 라벨 §166③ · 취득가액 줄은 재개발 경로 값 56,488,613(명세 슬롯 0이 아니다) · 개산공제 문구", () => {
    const c = table(<BgPreDeemedThreeWayRows bg={bg(three("converted", null))} isRedev redevSec166={{ acquisition: 56_488_613, lumpDeduction: 1_020_419 }} />);
    expect(c.querySelector('[data-candidate="converted"]')?.textContent).toContain("관리처분계획 인가일 기준시가");
    expect(c.querySelector('[data-candidate="converted"]')?.textContent).not.toContain("증여가액");
    expect(c.querySelector('[data-testid="bg-pre-deemed-acquisition"]')?.textContent).toContain("56,488,613");
    expect(c.querySelector('[data-testid="bg-pre-deemed-acquisition"]')?.textContent).toContain("§166③");
    expect(c.textContent).toContain("인가전 분 개산공제 1,020,419");
    expect(c.textContent).not.toContain("§97②2호 단서");
    cleanup();
  });

  it("R-2 ① 채택 — ③ 라벨은 §166③ · 취득가액 줄은 명세 값(8천만) · 실지 의제 문구", () => {
    const c = table(
      <BgPreDeemedThreeWayRows bg={bg(three("reported", 200_000_000), { perAsset: { land: { acquisitionPrice: 0 }, building: { acquisitionPrice: 80_000_000 } }, necessaryExpenseSwap: undefined })} isRedev />,
    );
    expect(c.querySelector('[data-candidate="converted"]')?.textContent).toContain("§166③");
    expect(c.querySelector('[data-testid="bg-pre-deemed-acquisition"]')?.textContent).toContain("80,000,000");
    expect(c.textContent).toContain("①·② 채택");
    cleanup();
  });

  it("R-4 화면 폼 → route → 명세 카드 — 선언(③ 채택) + 경비면 명세 슬롯은 0이지만 카드는 재개발 경로 값 56,488,613을 보인다", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
      totalTransferExpense: "0",
      householdHousingCount: "0",
      isOneHousehold: false,
      contractTotalPrice: "525000000",
      assets: [
        {
          ...makeDefaultAsset(1),
          ...REDEV,
          ...MARKET,
          actualSalePrice: "525,000,000",
          redevSettlementDirection: "pay",
          redevSettlementAmount: "92,781,500",
          redevCompletionDate: "2012-09-01",
          preDeemedClauseAUnconfirmed: true,
          capitalExpenditure: "150,000,000",
          transferExpense: "10,000,000",
        } as AssetForm,
      ],
    }) as TransferFormData;
    const r = await postTransfer(await captureBody(f));
    const result = r.result as Parameters<typeof redevSec166DisplayOf>[0] & { transferBurdenedGiftBreakdown: TransferBurdenedGiftBreakdown };
    const bgr = result.transferBurdenedGiftBreakdown;
    expect(bgr.perAsset.land.acquisitionPrice + bgr.perAsset.building.acquisitionPrice).toBe(0);
    const display = redevSec166DisplayOf(result);
    const { container } = render(<BurdenedGiftDetailCard breakdown={bgr} propertyType="redevelopment_apt" redevSec166={display} />);
    expect(container.querySelector('[data-candidate="converted"]')?.textContent).toContain("관리처분계획 인가일 기준시가");
    expect(container.querySelector('[data-testid="bg-pre-deemed-acquisition"]')?.textContent).toContain("56,488,613");
    cleanup();
  });

  it("R-3 재개발이 아니면 종전 그대로 — ③ = 증여가액 × 의제취득일 기준시가 ÷ 양도시 기준시가", () => {
    const c = table(<BgPreDeemedThreeWayRows bg={bg(three("converted", null), { necessaryExpenseSwap: undefined, perAsset: { land: { acquisitionPrice: 56_488_613 }, building: { acquisitionPrice: 0 } } })} />);
    expect(c.querySelector('[data-candidate="converted"]')?.textContent).toContain("증여가액 525,000,000");
    expect(c.querySelector('[data-testid="bg-pre-deemed-acquisition"]')?.textContent).toContain("§176조의2④");
    cleanup();
  });
});
