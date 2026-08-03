/**
 * E2E: 양도소득세 계산 마법사 법조문 링크 배지(LawArticleModal) → 조문 HTML 팝업
 *
 * 검증 대상: Phase 3 후속 선별 전수에서 추가한 양도세 transfer 컴포넌트 내 LawArticleModal 배지.
 *   (기존 e2e/law-article-popup.spec.ts는 /law 리서치 페이지의 ArticleModal — 별개 컴포넌트)
 *
 * 진입점: 양도세 마법사 Step1 자산 카드(data-asset-card-index="0")의 "취득 원인" 라디오.
 *   - 증여(gift) 선택 → CompanionAcqGiftBlock 의 §97①1호 배지
 *   - 상속(inheritance) 선택 → CompanionAcqInheritanceBlock 의 소령 §163⑨ / 상증법 §61 배지
 *   기본 자산(assetKind="housing", acquisitionCause="purchase")은 페이지 로드 시 즉시 렌더되어
 *   추가 자산·자산종류 선택 없이 취득 원인 라디오만 클릭하면 배지에 도달 — 가장 단순 경로.
 *
 * TLAW-1: 증여 취득 §97①1호 배지 클릭 → 조문 팝업 헤더 "소득세법 제97조" (parseLawRef props 기반)
 * TLAW-2: 약칭 라벨(소령 §163⑨) 배지 클릭 → 정식명 헤더 "소득세법 시행령 제163조" 변환 + ESC 닫힘
 *
 * 비고: 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 팝업 헤더(법령명·조문번호, props 기반)만 단정.
 *       본문 텍스트는 비단정(law-article-popup.spec.ts·inheritance-gift-law-citation-link.spec.ts 동일 철학).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/transfer-law-citation-link.spec.ts
 *   ⚠️ stale 서버 주의 — lsof -ti :3102 | xargs kill 후 실행.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 양도세 마법사 첫 화면(Step1) 도달 — 기본 자산 카드가 즉시 렌더됨 */
async function gotoTransferStep1(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 기본 단일 자산 카드(증여/상속 취득 원인 라디오 포함)가 렌더되어 있어야 함
  await expect(page.locator('[data-asset-card-index="0"]')).toBeVisible();
  // 점진적 노출 — 취득정보(③ 취득원인 라디오·법조문 배지) 펼침
  await expandAssetSection(page, 3);
}

test.describe("양도세 계산 마법사 법조문 링크 → 조문 팝업", () => {
  test("TLAW-1: 증여 취득 §97①1호 배지 → 소득세법 제97조 팝업 헤더", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoTransferStep1(page);

    const card = page.locator('[data-asset-card-index="0"]');

    // 취득 원인: "증여" 라디오 선택 → CompanionAcqGiftBlock(§97①1호 배지) 렌더
    await card.getByRole("button", { name: "증여", exact: true }).click();

    // §97①1호 배지 — 버튼 텍스트는 "§97①1호 ↗"
    const badge = card.getByRole("button", { name: /§97①1호/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // 조문 팝업 헤더 — props 기반(parseLawRef 결과, 법제처 API 무관 즉시 렌더)
    // legalBasis="소득세법 §97 ① 1호" → {소득세법, "97"} → "소득세법 제97조"
    await expect(
      page.getByRole("dialog").getByText("소득세법 제97조"),
    ).toBeVisible();
  });

  test("TLAW-2: 약칭 라벨(소령 §163⑨) 배지 → 정식명 시행령 제163조 헤더 + ESC 닫힘", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoTransferStep1(page);

    const card = page.locator('[data-asset-card-index="0"]');

    // 취득 원인: "상속" 라디오 선택 → CompanionAcqInheritanceBlock(소령 §163⑨ 배지) 렌더
    // §163⑨ 배지는 **상가·겸용** 상속에만 렌더된다(CompanionAcqInheritanceBlock.tsx:113·138).
    // 일반 주택 상속에는 없으므로 자산 종류를 상업용건물로 먼저 바꾼다.
    // 자산 카드는 진입 시 전부 접힘이라 ① 기본 섹션을 펼쳐야 종류 라디오가 렌더된다.
    await expandAssetSection(page, 1);
    await card.getByRole("button", { name: "상업용건물·오피스텔", exact: true }).click();
    await card.getByRole("button", { name: "상속", exact: true }).click();

    // 배지 라벨은 약칭 "소령 §163⑨" — legalBasis 정식명은 "소득세법 시행령 §163 ⑨"
    const badge = card.getByRole("button", { name: /소령 §163⑨/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // parseLawRef: "소득세법 시행령" → 정식명 그대로, §163 → 제163조
    // (라벨은 약칭 "소령"이지만 헤더는 정식명 "소득세법 시행령"으로 표시)
    const dialogTitle = page
      .getByRole("dialog")
      .getByText("소득세법 시행령 제163조");
    await expect(dialogTitle).toBeVisible();

    // ESC로 조문 팝업 닫힘
    await page.keyboard.press("Escape");
    await expect(dialogTitle).toBeHidden();
  });
});
