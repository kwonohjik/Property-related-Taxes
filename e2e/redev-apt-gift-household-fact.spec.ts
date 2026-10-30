/**
 * E2E: 증여받은 종전주택으로 원조합원이 된 완공APT — 「증여자와의 세대 관계」 카드 (계획서 `docs/00-pm/redev-apt-gift-household-fact.plan.md` Q-1~Q-3 a)
 *
 * 종전에는 세대 사실 칸이 일반 주택에만 열려 완공APT는 답할 곳이 없었다(같은 사실관계 일반 주택 0 ↔ 완공APT 149,060,000).
 * 세액·축별 단언은 anchor(`__tests__/calc/redev-apt-gift-household-fact.anchor.test.ts` RG-1~15)가 고정한다. 여기서는 브라우저에서
 * 카드가 보이고 · 답이 ④ 본문에 실려 · 비과세가 나오는지, 증여 전 입주일을 종전주택 칸에 넣으면 막히는지를 본다.
 *
 * 시료: 원조합원(주택 출자) · 배우자 증여 2018-01-01(강남 조정 중) · 세대 보유 시작 2008-01-01 · 인가 2019-06-01 · 준공 2023-06-01 ·
 * 신축 거주 6개월 · 2024-12-01 10억 · 1세대 1주택.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/redev-apt-gift-household-fact.spec.ts --workers=1
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
            acquisitionDate: "2018-01-01",
            donorAcquisitionDate: "2008-01-01",
            giftDonorRelation: "spouse",
            giftSameHousehold: "",
            // 증여 신고가액(§163⑨) — 원조합원 증여는 필수(계획서 successor-right-carryover-contribution §15 Q-2) · 종전 부동산 실거래가와 같은 값이라 세액 불변
            fixedAcquisitionPrice: "400000000",
            actualSalePrice: "1000000000",
            redevSubject: "apt",
            redevApprovalDate: "2019-06-01",
            redevCompletionDate: "2023-06-01",
            redevApprovalLawBasis: "urban_renovation_art_74",
            redevOriginalAssetType: "housing",
            redevSettlementDirection: "pay",
            redevSettlementAmount: "100000000",
            redevRightsValue: "900000000",
            redevIsSuccessorMember: "no",
            redevActualAcquisitionPrice: "400000000",
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

async function fillHouseholdStart(page: Page) {
  await page.getByRole("radio", { name: /^예 — 계속 같은 세대/ }).check();
  const start = page.getByTestId("one-house-gift-household-start");
  await start.getByLabel("연도").fill("2008");
  await start.getByLabel("월").fill("1");
  await start.getByLabel("일").fill("1");
}

test.describe("완공APT 증여 — 세대 관계 카드", () => {
  test("[RGE-1] 원조합원 완공APT에 카드가 열리고, 「예」 + 세대 보유 시작일이 본문에 실려 비과세 0", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: /^3\s*취득/ }).first().click();
    await expect(page.getByText("증여자와의 세대 관계 — 1세대1주택 비과세 판정")).toBeVisible();
    await fillHouseholdStart(page);

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const resp = await resP;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    expect(resp.request().postDataJSON()).toMatchObject({
      giftSameHouseholdContinuous: true,
      giftHouseholdHoldingStartDate: "2008-01-01",
    });
    const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number } } }).data.result;
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  test("[RGE-2] 종전주택 입주일이 증여일보다 앞서면 계산 전에 막는다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      giftSameHousehold: "yes",
      giftHouseholdHoldingStartDate: "2008-01-01",
      redevPriorResidenceStartDate: "2016-01-01",
      redevPriorResidenceEndDate: "2019-12-31",
      redevPriorHouseResidenceMonths: "47",
    });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/종전주택 입주일이 증여일보다 앞섭니다/).first()).toBeVisible();
  });
});
