/**
 * E2E: 상가(commercial_building) × 축 B(지분 분할) · 컴패니언(다른 물건).
 *
 * 계획서: `docs/02-design/features/transfer-companion-commercial.plan.md`
 *
 * 유닛 anchor(`__tests__/calc/axis-b-commercial.anchor.test.ts`)가 배관 각 층을 보지만,
 * **화면에서 실제로 열리는지**는 여기서만 확인된다. 특히 컴패니언 상가는 종전에
 * ⑧을 통과하고 route가 400을 내는 **안내 없는 dead-end**였다 — 유닛만으로는
 * 「사용자가 막힌다」가 드러나지 않는 축이다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-commercial-bundled.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

/** 상업지역 3배 · 대지 1,200㎡ · 바닥 200㎡ → 기준면적 600㎡ · 초과 600㎡. */
const CB = {
  assetKind: "commercial_building",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-06-01",
  fixedAcquisitionPrice: "600000000",
  useEstimatedAcquisition: false,
  cbTotalLandArea: "1200",
  cbTotalBuildingFootprintArea: "200",
  cbZoneType: "commercial",
  // NBL2611-V5-BX01 — 초과분 토지·건물 구분 기준시가(양도 12억 · 취득 6억 모두 토지 60%)
  cbPartAcqLandStd: "360000000",
  cbPartAcqBuildingStd: "240000000",
  cbPartTransferLandStd: "720000000",
  cbPartTransferBuildingStd: "480000000",
};

function seedForm(assets: Record<string, unknown>[]) {
  return {
    state: {
      formData: {
        assets,
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "0",
        // 명부 필수화(PR-1) — COMPANION 변형은 assets[0]이 "housing"이라 ⑧이 0행을 요구한다.
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true, // roster-required PR-D
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/** 축 B — 컴패니언 카드는 ① 기본정보를 숨기므로 자산종류·cb*가 primary에만 있다. */
const AXIS_B = [
  { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...CB, ownershipNumerator: "60", ownershipDenominator: "100" },
  {
    ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-06-01",
    fixedAcquisitionPrice: "600000000",
    useEstimatedAcquisition: false,
    ownershipNumerator: "40",
    ownershipDenominator: "100",
    // 지분마다 취득일이 달라 취득 당시 2칸은 카드별 입력(양도 당시 2칸은 자산 1 값을 병합)
    cbPartAcqLandStd: "360000000",
    cbPartAcqBuildingStd: "240000000",
  },
];

/** 컴패니언 — 서로 다른 물건(주택 + 상가). */
const COMPANION = [
  {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-06-01",
    fixedAcquisitionPrice: "300000000",
    useEstimatedAcquisition: false,
    standardPriceAtTransfer: "400000000",
    actualSalePrice: "500000000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
  },
  {
    ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1",
    ...CB,
    standardPriceAtTransfer: "800000000",
    actualSalePrice: "700000000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
  },
];

async function seedAndOpen(page: Page, assets: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedWithDeclaredRoster(seedForm(assets)),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return calcResponse;
}

test.describe("상가 × 함께양도·지분 분할", () => {
  test("축 B — 지분별로 계산되고 합계가 단건 100%와 같다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, AXIS_B);
    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const sent = resp.request().postDataJSON() as {
      companionAssets?: { assetKind?: string; commercialAppurtenantLand?: unknown }[];
    };
    // ⑬ 컴패니언 카드가 비어 있어도 `mergePrimaryBasic`이 자산종류·cb*를 채운다.
    expect(sent.companionAssets?.[0].assetKind).toBe("commercial_building");
    // 면적은 **물건 전체 그대로** — 지분으로 줄이면 §101① 초과분 판정이 달라진다.
    expect(sent.companionAssets?.[0].commercialAppurtenantLand).toEqual({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
      zoneType: "commercial",
      partBasis: { acquisitionLandStd: 360_000_000, acquisitionBuildingStd: 240_000_000, transferLandStd: 720_000_000, transferBuildingStd: 480_000_000 },
    });

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");
    expect(
      body.data.aggregated.properties.map((p: { transferGain: number }) => p.transferGain),
    ).toEqual([360_000_000, 240_000_000]);
    // 📌 §95④ 초일 산입(holding-period-first-day-inclusion.anchor) — 10년 20%
    // 📌 NBL2611-V5-BX01 재정의: 종전 181,852,000은 초과 비율 0.5를 건물분에도 곱한 값이었다. 이 픽스처는 토지·건물 기준시가 60:40이라
    //    비사업용 파트가 자산 양도소득의 30%(0.5 × 0.6)뿐이고, 30%는 §104⑤ 1호(합산 누진)가 흡수해 초과 없는 세액(181,566,000)과 같다.
    //    중과가 실제로 붙는 값은 vitest `commercial-nbl-land-part.anchor.test.ts`(토지 몫 80%·무허가 등)가 고정한다.
    expect(body.data.aggregated.totalTax).toBe(181_566_000);
  });

  test("🔴 컴패니언(다른 물건) 상가 — 종전 400이 계산으로 바뀐다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, COMPANION);
    const resp = await calculate(page);
    // 종전: ⑧은 통과시키고 route가 「Invalid option: expected one of housing|land|building」 400.
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");
    expect(
      body.data.aggregated.properties.map((p: { transferGain: number }) => p.transferGain),
    ).toEqual([100_000_000, 200_000_000]);
    // 📌 §95④ 초일 산입(holding-period-first-day-inclusion.anchor) — 10년 20%(vitest axis-b-commercial과 같은 값)
    expect(body.data.aggregated.totalTax).toBe(77_341_000);
  });
});
