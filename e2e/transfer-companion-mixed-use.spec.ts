/**
 * E2E: 컴패니언(다른 물건) × 겸용주택 분리계산 (시행령 §160① 단서).
 *
 * 설계: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md` §10
 *
 * 유닛 anchor가 배관 각 층과 「파트 카드 ≡ 단건 겸용」을 보지만, **화면에서 실제로 열리는지**는
 * 여기서만 확인된다. 일반건물 컴패니언을 열 때 유닛이 전부 통과한 상태에서 E2E가
 * 「⑧ 통과 ↔ ⑩ 400」 dead-end를 잡아낸 전례가 있다 — 겸용도 같은 위험을 갖는다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-companion-mixed-use.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 겸용주택 — 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 대지 600㎡(주거지역 3배 → 배율초과 발생). */
const MIXED = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};

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
    ...MIXED,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
  },
];

function seedForm() {
  return {
    state: {
      formData: {
        assets: ASSETS,
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "2",
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

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test("컴패니언 겸용주택 — 종전 차단이 파트 5장 계산으로 바뀐다", async ({ page }) => {
  test.setTimeout(90_000);
  await seedAndOpen(page);

  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;

  // 종전: ⑧이 "겸용주택 분리계산은 함께 양도와 같이 계산할 수 없습니다"로 막아 요청 자체가 없었다.
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

  // ⑬⑫ — 컴패니언이 전용 enum과 서브객체를 싣는다(없으면 ⑩ refine이 400).
  const sent = resp.request().postDataJSON() as {
    companionAssets?: { assetKind?: string; mixedUse?: unknown }[];
  };
  expect(sent.companionAssets?.[0].assetKind).toBe("mixed_use_house");
  expect(sent.companionAssets?.[0].mixedUse).toBeTruthy();

  // ⑭ — 1건이 파트 5장(주택 토지·건물 / 상가 토지·건물 / 배율초과)으로 펼쳐진다.
  const body = await resp.json();
  expect(body.data.mode).toBe("bundled");
  const ids = (body.data.aggregated.properties as { propertyId: string }[]).map(
    (p) => p.propertyId.split("#")[0],
  );
  expect(ids).toEqual([
    "primary",
    "mu-house-land",
    "mu-house-bld",
    "mu-comm-land",
    "mu-comm-bld",
    "mu-nbl",
  ]);

  // 배율초과분만 §104⑤ 후단의 별개 자산(비사업용 토지 세율군)이다.
  const groups = (body.data.aggregated.properties as { rateGroup: string }[]).map(
    (p) => p.rateGroup,
  );
  expect(groups.filter((g) => g === "non_business_land")).toHaveLength(1);
});
