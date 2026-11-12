/**
 * E2E: §155⑳ 거주주택 거주 2년 — 증여 전 같은 세대 거주를 통산한다(1주택 코드 리뷰 별건 ⑥).
 *
 * 계획서: `docs/00-pm/rental-residence-gift-inheritance-residence-consolidation.plan.md`
 * 엔진·⑧ 주장은 anchor가 고정한다(`rh-residence-same-household-consolidation.anchor.test.ts` ·
 * `rental-exception-same-household-residence.anchor.test.ts`). 여기서만 관측되는 것은 **계산기 화면이 본인 거주 12개월에서
 * 계산을 막지 않고 끝까지 가서, 결과에 통산 내역이 보이는가**다 — 종전에는 ⑧이 엔진에 닿기 전에 막았다.
 * 통산해도 24개월 미만이면 ⑧은 막지 않고 엔진이 특례 없이 과세한다(RS-1).
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-rental-155-20-same-household-residence.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedState(assetOver: Record<string, unknown>) {
  const a = makeDefaultAsset(1);
  return {
    state: {
      formData: {
        transferDate: "2025-03-03",
        filingDate: "2025-05-31",
        contractTotalPrice: "900000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        assets: [
          {
            ...a,
            assetKind: "housing",
            addressJibun: "서울 강남구 테스트동 1-1",
            acquisitionCause: "gift",
            acquisitionDate: "2021-01-04",
            fixedAcquisitionPrice: "500000000",
            actualSalePrice: "900000000",
            donorAcquisitionDate: "2015-03-02",
            giftDonorRelation: "lineal",
            giftSameHousehold: "yes",
            giftHouseholdHoldingStartDate: "2015-03-02",
            residenceInputMode: "direct",
            residencePeriodMonthsAsset: "12",
            rentalHousingException: {
              ...a.rentalHousingException,
              applyException: true,
              scenario: "A",
              rentalUnits: [
                {
                  businessRegistrationDate: "2018-06-01",
                  rentalRegistrationDate: "2018-06-01", rentalRegisteredDate: "2018-06-01",
                  rentalCategory: "long_general",
                  rentalAcquisitionType: "purchase",
                  isApartment: false,
                  region: "seoul-metro",
                  isExcluded918Rule: false,
                  standardPriceAtRentalStart: "300,000,000",
                  rentalLandArea: "",
                  rentalTotalFloorArea: "",
                  hasMinimum2Units: false,
                  rentalMonths: "96",
                  rentalAutoTermination: false,
                  requirementsConfirmed: true,
                },
              ],
            },
            ...assetOver,
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, assetOver: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), seedState(assetOver));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const BLOCK = /장기임대주택 특례 — 거주주택 거주기간 2년\(24개월\) 이상이 필요합니다/;

test.describe("§155⑳ 거주 2년 — 증여 전 같은 세대 거주 통산 (별건 ⑥)", () => {
  /** 계산기 ⑧은 요건 미달을 막지 않는다(`axis-b-late-share-surcharge-and-rhe-dead-end.plan.md` B) — 엔진이 특례 없이 계산한다. */
  test("[RS-1] 증여 전 거주 개월이 없으면 본인 12개월로 거주 2년 미달 — 막지 않고 특례 없이 과세", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { giftPriorHouseholdResidenceMonths: "" });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const resp = await resP;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const json = (await resp.json()) as { data: { result: { totalTax: number; isExempt: boolean } } };
    expect(json.data.result.isExempt).toBe(false);
    expect(json.data.result.totalTax).toBeGreaterThan(0);
    await expect(page.getByText(BLOCK)).toHaveCount(0);
  });

  test("[RS-2] ★ 증여 전 같은 세대 거주 18개월이면 막히지 않고 비과세 0 — 결과에 통산 내역", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { giftPriorHouseholdResidenceMonths: "18" });
    // ⑤ 카드 ✓/✗는 ⑧·엔진과 같은 leaf다 — 통산 30개월로 ✓, 「일반 양도소득세」 안내 없음(`rhe-e1-notice-and-card-verdict-mismatch.plan.md` B)
    await expandAssetSection(page, 5);
    await expect(page.getByText("현재 30개월 (같은 세대 거주 통산 18개월 포함)", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("일반 양도소득세로 계산됩니다", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const resp = await resP;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const json = (await resp.json()) as { data: { result: { totalTax: number; isExempt: boolean } } };
    expect(json.data.result.isExempt).toBe(true);
    expect(json.data.result.totalTax).toBe(0);
    await expect(page.getByText(BLOCK)).toHaveCount(0);
    await expect(page.getByText(/본인 거주 12개월 \+ 증여 전 같은 세대 거주 18개월 = 30개월/).first()).toBeVisible();
  });
});
