/**
 * 취득세 E2E — 주택 수·중과 P3 (계획서 E-6 · I-6 · I-7)
 *
 * - E-6 법률 제17473호 부칙 제6조: 조정 2주택 5억 · 2020.7.1. 매매계약(계약금 증빙·계약 당시 1주택 보유)
 *   · 2021.5.12. 잔금 → 종전 §11①8호 1% 5,000,000 (현행 8% 40,000,000)
 * - I-6 §28의4⑤: 입주권 행은 동순위여도 거주 칸이 없고 최연장자만 묻는다
 * - I-7 §28의4③: 잔금일과 같은 날 취득한 보유 주택을 「취득하는 주택 뒤로 정함」 → 주택 수 제외
 */

import { test, expect, type Page } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./_helpers/tax-flow";

/** 스위치의 접근 이름은 「제목 + 설명 + 제목」이다 — 제목 앞머리로 찾는다(바깥 카드가 안쪽 카드 글자를 품어도 안전) */
function toggleSwitch(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("switch", { name: new RegExp(`^${escaped}`) });
}

async function fillBalanceDate(page: Page, y: string, m: string, d: string) {
  // 매매 · 연부 OFF — Step0 첫 날짜 칸이 잔금 지급일
  await page.getByPlaceholder("YYYY").first().fill(y);
  await page.getByPlaceholder("MM").first().fill(m);
  await page.getByPlaceholder("DD").first().fill(d);
}

async function toStep2(page: Page) {
  await page.getByRole("button", { name: /다음/ }).click();
  await expect(page.getByPlaceholder("85㎡ 이하이면 농특세 면제")).toBeVisible();
  await page.getByRole("button", { name: /다음/ }).click();
  await expect(page.getByText("취득 후 보유 주택 수")).toBeVisible();
}

async function addRow(page: Page, stdValue: string, date: { year: string; month: string; day: string }) {
  await page.getByRole("button", { name: "+ 보유 주택 추가" }).click();
  await expect(page.getByText("보유 주택 #1")).toBeVisible();
  await fillAndVerify(page.getByPlaceholder("주택공시가격·개별공시지가×면적"), stdValue);
  await page.getByPlaceholder("YYYY").first().fill(date.year);
  await page.getByPlaceholder("MM").first().fill(date.month);
  await page.getByPlaceholder("DD").first().fill(date.day);
}

async function regulatedAndCalc(page: Page) {
  await page.getByRole("button", { name: /다음/ }).click();
  const regulated = toggleSwitch(page, "조정대상지역 내 주택");
  await expect(regulated).toBeVisible();
  await regulated.click();
  await page.getByRole("button", { name: /다음/ }).click();
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /취득세 계산/ }).click();
  const resp = await calcResponse;
  expect(resp.status()).toBe(200);
  await expect(page.getByText(/납부세액 합계|최종 납부세액/).first()).toBeVisible();
  return resp.request().postDataJSON() as Record<string, unknown>;
}

test.describe("취득세 — 주택 수·중과 P3", () => {
  test("E-6: 2020.7.1. 매매계약 → 부칙 제6조 종전 1% 5,000,000", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");
    await fillAndVerify(page.getByPlaceholder("계약서상 거래금액"), "500000000");
    await fillBalanceDate(page, "2021", "05", "12");

    // 2020.7.10. 이전 계약일을 넣어야 요건 카드가 열린다
    await expect(page.getByText("2020.7.10. 이전 매매계약 — 종전 세율")).toHaveCount(0);
    await fillDateAndVerify(page, { year: "2020", month: "07", day: "01" }, { scope: page.getByTestId("acq-sale-contract-date") });
    await expect(page.getByText("2020.7.10. 이전 매매계약 — 종전 세율")).toBeVisible();
    await toggleSwitch(page, "계약금 지급 증빙 보유").click();
    await toggleSwitch(page, "계약 당시 국내에 주택을 1개 이상 소유한 1세대").click();

    await toStep2(page);
    await addRow(page, "500000000", { year: "2015", month: "01", day: "01" });
    const body = await regulatedAndCalc(page);

    expect(body.saleContractDate).toBe("2020-07-01");
    expect(body.hasContractDepositProof).toBe(true);
    expect(body.ownedHouseAtSaleContract).toBe(true);
    await expect(page.getByText(/5,000,000/).first()).toBeVisible();
    await expect(page.getByText(/40,000,000/)).toHaveCount(0);
  });

  test("I-6: 입주권 행 — 동순위면 거주 칸 없이 최연장자만", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");
    await fillAndVerify(page.getByPlaceholder("계약서상 거래금액"), "500000000");
    await toStep2(page);
    await page.getByRole("button", { name: "+ 보유 주택 추가" }).click();
    await page.locator("select").filter({ has: page.locator("option", { hasText: "조합원입주권" }) }).selectOption("right");
    await toggleSwitch(page, "상속으로 취득한 주택").click();
    await toggleSwitch(page, "지분이 가장 큰 상속인이 두 명 이상").click();
    await expect(page.getByText("동순위 상속인 중 최연장자")).toBeVisible();
    await expect(page.getByText("본인이 그 주택에 거주")).toHaveCount(0);

    // 긍정 짝 — 주택 행은 거주 칸이 있다
    await page.locator("select").filter({ has: page.locator("option", { hasText: "조합원입주권" }) }).selectOption("housing");
    await expect(page.getByText("본인이 그 주택에 거주")).toBeVisible();
  });

  test("I-7: 잔금일과 같은 날 취득한 주택을 뒤로 정함 → 주택 수 제외 · 1% 5,000,000", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");
    await fillAndVerify(page.getByPlaceholder("계약서상 거래금액"), "500000000");
    await fillBalanceDate(page, "2024", "06", "01");
    await toStep2(page);
    await addRow(page, "500000000", { year: "2024", month: "05", day: "31" });

    const sameDay = page.getByText("같은 날 취득 — 취득하는 주택 뒤로 정함");
    await expect(sameDay).toHaveCount(0);
    await page.getByPlaceholder("DD").first().fill("01");
    await page.getByPlaceholder("MM").first().fill("06");
    await expect(sameDay).toBeVisible();
    await toggleSwitch(page, "같은 날 취득 — 취득하는 주택 뒤로 정함").click();

    const body = await regulatedAndCalc(page);
    const houses = (body.houseCountInput as { houses: { sameDayOrderAfterPending?: boolean }[] }).houses;
    expect(houses[0].sameDayOrderAfterPending).toBe(true);
    await expect(page.getByText(/5,000,000/).first()).toBeVisible();
    await expect(page.getByText(/40,000,000/)).toHaveCount(0);
  });
});
