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

  /**
   * 🔴 **한글 인터셉트가 살아날 때까지 기다린다** (2026-08-23 — CI 간헐 실패 해소)
   *
   * 이 spec의 검증 대상은 `useHangulTyping`의 **keydown 인터셉터**다. 그런데 React가
   * 핸들러를 붙이기 전에 키가 도착하면 그 키는 그냥 사라진다 — 입력이 controlled
   * (`AddressSearch`의 `value={query}`)라 브라우저가 넣은 영문자도 즉시 되돌려진다.
   * 결과는 **앞 몇 글자만 유실**되는 형태다(실측: `rkr` → `각`이어야 하는데 `ㅏㄱ`,
   * `xpgpfksfh 152` → `테헤란로 152`여야 하는데 `ㅏㄴ로 152`).
   *
   * ⚠️ `waitForLoadState("networkidle")`로는 해소되지 않는다(실측 3회 전부 실패) —
   *    dev 서버의 HMR 소켓 때문에 idle 신호가 하이드레이션을 보증하지 못한다.
   *    **인터셉트가 실제로 동작하는지**를 직접 확인하는 것이 유일하게 통하는 신호였다.
   *
   * 실측(각 3회): 워밍업 없음 → 매 회 3건 실패 / 워밍업 → 3회 전부 5건 통과.
   *
   * ⚠️ 이 워밍업은 **단언을 약화시키지 않는다** — 조합 결과 검증은 아래 각 테스트가 그대로 한다.
   *    여기서 보는 것은 「인터셉터가 붙었는가」뿐이고, 붙지 않으면 15초 뒤 실패한다.
   */
  const probe = page.getByPlaceholder(ADDR_PLACEHOLDER);
  await probe.click();
  await expect(async () => {
    await probe.fill("");
    await page.keyboard.type("r");
    await expect(probe).toHaveValue("ㄱ");
  }).toPass({ timeout: 15_000 });
  await probe.fill("");
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

    /**
     * 🔴 **첫 글자를 따로 단언한다** (2026-08-23 — CI 간헐 실패 해소)
     *
     * 이 테스트의 핵심은 「전체선택 상태에서 첫 글자가 기존 값을 **대체**하는가」다.
     * 그 첫 emit 직후 React가 controlled value를 다시 세팅하는데, **선택 영역이 아직
     * (0,1)로 남아 있는 순간**에 다음 키가 도착하면 훅이 「선택 영역 있음 → 조합 리셋」으로
     * 처리해 방금 만든 초성이 버려진다(실측: `가라`여야 하는데 **`ㅏ라`** — 첫 ㄱ만 유실).
     * 빠른 기기에서는 선택이 먼저 접혀 통과하므로 CI(2 worker)에서만 드러났다.
     *
     * ⇒ 첫 글자 결과를 먼저 확인해 선택 영역이 정리될 때까지 기다린다.
     *    **단언은 오히려 강해진다** — 「대체가 첫 키에서 일어났다」를 명시적으로 본다.
     */
    await page.keyboard.type("r");
    await expect(input, "전체선택 상태의 첫 자모가 기존 값을 대체해야 한다").toHaveValue("ㄱ");

    await page.keyboard.type("kfk");
    await expect(input).toHaveValue("가라");
  });
});
