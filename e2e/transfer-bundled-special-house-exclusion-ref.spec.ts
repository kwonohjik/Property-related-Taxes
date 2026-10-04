/**
 * transfer-bundled-special-house-exclusion-ref.spec.ts
 *
 * 일괄(함께양도) 결과 「자산별 계산 결과」의 감면주택·§99의4 카드에 단건·다건과 같은 「보유 주택 N」이 붙는다.
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8 「일괄 감면주택 카드 보유 주택 N」(사용자 결정 2026-10-04).
 *
 * 시료 = RTL anchor `__tests__/components/bundled-special-house-exclusion-card.anchor.test.tsx` BND-1과 같은 폼
 * (주 자산 강남 주택 + 컴패니언 토지 · actual · 명부 [일반 h2, §99의2 h3, §99의4 h4]).
 * 음성 짝: 같은 폼에서 명부 행의 조특법 선언을 뺀 일반 행 → 카드·라벨 없음.
 *
 * 실행: E2E_PORT=3271 npx playwright test e2e/transfer-bundled-special-house-exclusion-ref.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import type { HouseEntry, RowCountExclusionReduction } from "../lib/stores/calc-wizard-asset-nbl";

const GANGNAM = "1168010100";

const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2012-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
const SPECIAL_ROW: HouseEntry = {
  ...ROW,
  id: "h3",
  acquisitionDate: "2013-06-01",
  countExclusion: {
    kind: "special",
    special: {
      article: "unsold_99_2",
      houseAcquisitionDate: "2013-06-01",
      houseContractDate: "2013-06-01",
      isNationalHousing: false,
      requirementsConfirmed: true,
    },
  },
};
const RURAL: RowCountExclusionReduction = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
const RURAL_ROW: HouseEntry = {
  ...ROW,
  id: "h4",
  region: "non_capital",
  regionCode: undefined,
  acquisitionDate: "2021-01-01",
  officialPrice: "150000000",
  countExclusion: { kind: "reduction", reduction: RURAL },
};

/** 앱 기본 폼에서 출발(`feedback_fixture_default_masks_gate_defect`) — anchor `bundledForm()`과 같은 값 */
function bundledForm(houses: HouseEntry[]) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
    actualSalePrice: "2,000,000,000",
  };
  f.assets.push({
    ...makeDefaultAsset(2),
    addressJibun: "서울 강남구 테스트동 1-2",
    assetKind: "land",
    landNature: "standalone",
    acquisitionDate: "2010-01-01",
    acquisitionArea: "300",
    fixedAcquisitionPrice: "100,000,000",
    actualSalePrice: "300,000,000",
  });
  return Object.assign(f, {
    transferDate: "2026-09-18",
    contractTotalPrice: "2,300,000,000",
    bundledSaleMode: "actual",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
  });
}

/** 세션 시드 → 단계 순회 → 계산하기 → 일괄 결과 */
async function calculate(page: Page, houses: HouseEntry[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (formData) =>
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({ state: { formData, pendingMigration: false }, version: 0 }),
      ),
    bundledForm(houses),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const body = await resp.json();
  expect(body.data.mode).toBe("bundled");
  await expect(page.getByText("자산별 계산 결과")).toBeVisible({ timeout: 15_000 });
  return body as {
    data: {
      aggregated: {
        properties: {
          propertyId: string;
          specialHouseExclusionDetail?: { entries: { houseId?: string }[] };
          houseCountExclusionDetails?: { id: string; houseId?: string }[];
        }[];
      };
    };
  };
}

test.describe("일괄 결과 — 감면주택·§99의4 카드의 「보유 주택 N」", () => {
  test("§99의2·§99의4 명부 행 → 카드에 그 명부의 보유 주택 2·3", async ({ page }) => {
    test.setTimeout(120_000);
    const body = await calculate(page, [ROW, SPECIAL_ROW, RURAL_ROW]);
    const primary = body.data.aggregated.properties.find((p) => p.propertyId === "primary")!;
    expect(primary.specialHouseExclusionDetail?.entries.map((e) => e.houseId)).toEqual(["h3"]);
    expect(primary.houseCountExclusionDetails?.map((d) => d.houseId)).toEqual(["h4"]);

    const card = page.getByTestId("special-house-exclusion-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("조특법 감면주택 보유 — 주택수 제외")).toBeVisible();
    await expect(card.getByTestId("count-exclusion-house-ref")).toHaveText("보유 주택 2 (2013-06-01 취득) —");
    await expect(card.getByText("§99의2 신축주택등")).toBeVisible();
    // 화면 순서 = `ReductionDetailCards` 배치(§99의4·§98의9 카드가 감면주택 카드보다 앞)
    await expect(page.getByTestId("count-exclusion-house-ref")).toHaveText([
      "대상: 보유 주택 3 (2021-01-01 취득)",
      "보유 주택 2 (2013-06-01 취득) —",
    ]);
  });

  test("(음성) 조특법 선언 없는 일반 행 → 카드·라벨 없음", async ({ page }) => {
    test.setTimeout(120_000);
    const body = await calculate(page, [ROW, { ...ROW, id: "h3", acquisitionDate: "2013-06-01" }]);
    const primary = body.data.aggregated.properties.find((p) => p.propertyId === "primary")!;
    expect(primary.specialHouseExclusionDetail?.entries ?? []).toEqual([]);
    await expect(page.getByTestId("special-house-exclusion-card")).toHaveCount(0);
    await expect(page.getByTestId("count-exclusion-house-ref")).toHaveCount(0);
  });
});
