/**
 * E2E(보고서 출력): 국세청 「2023 기준시가 사례」 섹션3 마 — 양도건물 계산서
 *   (PDF p.73~74 입력 → p.75~76 (1) 양도건물 기준시가 계산서, p.77~78 (2) 취득당시)
 *
 * 양도 케이스: 종로구 RC, 신축 2000, 취득 2000.2.1(≤2000 산정기준율), 양도 2023.1.1.
 *   양도는 조정률 미적용 → 전 부분 ㎡당 동일.
 *   - 지상1 슈퍼: 양도 근생#41 / 취득 근생#27 / 100㎡
 *   - 지상2·3 주택: 양도 단독#2 / 취득 단독#1 / 각 100㎡
 *   - 부속: 주차장 60 + 보일러실 30 (지하1)
 *   - 공시지가: 양도 2,500,000 / 취득 2,240,000, 토지 130㎡
 *   → 양도당시 ⑪ 217,230,000 (Ⅲ 167,100,000 + Ⅳ 50,130,000)
 *     취득당시(2001) ⑪ 154,960,000 → 산정기준율 환산 157,439,360
 */
import { test, expect, type Page } from "@playwright/test";

const URL = "/tools/building-standard-price";
const OUT = "e2e/_artifacts/screenshots";

test.use({ viewport: { width: 1600, height: 2400 }, deviceScaleFactor: 2 });

async function selectOption(page: Page, triggerText: string, optionName: string | RegExp) {
  await page.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test("(1) 양도건물 계산서 — 양도당시 217,230,000 / 취득당시 154,960,000", async ({ page }) => {
  await page.goto(URL); // 기본 양도 모드
  await page.getByPlaceholder("신축연도 (4자리)").fill("2000");

  // 연도: 취득 2000(첫 연도 Select), 양도 2023(둘째)
  await selectOption(page, "연도 선택", "2000년");
  await selectOption(page, "연도 선택", "2023년");

  // 복합구조 ON
  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click();

  // 부속: 주차장 60 + 보일러실 30, 지하1
  await page.getByPlaceholder("주차장 면적").fill("60");
  await page.getByPlaceholder("보일러실 면적").fill("30");
  await page.getByPlaceholder("층(예 지하1)").nth(0).fill("지하1");
  await page.getByPlaceholder("층(예 지하1)").nth(1).fill("지하1");

  // 부분 1: 지상1(슈퍼) RC / 양도 근생#41 / 취득 근생#27 / 100㎡
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^41\./); // 양도시 용도(first)
  await selectOption(page, "용도 선택", /^27\./); // 취득시 용도
  await page.getByPlaceholder("부분 명칭 (선택)").nth(0).fill("지상1(슈퍼)");
  await page.getByPlaceholder("부분 면적").nth(0).fill("100");

  // 부분 2: 지상2(주택) RC / 양도 단독#2 / 취득 단독#1 / 100㎡
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await selectOption(page, "용도 선택", /^1\./);
  await page.getByPlaceholder("부분 명칭 (선택)").nth(1).fill("지상2(주택)");
  await page.getByPlaceholder("부분 면적").nth(1).fill("100");

  // 부분 3: 지상3(주택)
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await selectOption(page, "용도 선택", /^1\./);
  await page.getByPlaceholder("부분 명칭 (선택)").nth(2).fill("지상3(주택)");
  await page.getByPlaceholder("부분 면적").nth(2).fill("100");

  // 토지면적 130 + 공시지가(취득 2,240,000 / 양도 2,500,000)
  await page.getByPlaceholder("부속토지 면적").first().fill("130");
  await page.getByPlaceholder("원/㎡").nth(0).fill("2240000"); // 취득당시
  await page.getByPlaceholder("원/㎡").nth(1).fill("2500000"); // 양도당시

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();
  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();

  // 계산서 펼치기 — 양도당시 ⑪ 217,230,000 / 취득당시 154,960,000
  await page.getByRole("button", { name: /국세청.*계산서.*펼치기/ }).click();
  const report = page.getByTestId("nts-bsp-report");
  await expect(report).toBeVisible();
  await expect(page.getByTestId("nts-bsp-6-no11").first()).toContainText("217,230,000");
  await expect(page.getByTestId("nts-bsp-6-no11").nth(1)).toContainText("154,960,000");
  // Ⅳ 부속 — 층별 지하1 / 용도 주차장(귀속)
  await expect(report).toContainText("지하1");
  await expect(report).toContainText("주차장(지상1(슈퍼) 귀속)");

  // 출력: 고해상도 PNG + A4 PDF
  await report.scrollIntoViewIfNeeded();
  await report.screenshot({ path: `${OUT}/2023-mixed-transfer-nts-report.png` });

  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: `${OUT}/2023-mixed-양도건물기준시가계산서.pdf`,
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
  });
  await page.emulateMedia({ media: "screen" });
});
