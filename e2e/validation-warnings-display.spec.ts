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

/**
 * 사이드바 표식 — **색이 심각도를 말한다** (F-5).
 *
 * ## 유닛이 못 보는 것
 *
 * `__tests__/components/calc/wizard-sidebar-severity.predo.anchor.test.tsx`는
 * `OneHouseJudgmentSidebar`를 **직접** 렌더한다 — 「그 props면 그 표식이 난다」까지다.
 * 여기서만 관측되는 것은 **마법사가 실제로 그 사이드바를 그렇게 먹인다**는 것과,
 * 배너가 못 보여 주는 **다른 단계의** 경고가 눈에 띈다는 것이다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`).
 */
test.describe("사이드바 심각도 표식", () => {
  /** 사이드바 행 — StepIndicator의 같은 이름 버튼과 섞이지 않도록 nav로 범위를 좁힌다. */
  const sidebarRow = (page: import("@playwright/test").Page, label: string) =>
    page
      .getByRole("navigation", { name: "진행 단계" })
      .getByRole("listitem")
      .filter({ hasText: new RegExp(`^[!✓]?${label}$`) });

  test("[SB-E1] 오류는 «입력 필요», 경고는 «확인 필요»로 갈린다", async ({ page }) => {
    await page.goto("/calc/one-house-exemption?new=1");
    await expect(page.getByTestId("one-house-household")).toBeVisible();

    // ② 양도 대상 주택은 빈 폼에서 필수 3건이 비어 있다 → 차단 오류 표식.
    await expect(sidebarRow(page, "양도 대상 주택").getByLabel("입력 필요")).toBeVisible();

    // ① 세대는 아직 아무 문제가 없다 — 「항상 떠 있는 표식」이 아님을 먼저 못 박는다.
    await expect(sidebarRow(page, "세대").getByLabel("확인 필요")).toHaveCount(0);

    // 1세대 비해당 선언 → ①에 **비차단 경고**가 생긴다.
    await page.getByTestId("one-house-household").getByRole("switch").click();
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();

    /*
      🔑 여기가 F-5의 본체다. 사용자는 지금 ②에 있고 배너는 ②의 경고만 띄운다 —
         ①의 경고를 알려 주는 것은 이 표식뿐이다. 종전에는 이 행이 «✓세대»(완료)였다.
    */
    const row = sidebarRow(page, "세대");
    await expect(row.getByLabel("확인 필요")).toBeVisible();
    // 차단 오류로 **승격되지 않았다** — 경고는 진행을 막지 않는다.
    await expect(row.getByLabel("입력 필요")).toHaveCount(0);
  });
});
