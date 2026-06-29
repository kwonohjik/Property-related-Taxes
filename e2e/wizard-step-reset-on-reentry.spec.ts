/**
 * 마법사 재진입 시 첫 스텝부터 — currentStep 미persist E2E
 *
 * 계획서: docs/00-pm/wizard-step-reset-on-reentry.plan.md §7-2
 * 버그: 같은 탭에서 양도세 마법사를 뒷 스텝까지 진행 후 홈 재진입하면, sessionStorage 잔존
 *   currentStep이 복원되어 첫 스텝("자산 목록")이 아닌 이전 스텝("감면·공제")이 열렸다.
 *
 * 재현: addInitScript로 구 코드가 기록했을 sessionStorage(currentStep:2)를 주입 → 진입 시
 *   step 0("자산 목록") 화면이어야 하고 "감면 확인"(step 2 제목)은 보이면 안 된다.
 */
import { test, expect } from "@playwright/test";

const SEEDED = JSON.stringify({
  state: {
    currentStep: 2, // 구 코드가 "감면·공제"까지 진행 후 저장했을 잔존값
    formData: { transferDate: "2021-06-01" },
    pendingMigration: false,
  },
  version: 0,
});

test.describe("마법사 재진입 시 첫 스텝 복원", () => {
  test("양도세 — sessionStorage currentStep:2 잔존 상태로 진입해도 자산 목록(step 0)", async ({
    page,
  }) => {
    // 문서 로드 전 sessionStorage 주입 → rehydrate가 잔존값을 읽는 시나리오 재현
    await page.addInitScript((seeded) => {
      sessionStorage.setItem("transfer-tax-wizard", seeded);
    }, SEEDED);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 첫 스텝 본문 제목이 노출되고, 감면 단계(step 2) 제목은 보이지 않아야 함
    await expect(page.getByText("자산 목록·취득 정보 입력")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("감면 확인")).toHaveCount(0);

    // 사이드바 "자산 목록"이 active 스텝
    await expect(page.getByRole("button", { name: "자산 목록", exact: true })).toBeVisible();
  });
});
