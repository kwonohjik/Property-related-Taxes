/**
 * 리뷰 E-3 — 기존주택 원조합원 입주권 행의 새 칸(기존주택 매매계약일 · §155⑯ 지방이전)이 본문에 실리고 결론을 바꾼다.
 *
 * 엔진은 `original-member-right-canonical-timing-e3.anchor.test.ts`, ④⑧⑫⑭는 `original-member-contract-relocation-e3.test.ts`가
 * 고정한다. 여기서는 판정 메뉴에서 칸이 뜨고 그 입력으로 비과세가 되는지를 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seed(page: Page, p: { aAcq: string; aCode: string; transfer: string; right: Record<string, unknown> }) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: p.transfer,
    contractTotalPrice: "800000000",
    wasRegulatedAtAcquisition: false,
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: p.aAcq,
        regionCode: p.aCode,
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "36",
      },
    ],
    houses: [],
    presaleRights: [{ id: "p1", type: "redevelopment_right", region: "capital", memberOrigin: "original_house", ...p.right }],
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

// ⑯ — 비조정 지역끼리(천안) · 기존주택 취득 2019-01-01 · 양도 2023-06-01(3년 초과 · 5년 이내)
const RELOCATION = {
  aAcq: "2015-01-01",
  aCode: "4413110100",
  transfer: "2023-06-01",
  right: { acquisitionDate: "2019-01-01", regionCode: "4413110300" },
};

test("[E3-1] ⑯ 지방이전을 켜면 본문에 실리고 비과세", async ({ page }) => {
  await seed(page, RELOCATION);
  const card = page.getByTestId("original-member-relocation-0");
  await card.getByRole("switch", { name: /공공기관·법인 지방이전 특례/ }).click();
  await expect(card.getByTestId("relocation-new-house-location-note")).toContainText("정비구역(기존주택) 주소로 판정");
  const body = await judge(page);
  expect(body.presaleRights?.[0]).toMatchObject({ originalMemberPublicInstitutionRelocation: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});

test("[E3-2] 짝 — ⑯을 켜지 않으면 과세", async ({ page }) => {
  await seed(page, RELOCATION);
  await expect(page.getByTestId("original-member-relocation-0")).toBeVisible();
  const body = await judge(page);
  expect(body.presaleRights?.[0]).not.toHaveProperty("originalMemberPublicInstitutionRelocation");
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});

test("[E3-3] 2019.12.16. 이전 기존주택 계약일을 넣으면 종전 2년 기한으로 비과세", async ({ page }) => {
  // 강남 A · 서초 B(2020-03-02 취득 · 2020-04-01 전입) · 양도 2021-06-01 — 계약일이 없으면 조정→조정 1년이라 과세
  await seed(page, {
    aAcq: "2015-01-01",
    aCode: "1168010100",
    transfer: "2021-06-01",
    right: { acquisitionDate: "2020-03-02", regionCode: "1165010100", originalMemberMoveInDate: "2020-04-01" },
  });
  const contract = page.getByTestId("original-member-contract-date-0");
  await contract.getByRole("textbox", { name: "연도" }).fill("2019");
  await contract.getByRole("textbox", { name: "월" }).fill("12");
  await contract.getByRole("textbox", { name: "일" }).fill("1");
  await expect(contract.getByRole("textbox", { name: "일" })).toHaveValue("1");
  const body = await judge(page);
  expect(body.presaleRights?.[0]).toMatchObject({ originalMemberContractDate: "2019-12-01" });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});
