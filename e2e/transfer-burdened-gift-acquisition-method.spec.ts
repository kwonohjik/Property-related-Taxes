/**
 * E2E: 양도세 부담부증여 — 취득가액 산정방식 (K-4 실지 / K-5 환산)
 *
 * 시나리오 (양도세 마법사 /calc/transfer-tax):
 *   자산종류 주택 → 양도 형태 부담부증여 → 평가 유형 상증법 시가 →
 *   취득가액 산정방식 RadioCardGroup(신규) 노출 →
 *   K-5 환산 선택 → 환산 안내 노출 / K-4 실지 선택 → 실지취득가·자본적지출 입력 노출
 *
 * 검증: §100① 일치 게이트 신규 UI(bgAcquisitionMethod)가 시가 모드에서 렌더·토글되는지.
 *   데이터 파이프라인(폼→API→엔진)은 단위테스트·통합 anchor로 검증됨 — 본 E2E는 UI 흐름.
 *
 * 정책: worktree E2E_PORT=3102 (feedback_e2e_worktree_port_isolation)
 *   RadioCardGroup → <label>로 감싼 <input type="radio"> → getByRole("radio", { name })
 *   자산종류 → CompanionAssetCard 버튼 → getByRole("button", { name })
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("부담부증여 양도세 — 취득가액 산정방식 (K-4/K-5)", () => {
  test("시가 모드 → 취득방식 토글 노출 + K-5 환산/K-4 실지 조건부 UI", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    // 점진적 노출 — 기본정보(① 자산종류)·양도정보(② 부담부증여·산정방식) 펼침
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);

    // 자산 종류: 주택 (housing)
    await card.getByRole("button", { name: "주택", exact: true }).click();

    // 양도 형태: 부담부증여 → BurdenedGiftBlock 노출
    await card.getByRole("radio", { name: /부담부증여/ }).check();
    await expect(
      card.getByText("부담부증여 (소득세법 시행령 §159)"),
    ).toBeVisible();

    // 평가 유형: 상증법 시가 (기본은 기준시가 — 시가로 전환)
    await card.getByRole("radio", { name: /상증법 시가/ }).check();
    await expect(card.getByText("시가 모드 — 상증법 §60②~④")).toBeVisible();

    // 신규 UI: 취득가액 산정방식 RadioCardGroup 노출 (§100①)
    // ("취득가액 산정방식" 텍스트는 FieldCard 라벨 + CompanionAcqPurchaseBlock 안내 2곳 → 라디오로 검증)
    const convertedRadio = card.getByRole("radio", { name: /환산취득가액/ });
    const actualRadio = card.getByRole("radio", { name: /실지취득가액 안분/ });
    await expect(convertedRadio).toBeVisible();
    await expect(actualRadio).toBeVisible();

    /**
     * K-5 환산 선택 → 환산 산식 안내 노출 (§176의2②2호)
     *
     * 🔄 2026-08-23 정정 — 종전 단언은 `… × 취득시 기준시가 ÷ 양도시 기준시가`였다.
     *    PR #1240(2026-08-13, 산식 나눗셈 전면 분수 표기 통일)이 `BurdenedGiftBlock.tsx:370`의
     *    `÷`를 `<Frac top bottom />`으로 바꿨는데 **E2E spec은 함께 갱신되지 않았다**
     *    (#1240 커밋의 `e2e/` 변경 0건). `Frac`은 분자·분모를 별도 `<span>`으로 쌓아 올려
     *    `÷` 문자를 아예 렌더하지 않으므로 그 정규식은 영구히 매칭될 수 없다.
     *    ⇒ 분수 표기에서도 성립하는 형태로 바꾼다 — 문장 도입부 + 분자·분모 각각 + 근거 조문.
     *    (본 PR과 무관한 기존 실패다. 컴포넌트 소스가 origin/master와 동일함을 확인했다.)
     */
    await convertedRadio.check();
    await expect(convertedRadio).toBeChecked();
    const convertedNotice = card.getByText(/환산취득가액 = 양도가액\(채무액\) ×/);
    await expect(convertedNotice).toBeVisible();
    // 분수 표기(Frac) — 분자·분모가 각각 렌더된다
    await expect(convertedNotice.getByText("취득시 기준시가", { exact: true })).toBeVisible();
    await expect(convertedNotice.getByText("양도시 기준시가", { exact: true })).toBeVisible();
    // 근거 조문이 같은 안내 안에 있다
    await expect(convertedNotice).toContainText("시행령 §176의2②2호");

    // K-4 실지 선택 → 실지취득가 입력 + 자본적지출·양도비 노출 (§97①1호가목)
    await actualRadio.check();
    await expect(actualRadio).toBeChecked();
    await expect(card.getByText("실지취득가액 입력")).toBeVisible();
    await expect(card.getByText(/개산공제\(§163⑥ 3%\) 미적용/)).toBeVisible();
    await expect(
      card.getByText("실지취득가액 (주택·건물 전체)"),
    ).toBeVisible();
    await expect(card.getByText("자본적지출 (선택)")).toBeVisible();
    await expect(card.getByText("양도비 (선택)")).toBeVisible();

    // K-5로 되돌리면 실지취득가 입력 숨김 (조건부 토글 회귀)
    await convertedRadio.check();
    await expect(card.getByText("실지취득가액 입력")).toBeHidden();
  });
});
