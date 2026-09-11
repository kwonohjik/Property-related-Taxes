/**
 * E2E: 영농상속공제 **요건 입력이 화면에서 실제로 열린다** (2026-09-11 배선 복구).
 *
 * `FarmingEligibilitySection` 은 `step4-5.tsx` 가 「orphan 삭제」되면서(`a67b2871`) 화면에서
 * 사라졌었다. ①③④⑦ 이 전부 살아 있는 채로 **⑤만 없었고**, 결과뷰는 「Step4에서 영농상속공제
 * 요건 입력을 활성화하면」이라며 **존재하지 않는 UI 를 가리켰다**.
 *
 * RTL anchor(`farming-eligibility-mount.anchor.test.tsx`)는 Step4 를 **직접 렌더**하므로
 * 「마법사를 따라가면 그 단계에 실제로 닿는가」는 증명하지 못한다 — 여기서 잰다.
 *
 * 실행: npx playwright test e2e/farming-eligibility-mount.spec.ts
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  addHeir,
} from "./_helpers/tax-flow";

test.describe("영농상속공제 요건 입력 — Step4 배선", () => {
  test("FEM-E2E-1: Step4 에 요건 입력 토글이 있고, 켜면 요건 입력이 열린다", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await addHeir(page, "heir", "child", { residentNumber: "700101-1000001" });
    await nextSteps(page, 1);
    await addLandAsset(page, { area: "600", unitPrice: "10000000" });
    await nextSteps(page, 3); // → Step4

    // 🔑 그룹 A 는 progressive disclosure 로 접혀 있다 — 먼저 펼쳐야 영농 블록이 보인다.
    //    RTL anchor 는 Step4 를 직접 렌더해 이 단계를 «건너뛴다». 그래서 E2E 가 따로 필요하다.
    await page
      .getByRole("button", { name: /상속공제 — 배우자·금융재산·동거주택·영농·가업/ })
      .click();

    const toggle = page.getByRole("switch", { name: /영농상속공제 요건/ });
    await expect(
      toggle,
      "Step4 에 영농 요건 입력 토글이 없다 — 결과뷰 안내가 가리킬 곳이 사라졌다",
    ).toBeVisible({ timeout: 15_000 });

    // OFF 상태에서는 요건 입력이 접혀 있다 (3-state legacy)
    await toggle.click();

    // 켜면 영농 유형 선택이 열린다 — 이것이 form.farming 이 «객체»가 됐다는 화면 증거다.
    await expect(page.getByText(/개인 영농|영농조합법인|농업회사법인/).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
