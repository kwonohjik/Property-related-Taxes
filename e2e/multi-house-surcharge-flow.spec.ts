/**
 * 다주택 중과 판정 메뉴 — 시드 → 판정 → 표·상세 → 계산기 넘기기 (계획서 `multi-house-surcharge-judgment-menu.plan.md` §7.3 · P7).
 *
 * MHF-7 조합원입주권 양도 표(V-5 · `multi-house-surcharge-menu-residuals.plan.md` §2).
 *
 * 단위 anchor는 route·뷰를 따로 본다. 여기서는 **폼 → ④ 본문 → Zod → route → 엔진 → 결과 뷰 → 계산기 store**가 한 줄로
 * 이어지는지 본다(`feedback_leaf_anchor_skips_zod_layer`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE, selectDirectResidenceInput } from "./_helpers/residence-direct";
import { answerPhrp154_10NoIfUnanswered } from "./_helpers/judgment-seed";

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
  await answerPhrp154_10NoIfUnanswered(page);
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

  test("MHF-4 세부담 시뮬레이션 — 취득가액을 넣어 비교하면 판정대로(A)·중과가 없다면(B)와 차액이 나온다", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoResult(page);
    await page.getByTestId("surcharge-to-simulation").click();
    await page.getByTestId("surcharge-sim-acquisition-price").fill("500000000");
    await page.getByTestId("surcharge-sim-expenses").fill("10000000");
    await page.getByTestId("surcharge-simulate-cta").click();
    // 강남 3주택 · 양도 10억 · 취득 5억 · 필요경비 1천만 · 2015-01-01 취득 → 2021-06-01 양도(route anchor S-1과 같은 값)
    await expect(page.getByTestId("surcharge-sim-a-total")).toHaveText("347,435,000");
    await expect(page.getByTestId("surcharge-sim-b-total")).toHaveText("160,688,000");
    await expect(page.getByTestId("surcharge-sim-difference")).toHaveText("186,747,000");
    await expect(page.getByTestId("surcharge-sim-a-rate-sub")).toHaveText("가산 30%p 포함");
  });

  test("MHF-5 홈 카드는 새 건으로 연다 — 남아 있던 입력을 비운다(D5)", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoResult(page);
    await page.goto("/");
    await page.getByRole("link", { name: /다주택 중과 판정/ }).click();
    await expect(page).toHaveURL(/\/calc\/multi-house-surcharge/);
    await expect(page.getByTestId("one-house-household")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(sessionStorage.getItem("one-house-judgment-wizard") ?? "{}").state?.formData?.houses?.length ?? 0),
      )
      .toBe(0);
  });

  test("MHF-6 보유 주택을 양도 예정 주택으로 바꿔 판정 — 확인 → ② 고지 → 다시 판정하면 그 주택이 양도 예정 주택", async ({ page }) => {
    test.setTimeout(90_000);
    // h1은 양도 주택(2015)보다 나중(2018) 취득 — 맞바꾼 뒤 옛 양도 주택이 더 오래된 행이 되어 §155① 취득 경위 질문이 생기지 않는다
    await gotoResult(page, { houses: [{ ...house("h1"), acquisitionDate: "2018-01-01" }, house("h2")] });
    await page.getByTestId("surcharge-swap-h1").click();
    await page.getByRole("button", { name: "바꿔서 판정" }).click();
    await expect(page.getByTestId("surcharge-swap-notice")).toBeVisible();
    await expect(page.getByTestId("surcharge-swap-cleared")).toContainText("예상 양도가액");
    const swapped = await page.evaluate(() => {
      const f = JSON.parse(sessionStorage.getItem("one-house-judgment-wizard") ?? "{}").state?.formData;
      return { acq: f?.assets?.[0]?.acquisitionDate, rows: f?.houses?.map((h: { id: string; acquisitionDate: string }) => `${h.id}:${h.acquisitionDate}`) };
    });
    // h1 자리에 옛 양도 주택(2015)이 들어가고, 새 양도 주택은 h1이던 2018 취득 주택이다
    expect(swapped).toEqual({ acq: "2018-01-01", rows: ["h1:2015-01-01", "h2:2010-01-01"] });
    // 새 양도 주택의 양도 사실 — 양도가액과 거주기간(전환은 거주를 비워 ⑧이 다시 묻게 한다)
    await page.getByTestId("one-house-sale-price").fill("900000000");
    await selectDirectResidenceInput(page);
    await answerPhrp154_10NoIfUnanswered(page);
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByTestId("surcharge-judge-cta").click();
    await expect(page.getByTestId("surcharge-conclusion-label")).toHaveText("3주택 이상 중과");
  });

  test("MHF-7 조합원입주권 양도 — ② 종전 주택의 가격 입력 → 범위 밖 사유와 함께 보유 주택별 표(입주권 불산입 · 주택 수 2)", async ({ page }) => {
    test.setTimeout(90_000);
    const right = { ...seedForm().state.formData.assets[0], assetKind: "right_to_move_in", regionCode: "4719010100" };
    await page.goto("/calc/multi-house-surcharge");
    await expect(page.getByTestId("one-house-household")).toBeVisible();
    await page.evaluate((s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)), seedForm({ assets: [right] }));
    await page.reload();
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByTestId("surcharge-selling-right-value").fill("250000000");
    await page.getByRole("button", { name: "다음" }).click();
    const req = page.waitForRequest((r) => r.url().includes("/api/calc/multi-house-surcharge-judgment"));
    await page.getByTestId("surcharge-judge-cta").click();
    expect((await req).postDataJSON().sellingRightValue).toBe(250000000);
    await expect(page.getByTestId("surcharge-scope-unsupported")).toContainText("조합원입주권");
    await expect(page.getByTestId("surcharge-row-selling-right")).toContainText("양도 예정 조합원입주권");
    await expect(page.getByTestId("surcharge-cell-counted-selling-right")).toContainText("불산입");
    await expect(page.getByTestId("surcharge-cell-ifSold-h1")).toContainText("(간이)");
    await expect(page.getByTestId("surcharge-count-summary")).toContainText("2");
    await expect(page.getByTestId("surcharge-swap-h1")).toHaveCount(0);
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
