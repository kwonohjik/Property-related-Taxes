/**
 * 검증 경고(`severity: "warning"`)가 **실제 입력 흐름에서** 화면에 뜨는가.
 *
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §6-2.
 *
 * ## 유닛이 못 보는 것
 *
 * 유닛 anchor(`__tests__/calc/validation-warnings-display*.predo.anchor.test.tsx`)는 store를
 * 직접 세우고 오케스트레이터를 렌더한다 — 「그 상태면 뜬다」까지다. 여기서만 관측되는 것은
 * **사용자가 칸을 채워 나가는 도중에 뜨고, 진행을 막지 않는다**는 것이다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * 🔑 경고가 **차단이 아니라는 것**이 이 spec의 핵심 축이다. 오류로 잘못 승격시키면
 *    사용자가 자기 상황을 사실대로 적고도 진행하지 못한다.
 */
import { test, expect } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

test.describe("검증 경고 표시", () => {
  /**
   * ① 세대 — 합가일 두 칸을 모두 채우면 경고가 뜬다(§155④·⑤는 별개 특례).
   * 종전에는 이 경고가 **계산되지만 화면에 도달하지 않았다**.
   */
  test("[VW-1] 합가일 2개를 채우면 ①에 경고가 뜨고, 그래도 진행된다", async ({ page }) => {
    await page.goto("/calc/one-house-exemption?new=1");
    await expect(page.getByTestId("one-house-household")).toBeVisible();

    // 아직은 경고가 없다 — 「항상 떠 있는 카드」가 아님을 먼저 못 박는다.
    await expect(page.getByTestId("one-house-validation-warnings")).toHaveCount(0);

    await fillDateAndVerify(page, { year: "2024", month: "03", day: "01" }, {
      scope: page.getByTestId("merge-date-marriage"),
    });
    await fillDateAndVerify(page, { year: "2023", month: "05", day: "01" }, {
      scope: page.getByTestId("merge-date-parental-care"),
    });

    const card = page.getByTestId("one-house-validation-warnings");
    await expect(card).toBeVisible();
    await expect(card).toContainText("각각 별개 특례이므로 해당하는 쪽만 남기세요");

    // 🔑 경고는 **막지 않는다** — 「다음」이 그대로 먹힌다.
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  });

  /**
   * ④ 결과 — ①에서 낸 경고가 결과 화면에도 모인다(사이드바로 단계를 건너뛴 경로 대비).
   */
  test("[VW-2] ①의 경고가 판정 결과 화면에도 모인다", async ({ page }) => {
    await page.goto("/calc/one-house-exemption?new=1");
    await expect(page.getByTestId("one-house-household")).toBeVisible();

    // 1세대 비해당 선언 — 기본값이 true라 누르면 꺼진다.
    await page.getByTestId("one-house-household").getByRole("switch").click();
    await expect(page.getByTestId("one-house-validation-warnings")).toContainText(
      "1세대1주택 비과세 판정 대상이 아닙니다",
    );

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
    await fillDateAndVerify(page, { year: "2015", month: "03", day: "10" }, {
      scope: page.getByTestId("one-house-acq-date"),
    });
    await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
      scope: page.getByTestId("one-house-sale-date"),
    });
    await page.getByTestId("one-house-sale-price").fill("900000000");

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
    await page.getByTestId("one-house-judge-cta").click();

    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
    const card = page.getByTestId("one-house-validation-warnings");
    await expect(card).toContainText("판정 시 전제된 주의사항");
    await expect(card).toContainText("1세대1주택 비과세 판정 대상이 아닙니다");
  });
});
