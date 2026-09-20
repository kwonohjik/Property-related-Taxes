/**
 * 판정 메뉴 §89①4호 1세대1입주권 (P4-3b)
 *
 * 계획서 Q-7 — 두 번째 조문. §155⑳(P4-3a)과 **방향이 반대**다: 여기는 비과세를 **켠다**.
 *
 * ## 이 spec이 지키는 것
 *
 * 엔진·어댑터 주장은 anchor가 고정한다. 여기서만 관측되는 것은 **양도 대상 축이 화면을
 * 실제로 가르는가**다 — 자산 종류를 바꾸면 ③의 구성이 바뀌고(거주기간 ↔ §89①4호 카드),
 * 그 연쇄는 DOM에서만 보인다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

/** ①②를 지나 ③까지 간다. `isOneHousehold`는 기본값 true라 누르지 않는다. */
async function gotoStep3(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 보유 주택·권리")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("③ 양도 예정")).toBeVisible();
}

/** ③의 필수 3값 — 어느 자산 종류에서도 같다. */
async function fillSaleBasics(page: Page, price = "900000000") {
  await fillDateAndVerify(page, { year: "2019", month: "03", day: "10" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill(price);
}

async function pickRight(page: Page) {
  await page.getByRole("radio", { name: /조합원입주권/ }).click();
}

test.describe("판정 메뉴 §89①4호 1세대1입주권", () => {
  /**
   * 🔴 **양도 대상 축이 화면을 가른다.** 입주권에는 §89①4호 카드가 열리고, 거주기간 섹션은
   *    닫힌다 — 그 축은 「인가일 기준 종전주택 거주 월수」가 따로 받는다. 둘 다 띄우면
   *    사용자가 같은 질문을 두 번 받고 판정에는 하나만 쓰인다.
   */
  test("[ORR-1] 조합원입주권을 고르면 §89①4호 카드가 열리고 거주기간 섹션이 닫힌다", async ({ page }) => {
    await gotoStep3(page);

    // 주택(기본값)에서는 거주기간 섹션이 있고 §89①4호 카드는 없다.
    await expect(page.getByText("1세대1입주권 비과세 요건")).toHaveCount(0);

    await pickRight(page);

    await expect(page.getByText("1세대1입주권 비과세 요건")).toBeVisible();
    await expect(page.getByTestId("residence-period-total")).toHaveCount(0);
  });

  /**
   * 🔑 Q-7 분할선 — 판정 메뉴에는 **세액 맥락**이 뜨지 않는다.
   *    장기보유특별공제 과세구조 안내는 계산기(`mode="full"`)의 것이다.
   */
  test("[ORR-2] 장기보유특별공제 과세구조 안내는 뜨지 않는다", async ({ page }) => {
    await gotoStep3(page);
    await pickRight(page);

    await expect(page.getByText("관리처분 인가 후 조합원입주권 양도 — 과세 구조 안내")).toHaveCount(0);
    // 계산기 화면을 가리키는 지시도 판정 메뉴 문구로 바뀌어야 한다.
    await expect(page.getByText("Step 2 보유 상황 입력 필요")).toHaveCount(0);
  });

  /**
   * 🔴 **주택 수 파생의 두 번째 갈래를 화면에서 확인한다.**
   * 명부가 비면 가목이 성립해야 한다 — `selling` 행을 주택으로 세면 1채가 되어 절대 성립하지 않는다.
   */
  test("[ORR-3] 가목 — 다른 주택·분양권이 없으면 비과세로 판정된다", async ({ page }) => {
    await gotoStep3(page);
    await pickRight(page);
    await page.getByRole("switch", { name: /인가일 현재/ }).click();
    await fillSaleBasics(page);

    const response = page.waitForResponse(
      (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
    );
    await page.getByTestId("one-house-judge-cta").click();
    const res = await response;
    expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);

    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
    await expect(page.getByTestId("one-house-one-right-verdict")).toContainText("가목 성립");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByTestId("one-house-counted")).toHaveText("0채");
  });

  test("[ORR-4] 인가일 요건을 선언하지 않으면 과세이고 사유가 나온다", async ({ page }) => {
    await gotoStep3(page);
    await pickRight(page);
    await fillSaleBasics(page);

    await page.getByTestId("one-house-judge-cta").click();
    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
    await expect(page.getByTestId("one-house-one-right-verdict")).toContainText("요건 미충족");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  });

  /** 12억 초과 — 각 목 외의 부분 단서로 **부분 비과세**다(전액이 아니다). */
  test("[ORR-5] 12억 초과면 부분 비과세로 판정된다", async ({ page }) => {
    await gotoStep3(page);
    await pickRight(page);
    await page.getByRole("switch", { name: /인가일 현재/ }).click();
    await fillSaleBasics(page, "1500000000");

    await page.getByTestId("one-house-judge-cta").click();
    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
    await expect(page.getByTestId("one-house-verdict")).toHaveText("부분 비과세");
  });
});
