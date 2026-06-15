/**
 * E2E: 취득세 마법사 법조문 링크(TaxHelp → LawArticleModal) → 조문 HTML 팝업
 *
 * 검증 대상: 2/2에서 정정한 입력폼 인용이 실제 팝업으로 정확히 연결되는지.
 *   취득세 입력폼은 TaxHelp(ⓘ) 내부에 LawArticleModal을 중첩 — 2단계:
 *     ⓘ(aria-label "도움말: {title}") 클릭 → TaxHelp Dialog → "관련 조문" LawArticleModal 배지 클릭 → 조문 Dialog
 *   LawArticleModal 헤더 = parseLawRef(props) 기반 DialogTitle "법령명 제N조" (법제처 API 무관 즉시 렌더).
 *
 * ALAW-1: Step0 원시취득 도움말 → 지방세법 제11조 팝업 (구 §7② 드리프트 → §11①3호·§10의4 정정)
 * ALAW-2: Step1 사치성 도움말 → 지방세법 제13조 팝업 + ESC (구 §13① 드리프트 → §13⑤ 정정)
 *
 * 비고: 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 팝업 헤더(DialogTitle, props 기반)만 단정.
 *       본문 텍스트는 비단정 (property-law-citation-link.spec.ts 동일 철학).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/acquisition-law-citation-link.spec.ts
 *   ⚠️ stale 서버 주의 — lsof -ti :3100 | xargs kill 후 실행.
 */
import { test, expect, type Page } from "@playwright/test";

/** 취득세 마법사 Step0(취득 정보) 도달 */
async function gotoAcquisitionStep0(page: Page) {
  await page.goto("/calc/acquisition-tax");
  await expect(page.getByPlaceholder("계약서상 거래금액")).toBeVisible();
}

test.describe("취득세 마법사 법조문 링크 → 조문 팝업", () => {
  test("ALAW-1: Step0 원시취득 도움말 → 지방세법 제11조 팝업", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoAcquisitionStep0(page);

    // 취득 원인 카드 헤더의 TaxHelp ⓘ (원시취득 — §11①3호·§10의4, 구 §7② 정정)
    await page
      .getByRole("button", { name: "도움말: 신축·증축 취득 (원시취득)" })
      .click();

    // TaxHelp 모달 → "관련 조문" LawArticleModal 배지 (legalBasis "지방세법 제11조 제1항 제3호")
    const badge = page.getByRole("button", { name: /지방세법 제11조/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // 조문 팝업 헤더 — parseLawRef props: "지방세법 제11조 제1항 제3호" → "지방세법 제11조"
    await expect(
      page.getByRole("heading", { name: "지방세법 제11조" }),
    ).toBeVisible();
  });

  test("ALAW-2: Step1 사치성 도움말 → 지방세법 제13조 팝업 + ESC", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoAcquisitionStep0(page);

    // 거래금액 입력 후 Step1(물건 상세)로 이동
    await page.getByPlaceholder("계약서상 거래금액").fill("600000000");
    await page.getByRole("button", { name: /다음/ }).click();

    // Step1 사치성 재산 ToggleCard trailing의 TaxHelp ⓘ (구 §13① → §13⑤ 정정)
    await page
      .getByRole("button", { name: "도움말: 사치성 재산 정의 및 판정 기준" })
      .click();

    // TaxHelp 모달 → LawArticleModal 배지 (legalBasis "지방세법 제13조 제5항")
    const badge = page.getByRole("button", { name: /지방세법 제13조/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // 조문 팝업 헤더 — "지방세법 제13조 제5항" → "지방세법 제13조"
    const header = page.getByRole("heading", { name: "지방세법 제13조" });
    await expect(header).toBeVisible();

    // ESC로 닫힘
    await page.keyboard.press("Escape");
    await expect(header).not.toBeVisible();
  });
});
