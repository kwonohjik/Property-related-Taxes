/**
 * E2E: 동거가족 테이블+모달 뷰 — CohabitantDependentSection 리팩터 검증
 *
 * 배경:
 *   카드 나열(cohabitant-editor-N) → 요약 테이블 + 행 클릭 Dialog 모달 패턴으로 전환.
 *   상속인 테이블(HeirComposition) 동일 패턴 적용.
 *
 * 시나리오:
 *   TV-1: 동거가족 추가 → 테이블 행 표시 확인
 *   TV-2: 테이블 행 클릭 → 모달 오픈 확인
 *   TV-3: 모달에서 관계·생년월일 편집 → 닫기 → 테이블 반영 확인
 *   TV-4: 모달 내 삭제 → 모달 닫힘 + 3-state OFF(테이블 미표시) 확인
 *   TV-5: Enter/Space 키보드 트리거 → 모달 오픈 확인
 *
 * 정책:
 *   - [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *   - 행 선택: tr[role="button"] (data-testid 정확매칭 함정 회피)
 *   - 모달: 실시간 onChange — 저장/취소 없음, 닫기만 존재
 *   - 3-state OFF: 마지막 동거가족 삭제 → undefined → 테이블 미표시
 */

import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify, addHeir } from "./_helpers/tax-flow";

// ============================================================
// 공용 헬퍼
// ============================================================

/** Step0 이동 + 상속개시일 설정 */
async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
}

/** 자녀 상속인 1명 추가 + 주민번호 + 상속인 편집 모달 닫기 */
async function addChildHeir(page: Page) {
  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  // 자녀 추가 직후 "상속인 편집" 모달이 자동 오픈됨 → 동거가족 추가 전에 닫아야 함
  const heirDialog = page.getByRole("dialog", { name: "상속인 편집" });
  if (await heirDialog.isVisible()) {
    await heirDialog.getByRole("button", { name: "닫기" }).click();
    await expect(heirDialog).not.toBeVisible({ timeout: 3_000 });
  }
}

/** 동거가족 추가 버튼 클릭 */
async function addCohabitant(page: Page) {
  await page.getByRole("button", { name: /동거가족 추가/ }).click();
}

/** 동거가족 테이블의 첫 번째 행 (role="button") */
function firstCohabitantRow(page: Page) {
  // tr[role="button"] — 정확 매칭보다 role 기반 선택 (feedback_no_dynamic_testid_match)
  return page.locator('tr[role="button"]').filter({ hasText: "동거가족" }).first();
}

/** Dialog 모달 본문 */
function editDialog(page: Page) {
  return page.getByRole("dialog");
}

// ============================================================
// 테스트
// ============================================================

test.describe("동거가족 테이블+모달 뷰 (CohabitantDependentSection)", () => {
  test("TV-1: 동거가족 추가 → 테이블 행 표시 + 모달 자동 오픈", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await gotoStep0(page);
    await addChildHeir(page);

    // 섹션 헤더 표시 확인
    await expect(page.getByText(/동거가족 \(인적공제 대상 부양가족\)/)).toBeVisible();

    // 추가 전: 테이블 행 없음
    await expect(
      page.locator('tr[role="button"]').filter({ hasText: "동거가족" }),
    ).toHaveCount(0);

    // 추가 → 모달 자동 오픈
    await addCohabitant(page);

    // 모달 오픈 확인
    const dialog = editDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("동거가족 편집")).toBeVisible();

    // 닫기 → 모달 닫힘
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // 테이블에 행이 생성됨 (관계 기본값: 직계비속)
    await expect(firstCohabitantRow(page)).toBeVisible();
  });

  test("TV-2: 테이블 행 클릭 → 모달 오픈", async ({ page }) => {
    test.setTimeout(60_000);

    await gotoStep0(page);
    await addChildHeir(page);
    await addCohabitant(page);

    // 자동 오픈된 모달 닫기
    const dialog = editDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // 테이블 행 클릭 → 모달 재오픈
    const row = firstCohabitantRow(page);
    await expect(row).toBeVisible();
    await row.click();

    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("동거가족 편집")).toBeVisible();
  });

  test("TV-3: 모달에서 관계·생년월일 편집 → 닫기 → 테이블 반영", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await gotoStep0(page);
    await addChildHeir(page);
    await addCohabitant(page);

    const dialog = editDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 관계 변경: 직계비속 → 형제자매
    await dialog.getByText("형제자매").click();
    // 생년월일 입력 (1960-03-15)
    await fillDateAndVerify(
      page,
      { year: "1960", month: "3", day: "15" },
      { scope: dialog },
    );

    // 닫기
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // 테이블에 형제자매 관계 반영 확인
    const row = firstCohabitantRow(page);
    await expect(row).toBeVisible();
    await expect(row.getByText(/형제자매/)).toBeVisible();
    // 생년월일 반영 확인 (연로자 65세 이상 → "연로자" 배지 or 생년월일 텍스트)
    await expect(row.getByText(/1960-03-15/)).toBeVisible();
  });

  test("TV-4: 모달 내 삭제 → 모달 닫힘 + 3-state OFF (테이블 미표시)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await gotoStep0(page);
    await addChildHeir(page);
    await addCohabitant(page);

    const dialog = editDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 모달 내 삭제 버튼 클릭
    await dialog.getByText("이 동거가족 삭제").click();

    // 모달 닫힘 확인 (selectedDepId=null)
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // 3-state OFF — 테이블 행 없음
    await expect(
      page.locator('tr[role="button"]').filter({ hasText: "동거가족" }),
    ).toHaveCount(0);

    // 빈 안내문 표시
    await expect(
      page.getByText(/동거가족이 있으면.*동거가족 추가/),
    ).toBeVisible();
  });

  test("TV-5: Enter 키보드 트리거 → 모달 오픈", async ({ page }) => {
    test.setTimeout(60_000);

    await gotoStep0(page);
    await addChildHeir(page);
    await addCohabitant(page);

    const dialog = editDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // 자동 오픈된 모달 닫기
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // 테이블 행에 포커스 후 Enter
    const row = firstCohabitantRow(page);
    await row.focus();
    await row.press("Enter");

    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("동거가족 편집")).toBeVisible();
  });
});
