/**
 * E2E: 원조합원에게 관리처분계획 인가 뒤 입주권을 증여받은 승계조합원 완공APT — 증여자 세대의 보유기간 통산
 * (계획서 `docs/00-pm/redev-successor-gift-holding.plan.md` Q-1~Q-4 a)
 *
 * 종전에는 승계조합원이면 증여자와 같은 세대여도 보유기간을 준공일부터 셌다(같은 사실 화면 298,500,000 ↔ 세대 사실 주입 0).
 * 세액·축별 단언은 anchor(`__tests__/calc/redev-successor-gift-holding.anchor.test.ts` SG-1~20)가 고정한다. 여기서는 브라우저에서
 * 재개발 카드의 증여자 유형 질문 → 세대 보유 시작일이 ④ 본문에 실려 비과세가 나오는지, 인가 뒤 시작일을 넣으면 막히는지를 본다.
 *
 * 시료: 승계조합원 · 배우자 증여 2020-01-01 · 증여자 종전주택 취득 2008-01-01 · 인가 2019-06-01 · 준공 2023-06-01 ·
 * 신축 거주 6개월 · 강남 · 2024-12-01 10억 · 1세대 1주택.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/redev-successor-gift-holding.spec.ts --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedState(assetOver: Record<string, unknown>) {
  return {
    state: {
      formData: {
        transferDate: "2024-12-01",
        filingDate: "2025-02-28",
        contractTotalPrice: "1000000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        residencePeriodMonths: "6",
        houses: [],
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "redevelopment_apt",
            addressJibun: "서울특별시 강남구 역삼동 1",
            regionCode: "1168010100",
            acquisitionCause: "gift",
            acquisitionDate: "2020-01-01",
            donorAcquisitionDate: "2008-01-01",
            giftDonorRelation: "spouse",
            fixedAcquisitionPrice: "500000000",
            actualSalePrice: "1000000000",
            redevSubject: "apt",
            redevApprovalDate: "2019-06-01",
            redevCompletionDate: "2023-06-01",
            redevApprovalLawBasis: "urban_renovation_art_74",
            redevOriginalAssetType: "housing",
            redevSettlementDirection: "",
            redevSettlementAmount: "",
            redevIsSuccessorMember: "yes",
            redevSuccessorGiftSameHousehold: "yes",
            redevPriorHouseResidenceMonths: "0",
            redevNewHouseResidenceMonths: "6",
            residenceInputMode: "direct",
            residencePeriodMonthsAsset: "6",
            residencePeriods: [],
            ...assetOver,
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, assetOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), seedState(assetOver));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function fillStart(page: Page, y: string, m: string, d: string) {
  const card = page.locator('[data-field="redevSuccessorGiftHouseholdStartDate"]');
  await card.getByLabel("연도").fill(y);
  await card.getByLabel("월").fill(m);
  await card.getByLabel("일").fill(d);
}

test.describe("승계조합원 완공APT 증여 — 증여자 세대 보유 통산", () => {
  test("[SGE-1] 증여자 = 주택 출자 원조합원 「예」 + 세대 보유 시작일 → 본문에 실려 비과세 0", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: /^3\s*취득/ }).first().click();
    await expect(page.getByText("증여자가 관리처분계획 인가 전부터 종전주택을 보유한 조합원이었습니까?")).toBeVisible();
    await page.getByRole("radio", { name: /종전주택\(건물\)을 출자한 원조합원/ }).check();
    await fillStart(page, "2008", "1", "1");

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const resp = await resP;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const body = resp.request().postDataJSON();
    expect(body).toMatchObject({ giftSameHouseholdContinuous: true, giftHouseholdHoldingStartDate: "2008-01-01" });
    expect(body.redevelopment.successorGiftDonorHouseMember).toBe(true);
    const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number } } }).data.result;
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  test("[SGE-2] 세대 보유 시작일이 관리처분계획 인가일 뒤면 계산 전에 막는다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { donorAcquisitionDate: "2019-07-01", redevSuccessorGiftDonorHouseMember: "yes", redevSuccessorGiftHouseholdStartDate: "2019-07-01" });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/관리처분계획 인가일 이전이어야 합니다/).first()).toBeVisible();
  });
});
