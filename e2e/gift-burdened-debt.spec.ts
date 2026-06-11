/**
 * E2E: 부담부증여 채무인수 §47① — 과세가액 차감 확인
 *
 * 시나리오: 아파트(주택) 10억 + 수증자 인수 채무 4억 → 결과 채무인수 차감 행 확인
 *
 * 정책: worktree E2E_PORT=3100 (memory: feedback_e2e_worktree_port_isolation)
 *       spec 통과로 브라우저 확인 충족 (memory: feedback_browser_verify_with_playwright)
 */
import { test, expect } from "@playwright/test";
import { fillDateAndVerify, calcAndWaitResult } from "./_helpers/tax-flow";

test.describe("부담부증여 §47① 채무인수 차감", () => {
  test(
    "[BD-E2E-1] 아파트 10억 + 채무 4억 인수 → 결과 채무인수 차감 행 표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await page.goto("/calc/gift-tax");

      // Step0: 증여일 2025-03-15 + 증여자 select 선택 (validateStep: donor 필수)
      await fillDateAndVerify(page, { year: "2025", month: "3", day: "15" });
      // donorRelation은 donor select에서 자동 도출(G-M3) — index 1 = 父(father)
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: /^다음/ }).click(); // → Step1 증여재산

      // Step1: 주택(아파트) 자산 추가
      await page.getByRole("button", { name: /증여재산 추가/ }).click();
      // 카테고리 버튼 "주택" 선택 — accessible name은 이모지 포함 "🏠 주택" (anchored 매칭 불가)
      await page.getByRole("button", { name: /주택$/ }).first().click();

      // 편집 모달 자동 오픈(E-1) 확인
      await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
      // dialog role 기반 locator (estate-edit-dialog testid ≠ dialog role)
      const dialog = page.getByRole("dialog");

      // 자산명 입력 — 주택은 자산명 필수 (cash·financial·deposit만 면제, validateStep Step1)
      const nameInput = dialog.getByPlaceholder(/강남 아파트|본가 토지/);
      await nameInput.fill("서울 아파트");
      await expect(nameInput).toHaveValue("서울 아파트");

      // 시가 입력 — ToggleCard switch. accessible name = title+description 합쳐짐.
      // /^시가 \(매매/ 로 시작하는 switch만 매칭 (매매사례가액 토글은 "매매사례가액..." 로 시작)
      const marketToggle = dialog.getByRole("switch", {
        name: /^시가 \(매매/,
      });
      const marketChecked = await marketToggle.getAttribute("aria-checked");
      if (marketChecked !== "true") {
        await marketToggle.click();
      }

      // 시가 입력 필드 — CurrencyInput은 role="textbox" + aria-label
      // getByLabel은 switch/hidden-checkbox/textbox 3개 strict 위반 → getByRole("textbox") 사용
      const marketValueInput = dialog.getByRole("textbox", {
        name: "시가 (매매·수용·경매가액)",
      });
      await marketValueInput.fill("1000000000");

      // 담보·임대 토글 펼침 — ToggleCard title에 "담보·임대" 포함
      const collateralToggle = dialog.getByRole("switch", {
        name: /담보·임대/,
      });
      const collateralChecked =
        await collateralToggle.getAttribute("aria-checked");
      if (collateralChecked !== "true") {
        await collateralToggle.click();
      }

      // §47① 수증자 인수 채무액 입력
      // FieldCard label="수증자 인수 채무액 (§47①)" + CurrencyInput hideLabel → role="textbox"
      const debtInput = dialog.getByRole("textbox", {
        name: "수증자 인수 채무액 (§47①)",
      });
      await expect(debtInput).toBeVisible();
      await debtInput.fill("400000000");

      // §47③ 안내 문구 노출 확인 (채무>0 시 표시)
      await expect(dialog.getByText("§47③ 주의")).toBeVisible();

      // 편집 모달 닫기 (page.getByRole("dialog") 기반)
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // Step1 → 다음(Step2) → 다음(Step3) → 계산하기
      await page.getByRole("button", { name: /^다음/ }).click(); // → Step2 공제
      await page.getByRole("button", { name: /^다음/ }).click(); // → Step3 결과
      await calcAndWaitResult(page, { taxType: "gift" });

      // 결과 검증: 채무인수 차감 행 표시
      await expect(
        page.getByText("부담부증여 채무인수 차감 (§47①)"),
      ).toBeVisible();
    },
  );
});
