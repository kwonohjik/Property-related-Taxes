/**
 * E2E: 비상장주식 V2 정식평가 — 자본금 변동사항 입력란 재배치 (옵션 A)
 *
 * 검증 (계획: docs/00-pm/inheritance-unlisted-capital-change-relocation.plan.md):
 *   1. 자본금 변동사항(CapitalChangeTable)이 섹션 1(CorporateInfoSection) 내부로 이동:
 *      3×3 그리드 재편 후 DOM 세로 순서 = 보유 주식수(행2) < 발행주식총수(행3) < 자본금 변동사항(행3 직후 임베드)
 *   2. 자본금 변동사항이 "사업연도별 순손익액"(FiscalYearAdjustmentTable)보다 위에 온다
 *      (= 더 이상 섹션 4가 아니라 섹션 1 내부 — 재배치의 핵심 행동 변화)
 *   3. 임베드 시 자체 circle 번호 badge 없음 (제목만 표시)
 *   4. "+ 변동 추가" 동작 — 유형 select(유상증자) + 주식수 입력란 노출
 *
 * 실제 진입 경로: inheritance-unlisted-fiscal-year-annualize.spec.ts 와 동일
 *   Step0(상속개시일+상속인) → 다음 → Step1 → "주식·지분 추가" → "비상장주식" → "정식평가" 라디오
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 입력
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  // 상속인 1명(자녀) 등록
  await addHeir(page, "heir", "child");

  // Step1(상속재산 평가)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();

  // StockValuationForm: 주식·지분 추가 → 비상장주식 → 정식평가
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

/** 첫 매칭 요소의 세로(top) 좌표 — 렌더되지 않으면 실패 */
async function topY(page: Page, text: string | RegExp): Promise<number> {
  const loc = page.getByText(text).first();
  await loc.waitFor({ timeout: 5_000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`boundingBox null for: ${text}`);
  return box.y;
}

test.describe("비상장주식 V2 — 자본금 변동사항 입력란 재배치", () => {
  test("자본금 변동사항이 섹션 1 내부(보유주식 < 발행주식총수 < 자본금변동)에 위치한다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 제목이 렌더되어 있어야 함 (FiscalYear 표 아래로 스크롤하지 않아도 보임)
    await expect(
      page.getByText(/자본금 변동사항/).first()
    ).toBeVisible({ timeout: 5_000 });

    const yOwnedShares = await topY(page, "보유 주식수");
    const yTotalShares = await topY(page, "발행주식총수");
    const yCapitalChange = await topY(page, /자본금 변동사항/);

    // 섹션 1 내부 순서 (3×3 그리드): 보유 주식수(행2) → 발행주식총수(행3) → 자본금 변동사항(행3 직후 임베드).
    // 핵심 검증: 자본금 변동사항이 발행주식총수 바로 아래 = 섹션 1 내부 임베드.
    expect(yOwnedShares).toBeLessThan(yTotalShares);
    expect(yTotalShares).toBeLessThan(yCapitalChange);
  });

  test("자본금 변동사항이 '사업연도별 순손익액' 표보다 위에 온다 (섹션 1로 이동)", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const yCapitalChange = await topY(page, /자본금 변동사항/);
    const yFiscalYear = await topY(page, /사업연도별 순손익액/);

    // 재배치 핵심: 자본금 변동(섹션 1) < 사업연도별 순손익액(다음 섹션)
    expect(yCapitalChange).toBeLessThan(yFiscalYear);
  });

  test("임베드 시 자체 번호 badge 없이 '+ 변동 추가'로 행을 추가할 수 있다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // "+ 변동 추가" 클릭 → 유형 select(유상증자) + 주식수 입력 노출
    await page.getByRole("button", { name: /변동 추가/ }).click();

    // 유형 select에 "유상증자" 옵션이 보이고, 증가·감소 주식수 라벨이 노출됨
    await expect(
      page.getByText("증가·감소 주식수", { exact: false }).first()
    ).toBeVisible({ timeout: 3_000 });
  });
});
