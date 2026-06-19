/**
 * E2E: 조특법 특례 2-스트림 분리과세 UI
 *
 * 시나리오:
 *   [E2E-SS-1] 창업자금 단독 30억 — 자동 귀속, 특례 스트림 단독
 *   [E2E-SS-2] 혼합 증여 (창업자금 현금 30억 + 주택 5억) — 귀속 선택 → 2-스트림 분리
 *
 * 함정 회피 (memory: project_gift_burdened_debt_47_1):
 *   ① 카테고리 버튼 이모지 포함: getByRole("button", { name: /주택$/ }) — 끝매칭
 *   ② ToggleCard 내 입력: getByRole("textbox", { name: "라벨명" })
 *   ③ 자산명 필수 (주택): 모달 열린 후 이름 먼저 입력
 *
 * worktree 실행: E2E_PORT=3100
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  calcAndWaitResult,
  nextSteps,
} from "./_helpers/tax-flow";

// ============================================================
// 헬퍼: 현금 자산 추가 (증여세 전용, 자산명 불필요)
// ============================================================

async function addCashAsset(
  page: Parameters<typeof fillDateAndVerify>[0],
  opts: {
    name: string;
    amount: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  // 함정①: 이모지 라벨 끝매칭
  await page.getByRole("button", { name: /현금$/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");

  // 자산명 (현금도 이름 입력 — 식별 편의)
  const nameInput = dialog.getByPlaceholder(/자산명|이름/);
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(opts.name);
  }

  // 시가 입력 — 함정②: ToggleCard 내 입력은 getByRole("textbox")
  // 현금 자산은 별도 평가 방식 없이 시가 직접 입력
  const valueInput = dialog.getByRole("textbox", {
    name: /시가|증여가액|금액/,
  }).first();
  if (await valueInput.isVisible().catch(() => false)) {
    await valueInput.fill(opts.amount);
  } else {
    // fallback: 첫 번째 숫자 입력란
    await dialog.getByRole("textbox").first().fill(opts.amount);
  }

  // 모달 닫기
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
}

// ============================================================
// 헬퍼: 주택 자산 추가 (시가 입력)
// ============================================================

async function addApartmentAsset(
  page: Parameters<typeof fillDateAndVerify>[0],
  opts: {
    name: string;
    marketValue: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  // 함정①: 이모지 라벨 끝매칭
  await page.getByRole("button", { name: /주택$/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");

  // 함정③: 자산명 필수
  const nameInput = dialog.getByPlaceholder(/강남 아파트|본가 토지|자산명/);
  await nameInput.fill(opts.name);
  await expect(nameInput).toHaveValue(opts.name);

  // 시가 토글 ON
  const marketToggle = dialog.getByRole("switch", { name: /^시가 \(매매/ });
  const isOn = (await marketToggle.getAttribute("aria-checked")) === "true";
  if (!isOn) await marketToggle.click();

  // 함정②: getByRole("textbox") strict
  const marketInput = dialog.getByRole("textbox", {
    name: "시가 (매매·수용·경매가액)",
  });
  await marketInput.fill(opts.marketValue);

  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
}

// ============================================================
// 테스트
// ============================================================

test.describe("조특법 특례 2-스트림 분리과세 UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("[E2E-SS-1] 창업자금 단독 30억 — 자동 귀속 표시 + 특례 스트림 결과", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Step0: 증여일 + 증여자(기본 father)
    await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 현금 1건 추가
    await addCashAsset(page, { name: "창업자금", amount: "3000000000" });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 사전증여 없음
    await nextSteps(page, 1); // → Step3

    // Step4: 조특 칩 펼침 → 창업자금 과세특례 선택
    await page.getByText("조특법 과세특례 (§30의5·6)").click();
    await page.getByText("창업자금 증여세 과세특례 (§30의5)").click();

    // 자동 귀속 안내 표시 확인 (자산 1개) — strict 모드: .first() 사용
    await expect(page.getByText("자동 귀속").first()).toBeVisible({ timeout: 5_000 });

    // 투자 완료 토글 ON
    await page.getByText("창업자금 투자 완료 (§30의5④)").click();

    // 계산
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과 검증: 특례 스트림 카드 표시
    await expect(
      page.getByText("조특법 과세특례 스트림").first(),
    ).toBeVisible({ timeout: 10_000 });

    // §69 배제 안내
    await expect(
      page.getByText(/§30의5⑫/).first(),
    ).toBeVisible({ timeout: 10_000 });

    // 특례 세액 250,000,000 (30억 - 5억 = 25억, × 10%)
    await expect(
      page.getByText(/250,000,000/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[E2E-SS-2] 혼합 증여 현금30억+주택5억 — 귀속 선택 → 2-스트림 분리", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Step0
    await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 자산 2건
    await addCashAsset(page, { name: "창업자금", amount: "3000000000" });
    await addApartmentAsset(page, {
      name: "강남 아파트",
      marketValue: "500000000",
    });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: skip
    await nextSteps(page, 1); // → Step3

    // Step4: 조특 칩 펼침 → 창업자금 과세특례 선택
    await page.getByText("조특법 과세특례 (§30의5·6)").click();
    await page.getByText("창업자금 증여세 과세특례 (§30의5)").click();

    // 자산 2개 → 멀티선택 카드 표시 확인
    await expect(
      page.getByText("특례 귀속 자산 선택").first(),
    ).toBeVisible({ timeout: 5_000 });

    // 창업자금 체크박스 선택 — 첫 번째 자산(현금)이 giftItems[0]
    // 스크린샷 실측: 자산명 "현금 1" (자동 이름) / "강남 아파트 (주택)"
    // label 내 첫 번째 checkbox → 현금 자산 (창업자금 특례 귀속)
    await page.getByRole("checkbox").first().check();

    // 투자 완료 토글 ON
    await page.getByText("창업자금 투자 완료 (§30의5④)").click();

    // 계산
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과 검증: 일반 스트림 카드 표시
    await expect(
      page.getByText("일반 증여 스트림").first(),
    ).toBeVisible({ timeout: 10_000 });

    // 결과 검증: 특례 스트림 카드 표시
    await expect(
      page.getByText("조특법 과세특례 스트림").first(),
    ).toBeVisible({ timeout: 10_000 });

    // 결과 검증: 최종 납부세액 합산 카드
    await expect(
      page.getByText("최종 납부세액 (일반 + 특례)").first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
