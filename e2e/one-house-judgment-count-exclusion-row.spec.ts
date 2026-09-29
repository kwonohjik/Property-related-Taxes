/**
 * 판정 메뉴 ③ — 조특법 주택 수 제외를 **명부 행**에서 지정 → 판정 → 결과 (브라우저 경로)
 *
 * 계획서 `docs/00-pm/one-house-judgment-count-exclusion-row-link.plan.md`.
 * 엔진·route 주장은 anchor가 고정한다(`one-house-count-exclusion-row-link.anchor.test.ts`). 여기서만
 * 관측되는 것은 **행 편집 모달의 입력이 실제로 그 행에 붙어 판정 본문에 실리고, 결과가 그 주택을
 * 가리키는가**다.
 *
 * 시나리오: 해석례 서면-2021-부동산-6220 — 종전주택 A(2012.11.21.) · 신규주택 B(2019.3.17.) ·
 * 농어촌주택 C(2019.10.21.) · A 양도(2021.12.12.). 회신: 1주택으로 보아 비과세.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const house = (id: string, acquisitionDate: string) => ({
  id,
  region: "non_capital",
  acquisitionDate,
  officialPrice: "150000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
});

async function seed(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2021-12-12",
    contractTotalPrice: "800000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    assets: [{ assetKind: "housing", acquisitionDate: "2012-11-21" }],
    houses: [house("b", "2019-03-17"), house("c", "2019-10-21")],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as Record<string, unknown>;
}

test("[CXR-1] 행 편집에서 농어촌주택 지정 → 「특례」 배지 → 비과세 · 결과가 그 주택을 가리킨다", async ({ page }) => {
  await seed(page);

  await page.getByRole("button", { name: "주택 2 편집" }).click();
  await page.getByTestId("house-row-count-exclusion-new_99_4_rural").click();
  // 취득일은 입력 칸이 아니라 행 값이다
  await expect(page.getByTestId("new994-row-acq-date")).toContainText("2019-10-21");
  await page.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
  await page.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
  await page.getByRole("button", { name: "완료" }).click();

  await expect(page.getByTestId("house-count-exclusion-badge-c")).toHaveText("주택 수 제외: 농어촌주택");

  const body = await judge(page);
  expect(body.reductions).toEqual([
    expect.objectContaining({ type: "new_99_4_rural", houseId: "c", ruralHouseAcquisitionDate: "2019-10-21" }),
  ]);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId("one-house-count-excluded")).toHaveText(
    /보유 주택 2 \(2019-10-21 취득\) — 농어촌주택등 — 소유주택으로 보지 않음/,
  );
});

test("[CXR-1+] 짝 — 지정하지 않으면 3주택 → 과세", async ({ page }) => {
  await seed(page);
  const body = await judge(page);
  expect(body.reductions).toEqual([]);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});
