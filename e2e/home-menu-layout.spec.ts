import { test, expect } from "@playwright/test";

/**
 * 홈 메뉴 화면 재디자인 검증.
 * - 9개 메뉴(8개 세금 + 법령 리서치)가 모두 노출되는지
 * - 데스크톱 viewport(1280×720)에서 메뉴 그리드가 스크롤 없이 한 화면에 들어가는지
 */
test.describe("홈 메뉴 레이아웃", () => {
  test("9개 메뉴가 모두 렌더되고 그리드가 viewport 안에 들어온다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");

    const titles = [
      "양도소득세",
      "양도소득세 (다건)",
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
