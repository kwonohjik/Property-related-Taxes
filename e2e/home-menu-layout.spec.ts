import { test, expect } from "@playwright/test";

/**
 * 홈 메뉴 화면 재디자인 검증.
 * - 주요 메뉴가 모두 노출되는지 (세금 계산 + 판정 + 법령 리서치)
 * - 데스크톱 viewport(1280×720)에서 메뉴 그리드가 스크롤 없이 한 화면에 들어가는지
 *
 * 🔑 **두 번째 단언이 이 spec의 존재 이유다.** 메뉴를 하나 더하면 그리드가 한 행 늘어
 *    한 화면을 넘길 수 있다 — 실제로 「1세대1주택 비과세 판정」을 더했을 때 847px가 되어
 *    여기서 잡혔고, 제약을 낮추는 대신 **lg 4열 + 간격 축소**로 맞췄다(P4-2b-2).
 *    메뉴를 또 더한다면 이 단언을 완화하지 말고 **레이아웃을 먼저 손볼 것**.
 */
test.describe("홈 메뉴 레이아웃", () => {
  test("주요 메뉴가 모두 렌더되고 그리드가 viewport 안에 들어온다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");

    const titles = [
      "양도소득세",
      "양도소득세 (다건)",
      // P4-2b-2 신설 — 세액이 아니라 비과세 여부를 답하는 판정 전용 메뉴
      "1세대1주택 비과세 판정",
      "주식 양도소득세",
      "상속세",
      "증여세",
      "취득세",
      "재산세",
      "종합부동산세",
      "법령 리서치",
    ];
    for (const t of titles) {
      await expect(
        page.getByRole("heading", { name: t, exact: true }),
      ).toBeVisible();
    }

    // 마지막 메뉴 카드(법령 리서치)의 하단이 viewport 높이 안에 있어야 한다 (그리드 한 화면 fit)
    const lawCard = page.getByRole("link", { name: /법령 리서치/ });
    const box = await lawCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);

    await page.screenshot({
      path: "e2e/_artifacts/home-menu-redesign.png",
      fullPage: false,
    });
  });
});
