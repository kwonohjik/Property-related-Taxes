/**
 * E2E: 겸용주택 — PHD(§164⑦) 양도시 공시지가 → 상가 양도칸 자동 표시 + 자동합계 + 순서.
 *
 * 사용자 보고 재현(2026-07-15): PHD 3-시점 패널에 양도시 공시지가를 넣었는데도
 * ③ 상가의 "양도시 개별공시지가"가 비어 있고 "양도 상가부수토지 기준시가 (자동)"이 "—".
 * 취득시만 자동으로 나타났다 (취득측에만 read-through fallback이 있었음).
 *
 * 함께 검증: 시점 입력 순서가 취득 → 양도 (PHD 3-시점 법정 시계열과 정렬, PR ②).
 *
 * 정책: feedback_browser_verify_with_playwright · feedback_e2e_togglecard_setchecked
 */
import { test, expect, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function fillDateExact(
  scope: Locator,
  { year, month, day }: { year: string; month: string; day: string },
) {
  await scope.getByLabel("연도", { exact: true }).first().fill(year);
  await scope.getByLabel("월", { exact: true }).first().fill(month);
  await scope.getByLabel("일", { exact: true }).first().fill(day);
}

test.describe("겸용주택 — PHD 양도시 공시지가 fallback + 시점 순서", () => {
  test("PHD 양도 공시지가가 상가 양도칸·자동합계에 반영되고, 순서는 취득 → 양도", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await fillDateAndVerify(
      page,
      { year: "2025", month: "09", day: "01" },
      { scope: page.getByTestId("transfer-date") },
    );

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "1991",
      month: "09",
      day: "12",
    });

    // 면적 — 주택 100 / 상가 100, 전체 토지 200 → 상가부수토지 100㎡
    await page.getByPlaceholder("주택 전용면적").fill("100");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("100");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");
    await page.getByPlaceholder("전체 토지 면적").fill("200");

    // ── 시점 순서 검증: ③ 상가에서 취득칸이 양도칸보다 DOM상 먼저 (PR ②) ──
    const acqBuilding = page.getByPlaceholder("취득시 상가건물 기준시가 (필수)");
    const transferBuilding = page.getByPlaceholder("양도시 상가건물 기준시가");
    await expect(acqBuilding).toBeVisible();
    const orderOk = await page.evaluate(() => {
      const acq = document.querySelector('[placeholder="취득시 상가건물 기준시가 (필수)"]');
      const tr = document.querySelector('[placeholder="양도시 상가건물 기준시가"]');
      if (!acq || !tr) return false;
      return !!(acq.compareDocumentPosition(tr) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(orderOk, "③ 상가: 취득칸이 양도칸보다 먼저여야 함").toBe(true);

    // 상가건물 기준시가 직접 입력 (모달 대신 — 본 spec의 관심사는 공시지가 fallback)
    await acqBuilding.fill("50000000");
    await transferBuilding.fill("100000000");

    // ── PHD(§164⑦) ON — 여기 넣은 양도시 공시지가가 상가로 전파되어야 한다 ──
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).setChecked(true);

    // PHD 3-시점 공시지가 — 취득(①)·최초공시(②)·양도(③).
    // ThreePointStandardPriceInput은 기본 placeholder "원/㎡"를 쓴다(:411).
    // 상가 섹션은 "취득시/양도시 개별공시지가 /㎡"라 겹치지 않는다.
    const phdLandInputs = page.getByPlaceholder("원/㎡", { exact: true });
    await expect(phdLandInputs).toHaveCount(3);
    await phdLandInputs.nth(0).fill("2280000"); // 취득
    await phdLandInputs.nth(1).fill("1650000"); // 최초공시
    await phdLandInputs.nth(2).fill("6216000"); // 양도  ← 이 값이 상가로 전파되어야 함

    // ── 핵심 검증 1: 상가 양도 공시지가 칸에 PHD 값이 자동 표시 ──
    await expect(
      page.getByPlaceholder("양도시 개별공시지가 /㎡"),
      "PHD 양도 공시지가가 상가 양도칸에 read-through fallback 되어야 함",
    ).toHaveValue("6,216,000");

    // 취득측 대조군 — 종전부터 되던 동작(회귀 없어야 함)
    await expect(page.getByPlaceholder("취득시 개별공시지가 /㎡")).toHaveValue("2,280,000");

    // ── 핵심 검증 2: 자동합계가 "—"가 아니라 금액 ──
    // 상가부수토지 100㎡ × 6,216,000 = 621,600,000
    const transferLandRow = page
      .locator("div")
      .filter({ hasText: /^양도 상가부수토지 기준시가 \(자동\)/ })
      .last();
    await expect(transferLandRow).toContainText("621,600,000");

    // 합계 = 621,600,000 + 100,000,000(상가건물)
    const transferTotalRow = page
      .locator("div")
      .filter({ hasText: /^양도 상가부분 기준시가 합계 \(자동\)/ })
      .last();
    await expect(transferTotalRow).toContainText("721,600,000");

    // ── 검증 3: 면적 행이 취득(첫) 박스에 있다 (PR ②) ──
    await expect(page.getByText("상가부수토지 면적", { exact: true })).toBeVisible();
  });
});
