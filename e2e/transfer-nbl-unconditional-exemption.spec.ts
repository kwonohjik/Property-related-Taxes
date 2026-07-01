/**
 * transfer-nbl-unconditional-exemption.spec.ts
 *
 * 비사업용 토지 "무조건 사업용 의제"(§168-14③) — UI가 엔진 실제 판정을 반영하는지 검증.
 *
 * 배경(수정 전 버그): 배너·지목별 비활성이 토글 ON 여부만 보고 결정되어, 공익수용 토글을 켜고
 * 요건 미충족 날짜(고시일 2017 + 취득일 2015)를 넣어도 "무조건 사업용·지목별 건너뜀"으로 오표시하고
 * 지목별 입력을 잠갔다. 수정 후에는 엔진 판정(가목 고시일≤2006.12.31 / 나목 취득일≤고시일−5년)에 따라
 * 미충족이면 지목별 판정을 유지하고, 충족이면 건너뛴다.
 *
 * 실행(비-worktree, 기본 3000): npx playwright test e2e/transfer-nbl-unconditional-exemption.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** FieldCard/CurrencyInput 라벨 → 내부 input (scope 한정 가능) */
function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input")
    .first();
}

test.describe("비사업용 토지 무조건 의제 — UI가 엔진 판정 반영", () => {
  test("공익수용: 요건 미충족 시 지목별 유지, 충족 시 건너뜀", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-02-18
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("02");
    await page.getByTestId("transfer-date").getByLabel("일").fill("18");

    // 점진적 노출 — 기본정보(①)·양도정보(②)·취득정보(③)
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 단순토지 → 독립 나대지 → 면적
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("300");

    // 양도가액
    await inputByLabel(page, "양도가액 (원)").fill("1000000000");

    // 취득원인 매매 → 환산취득가 (취득일 입력칸 노출)
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    // 취득일 2015-06-01 (고시일 2017-04-23 기준 5년 이내 → 미충족 케이스)
    await page.getByLabel("연도", { exact: true }).nth(2).fill("2015");
    await page.getByLabel("월", { exact: true }).nth(2).fill("06");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");

    // 보유 상황(Step4) → 비사업용 스위치 ON → 판정 도움
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("switch", { name: /비사업용 토지/ }).click();
    await page.getByText("판정 도움 필요", { exact: true }).click();

    // 무조건 사업용 판정 섹션 — 공익사업으로 수용 토글 ON
    await page.getByRole("switch", { name: /공익사업으로 수용/ }).click();

    // 사업인정고시일 2017-04-23 (취득일 2015 → 5년 이내 → 미충족)
    const noticeGroup = page.locator('label:has-text("사업인정고시일")').locator("xpath=..");
    await noticeGroup.getByLabel("연도", { exact: true }).fill("2017");
    await noticeGroup.getByLabel("월", { exact: true }).fill("04");
    await noticeGroup.getByLabel("일", { exact: true }).fill("23");

    const wrapper = page.getByTestId("nbl-per-category");

    // ── 미충족 단언: 지목별 유지 + amber 안내 + 미충족 뱃지, 확정 배너 없음 ──
    await expect(page.getByText("요건 미충족")).toBeVisible();
    await expect(
      page.getByText(/아직 무조건 사업용 의제 요건을 충족하지 않아/),
    ).toBeVisible();
    await expect(wrapper).not.toHaveClass(/pointer-events-none/);
    await expect(page.getByText(/엔진이 무조건 사업용으로 판정합니다/)).toHaveCount(0);

    // ── 고시일을 2005-01-01 로 변경 (가목: ≤2006.12.31 → 충족) ──
    await noticeGroup.getByLabel("연도", { exact: true }).fill("2005");
    await noticeGroup.getByLabel("월", { exact: true }).fill("01");
    await noticeGroup.getByLabel("일", { exact: true }).fill("01");

    // ── 충족 단언: 확정 배너 + 충족 뱃지 + 지목별 건너뜀(비활성) ──
    await expect(page.getByText("요건 충족")).toBeVisible();
    await expect(page.getByText(/엔진이 무조건 사업용으로 판정합니다/)).toBeVisible();
    await expect(wrapper).toHaveClass(/pointer-events-none/);

    console.log("✅ NBL 무조건 의제 — 미충족 시 지목별 유지, 충족 시 건너뜀 확인");
  });

  // 회귀: 의제 충족(지목 비활성) 상태에서 계산 진행 시 "지목을 선택" 검증 차단이 없어야 한다.
  // (수정 전 버그: UI는 지목 비활성인데 validate가 지목 필수 요구 → 계산 불가)
  test("공익수용 충족 + 지목 미선택 → 계산 통과 + 결과에 사업용 판정 표시", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2024-05-01
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 단순토지 → 독립 나대지 → 면적
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("300");

    // 양도가액
    await inputByLabel(page, "양도가액 (원)").fill("1000000000");

    // 취득원인 매매 → 실거래(환산 미토글) → 취득가액 + 취득일 2018-01-01
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await inputByLabel(page, "취득가액 (원)").fill("400000000");
    await page.getByLabel("연도", { exact: true }).nth(2).fill("2018");
    await page.getByLabel("월", { exact: true }).nth(2).fill("01");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");

    // 보유 상황 → 비사업용 스위치 → 판정 도움 → 공익수용 토글 + 고시일 2005(가목 충족)
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("switch", { name: /비사업용 토지/ }).click();
    await page.getByText("판정 도움 필요", { exact: true }).click();
    await page.getByRole("switch", { name: /공익사업으로 수용/ }).click();
    const noticeGroup = page.locator('label:has-text("사업인정고시일")').locator("xpath=..");
    await noticeGroup.getByLabel("연도", { exact: true }).fill("2005");
    await noticeGroup.getByLabel("월", { exact: true }).fill("01");
    await noticeGroup.getByLabel("일", { exact: true }).fill("01");

    // 충족 + 지목 비활성 확인 (지목 미선택 상태)
    await expect(page.getByText("요건 충족")).toBeVisible();
    await expect(page.getByTestId("nbl-per-category")).toHaveClass(/pointer-events-none/);

    // 감면·공제 → 가산세 → 계산하기
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "가산세" }).first().click();

    const calcResp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResp;
    // 수정 전에는 클라이언트 검증이 차단해 POST 자체가 발생하지 않음 → 이 대기가 timeout(=버그)
    expect(resp.ok(), `계산 API ${resp.status()} — 지목 검증 차단 의심`).toBe(true);

    // 결과: 비사업용토지 판정 카드(사업용/무조건 의제) 표시 + 지목 오류 없음
    await expect(page.getByText("비사업용토지 판정 결과")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/지목을 선택하세요/)).toHaveCount(0);

    console.log("✅ NBL 무조건 의제 — 지목 미선택이어도 계산 통과 + 결과 판정 표시 확인");
  });
});
