/**
 * E2E: 일반건물(실거래가) **양도비 토지·건물 배분 기준** — 상세명세서 «자산별 양도비» 산식이 적용 양도가액을 분모로 쓰고 자기 값을 만든다.
 *
 * 계획서: docs/00-pm/gb-transfer-expense-apportion-basis.plan.md (D-1)
 *
 * 사용자 규칙: 양도비는 자산가액으로 배분한다 — 실가(구분 기재)·감정가액이면 그 가액, 환산(기준시가 안분)이면 기준시가.
 * 종전에는 양도비를 항상 양도시 기준시가로 나눠 구분 기재 14억/6억이어도 토지분이 3,771,045로 나왔고(양도가액 70:30과 다른 비율),
 * 신규 «양도비» 칸 입력에서는 산식이 `0 × … = 3,771,045`로 값을 못 만들었다.
 *
 * 시료: 총 양도가 20억 · 양도시 토지 85㎡ × 10,830,000 = 920,550,000 · 건물 기준시가 3억 · 구분 기재 14억/6억 · 양도비 5,000,000.
 * ⚠️ substring 단언을 피하려고 «산식 전체 문자열»을 정확히 비교한다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/gb-transfer-expense-sale-basis.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seed(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "general_building",
            acquisitionCause: "purchase",
            acquisitionDate: "2005-03-01",
            landAcquisitionDate: "2005-03-01",
            hasSeperateLandAcquisitionDate: false,
            gbBuildingAcquisitionCause: "purchase",
            useEstimatedAcquisition: false,
            fixedAcquisitionPrice: "700000000",
            gbLandArea: "85",
            gbBuildingArea: "180.96",
            gbBuildingFootprintArea: "90.48",
            gbTransferLandPricePerSqm: "10830000",
            gbTransferBuildingValue: "300000000",
            gbAcqLandPricePerSqm: "1500000",
            gbAcqBuildingValue: "28144700",
            gbZoneType: "commercial",
            gbIsMetropolitan: true,
            saleSplitMode: "actual",
            landTransferPrice: "1400000000",
            buildingTransferPrice: "600000000",
            transferExpense: "5000000",
            ...over,
          },
        ],
        transferDate: "2025-06-30",
        filingDate: "2025-08-31",
        contractTotalPrice: "2000000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed(over));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20_000 });
}

/**
 * 상세명세서 «필요경비» 행의 자산별(토지·건물) 산식 텍스트. 자산별 영역은 접힌 상태(`hidden`)에서도 DOM에 있으므로 `textContent`로 읽는다
 * (`innerText`는 숨김 요소를 건너뛴다). 공백은 한 칸으로 정규화한다.
 */
async function expenseFormulas(page: Page): Promise<string> {
  const text = await page.locator('[data-statement-row="필요경비"]').first().textContent();
  // 산식의 « / »는 분수(Frac)로 그려져 textContent에는 분자·분모가 붙어 나온다 — 아래 기대값이 그 모양이다.
  return (text ?? "").replace(/\s+/g, " ");
}

test.describe("일반건물 양도비 배분 기준 — 상세명세서 산식", () => {
  test("구분 기재 14억/6억 · 양도비 5,000,000 → 토지 3,500,000 (양도가액 비율과 같다)", async ({ page }) => {
    test.setTimeout(90_000);
    // Network — 요청 body에 양도비·구분 기재가 실려 가는가(이번 변경은 신규 필드가 없다: 기존 payload만으로 도달해야 한다).
    const bodies: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/calc/transfer")) bodies.push(r.postData() ?? "");
    });
    await seedAndCalc(page, {});
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toContain('"transferExpense":5000000');
    expect(bodies[0]).toContain('"landTransferPrice":1400000000');
    expect(bodies[0]).toContain('"buildingTransferPrice":600000000');
    const text = await expenseFormulas(page);
    expect(text).toContain("5,000,000 × 1,400,000,000(1,400,000,000+600,000,000) = 3,500,000");
    expect(text).toContain("5,000,000 - 토지 3,500,000 = 1,500,000 (잔액 보정)");
    expect(text, "종전 산식(양도시 기준시가·값을 못 만드는 0 ×)이 남아 있으면 안 된다").not.toContain("0 × 920,550,000");
  });

  test("구분 기재 없음(기준시가 안분) → 분모는 양도시 기준시가 — 종전과 같은 3,771,045", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndCalc(page, { saleSplitMode: "apportioned", landTransferPrice: "", buildingTransferPrice: "" });
    const text = await expenseFormulas(page);
    expect(text).toContain("5,000,000 × 920,550,000(920,550,000+300,000,000) = 3,771,045");
  });
});
