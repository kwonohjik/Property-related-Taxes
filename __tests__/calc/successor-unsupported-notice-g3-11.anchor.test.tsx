/** @vitest-environment jsdom */
/**
 * anchor — 승계조합원 카드 「현재 지원하지 않는 분기 (자동 차단)」 목록은 **⑧이 실제로 막는 분기만** 적는다 (G3-11).
 *
 * 종전 목록 4항목 중 「12억 초과 안분」·「동일세대 상속 §154⑧ 통산」은 엔진이 처리하고 ⑧·⑫도 막지 않는데
 * 「자동 차단」이라 적혀 있었다(같은 카드의 하늘색 박스 「장특공제 표2」와도 모순).
 *
 *  - 12억 초과: 「소득세법」 §95③ + 같은 법 시행령 §160① 「양도차익 × (양도가액 − 12억원) / 양도가액」, 취득시기는
 *    같은 영 §162①4호(사용승인서 교부일). 엔진은 준공일 기준으로 판정해 부분 비과세·안분을 건다.
 *  - 동일세대 상속: 같은 영 §154⑧3호 — 승계조합원도 상속개시 전 동일세대 거주가 통산된다(아래 G-4 실측).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | G-1 | ⑤ | 목록에 청산금 분기·환산취득가만 남는다 |
 * | G-2 | ⑧ | 목록의 두 항목은 실제로 ⑧이 막는다(🔑 긍정 짝 — 목록이 말하는 차단이 실재) |
 * | G-3 | route | 승계조합원 + 20억 → 200 · 안분(taxableRatio 0.4) 적용 · ⑧ 이슈 0 |
 * | G-4 | route | 승계조합원 + 상속 + 동일세대 통산 → 조정지역 취득·신축 거주 0에서 비과세(통산 없으면 과세) · ⑧ 이슈 0 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { render, cleanup } from "@testing-library/react";
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
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { SuccessorMemberSection } from "@/components/calc/transfer/RedevelopmentBlockCards";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 승계조합원 완공APT — 인가 2016-06-01 · 입주권 승계 2016-12-01 · 준공 2018-06-01 · 신축 거주 48개월 · 양도 2024-06-01 */
function succ(price: string, a: Partial<AssetForm> = {}, over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: price,
    householdHousingCount: "1",
    isOneHousehold: true,
    isRegulatedArea: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "0",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "redevelopment_apt",
        acquisitionCause: "purchase",
        acquisitionDate: "2016-12-01",
        fixedAcquisitionPrice: "900000000",
        actualSalePrice: price,
        addressJibun: "서울 테스트동 1",
        redevSubject: "apt",
        redevApprovalDate: "2016-06-01",
        redevApprovalLawBasis: "urban_renovation_art_74",
        redevOriginalAssetType: "housing",
        redevSettlementDirection: "pay",
        redevSettlementAmount: "0",
        redevIsSuccessorMember: "yes",
        redevCompletionDate: "2018-06-01",
        redevNewHouseResidenceMonths: "48",
        ...a,
      } as unknown as AssetForm,
    ],
    houses: [],
    ...over,
  } as TransferFormData;
}

function issues(form: TransferFormData): string[] {
  const out: string[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, form)) out.push(`${s}:${i.message}`);
  return out;
}

async function runRoute(form: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요 */
  }
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cap.body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return { status: res.status, result: json?.data?.result, issues: issues(form) };
}

describe("G3-11 · ⑤ 목록", () => {
  it("G-1 「지원하지 않는 분기」 목록 — 청산금 분기(자동 차단) · 추계 3종(실지거래가액으로만 계산)", () => {
    // 2026-10-26: 추계는 「자동 차단」이 아니라 선택지 자체가 없다(⑤ 라디오 숨김 · 계획서 redev-successor-bg-acq-method Q-2 a).
    const { container } = render(<SuccessorMemberSection asset={succ("2000000000").assets[0]} onChange={() => {}} />);
    const head = Array.from(container.querySelectorAll("div.font-semibold")).find((d) => d.textContent?.includes("지원하지 않는"));
    const items = Array.from(head!.parentElement!.querySelectorAll("li")).map((l) => l.textContent ?? "");
    expect(items).toEqual([
      "승계조합원 + 청산금 분기 (납부·수령) — 자동 차단",
      "승계조합원 + 환산·감정가액·매매사례가액 — 실지거래가액(증여는 증여 신고가액)으로만 계산합니다",
    ]);
    // 대조 — 같은 카드의 하늘색 박스는 표2 적용을 말한다
    expect(container.textContent).toMatch(/장특공제 표2/);
  });
});

describe("G3-11 · ⑧ — 목록이 말하는 차단은 실재한다 (긍정 짝)", () => {
  it("G-2 청산금 납부 1억 → ⑧ 「미지원」 차단 · 남은 환산 플래그는 차단하지 않는다(④가 무시 — 실거래가 전용)", () => {
    expect(issues(succ("2000000000", { redevSettlementAmount: "100000000" })).some((m) => /청산금 분기.*미지원/.test(m))).toBe(true);
    expect(issues(succ("2000000000", { useEstimatedAcquisition: true } as Partial<AssetForm>))).toEqual([]);
  });
});

describe("G3-11 · 목록에서 뺀 분기는 막히지 않고 엔진이 처리한다", () => {
  it("G-3 승계조합원 + 20억 → ⑧ 이슈 0 · 12억 초과 안분(0.4) 적용", async () => {
    const r = await runRoute(succ("2000000000"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.isPartialExempt).toBe(true);
    expect(r.result.redevelopmentDetail.successorMemberApplied).toBe(true);
    expect(r.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBe(0.4);
    expect(r.result.redevelopmentDetail.highValueAllocation.nontaxableThreshold).toBe(1_200_000_000);
  });

  it("G-4 승계조합원 + 상속 + 동일세대 통산 → 비과세(통산이 없으면 과세) · ⑧ 이슈 0", async () => {
    // 상속 승계의 취득가액은 상속개시일 평가액이다 — 매매 기본값의 취득가액(상속 카드엔 그 칸이 없다)으로 계산하던 시료를 바로잡았다
    //   (계획서 redev-successor-inherit-valuation-required.plan.md — 그 칸만 있으면 ⑧이 이제 막는다).
    const inh = {
      acquisitionCause: "inheritance", decedentAcquisitionDate: "2005-01-01", redevNewHouseResidenceMonths: "0",
      fixedAcquisitionPrice: "", inheritanceValuationMethod: "supplementary", publishedValueAtInheritance: "900,000,000",
    } as Partial<AssetForm>;
    const reg = { wasRegulatedAtAcquisition: true } as Partial<TransferFormData>;
    const same = await runRoute(
      succ("1000000000", { ...inh, decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "2010-01-01", decedentCohabitationResidenceMonths: "60" } as Partial<AssetForm>, reg),
    );
    const notSame = await runRoute(succ("1000000000", inh, reg));
    expect(same.issues).toEqual([]);
    expect(same.status).toBe(200);
    expect(same.result.isExempt).toBe(true);
    expect(notSame.result.isExempt).toBe(false);
  });
});
