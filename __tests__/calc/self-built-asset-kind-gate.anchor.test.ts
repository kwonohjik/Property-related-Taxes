/**
 * anchor: 신축·증축 축(§114조의2)이 **자산 종류 게이트**를 ⑤·⑧·④에서 같이 본다
 * (2026-09-07 — 「증거 소멸 48건」 표본 재확인에서 살아 있던 G9).
 *
 * ⑤ `SelfBuiltSection`은 `assetKind ∈ {housing, building}` + `acquisitionCause === "purchase"`
 * 안에만 있다. 종전에는 ⑧이 취득원인만 보고, ④는 둘 다 보지 않아
 *  - 주택→토지 전환 후 **화면에 없는 칸**을 요구해 계산이 영구 차단되거나,
 *  - 구분·완공일이 이미 차 있으면 토지 자산에 `isSelfBuilt: true`가 전송됐다.
 */
import { describe, it, expect, vi } from "vitest";
import { selfBuiltActive, selfBuiltSectionApplicable } from "@/lib/calc/self-built-scope";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { housingFlagResetPatchForAssetKind } from "@/components/calc/transfer/asset-sections/housing-flag-reset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 신축 플래그가 켜진 채 남은 자산. `buildingType`을 비워 ⑧이 걸리는지 본다. */
function staleSelfBuilt(kind: AssetForm["assetKind"], over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: kind,
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    actualSalePrice: "700,000,000",
    fixedAcquisitionPrice: "300,000,000",
    standardPriceAtTransfer: "700,000,000",
    isSelfBuilt: true,
    buildingType: "",
    constructionDate: "",
    ...over,
  } as AssetForm;
}

describe("G9-A — ⑧이 자산 종류를 본다", () => {
  it("🔑 A-1: 토지에 남은 신축 플래그로 **차단하지 않는다** — 그 칸은 화면에 없다", () => {
    const msg = validateAssetAcquisition(staleSelfBuilt("land"), "자산 1", "2025-05-01");
    expect(msg ?? "").not.toContain("신축·증축");
  });

  it("🔑 A-2: 주택은 종전대로 요구한다 — 게이트를 통째로 지운 게 아니다", () => {
    const msg = validateAssetAcquisition(staleSelfBuilt("housing"), "자산 1", "2025-05-01");
    expect(msg ?? "").toContain("신축·증축 구분");
  });

  it("A-3: 건물도 종전대로 요구한다 — ⑤가 여는 두 종류가 같다", () => {
    const msg = validateAssetAcquisition(staleSelfBuilt("building"), "자산 1", "2025-05-01");
    expect(msg ?? "").toContain("신축·증축 구분");
  });
});

describe("G9-B — ④가 자산 종류를 본다", () => {
  const singleForm = (asset: AssetForm) =>
    ({
      transferDate: "2026-01-27",
      assets: [asset],
      houses: [],
      presaleRights: [],
      isOneHousehold: false,
      householdHousingCount: "0",
      residencePeriodMonths: "0",
      annualBasicDeductionUsed: "0",
    }) as unknown as TransferFormData;

  async function capture(fn: () => Promise<unknown>) {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await fn().catch(() => {});
    vi.unstubAllGlobals();
    return cap;
  }

  it("🔑 B-1: 단건 — 토지 자산은 `isSelfBuilt`·`constructionDate`를 보내지 않는다", async () => {
    const asset = staleSelfBuilt("land", { buildingType: "new", constructionDate: "2015-03-01" });
    const cap = await capture(() => callTransferTaxAPI(singleForm(asset)));
    expect(cap.body?.isSelfBuilt).toBeUndefined();
    expect(cap.body?.constructionDate).toBeUndefined();
  });

  it("🔑 B-2: 단건 — 주택은 종전대로 보낸다", async () => {
    const asset = staleSelfBuilt("housing", { buildingType: "new", constructionDate: "2015-03-01" });
    const cap = await capture(() => callTransferTaxAPI(singleForm(asset)));
    expect(cap.body?.isSelfBuilt).toBe(true);
    expect(cap.body?.constructionDate).toBe("2015-03-01");
  });

  it("🔑 B-3: 다건 — 토지 주 자산도 같은 게이트를 쓴다", async () => {
    const asset = staleSelfBuilt("land", { buildingType: "new", constructionDate: "2015-03-01" });
    const multiForm = {
      ...defaultMultiTransferFormData,
      transferDate: "2026-01-27",
      properties: [],
    };
    const cap = await capture(() =>
      callMultiTransferTaxAPI(multiForm as never, [
        {
          propertyId: "p1",
          propertyLabel: "자산 1",
          form: { ...singleForm(asset) },
        } as never,
      ]),
    );
    const first = (cap.body?.properties as Record<string, unknown>[] | undefined)?.[0];
    expect(first).toBeTruthy();
    expect(first?.isSelfBuilt).toBeUndefined();
  });

  it("B-4: 다건 — 주택 주 자산은 종전대로 보낸다 (부정형의 짝)", async () => {
    const asset = staleSelfBuilt("housing", { buildingType: "new", constructionDate: "2015-03-01" });
    const multiForm = {
      ...defaultMultiTransferFormData,
      transferDate: "2026-01-27",
      properties: [],
    };
    const cap = await capture(() =>
      callMultiTransferTaxAPI(multiForm as never, [
        {
          propertyId: "p1",
          propertyLabel: "자산 1",
          form: { ...singleForm(asset) },
        } as never,
      ]),
    );
    const first = (cap.body?.properties as Record<string, unknown>[] | undefined)?.[0];
    expect(first?.isSelfBuilt).toBe(true);
  });
});

describe("G9-C — 종류 전환이 플래그를 즉시 비운다", () => {
  it("🔑 C-1: 토지로 바꾸면 신축 축이 함께 정리된다", () => {
    const patch = housingFlagResetPatchForAssetKind("land");
    expect(patch.isSelfBuilt).toBe(false);
    expect(patch.buildingType).toBe("");
    expect(patch.constructionDate).toBe("");
  });

  it("🔑 C-2: 건물로 바꿀 때는 **건드리지 않는다** — 그 종류에서는 축이 살아 있다", () => {
    const patch = housingFlagResetPatchForAssetKind("building");
    expect(patch.isSelfBuilt).toBeUndefined();
    expect(patch.buildingType).toBeUndefined();
  });
});

describe("G9-D — 술어 자체", () => {
  it("D-1: ⑤ 렌더 게이트와 같은 두 종류만 연다", () => {
    expect(selfBuiltSectionApplicable("housing")).toBe(true);
    expect(selfBuiltSectionApplicable("building")).toBe(true);
    expect(selfBuiltSectionApplicable("land")).toBe(false);
    expect(selfBuiltSectionApplicable("general_building")).toBe(false);
  });

  it("D-2: 취득원인도 함께 본다 — 상속 자산의 잔재는 축이 아니다", () => {
    expect(selfBuiltActive(staleSelfBuilt("housing"))).toBe(true);
    expect(selfBuiltActive(staleSelfBuilt("housing", { acquisitionCause: "inheritance" }))).toBe(false);
    expect(selfBuiltActive(undefined)).toBe(false);
  });
});
