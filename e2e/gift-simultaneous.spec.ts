/**
 * E2E: 동시증여 다중 건 세액 계산 — Phase 5
 *
 * 검증 목표:
 *   1. [A-6] GiftTaxForm.tsx의 ⑬ 버그 수정 실증 — 다건 fetch body
 *      `{ ...inputs[0], simultaneousGiftForms: inputs.slice(1) }` 가
 *      브라우저→fetch→Zod→route→calcSimultaneousGifts 전 경로에서 동작함을 확인.
 *   2. [D-2] 동일 그룹 차단 — 건0 부(father) + 건1 모(mother) 선택 시
 *      인라인 경고 표시 + 다음 단계 차단(validateStep §47 메시지).
 *
 * 앵커 (A-6): 건0 부(father) 60M + 건1 조부(grandparent) 100M
 *   - 건0 공제 ④: floor(50M × 60M / 160M) = 18,750,000
 *   - 건0 납부세액 ⑱: 4,001,250
 *   - 건1 헤더 "건 1" 배지 표시
 *   - 합계 카드 "수증자 총 납부세액 합계" 표시
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 *       worktree 실행 시 E2E_PORT=3101 필수.
 */

import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

// ──────────────────────────────────────────────────────────────────────────────
// 공통 셋업: 건 0 부 현금 60M 입력 + Step3(공제) 진입
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Step0 (증여일 + 건0 donor=father) → Step1 (현금 60M) → Step2(비과세) → Step3(공제) 진입.
 * 반환 값 없음 — page가 Step3 GiftCreditChecklist 상태.
 */
async function setupStep3WithFather60M(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/calc/gift-tax");

  // Step0: 증여일 (2024-05-01) + 증여자 = 부(father)
  await fillDateAndVerify(page, { year: "2024", month: "5", day: "1" });
  // 증여자 관계 select — 첫 번째 <select> = donor
  await page.locator("select").first().selectOption("father");
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 현금 60,000,000 추가
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  await page.getByRole("button", { name: /현금/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // CurrencyInput은 hideLabel=true → aria-label="현금 금액" 으로 접근
  await dialog.getByRole("textbox", { name: "현금 금액" }).fill("60000000");
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();

  // Step1 → Step2(비과세) → Step3(공제·세액공제)
  await nextSteps(page, 2);

  // Step3 진입 확인 — 동시증여 토글이 보여야 함
  await expect(
    page.getByText("같은 날 다른 분으로부터도 받으셨나요"),
  ).toBeVisible();
}

// ──────────────────────────────────────────────────────────────────────────────
// A-6: 이미지7 재현 — 건0 부 60M + 건1 조부 100M
// ──────────────────────────────────────────────────────────────────────────────

test.describe("동시증여 다건 세액 계산 (gift-simultaneous.spec.ts)", () => {
  test("[A-6] 건0 부 60M + 건1 조부 100M → 건0 공제 18,750,000 / 납부 4,001,250 / 합계 카드", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await setupStep3WithFather60M(page);

    // ① 동시증여 토글 ON
    await page.getByRole("switch", { name: /같은 날 다른 분으로부터도/ }).click();
    // 토글 ON 확인 — 안내 카드 노출
    await expect(page.getByText("1단계(증여자 관계)부터 입력하세요")).toBeVisible();

    // ② [+ 동시증여 추가] 클릭
    await page.getByRole("button", { name: "+ 동시증여 추가" }).click();
    // 카드 번호 배지 확인
    await expect(page.getByText("동시증여 추가 건 1")).toBeVisible();

    // ③ 건1 donor = grandparent (조부모) — testId 셀렉터
    await page.getByTestId("sim-card-0-donor-grandparent").click();
    // 세대생략 안내 표시 확인
    await expect(page.getByText("세대생략 할증(§57, 30%) 자동 적용")).toBeVisible();

    // ④ 건1 현금 100,000,000 추가
    // SimultaneousGiftCard의 "+ 증여재산 추가"는 addPanelOpen 인라인 패널을 열어둠(dialog 아님)
    // 카테고리 버튼(현금)은 page DOM에 인라인 렌더링 → dialog 스코핑 불가
    // → "+ 증여재산 추가" 버튼을 마지막 것(SimCard) 클릭 후
    //    addPanel 내 카테고리 "현금" 버튼을 마지막 것으로 클릭
    await page.getByRole("button", { name: "+ 증여재산 추가" }).last().click();
    // addPanel 열림 대기 — 카테고리 버튼은 page 인라인에 렌더링됨 (dialog 스코프 금지)
    await page.getByRole("button", { name: /현금/ }).last().click();
    // 카테고리 선택 후 DialogContent(role=dialog) 모달 자동 오픈
    // estate-edit-dialog testId는 DialogContent 안의 내용 div → 닫기 버튼은 그 바깥
    const editModal = page.getByRole("dialog");
    await expect(editModal).toBeVisible();
    // CurrencyInput은 hideLabel=true → aria-label="현금 금액"으로 접근
    const cashInput = editModal.getByRole("textbox", { name: "현금 금액" });
    await cashInput.fill("100000000");
    await expect(cashInput).toHaveValue(/100[,]?0[,]?0[,]?0[,]?0[,]?0[,]?0$/);
    // 닫기 버튼은 DialogContent 수준(role=dialog 안) → page.getByRole("dialog") 스코프에서 찾음
    await editModal.getByRole("button", { name: "닫기" }).click();
    await expect(editModal).toBeHidden();

    // 건1 재산 합계 표시 확인 (헤더 요약)
    await expect(page.getByText("합계 100,000,000원")).toBeVisible();

    // ⑤ 계산 (⑬ 버그 수정 실증 — fetch body가 올바른지 API 경로로 검증)
    await calcAndWaitResult(page, {
      taxType: "gift",
      resultText: "증여세 결정세액",
      timeout: 60_000,
    });

    // ⑥ 결과 검증
    // 건0 공제 ㉖ = 18,750,000 (별지 제10호서식 행번호 ㉖ = 증여재산공제 직계존비속)
    await expect(
      page.locator('[data-testid="besshi10-0-㉖"]'),
    ).toContainText("18,750,000");

    // 건0 납부세액 ㊺ = 4,001,250 (별지 제10호서식 행번호 ㊺ = 자진납부할 세액)
    await expect(
      page.locator('[data-testid="besshi10-0-㊺"]'),
    ).toContainText("4,001,250");

    // 건1 헤더 배지 "건 1" 표시
    await expect(page.getByTestId("sim-result-header-0")).toBeVisible();
    await expect(page.getByTestId("sim-result-header-0")).toContainText("건 1");

    // 합계 카드 "수증자 총 납부세액 합계" 표시
    await expect(page.getByText("수증자 총 납부세액 합계 (상증법 §4의2①)")).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // D-2: 동일 그룹 차단 — 건0 부 + 건1 모
  // ──────────────────────────────────────────────────────────────────────────────

  test("[D-2] 동일 그룹 차단 — 건0 부(father) + 건1 모(mother) → 인라인 경고 + 단계 차단", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await setupStep3WithFather60M(page);

    // ① 동시증여 토글 ON
    await page.getByRole("switch", { name: /같은 날 다른 분으로부터도/ }).click();

    // ② [+ 동시증여 추가] 클릭
    await page.getByRole("button", { name: "+ 동시증여 추가" }).click();

    // ③ 건1 donor = mother(모) — 건0의 father와 동일인 그룹
    await page.getByTestId("sim-card-0-donor-mother").click();

    // ④ 인라인 경고 표시 확인 (1차 방어)
    // SimultaneousGiftCard가 isSameGroup=true → rose 경고박스 렌더
    await expect(page.getByText(/동일인 그룹입니다/).first()).toBeVisible();
    // 경고에 §47② 언급 — strict mode: 동일인 텍스트가 경고+오류 두 곳에 있을 수 있으므로 .first()
    await expect(page.getByText(/§47②/).first()).toBeVisible();

    // ⑤ 다음 단계(계산) 버튼 클릭 → validateStep에서 차단 (2차 방어)
    // 계산하기 버튼이 없으므로 "다음" 버튼이 Step3에서 계산 트리거
    // 또는 validateStep 오류 메시지 표시
    await page.getByRole("button", { name: /계산하기|다음/ }).first().click();

    // 오류 메시지 확인 — 동일인 그룹 차단 또는 인라인 경고가 유지됨
    // validateStep(3) 가 "동일인 그룹" 메시지를 반환하거나
    // 인라인 경고가 그대로 보임 (차단 확인)
    // strict mode 주의: 인라인 경고 + 오류 div 두 곳에 "동일인" 텍스트 → .first() 필수
    await expect(page.getByText(/동일인 그룹|§47/).first()).toBeVisible();

    // 결과 페이지로 넘어가지 않음 (결과 카드 미노출)
    await expect(page.getByText("증여세 결정세액")).not.toBeVisible({ timeout: 3_000 });
  });
});
