import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";

/** E2E: 증여로 보는 경우 — 자본거래 (Phase 2 핵심 + sub-case 토글). 상세 입력은 모달 안. */

async function openDetail(page: Page, type: string) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("증여로 보는 경우 — 자본거래", () => {
  test("§40 전환사채 저가인수 시가10억·인수6억 → 4억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    await page.getByPlaceholder("전환사채등 시가 (원)").fill("1000000000");
    await page.getByPlaceholder("인수·취득가액 (원)").fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
  });

  test("§40①1호 나목 + 상장 + 공모 발행 → 적용 제외(0)", async ({ page }) => {
    // 「상증법」§40①1호나목 괄호 — 주권상장법인으로서 자시법 §9⑦ 모집방법으로 발행한 법인은 제외.
    // 목·상장·발행방법 3요건이 **모두 UI에서 엔진까지 도달**해야 0이 된다(⑤ 배선 전수 확인).
    // AND 조건 자체(비상장이면 과세)는 anchor CB-PO-4가 고정한다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    const dialog = page.getByTestId("deemed-detail-dialog");
    await page.getByTestId("cb-clause-major_excess").click();
    await dialog.getByRole("switch", { name: /주권상장법인/ }).click();
    await page.getByTestId("cb-issuance-public_offering").click();
    await page.getByPlaceholder("전환사채등 시가 (원)").fill("1000000000");
    await page.getByPlaceholder("인수·취득가액 (원)").fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§40① 적용 제외");
  });

  test("§40①1호 **가목**은 같은 입력에서 그대로 과세 (4개 목뿐)", async ({ page }) => {
    // 「이하 이 항에서 같다」는 「전환사채등을 발행한 법인」이라는 용어에 붙어 나·다목에만 걸린다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    const dialog = page.getByTestId("deemed-detail-dialog");
    await dialog.getByRole("switch", { name: /주권상장법인/ }).click();
    await page.getByPlaceholder("전환사채등 시가 (원)").fill("1000000000");
    await page.getByPlaceholder("인수·취득가액 (원)").fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
  });

  test("§39 증자 저가발행·실권주 재배정 → 33,330,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByPlaceholder("증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("신주 1주당 인수가액 (원)").fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("10000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("33,330,000");
  });

  test("§39 증자 고가발행 나목(실권주 미배정·비율가중) → 60,003,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByTestId("ci-direction-high").click();
    await page.getByTestId("ci-subtype-no_realloc").click();
    await page.getByPlaceholder("증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("신주 1주당 인수가액 (원)").fill("20000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("실권주수").fill("30000");
    await page.getByPlaceholder("특수관계인이 인수한 신주수").fill("15000");
    await page.getByPlaceholder("분모 신주수").fill("50000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("60,003,000");
  });

  test("§40 전환사채 양도 양도6억·시가5억 → 1억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    await page.getByTestId("cb-case-transfer").click();
    await page.getByPlaceholder("전환사채등 시가 (원)").fill("500000000");
    await page.getByPlaceholder("양도가액 (원)").fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("100,000,000");
  });

  test("§39①3호 전환주식 전환 33,330,000 − 발행 20,000,000 → 13,330,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_stock");
    // 전환 시점 (증자후 8333 − 전환 5000 = 3333 × 1만 = 33,330,000)
    await page.getByPlaceholder("전환 증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("전환 증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("전환 1주당 전환가액등 (원)").fill("5000");
    await page.getByPlaceholder("전환 증자 주식수").fill("50000");
    await page.getByPlaceholder("전환 배정받은 실권주수").fill("10000");
    // 발행 시점 (증자후 9000 − 인수 7000 = 2000 × 1만 = 20,000,000)
    await page.getByPlaceholder("발행 증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("발행 증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("발행 신주 1주당 인수가액 (원)").fill("7000");
    await page.getByPlaceholder("발행 증자 주식수").fill("50000");
    await page.getByPlaceholder("발행 배정받은 실권주수").fill("10000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("13,330,000");
  });
});
