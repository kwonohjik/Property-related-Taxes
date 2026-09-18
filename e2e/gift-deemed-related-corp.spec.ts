import { test, expect } from "@playwright/test";

/** E2E: §45의3 일감몰아주기 증여의제 — 교재 사례4 종합. 갑 20,520,000 + 을 16,200,000 = 36,720,000. */

test("§45의3 일감몰아주기 사례4 roster 전체 → 36,720,000", async ({ page }) => {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-related_corp").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도", { exact: true }).fill("2023");
  await dialog.getByLabel("월", { exact: true }).fill("12");
  await dialog.getByLabel("일", { exact: true }).fill("31");

  // 섹션 1 — 기업규모·재무
  await dialog.getByTestId("rc-size-small").click();
  await dialog.getByLabel("총 매출액", { exact: true }).fill("20000000000");
  await dialog.getByPlaceholder(/영업손실 시 음수/).fill("2500000000");
  await dialog.getByLabel("각 사업연도 소득금액", { exact: true }).fill("1800000000");
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
    await row.getByLabel("매출액", { exact: true }).fill(amount);
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

  // §⑭2호·4호는 지주회사·자법인 관계를 입력받지 않아 미구현이다. 방향이 «과대과세»라
  // 침묵하지 않는다 — ⑭1호가 걸리지 않은 ⑩ 미해당 특수관계 매출처(D법인)가 남아 있으므로 고지된다.
  await expect(page.getByTestId("rc-sec14-scope-notice")).toContainText("§34의3⑭");
  await expect(page.getByTestId("rc-sec14-scope-notice")).toContainText("1곳");
  await expect(page.getByTestId("rc-recipient-row-1")).toContainText("16,200,000");

  // ── 이관 단위: 수증자 1인 (§45의3① 「각각 증여받은 것으로 본다」) ──────────
  //  종전에는 갑만 이관하고 을을 `simultaneousGifts`(§46①2호 동시증여)에 넣었다.
  //  동시증여는 «동일 수증자» 전제라 갑의 §53 공제가 잘못 안분됐고, §55①2호 합산배제
  //  플래그도 조기반환 분기에서 통째로 소실됐다. 이 축은 E2E에서만 확인 가능하다
  //  (드롭다운 → sessionStorage payload).
  const notice = page.getByTestId("rc-per-donee-notice");
  await expect(notice).toContainText("별도 신고");
  await expect(notice).toContainText("20,520,000");

  const selector = page.getByTestId("rc-donee-selector");
  await expect(selector.locator("option")).toHaveCount(2);
  await selector.selectOption("1");
  await expect(notice).toContainText("16,200,000");

  await page.getByTestId("deemed-to-wizard").click();
  await page.waitForURL(/\/calc\/gift-tax/);
  const payload = JSON.parse(
    (await page.evaluate(() => sessionStorage.getItem("giftTaxResumeInput")))!,
  );
  expect(payload.giftItems).toHaveLength(1);
  expect(payload.giftItems[0].marketValue).toBe(16_200_000);
  expect(payload.giftItems[0].isAggregationExcludedGift).toBe(true);
  expect(payload.giftItems[0].aggregationExcludedClass).toBe("deemed_profit");
  expect(payload.simultaneousGifts).toBeUndefined();
});

/**
 * §45의3①1호나목2) — 일반기업 「정상거래비율의 3분의 2 초과 + 특수관계법인 매출 1천억원 초과」.
 * 종전에는 거래비율 25%가 정상거래비율 30% 이하라는 이유로 **0원**이 나왔다(과세요건 한 갈래만 판정).
 */
test("§45의3①1호나목2) 일반기업 거래비율 25%·특수관계매출 2,500억 → 3,400,000,000", async ({ page }) => {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-related_corp").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도", { exact: true }).fill("2024");
  await dialog.getByLabel("월", { exact: true }).fill("12");
  await dialog.getByLabel("일", { exact: true }).fill("31");

  await dialog.getByTestId("rc-size-large").click();
  await dialog.getByLabel("총 매출액", { exact: true }).fill("1000000000000");
  await dialog.getByPlaceholder(/영업손실 시 음수/).fill("100000000000");
  await dialog.getByLabel("각 사업연도 소득금액", { exact: true }).fill("80000000000");
  await dialog.getByPlaceholder("산출세액 − 공제·감면액 (원)").fill("15000000000");

  const shareholders: [string, string, string][] = [
    ["갑", "self", "20"],
    ["기타", "other", "80"],
  ];
  for (let i = 0; i < shareholders.length; i++) await dialog.getByTestId("rc-add-shareholder").click();
  for (let i = 0; i < shareholders.length; i++) {
    const [name, rel, pct] = shareholders[i];
    const row = dialog.getByTestId(`rc-sh-row-${i}`);
    await row.getByPlaceholder("주주 이름").fill(name);
    await row.getByLabel(`주주 ${i + 1} 관계`).selectOption(rel);
    await row.getByPlaceholder("지분율").fill(pct);
  }

  const sales: [string, string, "y" | "n"][] = [
    ["특수법인", "250000000000", "y"],
    ["기타매출", "750000000000", "n"],
  ];
  for (let i = 0; i < sales.length; i++) await dialog.getByTestId("rc-add-sales").click();
  for (let i = 0; i < sales.length; i++) {
    const [name, amount, related] = sales[i];
    const row = dialog.getByTestId(`rc-sales-row-${i}`);
    await row.getByPlaceholder("매출처 이름").fill(name);
    await row.getByLabel("매출액", { exact: true }).fill(amount);
    await row.getByLabel(`매출처 ${i + 1} 특수관계`).selectOption(related);
    if (related === "y") await row.getByLabel(`매출처 ${i + 1} 과세제외유형`).selectOption("");
  }

  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();

  await expect(page.getByTestId("deemed-result-value")).toContainText("3,400,000,000");
  // 어느 갈래로 충족했는지까지 화면에 밝힌다 (종전엔 「충족/미충족」 두 글자뿐)
  await expect(page.getByTestId("rc-tax-requirement")).toContainText("상증법 §45의3①1호나목2)");
});
