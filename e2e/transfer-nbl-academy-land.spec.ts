/**
 * transfer-nbl-academy-land.spec.ts
 *
 * 실제 케이스: 인천 중구 내동 6-20 학원용 토지 단독 양도
 * (건물 철거 후 나대지 양도, 환산취득가액 모드, 사업용 토지)
 *
 * 입력값:
 *   - 양도일: 2026-02-18
 *   - 취득일: 1997-02-03 (보유 29년)
 *   - 양도가액: 2,000,000,000 원
 *   - 면적: 314.1 ㎡
 *   - 취득시 개별공시지가: 637,000 원/㎡ → 총 200,081,700 원
 *   - 양도시 개별공시지가: 893,300 원/㎡ → 총 280,585,530 원
 *   - 자본적 지출액(배관시설·건물철거비): 27,854,000 원
 *   - 비사업용 토지 여부: OFF (수입금액비율 53.1% ≥ 10% → 사업용)
 *
 * 기대값 (사용자 수기 계산 — 엔진은 단계별 floor 적용으로 각 항목 최대 1원 작음, 정상):
 *   - 환산취득가액: ≈ 1,426,172,617 원
 *   - 개산공제: 6,002,451 원
 *   - 양도차익: ≈ 567,824,932 원
 *   - 장기보유특별공제(30%): ≈ 170,347,479 원
 *   - 양도소득금액: ≈ 397,477,453 원
 *   - 과세표준: ≈ 394,977,453 원
 *   - 산출세액(40%): ≈ 132,050,981 원
 *   - 지방소득세(10%): ≈ 13,205,098 원
 *   - 총 납부세액: ≈ 145,256,079 원
 *
 * 실행: npx playwright test e2e/transfer-nbl-academy-land.spec.ts
 * (개발 서버가 http://localhost:3000 에서 실행 중이어야 함)
 */

import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** CurrencyInput(htmlFor 연결 없음) → label 부모 div 탐색 후 input 반환 */
function getInputByLabel(page: Page, labelText: string) {
  return page
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input");
}

/** 결과 테이블 Row에서 오른쪽(값) 셀 텍스트 반환 — first(): 본세 메인 테이블 우선
 *  (지방소득세 명세에 같은 라벨(산출세액·결정세액)이 중복 존재하므로 last() 사용 시 오매칭) */
async function getRowValue(page: Page, labelText: string): Promise<string> {
  const row = page.locator(`tr:has(td:has-text("${labelText}"))`).first();
  return (await row.locator("td").nth(1).textContent())?.trim() ?? "";
}

test.describe("인천 중구 내동 6-20 학원용 토지 환산취득가액", () => {
  test("단독 양도 → 양도세 계산 결과 캡처", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ─── 양도일: 2026-02-18 (첫 번째 DateInput 그룹) ───────────────
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("02");
    await page.getByTestId("transfer-date").getByLabel("일").fill("18");

    // ─── 신고일: 2026-04-30 (두 번째 DateInput 그룹) ───────────────
    await page.getByTestId("filing-date").getByLabel("연도").fill("2026");
    await page.getByTestId("filing-date").getByLabel("월").fill("04");
    await page.getByTestId("filing-date").getByLabel("일").fill("30");

    // 점진적 노출 — 기본정보(①)·양도정보(②)·취득정보(③)·필요경비(④ 자본적지출) 펼침
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);
    await expandAssetSection(page, 4);

    // ─── 자산 카드: 토지·농지 선택 ──────────────────────────────────
    await page.getByRole("button", { name: "단순토지" }).click();

    // ─── 토지 성격: 독립 나대지 ─────────────────────────────────────
    // (건물 철거 후 양도 → 나대지)
    await page.getByText("독립 나대지", { exact: true }).click();

    // ─── 면적: 314.1 ㎡ (취득=양도 동일, areaScenario=same) ─────────
    // ※ 이 값이 acquisitionArea·transferArea 양쪽에 반영되어
    //   이후 StandardPriceInput의 area prop에 pre-populate됨
    await page.getByPlaceholder("면적 입력").first().fill("314.1");

    // ─── 양도가액: 2,000,000,000 원 ─────────────────────────────────
    const yangdoInput = getInputByLabel(page, "양도가액 (원)");
    await yangdoInput.fill("2000000000");

    // ─── 취득원인: 매매 ─────────────────────────────────────────────
    await page.getByRole("button", { name: "매매", exact: true }).click();

    // ─── 취득가액 산정방식: 환산취득가 ─────────────────────────────
    await page.getByRole("button", { name: "환산취득가" }).click();

    // ─── 취득일: 1997-02-03 (세 번째 DateInput 그룹, nth(2)) ─────────
    await page.getByLabel("연도", { exact: true }).nth(2).fill("1997");
    await page.getByLabel("월", { exact: true }).nth(2).fill("02");
    await page.getByLabel("일", { exact: true }).nth(2).fill("03");

    // ─── 취득시 기준시가: 637,000 원/㎡ ─────────────────────────────
    // area prop이 314.1로 pre-populate → 단가 입력만으로 총액 자동계산
    // 자동계산: Math.floor(637000 × 314.1) = 200,081,700
    await page.getByPlaceholder("공시지가 단가").first().fill("637000");
    await page.waitForTimeout(200); // 자동계산 반영 대기

    // ─── 양도시 기준시가: 893,300 원/㎡ ─────────────────────────────
    // 자동계산: Math.floor(893300 × 314.1) = 280,585,530
    await page.getByPlaceholder("공시지가 단가").nth(1).fill("893300");
    await page.waitForTimeout(200);

    // ─── 자본적 지출액: 27,854,000 원 (배관시설·건물철거비) ─────────
    // §97② swap 비교: 27,854,000 < 환산+개산공제(≈1,432M) → swap 미발동
    // 입력은 하되 엔진이 개산공제 우선 적용 예상
    const capitalExpInput = getInputByLabel(page, "자본적 지출액 (원)");
    await capitalExpInput.fill("27854000");

    // ─── 비사업용 토지 토글: OFF 유지 ───────────────────────────────
    // 수입금액비율 53.1% ≥ 10% → 사업용 → 중과 없음 (토글 기본값 false 유지)

    // ─── 사이드바: 보유 상황 이동 ───────────────────────────────────
    await page.getByRole("button", { name: "보유 상황" }).first().click();

    // ─── 사이드바: 감면·공제 이동 ──────────────────────────────────
    await page.getByRole("button", { name: "감면·공제" }).first().click();

    // ─── 사이드바: 가산세 이동 ─────────────────────────────────────
    await page.getByRole("button", { name: "가산세" }).first().click();

    // ─── 세금 계산 실행 ─────────────────────────────────────────────
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // ─── 결과 대기 ──────────────────────────────────────────────────
    // "총 납부세액" 라벨이 2곳(요약 hidden + 납부카드 visible) — visible 쪽(last) 사용
    await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 15000 });

    // ─── 결과 캡처 ──────────────────────────────────────────────────

    // 총 납부세액 (3xl bold, p:text("총 납부세액")의 다음 sibling p)
    const totalTax = (
      await page
        .locator('p:has-text("총 납부세액")')
        .last()
        .locator("xpath=following-sibling::p[1]")
        .textContent()
    )?.trim() ?? "";

    // 메인 결과 테이블 rows
    const transferGain = await getRowValue(page, "양도차익");
    const lthd = await getRowValue(page, "장기보유특별공제");
    const transferIncome = await getRowValue(page, "양도소득금액");
    const taxBase = await getRowValue(page, "과세표준");
    const calculatedTax = await getRowValue(page, "산출세액");
    const localTax = await getRowValue(page, "지방소득세");
    const determinedTax = await getRowValue(page, "결정세액");

    // swap 비교 텍스트 (환산+개산공제 vs 자본+양도비)
    const swapEl = page.locator('p:has-text("§97② 본문 적용")');
    const swapText = await swapEl.count() > 0
      ? (await swapEl.first().textContent())?.trim() ?? "표시 없음"
      : "swap 텍스트 없음 (swap 발동 또는 미표시)";

    // parcelDetails 섹션 존재 시 열어서 환산취득가액 확인
    let acquisitionPriceFromParcel = "";
    let estimatedDeductionFromParcel = "";
    const detailsEl = page.locator("details").first();
    if (await detailsEl.count() > 0) {
      await detailsEl.locator("summary").click();
      acquisitionPriceFromParcel = (
        await page.locator('tr:has(td:has-text("취득가액"))').first()
          .locator("td").nth(1).textContent()
      )?.trim() ?? "";
      estimatedDeductionFromParcel = (
        await page.locator('tr:has(td:has-text("개산공제"))').first()
          .locator("td").nth(1).textContent()
      )?.trim() ?? "";
    }

    // ─── 결과 보고 ──────────────────────────────────────────────────
    console.log("\n=== 인천 중구 내동 6-20 학원용 토지 — 양도세 계산 결과 ===\n");
    console.log("항목                    │ 엔진 결과                │ 사용자 예상값");
    console.log("───────────────────────────────────────────────────────────────");
    console.log(`환산취득가액 (파슬)     │ ${acquisitionPriceFromParcel.padEnd(24)}│ 1,426,172,617 원`);
    console.log(`개산공제 (파슬)         │ ${estimatedDeductionFromParcel.padEnd(24)}│ - 6,002,451 원`);
    console.log(`양도차익                │ ${transferGain.padEnd(24)}│ 567,824,932 원`);
    console.log(`장기보유특별공제(30%)   │ ${lthd.padEnd(24)}│ - 170,347,479 원`);
    console.log(`양도소득금액            │ ${transferIncome.padEnd(24)}│ 397,477,453 원`);
    console.log(`과세표준                │ ${taxBase.padEnd(24)}│ 394,977,453 원`);
    console.log(`산출세액(40%)           │ ${calculatedTax.padEnd(24)}│ 132,050,981 원`);
    console.log(`결정세액                │ ${determinedTax.padEnd(24)}│ 132,050,981 원`);
    console.log(`지방소득세(10%)         │ ${localTax.padEnd(24)}│ 13,205,098 원`);
    console.log(`총 납부세액             │ ${totalTax.padEnd(24)}│ 145,256,079 원`);
    console.log("───────────────────────────────────────────────────────────────");
    console.log(`§97② swap 비교: ${swapText}`);

    // ─── 최소 검증 (엔진 응답 확인) ─────────────────────────────────
    expect(totalTax, "총 납부세액이 비어있으면 안 됩니다").not.toBe("");
    expect(transferGain, "양도차익이 비어있으면 안 됩니다").not.toBe("");
    expect(taxBase, "과세표준이 비어있으면 안 됩니다").not.toBe("");
  });
});
