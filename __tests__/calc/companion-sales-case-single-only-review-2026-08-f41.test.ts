/**
 * F41 — 컴패니언 자산을 「매매사례가액」으로 취득하면 ⑧은 통과시키는데 ⑩ Zod가 400을 던지는
 * ⑧↔⑩ 모순의 회귀 anchor (코드리뷰 2026-08).
 *
 * ## 결함
 * `companionAssetSchema`(`lib/api/transfer-tax-schema-sub.ts:286~`)에는 `acquisitionMethod`·
 * `similarSalesValue`가 없다. 그래서 ④ `buildAssetPayload`도 그 값을 담지 않고, companion
 * superRefine(`lib/api/transfer-tax-schema.ts:600~626`)이 `acquisitionCause === "purchase"`를
 * 환산/실가 2분기로만 보아 `fixedAcquisitionPrice`를 요구한다.
 *
 * ⇒ 사용자는 **화면에 없는 「취득가액」**을 요구받고 계산을 끝낼 수 없다.
 *
 * ## 수정 전 실측 (이 파일의 픽스처 그대로)
 * · `collectStepIssues(0)` = [] — ⑧ 통과
 * · companion payload 키에 `similarSalesValue`·`fixedAcquisitionPrice`·`acquisitionMethod` **전부 없음**
 * · `propertySchema.safeParse` 실패 — {"companionAssets":["매매(실가) 시 취득가액 필수"]} → HTTP 400
 *
 * 세액은 변하지 않는다(계산이 애초에 도달하지 않았다). 「침묵 오산보다 명시 차단」 정책에 따라
 * ⑧에서 사유를 말하고 막는다.
 *
 * ## 술어를 좁힌 이유 (over-block 방지)
 * · **primary만 salesCase**는 `transfer-tax-api.ts:361`이 정상 배관하고 Zod도 통과한다(아래 SC-2 실측)
 *   — `some()`으로 전 자산을 보면 지원되는 조합이 죽는다.
 * · **일반건물 지분 분할**은 ④가 `generalBuildingShares` 전용 배열만 보내고 `companionAssets`를
 *   만들지 않아 400이 나지 않는다(아래 SC-4 실측: parse ok). 일반건물의 추계 축은 파트별
 *   `landAcqMode`/`buildingAcqMode`라 자산-수준 플래그와 축 자체가 다르다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

const SALES_CASE_MSG = "매매사례가액 추계(소득세법 시행령 제176조의2 제3항 제1호)";

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

/** 함께 양도(서로 다른 물건) — 주택 2건, actual 모드 */
function bundledForm(over: { primary?: Partial<AssetForm>; companion?: Partial<AssetForm> } = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "1,800,000,000";
  form.bundledSaleMode = "actual";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,000,000,000",
    ...over.primary,
  };
  form.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "700,000,000",
    actualSalePrice: "800,000,000",
    ...over.companion,
  } as AssetForm);
  return form;
}

/** 일반건물 지분 1건 — `generalBuildingShares` 경로가 성립하는 최소 입력 */
function gbShare(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

describe("[F41] 컴패니언 매매사례가액 — ⑧ 명시 차단", () => {
  it("SC-1: 컴패니언이 salesCase면 그 자산 인덱스로 차단된다 (종전 ⑧ 통과 → 400)", () => {
    const form = bundledForm({
      companion: {
        fixedAcquisitionPrice: "",
        isSalesCaseAcquisition: true,
        similarSalesValue: "700,000,000",
      },
    });
    const issues = collectStepIssues(0, form);
    const hit = issues.filter((i) => i.message.includes(SALES_CASE_MSG));
    expect(hit).toHaveLength(1);
    expect(hit[0].assetIndex).toBe(1);
    expect(hit[0].step).toBe(0);
  });

  it("SC-2: primary만 salesCase인 조합은 계속 통과한다 (지원 경로 — over-block 금지)", async () => {
    const form = bundledForm({
      primary: {
        fixedAcquisitionPrice: "",
        isSalesCaseAcquisition: true,
        similarSalesValue: "400,000,000",
      },
    });
    expect(collectStepIssues(0, form)).toEqual([]);

    // ④⑬ + ⑩ — 이 조합은 실제로 Zod를 통과한다(차단 대상이 아님을 payload로 고정)
    const { run, get } = captureBody(form);
    await run();
    const body = get()!;
    expect(body.acquisitionMethod).toBe("salesCase");
    expect(body.similarSalesValue).toBe(400_000_000);
    expect(propertySchema.safeParse(body).success).toBe(true);
  });

  it("SC-3: 단건(자산 1건) salesCase는 차단 대상이 아니다", () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2024-06-01";
    form.contractTotalPrice = "1,000,000,000";
    form.assets[0] = {
      ...form.assets[0],
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-05-05",
      isSalesCaseAcquisition: true,
      similarSalesValue: "400,000,000",
      actualSalePrice: "1,000,000,000",
    };
    expect(collectStepIssues(0, form)).toEqual([]);
  });

  it("SC-4: 일반건물 지분 분할은 제외 — companionAssets를 만들지 않으므로 400이 나지 않는다", async () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2024-03-01";
    form.contractTotalPrice = "1,000,000,000";
    form.householdHousingCount = "2";
    form.assets = [
      gbShare({ assetId: "share-a", ownershipNumerator: "60", ownershipDenominator: "100" }),
      gbShare({
        assetId: "share-b",
        acquisitionDate: "2015-03-01",
        ownershipNumerator: "40",
        ownershipDenominator: "100",
        useEstimatedAcquisition: false,
        isSalesCaseAcquisition: true,
        similarSalesValue: "300,000,000",
      }),
    ];

    expect(collectStepIssues(0, form)).toEqual([]);

    const { run, get } = captureBody(form);
    await run();
    const body = get()!;
    expect(body.generalBuildingShares).toBeDefined();
    expect(body.companionAssets).toBeUndefined();
    expect(propertySchema.safeParse(body).success).toBe(true);
  });

  it("SC-5: 컴패니언 2건이 모두 salesCase면 각각 1건씩 수집된다", () => {
    const form = bundledForm({
      companion: {
        fixedAcquisitionPrice: "",
        isSalesCaseAcquisition: true,
        similarSalesValue: "700,000,000",
      },
    });
    form.contractTotalPrice = "2,300,000,000";
    form.assets.push({
      ...makeDefaultAsset(3),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2011-05-05",
      isSalesCaseAcquisition: true,
      similarSalesValue: "300,000,000",
      actualSalePrice: "500,000,000",
    } as AssetForm);

    const hit = collectStepIssues(0, form).filter((i) => i.message.includes(SALES_CASE_MSG));
    expect(hit.map((i) => i.assetIndex)).toEqual([1, 2]);
  });
});
