import { test, expect } from "@playwright/test";

/** E2E: §45의3 일감몰아주기 증여의제 — 교재 사례4 종합. 갑 20,520,000 + 을 16,200,000 = 36,720,000. */

test("§45의3 일감몰아주기 사례4 roster 전체 → 36,720,000", async ({ page }) => {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-related_corp").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2023");
  await dialog.getByLabel("월").fill("12");
  await dialog.getByLabel("일", { exact: true }).fill("31");

  // 섹션 1 — 기업규모·재무
  await dialog.getByTestId("rc-size-small").click();
  await dialog.getByPlaceholder("총 매출액 (원)").fill("20000000000");
  await dialog.getByPlaceholder(/세무조정 후 영업손익/).fill("2500000000");
  await dialog.getByPlaceholder("각 사업연도 소득금액 (원)").fill("1800000000");
  await dialog.getByPlaceholder("산출세액 − 공제·감면액 (원)").fill("340000000");

  // 섹션 2 — 주주현황 6행
  const shareholders: [string, string, string, "person" | "corp"][] = [
    ["갑", "self", "20", "person"],
    ["을", "relative", "10", "person"],
    ["병", "other", "25", "person"],
    ["B법인", "other", "30", "corp"],
    ["C법인", "other", "10", "corp"],
    ["기타", "other", "5", "person"],
  ];
  for (let i = 0; i < shareholders.length; i++) await dialog.getByTestId("rc-add-shareholder").click();
  for (let i = 0; i < shareholders.length; i++) {
    const [name, rel, pct, kind] = shareholders[i];
    const row = dialog.getByTestId(`rc-sh-row-${i}`);
    await row.getByPlaceholder("주주 이름").fill(name);
    await row.getByLabel(`주주 ${i + 1} 관계`).selectOption(rel);
    await row.getByPlaceholder("지분율").fill(pct);
    await row.getByLabel(`주주 ${i + 1} 유형`).selectOption(kind);
  }

  // 섹션 3 — 간접출자법인 2행
  await dialog.getByTestId("rc-add-intermediary").click();
  await dialog.getByTestId("rc-add-intermediary").click();
  const int0 = dialog.getByTestId("rc-int-row-0");
  await int0.getByLabel("간접출자법인 1 법인주주").selectOption({ label: "B법인" });
  await int0.getByPlaceholder("수혜법인 지분율").fill("30");
  await int0.getByText("+ 개인소유주 추가").click();
  await int0.getByText("+ 개인소유주 추가").click();
  await int0.getByLabel("간접출자법인 1 소유주 1").selectOption({ label: "갑" });
  await int0.getByPlaceholder("소유 지분율").nth(0).fill("30");
  await int0.getByLabel("간접출자법인 1 소유주 2").selectOption({ label: "을" });
  await int0.getByPlaceholder("소유 지분율").nth(1).fill("20");
  const int1 = dialog.getByTestId("rc-int-row-1");
  await int1.getByLabel("간접출자법인 2 법인주주").selectOption({ label: "C법인" });
  await int1.getByPlaceholder("수혜법인 지분율").fill("10");
  await int1.getByText("+ 개인소유주 추가").click();
  await int1.getByLabel("간접출자법인 2 소유주 1").selectOption({ label: "갑" });
  await int1.getByPlaceholder("소유 지분율").nth(0).fill("10");

  // 섹션 4 — 매출처 5행
  const sales: [string, string, "y" | "n", string][] = [
    ["B법인", "3000000000", "y", "sec10_1"],
    ["C법인", "4000000000", "n", ""],
    ["D법인", "10000000000", "y", ""], // §⑭3호 갑30
    ["E법인", "2000000000", "y", "sec10_5"],
    ["기타", "1000000000", "n", ""],
  ];
  for (let i = 0; i < sales.length; i++) await dialog.getByTestId("rc-add-sales").click();
  for (let i = 0; i < sales.length; i++) {
    const [name, amount, related, excl] = sales[i];
    const row = dialog.getByTestId(`rc-sales-row-${i}`);
    await row.getByPlaceholder("매출처 이름").fill(name);
    await row.getByPlaceholder("매출액 (원)").fill(amount);
    await row.getByLabel(`매출처 ${i + 1} 특수관계`).selectOption(related);
    if (related === "y") {
      await row.getByLabel(`매출처 ${i + 1} 과세제외유형`).selectOption(excl);
    }
  }
  // D법인(row 2) §⑭3호: 갑 30% 출자
  const dRow = dialog.getByTestId("rc-sales-row-2");
  await dRow.getByText("+ 지배주주등 보유비율 추가").click();
  await dRow.getByLabel("매출처 3 §⑭ 주주 1").selectOption({ label: "갑" });
  await dRow.getByPlaceholder("보유비율").fill("30");

  // 계산
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();

  await expect(page.getByTestId("deemed-result-value")).toContainText("36,720,000");
  await expect(page.getByTestId("rc-recipient-row-0")).toContainText("20,520,000");
  await expect(page.getByTestId("rc-recipient-row-1")).toContainText("16,200,000");
});
