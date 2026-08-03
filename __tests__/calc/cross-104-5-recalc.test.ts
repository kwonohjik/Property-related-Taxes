/**
 * §104⑤ 크로스 — 이력 재계산 헬퍼 (C-3d-1)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3d-recalc.plan.md`
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 헬퍼는 **폼을 조립해 기존 API에 넘기는 배관**이다. 조립을 틀리면 세액이 조용히 달라지므로
 * **어떤 인자로 호출하는지**를 직접 고정한다(네트워크는 mock).
 *
 * 🔒 **X-1 — 기본공제 주입은 문자열이다.** 변환기가 `parseAmount`/`parseIntOrZero`로 파싱하므로
 *   숫자를 넣으면 파서에 따라 조용히 0이 될 수 있다. B-2·S-2가 그 규약을 고정한다.
 * 🔒 **W-1 — `mode:"mixed-use"`는 재계산하지 않는다**(4부분 안분이 달라질 수 있는데 미실측).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const callMultiTransferTaxAPI = vi.fn();
const callStockTransferTaxAPI = vi.fn();

vi.mock("@/lib/calc/multi-transfer-tax-api", () => ({
  callMultiTransferTaxAPI: (...a: unknown[]) => callMultiTransferTaxAPI(...a),
}));
vi.mock("@/lib/calc/stock-transfer-tax-api", () => ({
  callStockTransferTaxAPI: (...a: unknown[]) => callStockTransferTaxAPI(...a),
}));

import {
  checkRealEstateRecalc,
  recalcRealEstate,
  recalcOtherAsset,
} from "@/lib/calc/cross-104-5-recalc";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(
  taxType: string,
  inputData: Record<string, unknown>,
  resultData: Record<string, unknown> = {},
  o: Record<string, unknown> = {},
): CalculationRecord {
  return {
    id: "rec-1",
    userId: "local-user",
    taxType,
    title: "테스트 계산",
    inputData,
    resultData,
    taxLawVersion: "2024",
    createdAt: new Date("2024-07-01").toISOString(),
    ...o,
  } as unknown as CalculationRecord;
}

beforeEach(() => {
  callMultiTransferTaxAPI.mockReset().mockResolvedValue({ taxBase: 1 });
  callStockTransferTaxAPI.mockReset().mockResolvedValue({ taxBase: 1 });
});

describe("재계산 가능 여부 (W-1)", () => {
  it("E-1: 다자산 이력 — `properties`가 있으면 가능", () => {
    const r = checkRealEstateRecalc(
      rec("transfer", { __multiTransfer: true, taxYear: 2024, properties: [{ propertyId: "p1" }] }),
    );
    expect(r).toEqual({ ok: true, kind: "multi" });
  });

  it("E-2: 단건 이력 — `assets`가 있으면 가능", () => {
    const r = checkRealEstateRecalc(
      rec("transfer", { assets: [{ assetKind: "land" }], transferDate: "2024-06-01" },
        { mode: "single", result: {} }),
    );
    expect(r).toEqual({ ok: true, kind: "single" });
  });

  it("E-3: 🔒 **`mode:\"mixed-use\"`는 거부**한다 (겸용주택 — 안분이 달라질 수 있다)", () => {
    const r = checkRealEstateRecalc(
      rec("transfer", { assets: [{ assetKind: "housing" }] }, { mode: "mixed-use", result: {} }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("겸용주택");
  });

  it("E-4: 자산 목록이 비면 거부", () => {
    expect(checkRealEstateRecalc(rec("transfer", { assets: [] })).ok).toBe(false);
    expect(
      checkRealEstateRecalc(rec("transfer", { __multiTransfer: true, properties: [] })).ok,
    ).toBe(false);
  });
});

describe("부동산 재계산 — 호출 인자", () => {
  it("B-1: 다자산은 **저장된 `properties`를 그대로** 넘긴다", async () => {
    const properties = [{ propertyId: "p1", propertyLabel: "A", form: {}, completionPercent: 100 }];
    await recalcRealEstate(
      rec("transfer", { __multiTransfer: true, taxYear: 2023, properties, priorPaidTax: "500" }),
    );
    const [form, props] = callMultiTransferTaxAPI.mock.calls[0];
    expect(props).toBe(properties);
    expect(form.taxYear).toBe(2023);
    // 저장된 다른 필드도 보존된다 — 기본값으로 덮어쓰지 않는다.
    expect(form.priorPaidTax).toBe("500");
  });

  it("B-2: 🔒 **기본공제 기사용액은 문자열**로 주입된다 (X-1)", async () => {
    await recalcRealEstate(
      rec("transfer", { __multiTransfer: true, taxYear: 2024, properties: [{ propertyId: "p" }] }),
      { annualBasicDeductionUsed: 2_500_000 },
    );
    const [form] = callMultiTransferTaxAPI.mock.calls[0];
    expect(form.annualBasicDeductionUsed).toBe("2500000");
    expect(typeof form.annualBasicDeductionUsed).toBe("string");
  });

  it("B-3: 미지정이면 `\"0\"`", async () => {
    await recalcRealEstate(
      rec("transfer", { __multiTransfer: true, taxYear: 2024, properties: [{ propertyId: "p" }] }),
    );
    expect(callMultiTransferTaxAPI.mock.calls[0][0].annualBasicDeductionUsed).toBe("0");
  });

  it("B-4: ⭐ 단건은 **`PropertyItem` 하나**로 감싸고 나머지는 **기본값 상수**에서 온다", async () => {
    const singleForm = { assets: [{ assetKind: "land" }], transferDate: "2022-05-10" };
    await recalcRealEstate(rec("transfer", singleForm, { mode: "single", result: {} }));
    const [form, props] = callMultiTransferTaxAPI.mock.calls[0];

    expect(props).toHaveLength(1);
    expect(props[0].form).toBe(singleForm);
    expect(props[0].sourceCalculationId).toBe("rec-1");
    expect(props[0].propertyLabel).toBe("테스트 계산");

    // 과세연도는 이력에서 추출한다(단건은 `transferDate`).
    expect(form.taxYear).toBe(2022);
    // 나머지 19개 필드는 기본값 — 복제하지 않았음을 대표 3개로 확인.
    expect(form.basicDeductionAllocation).toBe(defaultMultiTransferFormData.basicDeductionAllocation);
    expect(form.amendmentMode).toBe(defaultMultiTransferFormData.amendmentMode);
    expect(form.correctionKind).toBe(defaultMultiTransferFormData.correctionKind);
  });

  it("B-5: 🔒 `mixed-use`는 **호출조차 하지 않는다**", async () => {
    await expect(
      recalcRealEstate(rec("transfer", { assets: [{}] }, { mode: "mixed-use", result: {} })),
    ).rejects.toThrow(/겸용주택/);
    expect(callMultiTransferTaxAPI).not.toHaveBeenCalled();
  });
});

describe("기타자산 재계산", () => {
  it("S-1: 저장된 폼을 그대로 다시 태운다", async () => {
    const form = { transferDate: "2024-05-10", marketType: "other_asset" };
    await recalcOtherAsset(rec("stock_transfer", form));
    const [sent] = callStockTransferTaxAPI.mock.calls[0];
    expect(sent.transferDate).toBe("2024-05-10");
    expect(sent.marketType).toBe("other_asset");
  });

  it("S-2: 🔒 **기본공제 기사용액은 문자열**로 덮어쓴다 (X-1)", async () => {
    await recalcOtherAsset(
      rec("stock_transfer", { transferDate: "2024-05-10", realEstateGroupBasicDeductionUsed: "0" }),
      { realEstateGroupBasicDeductionUsed: 2_500_000 },
    );
    const [sent] = callStockTransferTaxAPI.mock.calls[0];
    expect(sent.realEstateGroupBasicDeductionUsed).toBe("2500000");
    expect(typeof sent.realEstateGroupBasicDeductionUsed).toBe("string");
  });

  it("S-3: 입력이 없으면 거부", async () => {
    await expect(
      recalcOtherAsset({ id: "x", inputData: null } as unknown as CalculationRecord),
    ).rejects.toThrow(/저장된 입력/);
    expect(callStockTransferTaxAPI).not.toHaveBeenCalled();
  });
});
