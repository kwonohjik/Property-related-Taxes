/**
 * E2E: 상속세 장례비 식대/봉안 별도 입력 검증 (상증령 §9②)
 *
 * 검증:
 *   FE-1: Step2 단순 모드에서 "일반 장례비(식대·제수 등)" / "봉안시설·자연장지 비용" 두 줄 노출
 *         구 "봉안시설 이용" ToggleCard 미노출 (제거 확인)
 *   FE-2: 식대 8,000,000 + 봉안 6,000,000 입력 → 결과 화면에 13,000,000 포함
 *         (§9②1호 800만 + §9②2호 min(600만,500만) = 1,300만)
 *
 * 정책:
 *   - E2E_PORT=3003 (worktree 격리)
 *   - [[feedback_browser_verify_with_playwright]]
 *
 * 주의:
 *   - CurrencyInput 라벨은 <label> 태그 아닌 <p> 태그로 렌더링될 수 있음.
 *     getByLabel 대신 getByText + 인접 input 조합으로 검색.
 *   - 사이드바 "채무·공과·장례" 줄에 "장례 한도 적용 5,000,000" 표기로 최소 500만 보장
 *     → Step2 진입 직후 사이드바에 "-5,000,000" 표시 확인.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

// ============================================================
// 헬퍼
// ============================================================

/** Step0: 상속개시일 + 자녀 1명 → 다음(Step1) */
async function fillStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 토지 자산 추가 → 다음(Step2) */
async function fillStep1AndNext(page: Page) {
  await addLandAsset(page, { area: "300", unitPrice: "1000000" });
  await page.getByRole("button", { name: /^다음/ }).click();
}

// ============================================================
// 테스트
// ============================================================

test.describe("장례비 식대/봉안 별도 입력 UI", () => {
  test(
    "FE-1: Step2 단순 모드에서 식대·봉안 두 줄 입력 필드 노출, 구 ToggleCard 미노출",
    { tag: ["@funeral"] },
    async ({ page }) => {
      test.setTimeout(90_000);

      await fillStep0(page);
      await fillStep1AndNext(page);

      // Step2(비과세·장례비) 진입 확인
      await expect(
        page.getByText("장례비 (§14①3호)"),
      ).toBeVisible({ timeout: 10_000 });

      // 신규: "일반 장례비(식대·제수 등)" 텍스트 노출
      await expect(
        page.getByText("일반 장례비(식대·제수 등)"),
      ).toBeVisible();

      // 신규: "봉안시설·자연장지 비용" 텍스트 노출
      await expect(
        page.getByText("봉안시설·자연장지 비용"),
      ).toBeVisible();

      // 구 ToggleCard "봉안시설 이용" 미노출 확인
      await expect(
        page.getByText("봉안시설 이용"),
      ).not.toBeVisible();

      // 구 라벨 "장례비용" 미노출 확인
      await expect(
        page.getByText("장례비용"),
      ).not.toBeVisible();
    },
  );

  test(
    "FE-2: 식대 800만 + 봉안 600만 → 결과 장례비 공제 1,300만 (§9② FUN-01 경계값)",
    { tag: ["@funeral"] },
    async ({ page }) => {
      test.setTimeout(120_000);

      await fillStep0(page);
      await fillStep1AndNext(page);

      // Step2 — 단순 모드 장례비 입력 화면 진입
      await expect(
        page.getByText("일반 장례비(식대·제수 등)"),
      ).toBeVisible({ timeout: 10_000 });

      // 식대 입력: 상증령 §9②1호 — 8,000,000
      // "일반 장례비(식대·제수 등)" 라벨 다음 input 찾기
      // CurrencyInput은 FieldCard 안에 렌더되어 aria 연결이 있을 수 있음
      // placeholder "없으면 빈칸" 기준 위아래 두 개 있으므로 first/nth로 구분
      const funeralInputs = page.getByPlaceholder("없으면 빈칸");
      // 첫 번째 = 일반 장례비(식대), 두 번째 = 봉안시설·자연장지
      await funeralInputs.nth(0).fill("8000000");
      await funeralInputs.nth(1).fill("6000000");

      // Step3, Step4 건너뛰고 계산 실행
      await nextSteps(page, 2);
      await calcAndWaitResult(page);

      // 결과: 13,000,000 (콤마 포맷) 포함 확인
      // §9②1호: min(max(800만,500만),1천만) = 800만
      // §9②2호: min(600만, 500만) = 500만 → 합계: 1,300만
      const resultText = await page.textContent("body");
      expect(resultText).toContain("13,000,000");
    },
  );
});
