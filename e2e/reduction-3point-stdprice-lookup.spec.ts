/**
 * 감면소득금액 차감 조문 — 3시점 기준시가 조회형 + PHD 환산 UI E2E (§99 대표)
 *
 * 검증: §99 신축주택 감면의 기준시가 섹션(공용 ReductionStdPriceSection)이
 *   ① 취득·5년·양도 3시점 모두 조회형 위젯(HousingStdPriceLookupField)으로 렌더되고
 *   ② PHD 환산 토글 ON 시 취득시 기준시가가 §164⑤ echo(자동 산출)로 전환된다(취득 조회형 숨김).
 *   (PR #810 — 계획 reduction-stdprice-lookup-phd-unification.plan.md)
 *
 * 조회 실동작(주소검색→공시가격 조회→값 반영)은 동일 컴포넌트를 쓰는
 * reduction-994-stdprice-lookup.spec.ts(§99의4)가 커버 → 본 스펙은 3시점 렌더 + PHD echo에 집중.
 */
import { test, expect } from "@playwright/test";

test.describe("§99 3시점 기준시가 조회형 + PHD 환산", () => {
  test("3시점 조회형 위젯 3개 렌더 + PHD 환산 토글 → 취득시 echo 전환", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 양도일 입력 후 감면·공제 → 신축주택 그룹 → §99 ──
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2010");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");
    await page.getByRole("button", { name: "감면·공제" }).click();
    await page.getByRole("button", { name: /신축주택/ }).first().click();
    await page.getByText("§99 — 신축주택 양도세 감면", { exact: false }).first().click();

    // ── ① 3시점 조회형 위젯(취득·5년·양도) 모두 렌더 ──
    // 각 시점이 순수 CurrencyInput이 아닌 "공시가격 조회" 버튼(HousingStdPriceLookupField)을 가진다.
    await expect(page.getByTestId("new99-stdprice-acq-lookup-btn")).toBeVisible();
    await expect(page.getByTestId("new99-stdprice-5y-lookup-btn")).toBeVisible();
    await expect(page.getByTestId("new99-stdprice-transfer-lookup-btn")).toBeVisible();
    // 조회형 위젯의 연도 Select도 3시점 각각 존재
    await expect(page.getByTestId("new99-stdprice-acq-year-select")).toBeVisible();
    await expect(page.getByTestId("new99-stdprice-5y-year-select")).toBeVisible();

    // ── ② PHD 환산 토글 ON → 취득시 기준시가가 echo(§164⑤ 자동 산출)로 전환 ──
    // (신축주택은 취득 당시 주택가격 공시 전 → PHD 환산으로 취득시 기준시가 도출)
    await expect(page.getByTestId("new99-stdprice-acq-echo")).toHaveCount(0); // PHD OFF: echo 없음
    await page.getByText(/PHD 환산 — 최초공시 전 취득/).first().click();
    await expect(page.getByTestId("new99-stdprice-acq-echo")).toBeVisible(); // PHD ON: echo 표시
    // PHD ON 시 취득 조회형 위젯은 숨김(echo 대체) — 5년·양도 조회형은 유지
    await expect(page.getByTestId("new99-stdprice-acq-lookup-btn")).toHaveCount(0);
    await expect(page.getByTestId("new99-stdprice-5y-lookup-btn")).toBeVisible();
  });
});
