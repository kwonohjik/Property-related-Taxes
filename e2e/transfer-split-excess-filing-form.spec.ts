/**
 * E2E: 단일 주택(같은 날 취득 · 토지·건물 분리) 배율 초과 부수토지 — 신고서 양식이 초과분을 열에 반영한다 (표시 전용 · 세액 불변)
 *
 *   T1. 15억 · 토지 500㎡ · 정착 100㎡(한도 300㎡) → 신고서 열은 합계·토지·건물뿐이고(초과분 전용 열 없음),
 *       열 합 = 합계 열(과세대상 양도차익 · 장기보유특별공제 · 양도소득금액) · 초과분이 합산된 토지 열 칸에만 구성 각주
 *   T2. 대조 — 토지 300㎡(초과 없음) → 구성 각주·초과분 블록 없음
 *
 * ⚠️ 값의 정본은 vitest anchor(`filing-form-split-nonbusiness-land.anchor.test.ts` — echo 대조 · 열 합 불변식)다.
 *    여기는 «실제 렌더 파이프라인(store → API → result → 표)에서도 열 합이 합계와 맞는다»는 배선 확인이라 금액 리터럴·문구 정규식에 의존하지 않는다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-split-excess-filing-form.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

function seedForm(area: string) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2012-01-02",
          fixedAcquisitionPrice: "500000000",
          actualSalePrice: "1500000000",
          addressJibun: "서울 테스트동 1",
          residencePeriodMonthsAsset: "120",
          buildingFootprintArea: "100",
          appurtenantLandZone: "metropolitan_residential",
          isUrbanArea: true,
          areaScenario: "same",
          acquisitionArea: area,
          transferArea: area,
          standardPriceAtAcq: "300000000",
          standardPricePerSqmAtAcq: "400000",
          buildingStandardPriceAtAcq: "150000000",
          standardPricePerSqmAtTransfer: "800000",
          buildingStandardPriceAtTransfer: "400000000",
        }],
        transferDate: "2026-02-16",
        contractTotalPrice: "1500000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        residencePeriodMonths: "120",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, area: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(area));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 30_000 });
}

/** 행 라벨(첫 칸 정확 일치)로 찾은 행의 칸들 — [라벨, 합계, 토지, 건물] */
function rowCells(filing: Locator, label: string): Locator {
  return filing.locator("tbody tr").filter({ has: filing.page().locator("td:first-child", { hasText: new RegExp(`^\\s*${label}\\s*$`) }) }).first().locator("td");
}
/** 칸의 금액(각주 div 앞 첫 줄) */
async function amount(cell: Locator): Promise<number> {
  const first = (await cell.innerText()).split("\n")[0];
  return parseInt(first.replace(/[^0-9-]/g, "") || "0", 10);
}

test.describe("신고서 양식 — 단일 주택 배율 초과 부수토지 열 반영", () => {
  test("T1: 열 구성은 합계·토지·건물 · 열 합 = 합계 · 토지 열에만 구성 각주", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndCalc(page, "500");
    const filing = page.locator('[data-print-id="form-table"]').first();

    await expect(filing.locator("thead th")).toHaveCount(4); // 항목 · 합계 · 토지 · 건물 — 초과분 전용 열 없음

    for (const label of ["과세대상 양도차익", "장기보유특별공제", "양도소득금액"]) {
      const cells = rowCells(filing, label);
      const [total, land, building] = [await amount(cells.nth(1)), await amount(cells.nth(2)), await amount(cells.nth(3))];
      expect(land + building, `${label} 열 합 = 합계`).toBe(total);
    }
    // 초과분이 합산된 칸 — 토지 열에만 구성 각주(내용 있음), 합계·건물 열에는 없다
    for (const label of ["과세대상 양도차익", "비과세 양도차익", "장기보유특별공제", "보유 기간분 장특", "양도소득금액", "감면후 소득금액"]) {
      const cells = rowCells(filing, label);
      const note = cells.nth(2).getByTestId("filing-rose-note");
      await expect(note, `${label} 토지 열 각주`).toBeVisible();
      await expect(note).not.toBeEmpty();
      await expect(cells.nth(1).getByTestId("filing-rose-note")).toHaveCount(0);
      await expect(cells.nth(3).getByTestId("filing-rose-note")).toHaveCount(0);
    }
    // 분리 카드의 초과분 블록
    await expect(page.getByTestId("split-card-nb-part").first()).toBeVisible();
  });

  test("T2: 대조 — 초과 없음(토지 300㎡)이면 구성 각주·초과분 블록이 없다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndCalc(page, "300");
    const filing = page.locator('[data-print-id="form-table"]').first();
    // 초과가 없으면 같은 날 취득 주택은 분리 경로를 타지 않아 합계 열만 있다 — 구성 각주가 없다.
    for (const label of ["과세대상 양도차익", "장기보유특별공제", "양도소득금액"]) {
      await expect(rowCells(filing, label).nth(1).getByTestId("filing-rose-note")).toHaveCount(0);
    }
    await expect(page.getByTestId("split-card-nb-part")).toHaveCount(0);
  });
});
