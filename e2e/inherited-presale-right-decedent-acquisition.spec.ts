/**
 * 상속 분양권 행 — 피상속인 취득일(기획재정부 재산세제과-1033 · 법률 제17477호 부칙 제4조)
 *
 * 엔진·④⑫⑭·⑧·⑤ 배선은 anchor(`inherited-presale-right-decedent-acquisition.anchor.test.tsx`)가 고정한다. 여기서는
 * 판정 메뉴에서 칸이 뜨고 그 입력으로 결론이 바뀌는지, 계산기 명부에도 같은 칸이 뜨는지를 본다.
 *
 * 시나리오(E067 일자 가정): 주택 A 2015-03-15 취득 · 분양권 상속개시 2021-02-10(동일세대) · 양도 2024-04-15.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";

const RIGHT = {
  id: "b",
  type: "presale_right",
  acquisitionDate: "2021-02-10",
  region: "capital",
  isInherited: true,
  decedentSameHouseholdAtInheritance: true,
};

async function seedJudgment(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2024-04-15",
    contractTotalPrice: "600000000",
    assets: [{ assetKind: "housing", acquisitionDate: "2015-03-15" }],
    houses: [],
    presaleRights: [RIGHT],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as { presaleRights?: Record<string, unknown>[] };
}

test("[IPR-1] 판정 메뉴 — 피상속인 취득일(2019)을 넣으면 본문에 실리고 비과세", async ({ page }) => {
  await seedJudgment(page);
  const d = page.getByTestId("presale-decedent-acquisition-date-0");
  await d.getByRole("textbox", { name: "연도" }).fill("2019");
  await d.getByRole("textbox", { name: "월" }).fill("6");
  await d.getByRole("textbox", { name: "일" }).fill("15");
  await expect(d.getByRole("textbox", { name: "일" })).toHaveValue("15");
  const body = await judge(page);
  expect(body.presaleRights?.[0]).toMatchObject({ isInherited: true, decedentAcquisitionDate: "2019-06-15" });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});

test("[IPR-2] 짝 — 피상속인 취득일이 없으면 상속개시일로 산입해 과세", async ({ page }) => {
  await seedJudgment(page);
  await expect(page.getByTestId("presale-decedent-acquisition-date-0")).toBeVisible();
  const body = await judge(page);
  expect(body.presaleRights?.[0]).not.toHaveProperty("decedentAcquisitionDate");
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});

test("[IPR-3] 계산기 명부에도 같은 칸이 뜬다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: { acquisitionDate: "2015-03-15" },
    formOver: { transferDate: "2024-04-15", presaleRights: [RIGHT], householdNoPresaleRightsConfirmed: false },
  });
  await expect(page.getByTestId("presale-decedent-acquisition-date-0")).toBeVisible();
  await expect(page.getByText("취득일(상속개시일)")).toBeVisible();
});
