/**
 * E2E: 일반건물(토지+건물 일괄) × 컴패니언(다른 물건 함께양도) — 시행령 §166⑥ 2단 안분.
 *
 * 유닛 anchor(`__tests__/api/transfer.route.companion-general-building.anchor.test.ts`)가 배관
 * 각 층을 보지만, **화면에서 실제로 열리는지**는 여기서만 확인된다. 종전에는 route 5-a가
 * `return`해 5-a-3 GB 분기가 도달조차 하지 않았고 ⑧이 함께양도를 막고 있었다.
 *
 * 설계: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md`
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-companion-general-building.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 양도시 기준시가 = 토지 300,000,000(1,500,000 × 200㎡) + 건물 200,000,000 = 500,000,000. */
const GB = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "200",
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial",
  // 환산 모드 필수 — ⑧이 요구한다(`transfer-tax-validate-gb.ts:407`). 유닛 anchor는
  // 특정 차단 메시지만 보고 route probe는 ⑧을 건너뛰어, 이 누락을 **E2E가 잡았다**.
  gbBuildingArea: "300",
  gbTransferLandPricePerSqm: "1500000",
  gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "750000",
  gbAcqBuildingValue: "100000000",
};

/** primary 주택 + companion 일반건물. 양도시 기준시가를 같게 두어 안분이 50:50이 된다. */
const ASSETS = [
  {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
  },
  {
    ...makeDefaultAsset(2),
    ...GB,
    standardPriceAtTransfer: "500000000",
    actualSalePrice: "600000000",
  },
];

function seedForm(list: Record<string, unknown>[]) {
  return {
    state: {
      formData: {
        assets: list,
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "2",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page, list: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(list),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return resp;
}

test.describe("컴패니언 × 일반건물 (시행령 §166⑥ 2단 안분)", () => {
  test("차단이 풀리고 토지·건물 2 파트로 펼쳐진다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, ASSETS);

    // 차단이 남아 있으면 계산 요청이 나가지 않아 waitForResponse가 타임아웃된다.
    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const sent = resp.request().postDataJSON() as {
      companionAssets?: { assetKind?: string; generalBuildingValuation?: { landArea?: number } }[];
    };
    expect(sent.companionAssets?.[0].assetKind).toBe("general_building");
    // ⑫⑬ — GB 서브객체가 실려 나간다(등록 누락 시 침묵 strip).
    expect(sent.companionAssets?.[0].generalBuildingValuation?.landArea).toBe(200);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");

    // ⑭ — 컴패니언 1건이 토지·건물 2 item으로 펼쳐진다. 접미사는 그 자산의 assetId.
    const props = body.data.aggregated.properties as { propertyId: string }[];
    expect(props).toHaveLength(3);
    expect(props[0].propertyId).toBe("primary");
    const bases = props.slice(1).map((p) => p.propertyId.split("#")[0]);
    expect(bases).toEqual(["land", "building"]);
  });
});
