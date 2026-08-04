/**
 * E2E: 겸용주택 상가건물 기준시가 모달 — 개별공시지가 자동입력(prefill)
 *
 * 사용자 시나리오(PHD ON + 용도변경 없음 + 취득 ≤2000):
 *   주택분 3시점 배치 모달에서 "취득시 (2001년 기준) 공시지가"를 입력했는데,
 *   상가 섹션 모달을 열면 같은 값을 다시 입력해야 했다.
 *   종전 ThreePointStandardPriceInput의 applyBatch가 ≤2000 취득 공시지가를 **드롭**했기 때문
 *   (받을 그릇 부재 — phdLandPricePerSqmAtAcq는 취득당시 연도 토지값 트랙이라 넣으면 오염).
 *   → 전용 필드 phdLandPricePerSqmAtAcq2001 신설 + 상가 모달 prefill.
 *
 * 계획: docs/02-design/features/mixed-use-commercial-stdprice-modal-landprice-prefill.plan.md
 * 셀렉터 출처: e2e/transfer-phd-building-stdprice-calculator.spec.ts (검증된 PHD 배치 패턴)
 * 정책: feedback_browser_verify_with_playwright · feedback_e2e_togglecard_setchecked
 *
 * 비-worktree 실행: npx playwright test e2e/mixed-use-commercial-stdprice-landprice-prefill.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function fillDateExact(
  scope: Locator,
  d: { year: string; month: string; day: string },
) {
  await scope.getByLabel("연도", { exact: true }).first().fill(d.year);
  await scope.getByLabel("월", { exact: true }).first().fill(d.month);
  await scope.getByLabel("일", { exact: true }).first().fill(d.day);
}

function phdSection(page: Page) {
  // ⚠️ 겸용 패널 헤더는 "개별주택가격 미공시 취득"(MixedUsePreHousingDisclosureSection.tsx:106).
  // 단독 패널(PreHousingDisclosureSection)의 "주택공시가격 미공시 취득"과 문구가 다르다.
  return page
    .locator("div.bg-primary\\/5")
    .filter({ hasText: "개별주택가격 미공시 취득 (3-시점 환산)" })
    .first();
}

/** 겸용주택 + 취득 1997(≤2000) + 양도 2026 + PHD ON */
async function setupMixedUsePre2001PhdAsset(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("02");
  await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("16");

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  // ⚠️ setChecked 불가 — base-ui Switch는 <span role="switch">라 "Not a checkbox or radio button" 에러.
  // 형제 스펙(mixed-use-asset-major-commercial-modal.spec.ts:49)에서 검증된 .click() 사용.
  await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();

  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("button", { name: "환산취득가" }).click();
  // 취득 1997 → ≤2000 → 위치지수는 2001.1.1 기준 트랙(§164⑤)
  //
  // ⚠️ **`acq-date-building` 스코프 필수**. 겸용주택 토글이 `hasSeperateLandAcquisitionDate`를
  //    강제 ON 하므로(`MixedUseSection.tsx:44-50`) 취득일이 `[토지 | 건물]` 2열이 되는데,
  //    섹션 스코프 + `.first()`는 앞 칸인 **토지 취득일**을 잡는다. 그러면 `acquisitionDate`가
  //    빈 채로 남아 3시점 모달의 취득 시점 `p.year`가 undefined가 되고,
  //    `isAcqPre2001`(`MultiPointBuildingStdPriceModal.tsx:416-417`)이 false로 떨어져
  //    「2001.1.1. 현재 공시지가」 전용 행이 아예 렌더되지 않는다
  //    (계획서 e2e-preexisting-failures-4.plan.md §9-N1).
  await fillDateExact(page.getByTestId("acq-date-building"), {
    year: "1997",
    month: "09",
    day: "12",
  });

  await page.getByPlaceholder("주택 전용면적").fill("120");
  await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
  await page.getByPlaceholder("건축물대장의 건축면적").fill("100");

  // PHD(개별주택가격 미공시 §164⑦) ON — 주택분 3시점 환산 경로
  // ⚠️ 이 토글은 .click()이 먹지 않는다(focus만·aria-checked false 유지) → setChecked 필수.
  // 검증 출처: mixed-use-transfer-landprice-fallback.spec.ts:75 (통과 중). 두 토글의 동작이
  // 비일관적이라 형제 스펙에서 통과가 확인된 방식을 각각 그대로 쓴다([[feedback_e2e_togglecard_setchecked]]).
  await page.getByRole("switch", { name: /개별주택가격 미공시/ }).setChecked(true);
}

test.describe("겸용주택 상가 모달 — 개별공시지가 자동입력", () => {
  test("취득 ≤2000: 배치 모달의 2001.1.1 공시지가가 상가 모달 취득칸에 자동 채움", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await setupMixedUsePre2001PhdAsset(page);

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    // ── 주택분 3시점 배치 모달 — 취득시(≤2000) 2001.1.1 공시지가 입력 ──
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const batch = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(batch).toBeVisible();

    await batch.getByPlaceholder("신축연도 (4자리)").fill("1995");

    // 시점별 구조·용도 — 최초공시일 미설정 → 취득·양도 2시점 블록만 렌더될 수 있으므로 소진식으로 채움
    while ((await batch.getByText("구조 선택").count()) > 0) {
      await batch.getByText("구조 선택").first().click();
      await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    }
    while ((await batch.getByText("용도 선택").count()) > 0) {
      await batch.getByText("용도 선택").first().click();
      await page.getByRole("option", { name: /단독주택|아파트/ }).first().click();
    }

    // 취득시(≤2000)는 fixedYear=2001 전용 행 — placeholder로 특정
    await batch.getByPlaceholder("2001.1.1. 현재 공시지가").fill("1200000");
    // 양도시는 일반 "원/㎡" 행 — 마지막이 양도
    await batch.getByPlaceholder("원/㎡").last().fill("6216000");

    await batch.getByRole("button", { name: "3시점 계산하기" }).click();
    await batch.getByRole("button", { name: /모두 적용/ }).click();
    await expect(batch).toBeHidden();

    // ── 상가 섹션 모달 — 취득 위치지수 칸이 2001.1.1 값으로 자동 채움 ──
    // ⚠️ `name`은 **substring 매칭**이라(e2e/CLAUDE.md §2) 축 A의
    //    「**양도시** 건물 기준시가 계산」 런처까지 잡힌다. 2026-07-29 축 A 분리·재배치로
    //    겸용 화면에 그 런처가 새로 생기면서 `.first()`가 상가 런처가 아닌 그것을 열었고,
    //    2001 칸은 있으나 상가 prefill이 없어 빈 값으로 실패했다(계획서 §9-N1).
    //    → 「③ 상가 기준시가」 섹션으로 스코프를 한정한다.
    const commercialSection = page
      .locator("div")
      .filter({ hasText: /상가건물 기준시가 \(토지 제외\)/ })
      .last();
    await commercialSection.getByRole("button", { name: "건물 기준시가 계산" }).first().click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // 핵심 단언: 배치 모달에 입력한 2001.1.1 값이 재입력 없이 채워진다 (본 건 해결)
    await expect(modal.getByPlaceholder("2001.1.1. 현재 공시지가")).toHaveValue("1,200,000");
    // 양도당시 공시지가도 자동 채움(같은 필지·같은 시점)
    await expect(modal.getByPlaceholder("원/㎡").last()).toHaveValue("6,216,000");
  });
});
