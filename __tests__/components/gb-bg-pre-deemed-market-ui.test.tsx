/**
 * PR-7b-6b ⑤⑦ — 일반건물 × 부담부증여 × 시가 평가 × 의제취득일(1985.1.1.) 전 상속·증여 파트 (사용자 결정 Q-28·Q-29 · G-5).
 * ⑤: 의제 파트의 ① 칸(취득 정보) · 두 파트 다면 산정방식 라디오·방식별 칸 숨김 · 한 파트면 라디오는 남고 그 파트 칸만 숨김 · 담보 승이면 종전.
 * ⑦: 결과 명세가 엔진 echo `three_way_parts`를 파트별로 그린다(실제 route 결과로).
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
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { bgPreDeemedShareJudgmentFields } from "@/lib/calc/bg-pre-deemed-shares";
import { gbBgFractionalHasPartialShare } from "@/lib/calc/bg-pre-deemed-shares";
import { needsClauseADeclaration } from "@/lib/calc/transfer-tax-validate-clause-a";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const GB: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 8-8",
  assetKind: "general_building",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000",
  gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "300,000",
  gbAcqBuildingValue: "30,000,000",
  gbZoneType: "general_residential",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgMortgageDebtAmount: "500000000",
  bgLendingDepositTotal: "0",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  publishedValueAtInheritance: "600,000,000",
  gbBuildingInheritedValue: "10,000,000",
};
const LAND_ONLY = {
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "1983-07-26",
  acquisitionDate: "1995-05-01",
  gbBuildingAcquisitionCause: "purchase",
};
const asset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...GB, ...over }) as AssetForm;

function acquisitionView(a: AssetForm) {
  const { container } = render(
    <AssetSectionAcquisition asset={a} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} isPrimary splitMode={"none" as never} onFractionalToggle={() => {}} isFirst hasSiblings={false} />,
  );
  const has = (sel: string) => container.querySelector(sel) !== null;
  const out = {
    landCard: has('[data-testid="gb-bg-pre-deemed-reported-land"]'),
    buildingCard: has('[data-testid="gb-bg-pre-deemed-reported-building"]'),
    text: container.textContent ?? "",
  };
  cleanup();
  return out;
}
function modeView(a: AssetForm) {
  const { container } = render(<TransferModeBlock asset={a} onChange={() => {}} transferDate="2023-02-16" />);
  const has = (sel: string) => container.querySelector(sel) !== null;
  const out = {
    radio: has('[data-field="bgAcquisitionMethod"]'),
    notice: container.querySelector('[data-testid="gb-bg-pre-deemed-method-notice"]')?.textContent ?? null,
    actualLand: has('[data-field="bgActualAcquisitionLand"]'),
    actualBuilding: has('[data-field="bgActualAcquisitionBuilding"]'),
    presumedLand: has('[data-field="bgPresumedAcquisitionLand"]'),
    presumedBuilding: has('[data-field="bgPresumedAcquisitionBuilding"]'),
  };
  cleanup();
  return out;
}

describe("PR-7b-6b ⑤ 일반건물 부담부증여 · 시가 · 의제취득일 전 파트", () => {
  it("U-1 두 파트 다 1983 상속 — 취득 정보에 토지·건물 ① 칸 · 「입력란을 표시하지 않습니다」 안내 없음", () => {
    const v = acquisitionView(asset());
    expect([v.landCard, v.buildingCard]).toEqual([true, true]);
    expect(v.text).not.toContain("입력란을 표시하지 않습니다");
  });

  it("U-2 두 파트 다 — 산정방식 라디오·실지 칸 없음 · 안내(산정방식을 고르지 않음) · 남은 「실지」 값이 있어도 칸이 뜨지 않는다", () => {
    const v = modeView(asset({ bgAcquisitionMethod: "actual" }));
    expect(v.radio).toBe(false);
    expect([v.actualLand, v.actualBuilding]).toEqual([false, false]);
    expect(v.notice).toContain("산정방식을 고르지 않습니다");
  });

  it("U-3 토지만 1983 상속(건물 1995 매매) — 라디오 있음 · 실지·감정 칸은 건물만 · 토지 ① 칸만", () => {
    const actual = modeView(asset({ ...LAND_ONLY, bgAcquisitionMethod: "actual" }));
    expect(actual.radio).toBe(true);
    expect([actual.actualLand, actual.actualBuilding]).toEqual([false, true]);
    expect(actual.notice).toContain("건물의 취득가액에만");
    const appraisal = modeView(asset({ ...LAND_ONLY, bgAcquisitionMethod: "appraisal" }));
    expect([appraisal.presumedLand, appraisal.presumedBuilding]).toEqual([false, true]);
    const acq = acquisitionView(asset(LAND_ONLY));
    expect([acq.landCard, acq.buildingCard]).toEqual([true, false]);
  });

  it("U-4 담보 승(시가 4억) · 기준시가 평가 — ① 칸·안내 없음(종전 · 의제취득일 기준시가 × 채무비율)", () => {
    for (const over of [{ bgMarketValueAtTransfer: "400000000" }, { bgValuationMode: "sangjeungbeop_standard" }]) {
      const acq = acquisitionView(asset(over));
      expect([acq.landCard, acq.buildingCard]).toEqual([false, false]);
      expect(modeView(asset(over)).notice).toBeNull();
    }
  });

  it("U-5 축 B 지분 카드 판정 — 일반건물 파트별 3자 max면 부담부증여 값을 병합 · 두 파트 다가 아닌 지분이 있으면 라디오를 남긴다", () => {
    const primary = asset({ ownershipNumerator: "60", ownershipDenominator: "100" });
    // 지분 카드 원본 — ①②를 숨겨 저장값의 양도 형태가 기본 「일반」이다(병합해야 부담부증여로 판정된다)
    const share = {
      ...makeDefaultAsset(2),
      assetKind: "general_building",
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
      acquisitionDate: "1983-07-26",
      inheritanceStartDate: "1983-07-26",
      transferType: "regular",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
    } as AssetForm;
    expect(bgPreDeemedShareJudgmentFields(share, primary)).toMatchObject({ transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market" });
    const later = { ...share, acquisitionDate: "1995-05-01", inheritanceStartDate: "1995-05-01" } as AssetForm;
    expect(bgPreDeemedShareJudgmentFields(later, primary)).toEqual({});
    expect(gbBgFractionalHasPartialShare([primary, share])).toBe(false);
    expect(gbBgFractionalHasPartialShare([primary, later])).toBe(true);
  });

  it("U-7 축 B 이질 지분(리뷰 F-1) — 지분 1 두 파트 의제 · 지분 2 건물만 의제면 첫 카드에 라디오와 토지 실지 칸(⑧이 지분 2에 요구) · 건물 칸은 모든 지분이 의제라 숨김", () => {
    const share1 = asset({ ownershipNumerator: "60", ownershipDenominator: "100", bgAcquisitionMethod: "actual", bgActualAcquisitionBuilding: "40,000,000" });
    const share2 = {
      ...makeDefaultAsset(2),
      ...GB,
      transferType: "regular",
      bgValuationMode: undefined,
      hasSeperateLandAcquisitionDate: true,
      acquisitionCause: "purchase",
      landAcquisitionDate: "1995-05-01",
      acquisitionDate: "1983-07-26",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
    } as unknown as AssetForm;
    const { container } = render(<TransferModeBlock asset={share1} onChange={() => {}} transferDate="2023-02-16" isFractionalSplit fractionalShares={[share1, share2]} />);
    const has = (sel: string) => container.querySelector(sel) !== null;
    expect(has('[data-field="bgAcquisitionMethod"]')).toBe(true);
    expect([has('[data-field="bgActualAcquisitionLand"]'), has('[data-field="bgActualAcquisitionBuilding"]')]).toEqual([true, false]);
    cleanup();
  });

  it("U-6 E-1(「확인할 수 없음」 선언)은 파트별 3자 max에서 요구하지 않는다 — ①이 필수라 선언 칸이 없다(⑧ ① 검사가 먼저 걸려 가려지는 술어를 직접 본다)", () => {
    const noReported = { publishedValueAtInheritance: "", gbBuildingInheritedValue: "" };
    expect(needsClauseADeclaration(asset(noReported))).toBe(false);
    // 담보 승은 PR-7b-2 면제(`gbBgUsesStdAcq`), 기준시가 평가도 같다 — 일반 양도 1983 상속은 종전대로 선언을 요구한다
    expect(needsClauseADeclaration(asset({ ...noReported, transferType: "regular", useEstimatedAcquisition: true }))).toBe(true);
  });
});

describe("PR-7b-6b ⑦ 결과 명세 — 파트별", () => {
  const form = (): TransferFormData =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2023-02-16",
      filingDate: "2023-04-30",
      totalTransferExpense: "0",
      householdHousingCount: "0",
      isOneHousehold: false,
      assets: [asset()],
    }) as TransferFormData;

  it("R-1 부담부증여 명세 — 토지 ① 채택 · 건물 ③ 채택 행 · 합계 337,500,000 · 신고서 배지 「토지·건물별」", async () => {
    const r = await postTransfer(await captureBody(form()));
    const data = r.json?.data;
    const bg = data.transferBurdenedGiftBreakdown;
    const { container } = render(<BurdenedGiftDetailCard breakdown={bg} propertyType="general_building" />);
    const pick = (part: string, cand: string) =>
      container.querySelector(`[data-testid="bg-pre-deemed-candidate"][data-part="${part}"][data-candidate="${cand}"]`)?.textContent ?? "";
    expect(pick("land", "reported")).toContain("← 채택");
    expect(pick("building", "converted")).toContain("← 채택");
    expect(pick("building", "converted")).toContain("500,000,000");
    expect(container.querySelector('[data-testid="bg-pre-deemed-parts-total"]')?.textContent).toContain("337,500,000");
    expect(container.textContent).toContain("토지·건물별");
    cleanup();
    const t = render(<FilingFormTable result={{ ...(data.aggregated as TransferTaxResult), transferBurdenedGiftBreakdown: bg } as TransferTaxResult} />);
    const badge = [...t.container.querySelectorAll("span[title]")].map((e) => e.getAttribute("title") ?? "").find((x) => x.includes("§159①"));
    expect(badge).toContain("토지·건물별 — 의제취득일 전 파트는");
    cleanup();
  });
});
