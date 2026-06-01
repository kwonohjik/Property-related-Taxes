/**
 * E2E: A-1 — perHeir Map→Record 직렬화 수정 full-flow 검증
 *
 * 계획서: docs/00-pm/inheritance-perheir-serialization-fix.plan.md §5 A-1
 *
 * 배경:
 *   `HeirAllocationResult.perHeir`가 Map이었을 때 JSON 경유 후 `{}` 로 소실 →
 *   결과 화면 상속인별 배부 표에 상속인별 셀·금액 미렌더 (표 숨겨짐).
 *   커밋 `71f3cfd`에서 Record<string, HeirTaxBreakdown>으로 변경 → 직렬화 안전 → 표 렌더 기대.
 *
 * 대상 표 재지정(2026-06-01):
 *   구버전 간편표 HeirAllocationTable("상속인별 세부담액 집계")을 삭제하고,
 *   상위 호환 HeirAllocationSummaryTable("상속인별 상속세부담액 집계", ①~⑮)로 일원화.
 *   본 spec은 동일 `perHeir` Record를 읽는 이미지2 집계 표에 대해 full-flow hard-assert를 유지한다.
 *   (이미지2 표도 perHeir[id]를 셀로 렌더하므로 Map→Record 회귀 가드 동등 보존)
 *
 * RED 기준(수정 전):
 *   perHeir가 Map 직렬화 소실(`{}`) → 상속인별 셀이 비거나 표가 조건부 null 반환 → 미렌더.
 *
 * GREEN 기준(수정 후):
 *   perHeir가 Record → JSON round-trip 후에도 보존 → 표 렌더 + 상속인별 셀 표시.
 *
 * 시나리오:
 *   A-1-a: 자녀 상속인 1명 + 토지 재산 → full-flow → 집계 표 + ⑮행 + 상속인 셀 1개 확인
 *   A-1-b: 자녀 2명 → 상속인별 ⑮행 셀이 2개(합계 셀 제외) 존재 확인
 *   A-1-c: 법정상속분 자동배분 안내 메시지 표시 확인 (usedLegalShareFallback)
 *
 * 정책:
 *   - [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *   - data-testid 우선. 이미지2 표는 testid 보유 → 텍스트 셀렉터 대신 testid 사용
 *   - "heir-allocation-summary-table" = 표 존재 증명
 *   - "heir-summary-row-row-15-finalTax" = ⑮ 차감자진납부세액 행 렌더 증명
 *   - "heir-summary-cell-{id}-row-15-finalTax" = 상속인별 셀 렌더 증명 (이전 버그: 셀 전무)
 */

import { test, expect, type Page } from "@playwright/test";

// ============================================================
// 공용 헬퍼
// ============================================================

/** ⑮ 차감자진납부세액 행의 "상속인별" 셀(합계 셀 제외) locator */
function heirFinalTaxCells(page: Page) {
  return page.locator(
    'td[data-testid^="heir-summary-cell-"][data-testid$="-row-15-finalTax"]:not([data-testid="heir-summary-cell-total-row-15-finalTax"])',
  );
}

/** Step0: 상속개시일 + 상속인(자녀 N명) 추가 후 Step1으로 이동 */
async function gotoStep0AndAddChildren(page: Page, childCount: number) {
  await page.goto("/calc/inheritance-tax");

  // 상속개시일
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  // 자녀 N명 추가
  for (let i = 0; i < childCount; i++) {
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("자녀", { exact: true }).click();
  }

  // Step1(상속재산)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 토지 카드 추가 후 면적·공시지가 입력 */
async function addLandAsset(page: Page) {
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();

  // 면적 300㎡ × 공시지가 1,000,000원/㎡ = 3억 평가액
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");
}

/** Step1 → Step2 → Step3 → Step4 → 계산하기 → 결과 화면 대기 */
async function proceedToResult(page: Page) {
  // Step2(비과세·장례비)
  await page.getByRole("button", { name: /^다음/ }).click();
  // Step3(사전증여)
  await page.getByRole("button", { name: /^다음/ }).click();
  // Step4(공제·세액공제)
  await page.getByRole("button", { name: /^다음/ }).click();
  // 계산하기
  await page.getByRole("button", { name: /계산하기/ }).click();
  // 결과 화면 로드 대기
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 15_000 });
}

// ============================================================
// 테스트
// ============================================================

test.describe("A-1: 상속인별 상속세부담액 집계(이미지2) full-flow 렌더 검증 (perHeir Map→Record)", () => {
  test(
    "A-1-a: 자녀 1명 + 토지 → 집계 표 + ⑮행 + 상속인 셀 렌더",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0AndAddChildren(page, 1);
      await addLandAsset(page);
      await proceedToResult(page);

      // ── 검증 1: 표 존재 (전체 렌더 증명) ──
      await expect(
        page.getByTestId("heir-allocation-summary-table"),
      ).toBeVisible({ timeout: 5_000 });

      // ── 검증 2: ⑮ 차감자진납부세액 행 존재 (표 내부 행 렌더 증명) ──
      await expect(
        page.getByTestId("heir-summary-row-row-15-finalTax"),
      ).toBeVisible();

      // ── 검증 3: 합계 셀 존재 ──
      await expect(
        page.getByTestId("heir-summary-cell-total-row-15-finalTax"),
      ).toBeVisible();

      // ── 검증 4: 상속인별 셀 1개 존재 (이전 버그: perHeir 소실 → 셀 전무) ──
      await expect(heirFinalTaxCells(page)).toHaveCount(1);
    },
  );

  test(
    "A-1-b: 자녀 2명 + 토지 → 상속인별 ⑮행 셀 2개(합계 제외) 존재 확인",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0AndAddChildren(page, 2);
      await addLandAsset(page);
      await proceedToResult(page);

      // ── 검증 1: 표 존재 ──
      await expect(
        page.getByTestId("heir-allocation-summary-table"),
      ).toBeVisible({ timeout: 5_000 });

      // ── 검증 2: 상속인 수만큼 ⑮행 셀 존재 (2명 → 2개, 합계 셀 제외) ──
      await expect(heirFinalTaxCells(page)).toHaveCount(2);

      // ── 검증 3: 합계 셀 존재 ──
      await expect(
        page.getByTestId("heir-summary-cell-total-row-15-finalTax"),
      ).toBeVisible();
    },
  );

  test(
    "A-1-c: 법정상속분 자동배분 안내 메시지 표시 확인 (usedLegalShareFallback)",
    async ({ page }) => {
      test.setTimeout(90_000);

      // 협의분할 입력 없이 자녀 1명 → 법정상속분 자동배분 → usedLegalShareFallback=true
      await gotoStep0AndAddChildren(page, 1);
      await addLandAsset(page);
      await proceedToResult(page);

      // 표 존재 전제
      await expect(
        page.getByTestId("heir-allocation-summary-table"),
      ).toBeVisible({ timeout: 5_000 });

      // 법정상속분 안내 문구 (usedLegalShareFallback=true 시 표시)
      await expect(
        page.getByText(/법정상속분/, { exact: false }).first(),
      ).toBeVisible();
    },
  );
});
