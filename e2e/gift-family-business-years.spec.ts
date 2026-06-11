/**
 * E2E: 증여세 §30의6① 가업 영위기간 한도 분기 + 특례 귀속 카테고리 차단
 *
 * 가업승계 특례는 "주식 또는 출자지분"만 대상(§30의6①) — 자산은 상장주식으로 입력.
 * 350억 = 전후 2개월 종가평균 1,000,000원/주 × 35,000주 (상증법 §63①1가)
 *
 * 시나리오 [E2E-GFY-1] (영위 25년 → 한도 400억, 초과 없음):
 *   request body: creditInput.familyBusinessYears === 25 (⑬⑭ 도달 검증)
 *   결과: finalTax 5,600,000,000 (340억 과세표준 → 120억 10% + 220억 20%)
 *
 * 시나리오 [E2E-GFY-2] (미입력 → 기본 10년 한도 300억, 초과 50억 일반 이관):
 *   결과: finalTax 6,554,550,000 (특례 46억 + 일반 1,954,550,000)
 *
 * 시나리오 [E2E-GFY-3] (카테고리 차단 — R3 잔여 해소):
 *   토지 + family_business → Selector "특례 귀속 불가 재산" 경고 + 계산 차단
 *
 * 주의사항:
 *   - worktree 실행 시 E2E_PORT 격리 필수. 3100이 타 worktree dev 서버에 점유될 수
 *     있음 — lsof -p로 cwd 확인 (memory: feedback_e2e_worktree_port_isolation)
 */
import { test, expect } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

type PageT = Parameters<typeof fillDateAndVerify>[0];

// 헬퍼: 상장주식 자산 추가 — 종목명·주식수·종가평균 수동 입력 (§63①1가)
async function addListedStockAsset(
  page: PageT,
  opts: { name: string; shares: string; avgPrice: string },
): Promise<void> {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /상장주식/ }).first().click();

  // 종목명 (typeahead — 자유 텍스트 입력 허용)
  await page
    .getByPlaceholder(/종목명 검색 또는 자동조회 시 자동 입력/)
    .fill(opts.name);
  // 보유 주식 수
  await page.getByTestId("ls-security-info-shares").fill(opts.shares);
  // 전후 2개월 종가 단순평균
  await page.getByTestId("ls-avg-price").fill(opts.avgPrice);
}

async function setupFamilyBusinessStep3(page: PageT) {
  await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 상장주식 350억 (1,000,000원/주 × 35,000주)
  await addListedStockAsset(page, {
    name: "가업주식회사",
    shares: "35000",
    avgPrice: "1000000",
  });

  await nextSteps(page, 2); // Step1 → Step2 → Step3

  // Step3: 가업승계 선택 → 영위기간 필드 노출
  await page.getByText("가업승계 증여세 과세특례 (§30의6)").click();
  await expect(page.getByText("부모 가업 영위기간 (§30의6①)")).toBeVisible();
}

test.describe("§30의6① 가업 영위기간 — 한도 분기 + 카테고리 차단", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("[E2E-GFY-1] 상장주식 350억 · 영위 25년 → body 도달 + 한도 400억 finalTax 56억", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setupFamilyBusinessStep3(page);

    await page.getByPlaceholder("영위 기간 입력").fill("25");

    const reqPromise = page.waitForRequest(
      (req) => req.url().includes("/api/calc/gift") && req.method() === "POST",
    );
    await calcAndWaitResult(page, { taxType: "gift" });
    const req = await reqPromise;
    const body = req.postDataJSON() as {
      creditInput: { familyBusinessYears?: number };
    };
    expect(body.creditInput.familyBusinessYears).toBe(25);

    // 한도 400억(20년 이상 30년 미만) → 초과 없음 → finalTax 56억
    await expect(page.getByText("5,600,000,000").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[E2E-GFY-2] 미입력(기본 10년·한도 300억) → 초과 50억 일반 이관 finalTax 6,554,550,000", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setupFamilyBusinessStep3(page);

    const reqPromise = page.waitForRequest(
      (req) => req.url().includes("/api/calc/gift") && req.method() === "POST",
    );
    await calcAndWaitResult(page, { taxType: "gift" });
    const req = await reqPromise;
    const body = req.postDataJSON() as {
      creditInput: { familyBusinessYears?: number };
    };
    expect(body.creditInput.familyBusinessYears).toBeUndefined();

    await expect(page.getByText("6,554,550,000").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[E2E-GFY-3] 토지 + 가업승계 → 특례 귀속 불가 경고 + 계산 차단 (§30의6① 주식만)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 토지 자산 (가업승계 특례 귀속 불가 카테고리)
    await addLandAsset(page, {
      area: "100",
      unitPrice: "10000000",
      addButtonName: /증여재산 추가/,
      keepModalOpen: true,
    });
    await page.getByPlaceholder(/본가 토지/).fill("가업 토지");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

    await nextSteps(page, 2);

    // Step3: 가업승계 선택 → Selector 부적격 경고 카드 (단일 자산 자동 귀속 불가)
    await page.getByText("가업승계 증여세 과세특례 (§30의6)").click();
    await expect(
      page.getByText("특례 귀속 불가 재산", { exact: false }).first(),
    ).toBeVisible();

    // 계산 시도 → validateStep ⑧ 차단 메시지
    await page.getByRole("button", { name: /계산하기|계산/ }).last().click();
    await expect(
      page.getByText(/주식·출자지분만 대상/).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
