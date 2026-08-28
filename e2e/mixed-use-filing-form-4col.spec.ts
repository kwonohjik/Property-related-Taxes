/**
 * 겸용주택 신고서 양식 — 주택분·상가분 토지/건물 4분할 표시 회귀 E2E
 *
 * 변경: 일반 겸용주택 신고서 표 [합계·주택부분·상가부분] 3열 → [합계·주택분토지·주택분건물·상가분토지·상가분건물] 5열.
 * 엔진 무변경 — MixedUseHousingPart/CommercialPart의 토지·건물 분리값을 표시 분할.
 * unit anchor(__tests__/components/mixed-use-filing-form-4col.anchor.test.tsx)는 render 파이프라인을 커버 —
 *   여기서는 실제 브라우저(store→API→result→FilingFormTable DOM)에서 컬럼·자기정합을 검증.
 *
 * 상태 주입: sessionStorage("transfer-tax-wizard") 시드 + reload (self-owns-filing-form.spec.ts 동일 패턴).
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/mixed-use-filing-form-4col.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

// 일반 겸용주택(§97 직접 환산, PHD 미적용 — 취득 2010 > 개별주택가격 공시 시작).
function mixedUseAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    isOneHousehold: false,
    isMixedUseHouse: true,
    // 면적 (전용 직접 입력 — 연면적 = 전용값 그대로)
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    // 양도시 기준시가
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    // 취득시 기준시가
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
    // 겸용주택 실가 모드의 §100② **피안분액** — 없으면 validate가 계산을 차단해
    // 결과 화면(신고서 양식)에 도달하지 못한다("겸용주택 취득 실거래가을 입력하세요").
    // 종전 seed는 기준시가 6필드만 넣고 실거래가를 빠뜨려, validate 강화 후 두 테스트가
    // 20s timeout으로 깨져 있었다(계획서 e2e-preexisting-failures-4.plan.md D-A).
    fixedAcquisitionPrice: "700000000",
  };
}

function seedForm() {
  return {
    state: {
      formData: {
        assets: [mixedUseAsset()],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1500000000",
        householdHousingCount: "1",
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

async function seedAndCalc(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((seed) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
  }, seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("겸용주택 신고서 양식 — 주택분·상가분 토지/건물 4분할", () => {
  test("5열 헤더(토지-우선) + 구 2열 라벨 미표시 + 양도가액 자기정합", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    const filing = page.locator('[data-print-section="form-table"]').first();
    await expect(filing).toBeVisible();
    const header = filing.locator("thead").first();

    // 신규 5열 라벨 (토지-우선)
    await expect(header.getByText("주택분 토지", { exact: true })).toBeVisible();
    await expect(header.getByText("주택분 건물", { exact: true })).toBeVisible();
    await expect(header.getByText("상가분 토지", { exact: true })).toBeVisible();
    await expect(header.getByText("상가분 건물", { exact: true })).toBeVisible();

    // 구 2열 라벨은 없어야 함
    await expect(header.getByText("주택부분", { exact: true })).toHaveCount(0);
    await expect(header.getByText("상가부분", { exact: true })).toHaveCount(0);

    // 자기정합: 양도가액 4개 데이터열 합 == 합계열 (첫 데이터셀)
    const cellsOf = async (rowLabel: string) => {
      const row = filing.locator("tr", { hasText: rowLabel }).first();
      const cells = row.locator("td");
      const n = await cells.count();
      const vals: number[] = [];
      for (let i = 0; i < n; i++) {
        const raw = (await cells.nth(i).innerText()).replace(/[^0-9-]/g, "");
        vals.push(parseInt(raw || "0", 10));
      }
      return vals; // [라벨, 합계, 주택분토지, 주택분건물, 상가분토지, 상가분건물]
    };
    const tp = await cellsOf("양도가액");
    expect(tp.length).toBe(6); // 라벨 td 1 + 데이터열 5 (합계 포함)
    const total = tp[1];
    const colSum = tp[2] + tp[3] + tp[4] + tp[5];
    expect(colSum).toBe(total);
    expect(total).toBe(1_500_000_000);

    // 결과탭 첫번째 보고서 = 신고서 양식 (분리계산 본문보다 DOM에서 먼저)
    const filingBox = page.locator('[data-print-id="form-table"]');
    const calcBox = page.locator('[data-print-id="calculation"]');
    await expect(filingBox).toBeVisible();
    await expect(calcBox).toBeVisible();
    const order = await page.evaluate(() => {
      const f = document.querySelector('[data-print-id="form-table"]');
      const c = document.querySelector('[data-print-id="calculation"]');
      if (!f || !c) return 0;
      // DOCUMENT_POSITION_FOLLOWING(4) → f가 c보다 앞
      return f.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
    });
    expect(order).toBe(1); // filing-form 이 calculation 보다 먼저
  });

  test("토지≠건물 취득일 → 취득일자 행 토지 열/건물 열 상이", async ({ page }) => {
    test.setTimeout(60_000);
    // 토지 취득 2005 / 건물 취득 2010 (분리 입력)
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, {
      state: {
        formData: {
          assets: [{
            ...mixedUseAsset(),
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "2005-06-10",
          }],
          transferDate: "2026-02-16",
          filingDate: "2026-04-30",
          contractTotalPrice: "1500000000",
          householdHousingCount: "1",
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });

    const filing = page.locator('[data-print-section="form-table"]').first();
    const row = filing.locator("tr", { hasText: "취득일자" }).first();
    const cells = row.locator("td");
    // [라벨, 합계, 주택분토지, 주택분건물, 상가분토지, 상가분건물]
    const landCell = await cells.nth(2).innerText();     // 주택분 토지
    const buildingCell = await cells.nth(3).innerText(); // 주택분 건물
    expect(landCell).toContain("2005");
    expect(buildingCell).toContain("2010");
    expect(landCell).not.toBe(buildingCell);
  });
});
