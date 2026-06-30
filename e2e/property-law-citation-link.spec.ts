/**
 * E2E: 재산세 계산 마법사 법조문 링크 배지(LawArticleModal) → 조문 HTML 팝업
 *
 * 검증 대상: Phase 3에서 추가한 재산세 property 입력폼(Step1·Step3) 내 LawArticleModal 배지.
 *   LawArticleModal은 양도·상속·증여와 동일 공용 컴포넌트 — 팝업 헤더는 parseLawRef(props) 기반(법제처 API 무관 즉시 렌더).
 *
 * 진입: 재산세 마법사 Step0(기본 정보).
 *   - 주택(기본 선택) → 공시가격 총액 입력 → 다음 → Step3(주택 §122 단서 배지)
 *   - 토지 → 공시지가 단가+면적 → 다음 → Step1(토지 분류 §106 배지)
 *   ⚠️ 물건 유형은 RadioCardGroup = radio role (button 아님). 공시가격(주택)은 textbox "금액 입력".
 *
 * PLAW-1: 주택 부칙 §15·§122 배지(경과조치 ToggleCard ON 시 노출) 클릭 → 조문 팝업 헤더 "지방세법 제122조"
 * PLAW-2: 토지 §106 배지 클릭 → 헤더 "지방세법 제106조" + ESC 닫힘
 *
 * 비고: 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 팝업 헤더(법령명·조문번호, props 기반)만 단정.
 *       본문 텍스트는 비단정(transfer-law-citation-link.spec.ts 동일 철학).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/property-law-citation-link.spec.ts
 *   ⚠️ stale 서버 주의 — lsof -ti :3100 | xargs kill 후 실행.
 */
import { test, expect, type Page } from "@playwright/test";

/** 재산세 마법사 첫 화면(Step0 기본 정보) 도달 */
async function gotoPropertyStep0(page: Page) {
  await page.goto("/calc/property-tax");
  await page.getByRole("heading", { name: "기본 정보" }).waitFor();
}

test.describe("재산세 계산 마법사 법조문 링크 → 조문 팝업", () => {
  test("PLAW-1: 주택 부칙 §15·§122 배지 → 지방세법 제122조 팝업 헤더", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoPropertyStep0(page);

    // 물건 유형은 기본 "주택" 선택됨 → 공시가격 총액 직접 입력
    // /금액 입력/ 은 당해 공시가격(name "금액 입력") + 직전연도·건축물(name "금액 입력 (원)") 3개 매칭
    // → 당해 공시가격(DOM 첫 번째)으로 한정 (probe: error-context snapshot)
    await page.getByRole("textbox", { name: /금액 입력/ }).first().fill("500000000");

    // 다음 → 전년도 세액 단계 (주택: 부칙 §15 세부담상한 경과조치)
    await page.getByRole("button", { name: "다음" }).click();

    // §122 배지는 "부칙 제15조 세부담상한 경과조치" ToggleCard children(ON 시 렌더) 안에 있음 → 먼저 ON
    // (data-slot 카드로 좁혀 switch 직접 클릭 — label→switch 자동연결 안 됨, property-house-split 동일)
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "부칙 제15조 세부담상한 경과조치" })
      .first()
      .getByRole("switch")
      .click();

    // §122 배지 — 버튼 텍스트 "부칙 §15·§122 ↗" (label="부칙 §15·§122", legalBasis="지방세법 §122")
    const badge = page.getByRole("button", { name: /부칙 §15·§122/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // 조문 팝업 헤더 — props 기반(parseLawRef: "지방세법 §122" → "지방세법 제122조")
    await expect(
      page.getByRole("dialog").getByText("지방세법 제122조"),
    ).toBeVisible();
  });

  test("PLAW-2: 토지 §106 배지 → 지방세법 제106조 헤더 + ESC 닫힘", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoPropertyStep0(page);

    // 물건 유형: 토지 라디오 선택 (RadioCardGroup = radio role) → 단가 + 면적
    await page.getByRole("radio", { name: "토지", exact: true }).check();
    await page.getByPlaceholder("공시지가 단가").fill("1000000");
    await page.getByPlaceholder("면적 입력").fill("300");

    // 다음 → step 1 (토지 분류)
    await page.getByRole("button", { name: "다음" }).click();

    // §106 배지 — 버튼 텍스트 "지방세법 §106 ↗"
    const badge = page.getByRole("button", { name: /지방세법 §106/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // parseLawRef: "지방세법 §106" → "지방세법 제106조"
    const title = page.getByRole("dialog").getByText("지방세법 제106조");
    await expect(title).toBeVisible();

    // ESC로 조문 팝업 닫힘
    await page.keyboard.press("Escape");
    await expect(title).toBeHidden();
  });
});
