/**
 * 일시적 2주택 §155① 종전취득일 자동반영 + 요건 자동판정 카드 E2E.
 *
 * - 종전 주택 취득일 = 양도 자산(assets[0]) 취득일 자동반영(읽기전용 hint 노출).
 * - 신규 주택 취득일 입력 시 판정 카드(data-testid="temp-two-house-verdict")가 요건 A(1년)·B(3년) 자동판정.
 *   · 충족 / 미충족(1년 미경과) / 입력부족(pending) 3분기.
 *
 * 계획서: docs/02-design/features/transfer-temporary-two-house-155-auto-judge.plan.md §5-A·5-B(⑤).
 *
 * ## 🔄 화면이 **판정 메뉴로 옮겨졌다** (P6-b)
 *
 * 계산기 ③은 이제 `mode="calc"`로 §155⑧·합가만 그린다. §155①의 중과 배제는 영 §167의10①
 * **15호**(「§154①의 요건을 모두 충족」 2요소)라 비과세 판정을 반드시 경유하므로, 입력이
 * 판정 메뉴로 갔다. **같은 컴포넌트**라 단언은 한 줄도 바뀌지 않았다 — 마운트 화면만 옮긴다.
 * 지우면 「카드가 사라진 것」과 「자리를 옮긴 것」이 구별되지 않는다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";

function gotoHolding(page: Page, acquisitionDate: string, over: Record<string, unknown>) {
  return gotoJudgmentStep2(page, {
    assets: [
      {
        ...makeDefaultAsset(1),
        addressJibun: "서울 강남구 테스트동 1-1",
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate,
      },
    ],
    temporaryTwoHouseSpecial: true,
    ...over,
  });
}

test.describe("일시적 2주택 §155① 종전취득일 자동반영 + 요건 자동판정", () => {
  test("종전취득일 자동반영 hint 노출(읽기전용 단일소스)", async ({ page }) => {
    await gotoHolding(page, "2018-01-01", {
      transferDate: "2021-06-01",
      newHouseAcquisitionDate: "2020-01-01",
    });
    // 종전 주택 취득일 라벨 + 자동반영 안내(읽기전용 — 별도 입력 없음)
    await expect(page.getByText("종전 주택 취득일", { exact: true })).toBeVisible();
    await expect(page.getByText(/취득일에서 자동 반영/)).toBeVisible();
  });

  test("요건 충족: 1년 경과 + 3년내 → 충족 카드", async ({ page }) => {
    await gotoHolding(page, "2018-01-01", {
      transferDate: "2021-06-01",
      newHouseAcquisitionDate: "2020-01-01", // 종전+24개월, 3년내
    });
    const verdict = page.getByTestId("temp-two-house-verdict");
    await expect(verdict).toBeVisible();
    await expect(page.getByText("일시적 2주택 특례 요건 충족", { exact: true })).toBeVisible();
  });

  test("요건 미충족: 1년 미경과 → 미충족 카드(요건 A)", async ({ page }) => {
    await gotoHolding(page, "2020-01-01", {
      transferDate: "2022-06-01", // 보유 2.4년(보유요건은 통과)
      newHouseAcquisitionDate: "2020-06-01", // 종전+5개월 → 1년 미경과
    });
    await expect(page.getByText("일시적 2주택 특례 요건 미충족", { exact: true })).toBeVisible();
    await expect(page.getByTestId("temp-two-house-verdict")).toContainText("미충족 · 요건 A");
  });

  test("입력 부족(신규취득일 미입력) → 판정 대기 카드", async ({ page }) => {
    await gotoHolding(page, "2018-01-01", {
      transferDate: "2021-06-01",
      newHouseAcquisitionDate: "",
    });
    await expect(page.getByText("요건 자동 판정 대기", { exact: true })).toBeVisible();
  });

  /**
   * 🔑 **계산기 쪽 짝** — 위 네 건이 판정 메뉴에서만 통과하면 「계산기에서도 여전히 된다」와
   *    구별되지 않는다. 계산기에는 이제 이 칸이 없고, 대신 안내 카드가 길을 알려준다.
   */
  test("P6-b: 계산기 ③에는 이 칸이 없고 안내 카드가 대신 뜬다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      {
        state: {
          formData: {
            assets: [
              {
                ...makeDefaultAsset(1),
                addressJibun: "서울 강남구 테스트동 1-1",
                assetKind: "housing",
                acquisitionCause: "purchase",
                acquisitionDate: "2018-01-01",
              },
            ],
            transferDate: "2021-06-01",
            isOneHousehold: true,
            householdHousingCount: "2",
          },
          pendingMigration: false,
        },
        version: 0,
      },
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId("judgment-handoff-notice")).toBeVisible();
    await expect(page.getByText("일시적 2주택 특례 해당", { exact: true })).toHaveCount(0);
    // 합가는 **그대로 있다** — 사라지면 중과 입력 경로가 끊긴다(영 §167의3⑨).
    await expect(page.getByText("혼인합가일", { exact: true })).toBeVisible();
    /**
     * 🔄 **§155⑧은 명부 행으로 갔다**(D-6 4 · 2026-09-22) — 계산기 ③에도 없다.
     *    입력 경로 자체는 여전히 필요하고(비과세를 주장할 수 없는 세대의 중과 배제),
     *    그 안전망은 `e2e/transfer-house-row-one-house-facts.spec.ts`가 진다.
     */
    await expect(
      page.getByText("수도권 밖 부득이한 사유 주택 보유 (§155⑧)", { exact: true }),
    ).toHaveCount(0);
  });
});
