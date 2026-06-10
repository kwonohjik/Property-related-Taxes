/**
 * E2E: 피상속인 인적사항(Step1) 입력 → 별지 제9호서식 ⑦⑧ 칸 반영 full-flow 검증
 *
 * 배경:
 *   별지 제9호서식·별지5호 인적사항 표의 피상속인 성명·주민등록번호가 입력 경로 부재로 공란이었음.
 *   Step0(피상속인·상속인)에 피상속인 성명·주민등록번호 입력 필드 신설 → 엔진 우회 prop 전달 →
 *   FilingForm9 ⑦⑧ / Besshi5 인적사항 칸에 표시.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족.
 *   data-testid 우선(ff9-⑦·ff9-⑧). 펼침 토글 OFF 상태에서도 DOM 텍스트는 존재(hidden print:block) →
 *   toHaveText로 검증(가시성 불요).
 */

import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

test.describe("피상속인 인적사항 Step1 입력 → 신고서 반영", () => {
  test(
    "DI-1: 성명·주민번호 입력 → 별지 제9호서식 ⑦⑧ 칸 표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await page.goto("/calc/inheritance-tax");

      // ── 피상속인 인적사항 (신규 필드) ──
      await page.getByPlaceholder("성명").first().fill("홍길동");
      await page.getByPlaceholder("앞 6자리-뒤 7자리").fill("350505-1234567");

      // 상속개시일
      await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

      // 자녀 1명 — addHeir가 모달 안 주민번호 입력 + 닫기까지 수행 (피상속인 RRN은 위 별도 입력)
      await addHeir(page, "heir", "child", { residentNumber: "900202-2000000" });

      // Step1(상속재산) → 토지
      await page.getByRole("button", { name: /^다음/ }).click();
      await addLandAsset(page, { area: "300", unitPrice: "1000000" });

      // Step2 → Step3 → Step4 → 계산
      await nextSteps(page, 3);
      await calcAndWaitResult(page);

      // ── 검증: 별지 제9호서식 ⑦ 피상속인 성명 · ⑧ 주민등록번호 (hidden 상태에서도 텍스트 존재) ──
      await expect(page.getByTestId("ff9-⑦")).toHaveText("홍길동");
      await expect(page.getByTestId("ff9-⑧")).toHaveText("350505-1234567");
      // ② 신고인(대표 상속인) 주민등록번호
      await expect(page.getByTestId("ff9-②")).toHaveText("900202-2000000");
    },
  );
});
