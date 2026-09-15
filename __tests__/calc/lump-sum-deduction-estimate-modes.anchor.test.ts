/**
 * 감정가액·매매사례가액 취득가액의 **필요경비 개산공제(§163⑥)** 결선 anchor.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md
 *
 * ## 결함 (수정 전 실측)
 * ④가 `standardPriceAtAcquisition`(개산공제 base)을 **환산 모드에서만** 보내, 감정·매매사례는
 * ⑤ UI에 입력칸이 있는데도 엔진에 도달하지 못해 개산공제가 **0**이었다.
 * 미등기 여부와 무관하며(등기 3% / 미등기 0.3% 둘 다 0), 세액 영향은 아래 A-5·A-6이 잠근다.
 *
 * ## 법령
 * 소득세법 §97②2호 **본문** — 「제1항제1호**나목** … 의 금액에 자산별로 대통령령으로 정하는
 * 금액을 더한 금액」. §97①1호 나목 = 「매매사례가액, 감정가액 또는 환산취득가액」이므로
 * **셋 모두** 개산공제 대상이다. 율은 시행령 §163⑥(1·2호 3% · 미등기 단서 0.3% · 4호 1%).
 * ※ §97②2호 **단서**(swap)는 「환산취득가액으로 하는 경우」 한정 — 감정·매매사례는 대상이 아니다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: TransferFormData) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

/** 단일 자산 폼 — 양도가 2억 · 추계 취득가 1억 · 취득시 기준시가 1억 */
function singleForm(over: Partial<AssetForm> = {}): TransferFormData {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "200,000,000";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2017-03-09",
    actualSalePrice: "200,000,000",
    fixedAcquisitionPrice: "100,000,000",
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "150000000",
    ...over,
  };
  return form;
}

const SALES_CASE = { isSalesCaseAcquisition: true, similarSalesValue: "100,000,000" } as const;
const APPRAISAL = { isAppraisalAcquisition: true } as const;

/** 엔진 입력 — 단건 추계 공통 */
function engineInput(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 200_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2017-03-09"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    standardPriceAtAcquisition: 100_000_000,
    ...over,
  });
}

// ════════════════════════════════════════════════════════════════
// A-1 · A-2 — ④ 단건
// ════════════════════════════════════════════════════════════════

describe("A-1/A-2 — ④ 단건 취득시 기준시가 전송", () => {
  it("A-1a: 감정가액 모드 → standardPriceAtAcquisition 전송", async () => {
    const { run, get } = captureBody(singleForm(APPRAISAL));
    await run();
    expect(get()!.standardPriceAtAcquisition).toBe(100_000_000);
  });

  it("A-1b: 매매사례가액 모드 → standardPriceAtAcquisition 전송", async () => {
    const { run, get } = captureBody(singleForm(SALES_CASE));
    await run();
    expect(get()!.standardPriceAtAcquisition).toBe(100_000_000);
  });

  it("A-1c: 분양권(§163⑥4호)도 전송된다 — 율은 엔진이 1%로 가른다", async () => {
    const { run, get } = captureBody(singleForm({ ...SALES_CASE, assetKind: "presale_right" }));
    await run();
    const body = get()!;
    expect(body.standardPriceAtAcquisition).toBe(100_000_000);
    expect(body.propertyType).toBe("presale_right");
  });

  it("A-2: 실지거래가 모드는 **여전히 미전송** — 넓히기 오판정 가드", async () => {
    const { run, get } = captureBody(singleForm());
    await run();
    expect(
      get()!.standardPriceAtAcquisition,
      "실가는 §97②1호라 개산공제 자체가 없다 — 보내면 쓰이지 않는 값을 요구하는 셈",
    ).toBeUndefined();
  });

  it("A-2b: 미입력이면 전송하지 않는다 (0 금지 — ⑫ .positive() 400 가드)", async () => {
    const { run, get } = captureBody(singleForm({ ...APPRAISAL, standardPriceAtAcq: "" }));
    await run();
    expect(get()!.standardPriceAtAcquisition).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════
// A-3 — ④ 다건
// ════════════════════════════════════════════════════════════════

describe("A-3 — ④ 다건(buildPropertyPayload)", () => {
  it("A-3a: 감정·매매사례 모두 전송", () => {
    for (const mode of [APPRAISAL, SALES_CASE]) {
      const payload = buildPropertyPayload(singleForm(mode)) as Record<string, unknown>;
      expect(payload.standardPriceAtAcquisition).toBe(100_000_000);
    }
  });

  it("A-3b: 🔴 미입력이면 **undefined** — `0`을 보내면 ⑫ `.positive()`가 400을 던진다", () => {
    const payload = buildPropertyPayload(
      singleForm({ ...SALES_CASE, standardPriceAtAcq: "" }),
    ) as Record<string, unknown>;
    expect(payload.standardPriceAtAcquisition).toBeUndefined();
  });

  it("A-3c: 실가는 미전송", () => {
    const payload = buildPropertyPayload(singleForm()) as Record<string, unknown>;
    expect(payload.standardPriceAtAcquisition).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════
// A-4 — ④ 컴패니언 (감정 전용)
// ════════════════════════════════════════════════════════════════

/**
 * 컴패니언은 **감정만** 대상이다 — 매매사례는 F41(`companion-sales-case-single-only-*`)이
 * ⑧에서 이미 명시 차단하므로 ④에 도달하지 않는다(실측).
 */
function bundledForm(companionOver: Partial<AssetForm>): TransferFormData {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "1,800,000,000";
  form.bundledSaleMode = "actual";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,000,000,000",
  };
  form.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    actualSalePrice: "800,000,000",
    standardPriceAtAcq: "100000000",
    ...companionOver,
  } as AssetForm);
  return form;
}

describe("A-4 — ④ 컴패니언(함께양도) 감정가액", () => {
  it("A-4a: 컴패니언 감정 → 그 자산에 standardPriceAtAcquisition 전송", async () => {
    const { run, get } = captureBody(
      bundledForm({ ...APPRAISAL, fixedAcquisitionPrice: "700,000,000" }),
    );
    await run();
    const companion = (get()!.companionAssets as Array<Record<string, unknown>>)[0];
    expect(companion.standardPriceAtAcquisition).toBe(100_000_000);
    // 취득가액(감정가액) 자체는 종전대로 전달된다 — 이 anchor가 바꾸는 것은 개산공제 base뿐
    expect(companion.fixedAcquisitionPrice).toBe(700_000_000);
  });

  it("A-4b: 컴패니언 실가는 미전송", async () => {
    const { run, get } = captureBody(bundledForm({ fixedAcquisitionPrice: "700,000,000" }));
    await run();
    const companion = (get()!.companionAssets as Array<Record<string, unknown>>)[0];
    expect(companion.standardPriceAtAcquisition).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════
// A-5 · A-6 — 엔진 세액 (§163⑥ 율 축)
// ════════════════════════════════════════════════════════════════

describe("A-5/A-6 — 엔진 개산공제·세액", () => {
  it("A-5: 감정 + 등기 → 개산공제 3,000,000 · 총세액 14,514,720", () => {
    const r = calculateTransferTax(
      engineInput({ acquisitionMethod: "appraisal", appraisalValue: 100_000_000 }),
      makeMockRates(),
    );
    expect(r.estimatedDeduction).toBe(3_000_000);
    expect(r.expenses).toBe(3_000_000);
    expect(r.totalTax).toBe(14_514_720);
  });

  it("A-6: 매매사례 + **미등기** → 개산공제 300,000 (§163⑥1호 단서 3/1000) · 총세액 76,769,000", () => {
    const r = calculateTransferTax(
      engineInput({
        acquisitionMethod: "salesCase",
        similarSalesValue: 100_000_000,
        isUnregistered: true,
      }),
      makeMockRates(),
    );
    expect(r.estimatedDeduction).toBe(300_000);
    expect(r.totalTax).toBe(76_769_000);
  });

  it("A-6b: 분양권(§163⑥**4호**)은 1% — 미등기여도 1%다(4호에 단서가 없다)", () => {
    for (const unreg of [false, true]) {
      const r = calculateTransferTax(
        engineInput({
          propertyType: "presale_right" as TransferTaxInput["propertyType"],
          acquisitionMethod: "salesCase",
          similarSalesValue: 100_000_000,
          isUnregistered: unreg,
        }),
        makeMockRates(),
      );
      expect(r.estimatedDeduction, `미등기=${unreg}`).toBe(1_000_000);
    }
  });

  it("A-6c: 상업용건물도 일반 경로로 개산공제를 받는다 (환산 모드가 아니라 STEP 0.35 미진입)", () => {
    const r = calculateTransferTax(
      engineInput({
        propertyType: "commercial_building" as TransferTaxInput["propertyType"],
        acquisitionMethod: "appraisal",
        appraisalValue: 100_000_000,
      }),
      makeMockRates(),
    );
    expect(r.estimatedDeduction).toBe(3_000_000);
  });
});
