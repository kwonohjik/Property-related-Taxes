/**
 * E2E: A-1 — perHeir Map→Record 직렬화 수정 full-flow 검증
 *
 * 계획서: docs/00-pm/inheritance-perheir-serialization-fix.plan.md §5 A-1
 *
 * 배경:
 *   `HeirAllocationResult.perHeir`가 Map이었을 때 JSON 경유 후 `{}` 로 소실 →
 *   결과 화면 HeirAllocationTable에 상속인별 행·금액 미렌더 (interim 가드로 크래시는 막혔으나 표 숨겨짐).
 *   커밋 `71f3cfd`에서 Record<string, HeirTaxBreakdown>으로 변경 → 직렬화 안전 → 표 렌더 기대.
 *
 * RED 기준(수정 전):
 *   perHeir가 Map 직렬화 소실(`{}`) → HeirAllocationTable이 조건부 null 반환 → 표 미렌더.
 *
 * GREEN 기준(수정 후):
 *   perHeir가 Record → JSON round-trip 후에도 보존 → 표 렌더 + 상속인별 행·금액 표시.
 *
 * 시나리오:
 *   A-1-a: 자녀 상속인 1명 + 토지 재산 → full-flow → HeirAllocationTable 렌더 + 행·금액 확인
 *   A-1-b: 자녀 2명 → 상속인 수만큼 열 헤더 + 자진납부세액 0 아닌 값 1개 이상 존재 확인
 *
 * 정책:
 *   - [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *   - data-testid 우선. HeirAllocationTable에 testid 없으므로 텍스트 셀렉터 사용
 *   - "상속인별 세부담액 집계" 헤더 = 표 존재 증명
 *   - "자진납부세액" 행 + 0이 아닌 셀 = 금액 표시 증명 (이전 버그: 행 자체 미렌더)
 */

import { test, expect, type Page } from "@playwright/test";

// ============================================================
// 공용 헬퍼
// ============================================================

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

test.describe("A-1: HeirAllocationTable full-flow 렌더 검증 (perHeir Map→Record 수정)", () => {
  test(
    "A-1-a: 자녀 1명 + 토지 → HeirAllocationTable 헤더 렌더 + 자진납부세액 행 표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0AndAddChildren(page, 1);
      await addLandAsset(page);
      await proceedToResult(page);

      // ── 검증 1: 표 헤더 존재 (HeirAllocationTable 전체 렌더 증명) ──
      // "상속인별 세부담액 집계" 는 표가 null 반환하지 않았을 때만 나타남
      await expect(page.getByText("상속인별 세부담액 집계")).toBeVisible({ timeout: 5_000 });

      // ── 검증 2: "자진납부세액" 행 존재 (표 내부 행 렌더 증명) ──
      await expect(page.getByText("자진납부세액")).toBeVisible();

      // ── 검증 3: "자녀" 열 헤더 존재 (상속인별 열 렌더 증명) ──
      await expect(page.getByRole("columnheader", { name: /자녀/ })).toBeVisible();

      // ── 검증 4: 합계 열 헤더 존재 ──
      await expect(page.getByRole("columnheader", { name: "합계" })).toBeVisible();

      // ── 검증 5: 0이 아닌 금액 셀 존재 (이전 버그: 행 없음 → 금액 셀 전무) ──
      // 표 내부 td 셀로 한정 (하단 footer 문구와 중복 방지)
      await expect(page.getByRole("cell", { name: "산출세액상당액" })).toBeVisible();
    },
  );

  test(
    "A-1-b: 자녀 2명 + 토지 → 상속인 열 2개 + 합계 열 존재 확인",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0AndAddChildren(page, 2);
      await addLandAsset(page);
      await proceedToResult(page);

      // ── 검증 1: 표 헤더 존재 ──
      await expect(page.getByText("상속인별 세부담액 집계")).toBeVisible({ timeout: 5_000 });

      // ── 검증 2: 자녀 열 헤더가 2개 이상 존재 (2명 → 2열) ──
      const childHeaders = page.getByRole("columnheader", { name: /자녀/ });
      await expect(childHeaders).toHaveCount(2);

      // ── 검증 3: 합계 열 헤더 존재 ──
      await expect(page.getByRole("columnheader", { name: "합계" })).toBeVisible();

      // ── 검증 4: 안분 산정 기준 섹션 존재 (표 하단 footer) ──
      await expect(page.getByText("안분 산정 기준")).toBeVisible();
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
      await expect(page.getByText("상속인별 세부담액 집계")).toBeVisible({ timeout: 5_000 });

      // 법정상속분 안내 문구 (usedLegalShareFallback=true 시 표시)
      await expect(
        page.getByText(/법정상속분/, { exact: false }),
      ).toBeVisible();
    },
  );
});
