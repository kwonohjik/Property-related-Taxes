/**
 * transfer-multi-pre1990-land.spec.ts
 *
 * 회귀 방지: 다건(연간 합산) 양도 계산기에서 "1990.8.30. 이전 취득 토지 기준시가 환산"이
 * 더 이상 차단되지 않고, 실제 계산까지 도달해야 한다.
 *
 * 과거 버그: validateMultiSupportedMode가 pre1990을 명시 차단
 *   ("…단건 계산기에서만 지원됩니다.") — buildPropertyPayload가 pre1990Land sub-object를
 *   구성하지 않았기 때문. (수정: 차단 삭제 + payload에 pre1990Land 구성 — Zod·route⑭·엔진은 기지원.)
 *
 * 검증:
 *   1) 차단 메시지가 뜨지 않는다.
 *   2) POST /api/calc/transfer/multi request body의 properties[0]에 pre1990Land가 실려간다
 *      (브라우저 Network 확인 자동화).
 *   3) 계산 결과가 렌더된다.
 *
 * 셀렉터는 단건 pre1990 스펙(transfer-pre1990-land-transfer-stdprice.spec.ts, green)을 재사용.
 * 다건 편집 단계는 단건 마법사(TransferTaxCalculator)를 그대로 재사용하므로 위젯 셀렉터 동일.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

test.describe("다건 양도 — 1990.8.30. 이전 취득 토지 환산 지원", () => {
  test("차단 없이 계산 도달 + request body에 pre1990Land 포함", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    // 마운트 시 편집 모드(빈 자산 1건) — 편집 대상 = 단건 마법사 재사용
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("02");
    await page.getByTestId("transfer-date").getByLabel("일").fill("18");
    await page.getByTestId("filing-date").getByLabel("연도").fill("2026");
    await page.getByTestId("filing-date").getByLabel("월").fill("04");
    await page.getByTestId("filing-date").getByLabel("일").fill("30");

    // 점진적 노출 — ① 기본 / ② 양도 / ③ 취득 펼침
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 토지·농지 → 독립 나대지 → 면적 2417 → 양도가액 20억
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("2417");
    await getInputByLabel(page, "양도가액 (원)").fill("2000000000");

    // 매매 → 환산취득가 (pre1990은 useEstimatedAcquisition=true 선행)
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("radio", { name: "환산취득가" }).click();
    await page.waitForTimeout(300);

    // 취득일 1985-03-01 (< 1990-08-30) → pre1990 환산 자동 활성화
    await page.getByLabel("연도", { exact: true }).nth(2).fill("1985");
    await page.getByLabel("월", { exact: true }).nth(2).fill("03");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");
    await page.waitForTimeout(700);

    // pre1990 입력: 1990.8.30. 개별공시지가 + 토지등급 3개(등급번호 모드 기본).
    // 등급 입력은 label 기반 타겟 (placeholder는 gradeMode에 따라 "등급 번호"/"등급가액"으로 가변).
    await page.getByPlaceholder("㎡당 가액 입력").fill("100000");
    await getInputByLabel(page, "현재 등급").first().fill("100");
    await getInputByLabel(page, "직전 등급").first().fill("100");
    await getInputByLabel(page, "취득시 유효 등급").first().fill("100");

    // 양도시 기준시가 ㎡당 단가 (양도시 섹션 스코프)
    await page
      .locator('div:has(> label:has-text("양도시 기준시가"))')
      .getByPlaceholder("공시지가 단가")
      .fill("222200");
    await page.waitForTimeout(300);

    // 자산 목록으로 저장 → 공통 설정 단계
    await page.getByRole("button", { name: "자산 목록으로" }).first().click();
    await page.getByRole("button", { name: /공통 설정으로/ }).click();

    // 세액 계산 — 요청/응답 가로채기 (pre1990Land 전송 + 200 확인)
    const reqPromise = page.waitForRequest(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.method() === "POST",
      { timeout: 15000 },
    );
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    const req = await reqPromise;
    const resp = await respPromise;

    // 핵심 1: request body properties[0]에 pre1990Land가 실려간다 (⑬ 브라우저 실증)
    const body = JSON.parse(req.postData() ?? "{}");
    expect(body.properties?.[0]?.pre1990Land).toBeTruthy();
    expect(body.properties[0].pre1990Land.areaSqm).toBe(2417);
    expect(body.properties[0].pre1990Land.pricePerSqm_1990).toBe(100000);

    // 핵심 2: 차단 없이 서버가 정상 계산(200)
    expect(resp.status()).toBe(200);

    // 핵심 3: 차단 메시지가 뜨지 않는다
    await expect(page.getByText(/단건 계산기에서만 지원됩니다/)).toHaveCount(0);

    // 핵심 4: 계산 결과 렌더 — 다건 결과 뷰 최종 총액 라벨("납부할 세액", visible)
    await expect(page.locator(':text("납부할 세액"):visible').first()).toBeVisible({
      timeout: 15000,
    });
  });
});
