/**
 * E2E(스크린샷 생성): 국세청 「2023 기준시가 사례」 섹션3 마 — 주거+상업 복합 공용 안분
 *   (PDF p.73~74 입력 → p.75~76 「건물 기준시가 계산서」 양식 보고서 재현)
 *
 * 종로구, 철근콘크리트조, 지상3층 지하1층, 신축 2000, 상속 2023.1.1, 대지 130㎡·공시지가 2,500,000
 *   - 1층 슈퍼(근생 #41) 100㎡ / 조정 1.08(9,20) · 공용 0.54(9,24)
 *   - 2~3층 주택(단독 #2) 각 100㎡ / 공용 0.60(24)
 *   - 공용: 주차장 60 + 보일러실 30
 *   → 건물 기준시가 합계 200,540,000
 *
 * 목적: 계산서 양식을 펼친 화면을 PNG로 저장(e2e/_artifacts/screenshots/)하여 육안 확인.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

const URL = "/tools/building-standard-price";
const OUT = "e2e/_artifacts/screenshots";

// 계산서 가독성 — 넓은 viewport + 2배 해상도(선명한 캡처)
test.use({ viewport: { width: 1600, height: 2200 }, deviceScaleFactor: 2 });

async function selectOption(page: Page, triggerText: string, optionName: string | RegExp) {
  await page.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test("마.주거+상업 복합 — 계산서 양식 보고서 스크린샷(200,540,000)", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();

  await page.getByPlaceholder("신축연도 (4자리)").fill("2000");
  // 평가연도는 "연도 선택" 드롭다운 폐지 → 상속·증여일에서 자동 산정. 2023.1.1 → 평가연도 2023.
  // 일자 입력 후 구조·용도·공시지가 입력이 활성화된다.
  const eventDateCard = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "상속·증여일" });
  await fillDateAndVerify(page, { year: "2023", month: "1", day: "1" }, { scope: eventDateCard });

  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click(); // 토글 ON
  // 부속시설: 주차장 60 + 보일러실 30 (PDF 구분 입력 → 공용 조정률 노출), 둘 다 지하1층
  await page.getByPlaceholder("주차장 면적").fill("60");
  await page.getByPlaceholder("보일러실 면적").fill("30");
  await page.getByPlaceholder("층(예 지하1)").nth(0).fill("지하1"); // 주차장 층
  await page.getByPlaceholder("층(예 지하1)").nth(1).fill("지하1"); // 보일러실 층

  // 부분 1: 지상1 슈퍼 근생(#41) · 조정 9,20 · 공용 9,24
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^41\./);
  await page.getByPlaceholder("부분 명칭 (선택)").fill("지상1(슈퍼)");
  await page.getByPlaceholder("부분 면적").fill("100");
  // 부분 조정률 기본값이 「특성으로 계산」(2026-08-12)이라 번호 칸은 라디오 전환 후 열린다.
  await page.getByRole("radio", { name: "직접 입력(%·번호)" }).nth(0).check();
  await page.getByPlaceholder("조정률 번호 (선택)", { exact: true }).fill("9,20");
  await page.getByPlaceholder("공용 조정률 번호 (선택)", { exact: true }).fill("9,24");

  // 부분 2: 지상2 주택 단독(#2) · 공용 24
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await page.getByPlaceholder("부분 명칭 (선택)").nth(1).fill("지상2(주택)");
  await page.getByPlaceholder("부분 면적").nth(1).fill("100");
  await page.getByPlaceholder("공용 조정률 번호 (선택)", { exact: true }).nth(1).fill("24");

  // 부분 3: 지상3 주택 단독(#2) · 공용 24
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await page.getByPlaceholder("부분 명칭 (선택)").nth(2).fill("지상3(주택)");
  await page.getByPlaceholder("부분 면적").nth(2).fill("100");
  await page.getByPlaceholder("공용 조정률 번호 (선택)", { exact: true }).nth(2).fill("24");

  // 대지면적 130 + 공시지가 2,500,000 → 토지가액 325,000,000 (계산서 Ⅱ·Ⅵ)
  await page.getByPlaceholder("부속토지 면적").fill("130");
  await page.getByPlaceholder("원/㎡").fill("2500000");

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("200,540,000");

  // 국세청 계산서 양식 펼치기
  await page.getByRole("button", { name: /국세청.*계산서/ }).click();
  const report = page.getByTestId("nts-bsp-report");
  await expect(report).toBeVisible();
  await expect(page.getByTestId("nts-bsp-6-no11")).toContainText("200,540,000");

  // Ⅳ 부속 표 — 층별=지하1, 용도=주차장(귀속) 분리 확인
  await expect(report).toContainText("지하1");
  await expect(report).toContainText("주차장(지상1(슈퍼) 귀속)");

  // Ⅱ. 건물 기본현황 — 용도지수② 채워짐 확인(근생 1.00 · 단독 1.00)
  const overview = page.locator("section.mb-3").filter({ hasText: "Ⅱ. 건물 기본현황" });
  await expect(overview).toContainText("1.00 · 1.00");
  // 건물 연면적 = 주용도 300 + 부속 90 = 390㎡ (건물 전체)
  await expect(overview).toContainText("390㎡");

  // 스크린샷 1: 계산서 양식 영역만
  await report.scrollIntoViewIfNeeded();
  await report.screenshot({ path: `${OUT}/2023-mixed-nts-report.png` });

  // 스크린샷 1b: Ⅱ 건물 기본현황만 크롭(용도지수 칸 육안 확인용)
  await overview.screenshot({ path: `${OUT}/2023-mixed-section2-overview.png` });

  // 스크린샷 1c: Ⅳ 건물부속 표만 크롭(층별·용도 분리 확인용)
  const section4 = page.locator("section.mb-4").filter({ hasText: "Ⅳ." });
  await section4.screenshot({ path: `${OUT}/2023-mixed-section4-ancillary.png` });

  // 출력 1: 계산서 전체를 A4 세로 PDF로 출력(인쇄 미디어 = 양식 자동 펼침)
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: `${OUT}/2023-mixed-건물기준시가계산서.pdf`,
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
  });
  await page.emulateMedia({ media: "screen" });

  // 스크린샷 2: 입력+결과+양식 전체 풀페이지
  await page.screenshot({ path: `${OUT}/2023-mixed-fullpage.png`, fullPage: true });
});
