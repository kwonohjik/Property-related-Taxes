/**
 * §155⑥1호 국가유산주택 — 사실의 정본이 **명부 행**이다 (D-6 · P7-3).
 *
 * ## 왜 E2E인가 — anchor는 컴포넌트를 직접 마운트한다
 *
 * 도출 규칙과 ④ 배선은 `__tests__/calc/one-house-row-facts.anchor.test.ts`가 고정한다.
 * 여기서만 보이는 것은 **행 편집 모달이 실제로 이 카드를 품고 있는가**다 —
 * `HouseEntryEditor`에 섹션을 붙이는 한 줄이 빠져도 타입은 통과하고 anchor도 초록이다
 * (U1-03이 같은 층위에서 조용히 끊겼던 자리).
 *
 * ## 🔑 Q-8이 선행 조건이었다
 *
 * §155⑥은 주택 수 **2**에서만 성립한다(`transfer-tax-exemption.ts:374`). 명부에 행을 넣으면
 * 주택 수가 명부에서 도출되므로(P7-2) 스칼라를 건드리지 않아도 2가 된다 — 그 연결이
 * 살아 있어야 이 특례가 행 하나로 성립한다.
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoHoldingStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "2채", exact: true }).click();
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

test.describe("§155⑥1호 — 명부 행 선언", () => {
  /**
   * 🔴 **배선 축.** `HouseEntryEditor`가 `HouseEntryOneHouseFactsSection`을 렌더하지 않으면
   *    여기가 빨개진다 — 그 외 어떤 게이트도 이것을 잡지 못한다.
   */
  test("[RF-E2E-1] 행 편집 모달에 §155⑥1호 카드가 있다", async ({ page }) => {
    await gotoHoldingStep(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();

    const card = page.getByTestId("house-row-cultural-heritage");
    await expect(card).toBeVisible();
    await expect(card).toContainText("§155⑥1호");

    // 🔑 중과 축(④)과 **다른 카드**다 — 한 카드에 섞이면 요건이 뭉개진다.
    await expect(page.getByText("특수 배제 사유 (2주택·인구감소)")).toBeVisible();
    await expect(page.getByText("1세대1주택 비과세 특례 사실 (§155)")).toBeVisible();
  });

  /** 🔑 토글이 실제로 상태를 바꾼다 — 라벨만 있고 배선이 없으면 안 된다. */
  test("[RF-E2E-2] 토글을 켜면 체크 상태가 유지된다", async ({ page }) => {
    await gotoHoldingStep(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();

    const sw = page.getByRole("switch", {
      name: /지정문화유산·국가등록문화유산·천연기념물등 주택/,
    });
    await expect(sw).toHaveAttribute("data-unchecked", "");
    await sw.click();
    await expect(sw).toHaveAttribute("data-checked", "");
  });

  /**
   * 🔴 **이중 입력 금지의 반대편.** 같은 선언이 판정 메뉴 세대 단위 토글로도 남아 있으면
   *    어느 쪽이 정본인지 알 수 없다 — 같은 PR에서 뺐음을 여기서 고정한다.
   */
  test("[RF-E2E-3] 판정 메뉴에 세대 단위 문화유산 토글이 없다", async ({ page }) => {
    await page.goto("/calc/one-house-exemption");
    await page.getByRole("heading", { name: /1세대 1주택|비과세 판정/ }).first().waitFor();
    await expect(
      page.getByText(/지정문화유산·국가등록문화유산·천연기념물등 주택 보유/),
    ).toHaveCount(0);
  });
});
