import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: §45의5 특정법인과의 거래 이익 증여의제 — 사례2 roster+auto 모드.
 *
 * 입력: 갑60%·부20%(증여자)·을3%·병17%, 거래이익 30억, 법인세 산출세액 780백만·소득 40억
 * 기대: 갑 증여재산가액 1,449,000,000 / 한도(㉯) 189,000,000
 *
 * anchor: docs/02-design/features/gift-specific-corp-45-5.engine.design.md SC-CASE2
 */

/** deemed-type 버튼 클릭 후 dialog가 열릴 때까지 대기 */
async function openDetail(page: Page) {
  await page.getByTestId("deemed-type-specific_corp").click();
  // dialog 내부 컨텐츠(deemed-detail-dialog)가 DOM에 나타날 때까지 기다림
  await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
}

const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("§45의5 특정법인과의 거래 (roster+auto — 사례2)", () => {
  test("사례2 갑 증여재산가액 1,449,000,000 · 한도 189,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    // 증여일 입력
    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    // 입력 방식: 주주 명단
    await dialog.getByTestId("sc-mode-roster").click();

    // 거래이익 30억
    await dialog.getByTestId("sc-transaction-benefit").fill("3000000000");

    // 법인세: 산출세액+소득금액 자동안분
    await dialog.getByTestId("sc-corp-tax-auto").click();
    await dialog.getByTestId("sc-corp-tax-assessed").fill("780000000");
    await dialog.getByTestId("sc-corp-tax-deduction").fill("0");
    await dialog.getByTestId("sc-corp-income").fill("4000000000");

    // 발행주식 총수
    await dialog.getByTestId("sc-total-shares").fill("100000");

    // 주주 명단 4행: 갑60%·부20%(증여자)·을3%·병17%
    // 행 0: 갑(직계비속, 60000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("갑");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("60000");

    // 행 1: 부(직계존속, 20000, isDonor=true)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-1").fill("부");
    await dialog.getByTestId("sc-sh-relation-1").selectOption("lineal_ascendant");
    await dialog.getByTestId("sc-sh-shares-1").fill("20000");
    await dialog.getByTestId("sc-sh-is-donor-1").check();

    // 행 2: 을(형제자매, 3000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-2").fill("을");
    await dialog.getByTestId("sc-sh-relation-2").selectOption("sibling");
    await dialog.getByTestId("sc-sh-shares-2").fill("3000");

    // 행 3: 병(타인, 17000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-3").fill("병");
    await dialog.getByTestId("sc-sh-relation-3").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-3").fill("17000");

    // 증여재산공제 5천만 (§45의5② 한도 계산용)
    await dialog.getByTestId("sc-gift-deduction").fill("50000000");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    // 주주별 표 확인 — 갑 증여재산가액
    const matrix = page.getByTestId("sc-multi-matrix");
    await expect(matrix).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("sc-multi-gain-0")).toContainText("1,449,000,000");

    // §45의5② 한도 표 확인
    const limitCard = page.getByTestId("sc-multi-limit");
    await expect(limitCard).toBeVisible();
    await expect(page.getByTestId("sc-limit-amount")).toContainText("189,000,000");
  });

  test("사례1 roster+direct → 장남 과세·직원 비특수관계 제외", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    // 주주 명단 모드, 거래이익 10억
    await dialog.getByTestId("sc-mode-roster").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("1000000000");

    // 법인세: 직접 입력(이월결손금으로 0)
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");

    // 발행주식 총수
    await dialog.getByTestId("sc-total-shares").fill("100000");

    // 행 0: 부(직계존속, 40000, isDonor=true)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("부");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_ascendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("40000");
    await dialog.getByTestId("sc-sh-is-donor-0").check();

    // 행 1: 직원(타인, 10000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-1").fill("직원");
    await dialog.getByTestId("sc-sh-relation-1").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-1").fill("10000");

    // 행 2: 장남(직계비속, 25000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-2").fill("장남");
    await dialog.getByTestId("sc-sh-relation-2").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-2").fill("25000");

    // 행 3: 차남(직계비속, 25000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-3").fill("차남");
    await dialog.getByTestId("sc-sh-relation-3").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-3").fill("25000");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    const matrix = page.getByTestId("sc-multi-matrix");
    await expect(matrix).toBeVisible({ timeout: 15000 });
    // 장남 25% → 250,000,000 과세
    await expect(matrix).toContainText("250,000,000");
    // "비특수관계인 제외" 배지 노출
    await expect(matrix).toContainText("비특수관계인 제외");
    // "본인증여 제외" 배지 노출
    await expect(matrix).toContainText("본인증여 제외");
  });
});
