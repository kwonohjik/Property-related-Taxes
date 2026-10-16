/**
 * anchor — 부담부증여 × 재개발·재건축 완공 아파트(원조합원) × 시가 모드 × 환산(K-5): 「소득세법 시행령」 §166③ (④⑤⑧ + 폼→route→엔진).
 *
 * 종전: §159 명세의 일반 환산(§176의2②2호 — 신축주택 기준시가 비율)으로 취득가액을 만들고 개산공제를 버렸다(엔진 anchor A-A6).
 * 화면도 어긋나 있었다 — 부담부증여에서도 재개발 블록 ⑤ 「인가전 분 종전 부동산 취득가액」 라디오와 칸이 떠서 ⑧이 엔진이 읽지 않는 값을
 * 요구했고, §166③에 필요한 인가일 기준시가는 그 라디오가 「환산」일 때만 떴다.
 * 이제 하나의 leaf(`redevPreApprovalAcqMode`)가 ⑤·⑧·④·PHD 트리거를 정한다 — 부담부증여는 K-4/K-5가 정하고 K-5(완공 아파트)만 §166③ 칸을 띄운다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { redevPreApprovalAcqMode, redevSec166DisplayOf } from "@/lib/calc/redev-pre-approval-acq-mode";
import { isRedevPhdTriggered } from "@/lib/calc/redev-phd-trigger";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

/** 엔진 anchor A-A6과 같은 사실관계 — 시가 15억 · 채무 6억(r 0.4) · 평가액 5억 · 납부 청산금 2억 · 취득일 기준시가 3억 · 인가일 기준시가 4억 */
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "redevelopment_apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,500,000,000",
    bgMortgageDebtAmount: "600,000,000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "converted",
    bgActualAcquisitionTotal: "300,000,000",
    standardPriceAtTransfer: "1,500,000,000",
    standardPriceAtAcq: "",
    redevSubject: "apt",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-06-01",
    redevRightsValue: "500,000,000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "200,000,000",
    redevPreApprovalExpenses: "10,000,000",
    redevPostApprovalExpenses: "5,000,000",
    redevCompletionDate: "2021-09-01",
    redevManagementDisposalHousingPrice: "400,000,000",
    redevAcquisitionHousingPrice: "300,000,000",
    redevActualAcquisitionPrice: "",
    useEstimatedAcquisition: false,
    ...over,
  }) as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    contractTotalPrice: "1,500,000,000",
    householdHousingCount: "2",
    isOneHousehold: false,
    assets: [a],
  }) as unknown as TransferFormData;

const V = (a: AssetForm) => {
  const { result, fieldOf } = collectWithFields(() => validateRedevelopmentAsset(a, "자산", false));
  return { result, field: result ? fieldOf(result) : undefined };
};

async function body(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => {});
  vi.unstubAllGlobals();
  return cap.body!;
}

describe("leaf redevPreApprovalAcqMode — ⑤·⑧·④·PHD 트리거가 같은 것을 본다", () => {
  it.each([
    ["일반 양도 · 실가", { transferType: "regular", useEstimatedAcquisition: false }, "actual"],
    ["일반 양도 · 환산", { transferType: "regular", useEstimatedAcquisition: true }, "estimated"],
    ["부담부증여 · 완공 아파트 · 시가 · 환산(K-5)", {}, "estimated"],
    ["부담부증여 · 실지(K-4)", { bgAcquisitionMethod: "actual" }, "burdened_gift"],
    ["부담부증여 · 기준시가 모드", { bgValuationMode: "sangjeungbeop_standard" }, "burdened_gift"],
    ["부담부증여 · 승계조합원(§166 밖)", { redevIsSuccessorMember: "yes" }, "burdened_gift"],
    ["부담부증여 · 조합원입주권(K-4 전용)", { assetKind: "right_to_move_in" }, "burdened_gift"],
    ["부담부증여 · 양도 대상 stale 입주권", { redevSubject: "right" }, "burdened_gift"],
    ["부담부증여 · 숨은 ⑤ 라디오 stale 환산 + K-4", { bgAcquisitionMethod: "actual", useEstimatedAcquisition: true }, "burdened_gift"],
  ])("%s → %s", (_n, over, expected) => {
    expect(redevPreApprovalAcqMode(asset(over as Partial<AssetForm>))).toBe(expected);
  });
});

describe("PHD 트리거(§164⑦) — 같은 leaf", () => {
  // 취득일 2009-03-01 < 최초공시일 → 환산 모드면 §164⑦ 본문 칸이 열린다
  const early = { acquisitionDate: "2004-01-01", redevFirstDisclosureDate: "2005-04-30" };
  it("[P-1] 부담부증여 K-5는 §164⑦ 축이 열린다", () => {
    expect(isRedevPhdTriggered(asset(early))).toBe(true);
  });
  it("[P-2] 🔴 부담부증여 K-4 + 숨은 ⑤ 라디오 stale 환산은 열리지 않는다", () => {
    expect(isRedevPhdTriggered(asset({ ...early, bgAcquisitionMethod: "actual", useEstimatedAcquisition: true }))).toBe(false);
  });
});

describe("⑧ validate", () => {
  it("[V-1] K-5인데 인가일 기준시가(§166③ 분모)가 비면 그 칸에서 막는다", () => {
    const r = V(asset({ redevManagementDisposalHousingPrice: "" }));
    expect(r.field).toBe("redevManagementDisposalHousingPrice");
  });
  it("[V-2] K-5 + 취득일 기준시가 미입력 → 그 칸(§166③ 분자)에서 막는다", () => {
    expect(V(asset({ redevAcquisitionHousingPrice: "" })).field).toBe("redevAcquisitionHousingPrice");
  });
  it("[V-3] 🔴 부담부증여 K-4는 화면에 없는 ⑤ 실가 칸을 요구하지 않는다(엔진이 §159 안분값을 쓴다)", () => {
    expect(V(asset({ bgAcquisitionMethod: "actual", redevActualAcquisitionPrice: "" })).result).toBeNull();
  });
  it("[V-4] 🔴 대조군 — 일반 양도 실가는 ⑤ 실가 칸을 계속 요구한다", () => {
    expect(V(asset({ transferType: "regular", redevActualAcquisitionPrice: "" })).field).toBe("redevActualAcquisitionPrice");
  });
  it("[V-5] 부담부증여 K-5는 일반 환산용 「취득시 기준시가」(②)를 요구하지 않는다 — §166③ 칸이 대신한다", () => {
    expect(needsBgAcqStdPriceInput(asset())).toBe(false);
    expect(needsBgAcqStdPriceInput(asset({ assetKind: "housing" }))).toBe(true);
  });
});

describe("⑧ 단계 전체 — 막는 오류가 없다(화면 흐름의 정본)", () => {
  it("[V-6] 부담부증여 K-5 — 취득시 기준시가(②) 없이도 0단계 오류 0건", () => {
    expect(collectStepIssues(0, form(asset()) as never).map((i) => i.message)).toEqual([]);
  });
  it("[V-7] 🔴 대조군 — 일반 주택 K-5는 취득시 기준시가를 계속 요구한다", () => {
    const f = form(asset({ assetKind: "housing" }));
    expect(collectStepIssues(0, f as never).some((i) => i.field === "standardPriceAtAcq")).toBe(true);
  });
});

describe("⑤ 재개발 블록 「인가전 분 종전 부동산 취득가액」", () => {
  const renderBlock = (a: AssetForm) =>
    render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate="2024-03-01" />);

  it("[U-1] 부담부증여 K-5 — ⑤ 라디오 없이 §166③ 안내와 인가일 기준시가 칸이 뜬다", () => {
    const { container } = renderBlock(asset());
    expect(container.querySelector('[data-field="useEstimatedAcquisition"]')).toBeNull();
    expect(screen.getByTestId("redev-bg-sec166-3-notice")).toBeTruthy();
    expect(container.querySelector('[data-field="redevManagementDisposalHousingPrice"]')).not.toBeNull();
  });
  it("[U-2] 부담부증여 K-4 — 섹션 전체가 없다(⑤ 실가 칸은 계산에 쓰이지 않는다)", () => {
    const { container } = renderBlock(asset({ bgAcquisitionMethod: "actual" }));
    expect(screen.queryByText("인가전 분 종전 부동산 취득가액")).toBeNull();
    expect(container.querySelector('[data-field="redevActualAcquisitionPrice"]')).toBeNull();
  });
  it("[U-3] 🔴 대조군 — 일반 양도는 ⑤ 라디오가 그대로 있다", () => {
    const { container } = renderBlock(asset({ transferType: "regular" }));
    expect(container.querySelector('[data-field="useEstimatedAcquisition"]')).not.toBeNull();
  });
});

describe("④ → ⑫ → ⑭ → 엔진", () => {
  it("[W-1] K-5 — useEstimatedAcquisition true · §166③ 필드가 실린다", async () => {
    const b = await body(form(asset()));
    expect(b.useEstimatedAcquisition).toBe(true);
    const rd = b.redevelopment as Record<string, unknown>;
    expect(rd.managementDisposalHousingPrice).toBe(400_000_000);
    expect(rd.acquisitionHousingPrice).toBe(300_000_000);
  });
  it("[W-2] 🔴 K-4 + 숨은 ⑤ 라디오 stale 환산 → false (⑫ §166③ 분모 refine을 일으키지 않는다)", async () => {
    const b = await body(form(asset({ bgAcquisitionMethod: "actual", useEstimatedAcquisition: true })));
    expect(b.useEstimatedAcquisition).toBe(false);
  });
  it("[W-3] 폼 → route → 엔진: 인가전 취득가액 150,000,000 · 개산공제 3,600,000 (종전 120,000,000 · 실비 4,000,000)", async () => {
    const b = await body(form(asset()));
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          isNonBusinessLand: false,
          annualBasicDeductionUsed: 0,
          ...b,
          isOneHousehold: false,
          householdHousingCount: 2,
          residencePeriodMonths: 0,
        }),
      }),
    );
    const json = (await res.json()) as {
      data?: { result?: { redevelopmentDetail?: { preApproval: { apportionedAcquisition: number; expenses: number } } } };
      error?: unknown;
    };
    expect(res.status, JSON.stringify(json.error ?? "")).toBe(200);
    const pre = json.data!.result!.redevelopmentDetail!.preApproval;
    expect(pre.apportionedAcquisition).toBe(150_000_000);
    expect(pre.expenses).toBe(3_600_000);

    // ⑦ 부담부증여 명세 카드 — 일반 환산(§176의2②2호 · 120,000,000) 행 대신 §166③ 값을 보인다
    const result = json.data!.result as unknown as Parameters<typeof redevSec166DisplayOf>[0] & {
      transferBurdenedGiftBreakdown: Parameters<typeof BurdenedGiftDetailCard>[0]["breakdown"];
    };
    const display = redevSec166DisplayOf(result);
    expect(display).toEqual({ acquisition: 150_000_000, lumpDeduction: 3_600_000 });
    render(<BurdenedGiftDetailCard breakdown={result.transferBurdenedGiftBreakdown} propertyType="redevelopment_apt" redevSec166={display} />);
    expect(screen.getByTestId("bg-redev-sec166-acquisition").textContent).toContain("§166③");
    expect(screen.queryByText(/건물 환산취득가 = 양도가액/)).toBeNull();
  });

  it("[W-4] 🔴 대조군 — K-4면 §166③ 표시 값이 없다(명세 그대로)", () => {
    expect(
      redevSec166DisplayOf({
        transferBurdenedGiftBreakdown: { acquisitionMethodUsed: "actual" },
        redevelopmentDetail: { valuationMeta: { method: "actual" }, preApproval: { apportionedAcquisition: 1 } },
      }),
    ).toBeUndefined();
  });
});
