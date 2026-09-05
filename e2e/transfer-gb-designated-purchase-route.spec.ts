/**
 * §77의3 개발제한구역 매수 토지 — **매수 경로 축**(§17 / §20) 실브라우저 검증
 *
 * 조특법 §77의3①은 「해당 토지등을 같은 법 **제17조**에 따른 토지매수의 청구 또는 같은 법
 * **제20조**에 따른 협의매수를 통하여」로 한 항에 두 경로를 담는데 대상 범위가 다르다
 * (개발제한구역법 §17① 「매수대상**토지**」 / §20① 「토지와 그 토지의 정착물」).
 *
 * 검증:
 *  - §77의3 토글 ON → **매수 경로 라디오가 뜬다**(신설 축)
 *  - 경로 미선택으로 다음 단계 진행 시 ⑧이 차단한다 — 화면에 사유가 나온다
 *  - 경로를 고르면 통과한다
 *
 * ⚠️ 이 배치의 원래 전제였던 「§77의3은 세부 입력 위젯이 없다」는 **오판이었다** — 지정일·
 *    매수청구일 등 6필드는 처음부터 있었다. 이 spec은 그 사실도 함께 고정한다.
 *
 * 실행(비-worktree 기본 3000): npx playwright test e2e/transfer-gb-designated-purchase-route.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("§77의3 매수 경로 축", () => {
  test("토글 ON → 경로 라디오 노출 · 미선택이면 ⑧이 차단한다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("03");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("500");
    await page
      .locator('label:has-text("양도가액 (원)")')
      .locator("xpath=..")
      .locator("input")
      .first()
      .fill("2000000000");

    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await page.getByLabel("연도", { exact: true }).nth(2).fill("2000");
    await page.getByLabel("월", { exact: true }).nth(2).fill("01");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");

    await page.getByRole("button", { name: "감면·공제" }).first().click();

    // 종전부터 있던 서브패널 6필드 중 하나 — 「위젯 부재」가 오판이었음을 고정한다.
    await page.getByRole("switch", { name: /개발제한구역 매수 토지 감면/ }).setChecked(true);
    await expect(page.getByText("개발제한구역 지정일")).toBeVisible();

    // 🔴 신설 축 — 경로 라디오
    await expect(page.getByText("매수 경로")).toBeVisible();
    await expect(page.getByText("토지매수 청구 (§17)")).toBeVisible();
    await expect(page.getByText("협의매수 (§20)")).toBeVisible();

    // 미선택 상태로 진행 → ⑧ 차단 사유가 화면에 나온다
    await page.getByRole("button", { name: /다음/ }).first().click();
    await expect(page.getByText(/매수 경로/).first()).toBeVisible();

    // 경로를 고르고 다시 진행하면 **차단 사유가 다음 필드로 넘어간다**
    // (경로 요건이 충족됐다는 뜻 — 사유가 그 자리에 머물면 라디오가 값을 안 쓴 것이다)
    await page.getByText("협의매수 (§20)").click();
    await page.getByRole("button", { name: /다음/ }).first().click();
    await expect(page.getByText(/개발제한구역 지정일을 선택하세요/)).toBeVisible();
    await expect(page.getByText(/매수 경로\(매수청구/)).toHaveCount(0);
  });
});
