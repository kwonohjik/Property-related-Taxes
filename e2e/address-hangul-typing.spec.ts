import { test, expect } from "@playwright/test";

/**
 * 소재지(AddressSearch) 한글 자동 입력 검증
 *
 * 브라우저는 OS IME를 한글 모드로 강제할 수 없으므로(CSS `ime-mode` deprecated·macOS 전면 미지원),
 * 영문 자판 키를 자모로 조합해 한글을 만든다. Playwright의 keyboard.type은 IME를 거치지 않는
 * 순수 영문 입력이라 이 경로를 그대로 재현한다.
 */

const ADDR_PLACEHOLDER = "도로명 또는 지번 주소 입력 (예: 테헤란로 123)";

test.beforeEach(async ({ page }) => {
  // 외부 주소 API 실호출 차단 (debounce 후 검색이 돈다)
  await page.route("**/api/address/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    }),
  );
  await page.goto("/calc/property-tax");
});

test.describe("소재지 한글 자동 입력", () => {
  test("영문 자판 입력이 한글로 조합된다", async ({ page }) => {
    const input = page.getByPlaceholder(ADDR_PLACEHOLDER);
    await input.click();
    await page.keyboard.type("xpgpfksfh");
    await expect(input).toHaveValue("테헤란로");
  });

  test("숫자·공백은 그대로 통과하고 조합을 확정한다", async ({ page }) => {
    const input = page.getByPlaceholder(ADDR_PLACEHOLDER);
    await input.click();
    await page.keyboard.type("xpgpfksfh 152");
    await expect(input).toHaveValue("테헤란로 152");
  });

  test("겹받침·받침 넘김이 실제 타이핑에서 동작한다", async ({ page }) => {
    const input = page.getByPlaceholder(ADDR_PLACEHOLDER);
    await input.click();
    await page.keyboard.type("tjchrn qksvheofh"); // 서초구 반포대로
    await expect(input).toHaveValue("서초구 반포대로");
  });

  test("백스페이스가 자모 단위로 지운다", async ({ page }) => {
    const input = page.getByPlaceholder(ADDR_PLACEHOLDER);
    await input.click();
    await page.keyboard.type("rkr"); // 각
    await expect(input).toHaveValue("각");
    await page.keyboard.press("Backspace");
    await expect(input).toHaveValue("가");
    await page.keyboard.press("Backspace");
    await expect(input).toHaveValue("ㄱ");
    await page.keyboard.press("Backspace");
    await expect(input).toHaveValue("");
  });

  test("포커스 시 전체선택 후 다시 입력하면 새 값으로 대체된다", async ({ page }) => {
    const input = page.getByPlaceholder(ADDR_PLACEHOLDER);
    await input.click();
    await page.keyboard.type("xpgpfksfh");
    await expect(input).toHaveValue("테헤란로");

    // 전역 SelectOnFocusProvider가 포커스 시 전체 선택한다
    await input.blur();
    await input.click();
    await page.keyboard.type("rkfk");
    await expect(input).toHaveValue("가라");
  });
});
