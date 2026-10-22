/**
 * 다주택 중과 판정 메뉴 — 시드 → 판정 → 표·상세 → 계산기 넘기기 (계획서 `multi-house-surcharge-judgment-menu.plan.md` §7.3 · P7).
 *
 * 단위 anchor는 route·뷰를 따로 본다. 여기서는 **폼 → ④ 본문 → Zod → route → 엔진 → 결과 뷰 → 계산기 store**가 한 줄로
 * 이어지는지 본다(`feedback_leaf_anchor_skips_zod_layer`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";
const house = (id: string) => ({
  id,
  region: "capital" as const,
  regionCode: GANGNAM,
  acquisitionOrigin: "general" as const,
  acquisitionDate: "2010-01-01",
  officialPrice: "500000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** 강남 양도 주택 + 강남 2채 · 양도 2021-06-01 ⇒ 3주택 이상 중과(유예 창 전) */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            ...DIRECT_RESIDENCE,
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2015-01-01",
            regionCode: GANGNAM,
            residencePeriodMonthsAsset: "0",
          },
        ],
        transferDate: "2021-06-01",
        contractTotalPrice: "1000000000",
        isOneHousehold: true,
        presaleRights: [],
        houses: [house("h1"), house("h2")],
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoResult(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/multi-house-surcharge");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate((s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)), seedForm(over));
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByTestId("surcharge-judge-cta").click();
  await expect(page.getByTestId("surcharge-result")).toBeVisible();
}

test.describe("다주택 중과 판정 — 흐름", () => {
  test("MHF-1 3주택 이상 중과 — 결론 · 표(양도 예정 주택 정밀 · 다른 행 간이) · 판정 순서 · 세율 +30%p", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoResult(page);
    await expect(page.getByTestId("surcharge-conclusion-label")).toHaveText("3주택 이상 중과");
    await expect(page.getByTestId("surcharge-row-selling")).toBeVisible();
    await expect(page.getByTestId("surcharge-cell-ifSold-h1")).toContainText("(간이)");
    await expect(page.getByTestId("surcharge-selling-detail")).toContainText("여기서 결론");
    await expect(page.getByTestId("surcharge-rate-line")).toHaveText("기본세율 + 30%p");
    await expect(page.getByTestId("surcharge-exemption-summary")).toBeVisible();
  });

  test("MHF-2 양도 주택 문화유산 선언 → 중과 없음 → 계산기로 넘기면 그 사실이 계산기 폼에 도착한다", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoResult(page, { sellingHouseExclusion: { isCulturalHeritage: true } });
    await expect(page.getByTestId("surcharge-conclusion-label")).toHaveText("중과 없음");
    await page.getByTestId("surcharge-calculate-tax").click();
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/);
    const exclusion = await page.evaluate(() => {
      const raw = sessionStorage.getItem("transfer-tax-wizard") ?? localStorage.getItem("transfer-tax-wizard");
      return raw ? JSON.parse(raw).state?.formData?.sellingHouseExclusion : null;
    });
    expect(exclusion).toEqual({ isCulturalHeritage: true });
  });

  test("MHF-3 두 메뉴 교차 링크는 입력을 유지한다", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoResult(page);
    await page.getByTestId("surcharge-to-one-house-link").click();
    await expect(page).toHaveURL(/\/calc\/one-house-exemption$/);
    // 입력을 함께 쓴다 — 1주택 메뉴 사이드바 요약에 시드한 양도 예정일이 그대로 있다
    await expect(page.locator("aside")).toContainText("2021-06-01");
    await page.getByTestId("one-house-to-surcharge-link").click();
    await expect(page).toHaveURL(/\/calc\/multi-house-surcharge$/);
  });
});
