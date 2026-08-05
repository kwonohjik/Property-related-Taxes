import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";

/**
 * E2E: 증자에 따른 이익의 증여 §39 — cap-table (다수증자·다증여자).
 * 교재 사례4(고가 재배정): 병 300,000,000(부225M+모75M)·정 100,000,000. 검증내역 증감 합계 0.
 * 계획서: docs/00-pm/gift-capital-increase-section39.plan.md
 */

async function openDetail(page: Page) {
  await page.getByTestId("deemed-type-capital_increase_allocation").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("7");
  await dialog.getByLabel("일", { exact: true }).fill("1");
}

async function fillRow(
  page: Page,
  idx: number,
  name: string,
  pre: string,
  entitled: string,
  subscribed: string,
  realloc: string,
) {
  const row = page.getByTestId(`ci-alloc-row-${idx}`);
  await page.getByTestId(`ci-alloc-name-${idx}`).fill(name);
  await row.getByPlaceholder("증자 전 보유 주식수").fill(pre);
  await row.getByPlaceholder("균등 배정 신주수").fill(entitled);
  await row.getByPlaceholder("실제 인수 신주수").fill(subscribed);
  await row.getByPlaceholder("재배정/제3자/초과 신주수").fill(realloc);
}

test.describe("§39 증자 이익 cap-table", () => {
  test("사례4 고가 재배정 → 병 300,000,000(부225M+모75M)·정 100,000,000·검증내역 0", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    // 증자 개요: 고가발행, ㉮ 10,000 / ㉰ 30,000
    await page.getByTestId("ci-alloc-direction-high").click();
    await page.getByPlaceholder("증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("신주 1주당 인수가액 (원)").fill("30000");

    // 4행 (INITIAL 2행 + 2 추가)
    await page.getByTestId("ci-alloc-add-row").click();
    await page.getByTestId("ci-alloc-add-row").click();

    await fillRow(page, 0, "갑", "50000", "50000", "80000", "30000"); // 父 인수자(증여자)
    await fillRow(page, 1, "을", "10000", "10000", "20000", "10000"); // 母 인수자(증여자)
    await fillRow(page, 2, "병", "30000", "30000", "0", "0"); // 子 포기자(수증자)
    await fillRow(page, 3, "정", "10000", "10000", "0", "0"); // 子 포기자(수증자)

    // 특수관계인: 병·정 ← 갑(sh-1)·을(sh-2)
    await page.getByTestId("ci-alloc-related-2-sh-1").click();
    await page.getByTestId("ci-alloc-related-2-sh-2").click();
    await page.getByTestId("ci-alloc-related-3-sh-1").click();
    await page.getByTestId("ci-alloc-related-3-sh-2").click();

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    const result = page.getByTestId("deemed-result");
    await expect(result).toContainText("300,000,000"); // 병 합계
    await expect(result).toContainText("225,000,000"); // 병 ← 갑(부)
    await expect(result).toContainText("75,000,000"); // 병 ← 을(모) / 정 ← 갑(부)
    await expect(result).toContainText("100,000,000"); // 정 합계
    await expect(result).toContainText("25,000,000"); // 정 ← 을(모)

    // 검증내역 증감 합계 0
    await expect(page.getByTestId("ci-alloc-reconciliation")).toContainText("증감 합계 = 0");

    // 증여세 마법사 이관
    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
  });

  test("§39① 공모 모집 배정 — 적용 제외로 증여재산가액 0 (상증령 §29③ 간주모집은 과세)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await page.getByTestId("deemed-type-capital_increase").click();
    const d = page.getByTestId("deemed-detail-dialog");
    await d.getByLabel("연도").fill("2025");
    await d.getByLabel("월").fill("7");
    await d.getByLabel("일", { exact: true }).fill("1");
    await d.getByPlaceholder("증자 전 1주당 평가가액 (원)").fill("20000");
    await d.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await d.getByPlaceholder("신주 1주당 인수가액 (원)").fill("10000");
    await d.getByPlaceholder("증자 주식수").fill("100000");
    await d.getByPlaceholder("배정받은 실권주수").fill("60000");
    // 「상증법」§39① 괄호의 주어가 「주권상장법인이」라 공모 제외는 **상장이 AND 조건**이다(anchor PO-9).
    // 첫 단계에서 켜 둔다. ⑧ validate가 상장이면 종가평균을 요구하므로(gift-deemed-validate.ts:130)
    // 함께 입력하되, 이론 ㉯ 15,000보다 **큰** 20,000을 넣어 「상증령」§29②1가 단서 Min(종가, 이론)이
    // 이론값을 고르게 한다 ⇒ ①③의 300,000,000이 유지되어 **공모 제외 효과만** 분리 관측된다.
    await d.getByRole("switch", { name: /주권상장법인등/ }).click();
    await d.getByPlaceholder("평가기준일 전후 각 2개월 종가평균 (원)").fill("20000");

    // ① 기본(일반 배정) — 300,000,000
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("300,000,000");

    // ② 공모 배정 — 「배정」에서 제외되어 과세 요건 자체가 성립하지 않는다
    await page.getByTestId("deemed-edit-btn").click();
    await d.getByTestId("ci-alloc-method-public_offering").click();
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    // ⚠️ `deemed-result-value`에 toContainText("0")을 쓰지 말 것 — **substring 매칭**이라
    //    "300,000,000"도 통과해 제외가 안 돼도 초록으로 남는다(실제로 그렇게 무력화된 적이 있다).
    //    제외 상태에서는 값 대신 제외 배너가 렌더되므로 배너를 직접 단언한다.
    await expect(page.getByTestId("deemed-exclusion")).toContainText("모집방법");

    // ③ 간주모집(자시령 §11③) — 제외가 취소되어 다시 과세
    await page.getByTestId("deemed-edit-btn").click();
    await d.getByTestId("ci-alloc-method-deemed_public_offering").click();
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("300,000,000");
    await expect(page.getByTestId("deemed-result")).toContainText("간주모집");
  });
});
