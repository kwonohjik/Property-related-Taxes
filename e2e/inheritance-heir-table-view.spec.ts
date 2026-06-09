/**
 * E2E: 상속인·수유자 구성 테이블 뷰 개편 검증
 *
 * 설계: docs/02-design/features/inheritance-heir-table-view.ui.design.md
 *
 * 시나리오:
 *   TV-1: 상속인 추가(종류→관계 2단계) → 테이블 표시 → 라디오 선택 → 편집 카드 로드 → 수정 반영 → 삭제 → 선택 해제
 *   TV-2: 대습상속인 추가 → 테이블 "대습상속인" 표시 + 편집 카드 SubstituteHeirPanel 토글 자동 ON 확인
 *   TV-3: 수유자 추가 → 테이블 "수유자" 종류 표시 확인
 *   TV-4: heirs 0명 → 테이블 미표시, "상속인 추가" 버튼만 확인
 *
 * 정책:
 *   - [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *   - data-testid 우선
 *   - 내부 id(heir-*) 테이블에 노출 없음 확인 (feedback_no_internal_id_in_result)
 */

import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

/** 상속세 마법사 Step0로 이동 후 상속개시일 입력 */
async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
}

/** "상속인 추가" 버튼 클릭 */
async function clickAddHeir(page: Page) {
  await page.getByRole("button", { name: /상속인 추가/ }).click();
}

/**
 * KindButton / RelationButton 은 내부에 <span> 으로 분리된 텍스트를 포함하므로
 * getByRole("button", { name, exact }) 이 아닌 getByText 로 포함된 버튼을 찾는다.
 */
async function clickButtonContaining(page: Page, text: string) {
  await page.locator("button").filter({ hasText: text }).first().click();
}

test.describe("TV-4: heirs 0명 — 테이블 미표시, 추가 버튼만", () => {
  test("heirs 없을 때 테이블 role=group 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);

    // 테이블이 없어야 함 (E-3)
    const table = page.locator('[role="group"][aria-label="상속인·수유자 목록"]');
    await expect(table).not.toBeVisible();

    // "상속인 추가" 버튼은 표시되어야 함
    await expect(page.getByRole("button", { name: /상속인 추가/ })).toBeVisible();
  });
});

test.describe("TV-1: 상속인(자녀) 추가 2단계 → 테이블 → 편집 → 삭제", () => {
  test(
    "자녀 추가 → 테이블 행 확인 → 라디오 선택 → 편집 카드 → 이름 수정 → 삭제",
    async ({ page }) => {
      test.setTimeout(90_000);
      await gotoStep0(page);

      // 1단계: 상속인 추가 버튼
      await clickAddHeir(page);

      // 1단계 종류 선택 UI 노출 확인
      await expect(page.getByText("종류 선택 (1단계)")).toBeVisible();

      // 1단계: "상속인" 선택 (KindButton은 span이 분리되어 있어 filter로 찾음)
      await clickButtonContaining(page, "상속인");

      // 2단계 관계 선택 UI 노출 확인
      await expect(page.getByText("관계 선택 (2단계 — 상속인)")).toBeVisible();

      // 2단계: "자녀" 선택 (RelationButton 동일)
      await clickButtonContaining(page, "자녀");

      // 테이블이 표시되어야 함
      const table = page.locator('[role="group"][aria-label="상속인·수유자 목록"]');
      await expect(table).toBeVisible({ timeout: 5_000 });

      // 테이블 행에 "상속인" 종류 텍스트 표시 확인
      await expect(table.getByText("상속인").first()).toBeVisible();

      // 테이블 행에 "자녀" 관계 텍스트 표시 확인
      await expect(table.getByText("자녀").first()).toBeVisible();

      // 추가 직후 자동 선택(E-1) — 편집 카드가 자동으로 로드되어야 함
      // HeirEditor는 data-testid="heir-editor-0"
      await expect(page.getByTestId("heir-editor-0")).toBeVisible({ timeout: 3_000 });

      // 편집 카드에서 이름 입력
      const nameInput = page.getByTestId("heir-editor-0").getByPlaceholder("예: 홍길동");
      await nameInput.fill("홍길순");
      await expect(nameInput).toHaveValue("홍길순");

      // 테이블에 이름 반영 확인
      await expect(table.getByText("홍길순")).toBeVisible();

      // 내부 heir-id가 셀 텍스트에 노출되지 않아야 함 (feedback_no_internal_id_in_result)
      // data-testid 속성은 테스트용 허용, td 텍스트에만 미노출 확인
      const tdTexts = await table.locator("td").allTextContents();
      for (const text of tdTexts) {
        expect(text).not.toMatch(/^heir-\d+-\d+$/);
      }

      // 라디오 클릭으로 선택 확인 (이미 선택된 상태이므로 checked)
      const radioInput = table.getByRole("radio").first();
      await expect(radioInput).toBeChecked();

      // 편집 카드 삭제 버튼 클릭
      await page.getByTestId("heir-editor-0").getByRole("button", { name: "삭제" }).click();

      // 삭제 후 선택 해제(E-2) — 편집 카드 사라짐
      await expect(page.getByTestId("heir-editor-0")).not.toBeVisible();

      // 테이블도 사라짐 (heirs 0명)
      await expect(table).not.toBeVisible();

      // "상속인 추가" 버튼 재출현
      await expect(page.getByRole("button", { name: /상속인 추가/ })).toBeVisible();
    },
  );
});

test.describe("TV-2: 대습상속인 추가 → 테이블 + SubstituteHeirPanel 자동 ON", () => {
  test(
    "대습상속인 선택 → 테이블 '대습상속인' 표시 + 편집 카드 SubstituteHeirPanel 토글 ON",
    async ({ page }) => {
      test.setTimeout(90_000);
      await gotoStep0(page);

      // "상속인 추가" → 1단계 "대습상속인" 선택 (2단계 관계 선택 없음)
      await clickAddHeir(page);
      await clickButtonContaining(page, "대습상속인");

      // 테이블 표시 및 "대습상속인" 종류 확인
      const table = page.locator('[role="group"][aria-label="상속인·수유자 목록"]');
      await expect(table).toBeVisible({ timeout: 5_000 });
      await expect(table.getByText("대습상속인").first()).toBeVisible();

      // 추가 직후 자동 선택(E-1) + 편집 카드 로드
      await expect(page.getByTestId("heir-editor-0")).toBeVisible({ timeout: 3_000 });

      // SubstituteHeirPanel 토글이 자동 ON 상태 (substituteGroupId 발급됨)
      // data-testid="heir-substitute-panel-0" 가 보이는지 확인
      await expect(page.getByTestId("heir-substitute-panel-0")).toBeVisible({ timeout: 3_000 });
    },
  );
});

test.describe("TV-3: 수유자 추가 → 테이블 '수유자' 종류 표시", () => {
  test("수유자 선택 → 1단계에서 즉시 추가 → 테이블 '수유자' 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);

    // "상속인 추가" → "수유자" 선택 (1단계에서 즉시 추가)
    await clickAddHeir(page);
    await clickButtonContaining(page, "수유자");

    // 테이블 표시
    const table = page.locator('[role="group"][aria-label="상속인·수유자 목록"]');
    await expect(table).toBeVisible({ timeout: 5_000 });

    // "수유자" 종류 컬럼 텍스트 확인
    await expect(table.getByText("수유자").first()).toBeVisible();

    // 편집 카드 자동 로드 확인
    await expect(page.getByTestId("heir-editor-0")).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("TV-Extra: 관계 변경 버튼 텍스트", () => {
  test("편집 카드 헤더의 버튼 텍스트가 '관계 변경'이어야 함 (정정 #7)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);

    // 배우자 추가
    await clickAddHeir(page);
    await clickButtonContaining(page, "상속인");
    await clickButtonContaining(page, "배우자");

    // 편집 카드 로드 대기
    await expect(page.getByTestId("heir-editor-0")).toBeVisible({ timeout: 3_000 });

    // "관계 변경" 버튼 확인 (기존 "종류 변경" 텍스트가 변경된 것)
    await expect(
      page.getByTestId("heir-change-relation-0"),
    ).toHaveText("관계 변경");
  });
});
