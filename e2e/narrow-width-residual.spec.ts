/**
 * E2E: 좁은 폭 잔여 넘침 — 회귀.
 *
 * ① FieldCard 라벨-좌 배치가 화면 폭(sm) 기준이라, 330px 남짓한 카드에서 입력 자리가 122px로 줄어
 *    날짜칸(약 150px)이 카드 밖으로 넘쳤다(768 전체 E2E 실측 2,319회). sm 이상을 flex-wrap으로 바꿔
 *    입력의 최소 폭이 라벨 옆에 안 들어갈 때만 본문이 라벨 아래로 내려간다.
 * ② 375에서 화면별로 남은 넘침 — 모바일에서도 2열이던 날짜칸 격자, 직접 쓴 값 span이 줄지 않던 Select.
 * 계획서: docs/00-pm/ui-narrow-width-and-dark-mode-residual.plan.md ①②
 * ③ 그 뒤 375에 남은 44회 — 패딩 상자 8~9겹이 카드 안쪽을 73~117px로 줄인 깊은 중첩(공시지가 연도·최초 공시일),
 *    `w-fit` 그대로 늘어나던 유예 「사유」 Select, 375에도 2열이던 부속시설 면적 격자.
 * 계획서: docs/00-pm/ui-narrow-375-residual-overflow.plan.md
 * ④ 페이지 전체 가로 스크롤 — 처음 열기만 해도 재현되는 두 화면(나머지는 각 spec 끝에서 expectNoPageHScroll).
 * 계획서: docs/00-pm/ui-narrow-375-page-hscroll.plan.md
 *
 * 실행: E2E_PORT=3181 npx playwright test e2e/narrow-width-residual.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { NBL_FIELD_JUMP_CASES } from "./_helpers/validation-field-jump-cases-nbl";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";

/** 카드 안쪽 오른쪽 끝을 넘은 보이는 요소 수 — 1.5px까지는 반올림으로 본다 */
async function overflowCount(card: Locator) {
  return card.evaluate((c) => {
    const cs = getComputedStyle(c);
    const right = c.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return [...c.querySelectorAll("*")].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 1 && b.height > 1 && b.right > right + 1.5;
    }).length;
  });
}

/** 라벨과 입력 본문이 같은 줄인가(라벨-좌) */
async function labelBeside(card: Locator) {
  return card.evaluate((c) => {
    const label = c.querySelector(":scope > label")!.getBoundingClientRect();
    const body = c.querySelector(":scope > div")!.getBoundingClientRect();
    return body.top < label.bottom && body.left >= label.right;
  });
}

const cardByLabel = (page: Page, label: string | RegExp) =>
  page.locator("[data-slot=field-card]").filter({ has: page.locator(":scope > label", { hasText: label }) }).first();

test.describe("① 양도일·신고일 — 화면 폭별 배치", () => {
  for (const [width, beside] of [[768, false], [1280, true], [375, false]] as const) {
    test(`${width}px — 날짜칸이 카드 안, 라벨 ${beside ? "옆" : "위"}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/calc/transfer-tax");
      await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
      for (const label of [/양도일/, /^신고일/]) {
        const card = cardByLabel(page, label);
        await card.waitFor();
        expect(await overflowCount(card), `${label} 카드 밖으로 넘쳤다`).toBe(0);
        expect(await labelBeside(card)).toBe(beside);
      }
    });
  }
});

test("② 375px 건물 기준시가 — 연도·날짜 짝과 구조·용도 짝이 카드 밖으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/tools/building-standard-price");
  await page.getByPlaceholder("신축연도 (4자리)").waitFor();
  for (const label of ["취득연도", "취득일", "양도연도", "양도일", "취득당시 구조", "양도당시 구조"]) {
    const card = cardByLabel(page, new RegExp(`^${label}`));
    await card.waitFor();
    expect(await overflowCount(card), `「${label}」 카드 밖으로 넘쳤다`).toBe(0);
  }
});

for (const width of [375, 1280]) test(`② ${width}px 공시지가 연도 Select — 카드 밖으로 넘치지 않고${width === 1280 ? ", 값이 잘리지 않는다" : ""}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", assetLabel: "상속 주택",
          acquisitionCause: "inheritance", acquisitionDate: "2000-03-01", inheritanceStartDate: "2000-03-01",
          decedentAcquisitionDate: "1975-03-01", inheritanceAssetKind: "house_individual", inheritanceValuationMethod: "supplementary",
          publishedValueAtInheritance: "50000000", acquisitionArea: "200", actualSalePrice: "500000000",
        }],
        transferDate: "2025-06-01", houses: [], presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
  // ③ 의제취득일 이후 상속 주택 — 「최초 공시일」 날짜칸(최소 150px)이 깊은 중첩 안에서 넘치지 않는다
  const first = cardByLabel(page, /^이 주택의 개별주택가격 최초 공시일/);
  await first.waitFor();
  expect(await overflowCount(first), "최초 공시일 카드 밖으로 넘쳤다").toBe(0);
  const cards = page.locator("[data-slot=field-card]").filter({ has: page.locator(":scope > label", { hasText: /^공시지가 연도/ }) });
  await cards.first().waitFor();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if (!(await card.isVisible())) continue;
    expect(await overflowCount(card), `공시지가 연도 카드 ${i} 밖으로 넘쳤다`).toBe(0);
    if (width === 1280) {
      // 넓은 화면에서는 조회 버튼이 아래 줄로 내려가더라도 연도 값(「2025년 (자동)」)이 말줄임되지 않는다
      const clipped = await card.locator("[data-slot=select-trigger] > span").evaluate((e) => e.scrollWidth > e.clientWidth + 1);
      expect(clipped, `공시지가 연도 카드 ${i} 값이 잘렸다`).toBe(false);
    }
  }
});

const seedTransfer = async (page: Page, formData: Record<string, unknown>) => {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData: { ...createDefaultTransferFormData(), ...formData }, currentStep: 0, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
};

test("③ 375px 의제취득일 이전 상속 주택 — 「최초 공시일」 날짜칸이 카드 밖으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await seedTransfer(page, {
    assets: [{
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", assetLabel: "상속 주택",
      acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26",
      inheritanceAssetKind: "house_individual", acquisitionArea: "200", actualSalePrice: "500000000",
    }],
    transferDate: "2025-06-01",
  });
  await expandAssetSection(page, 3);
  const card = cardByLabel(page, /^이 주택의 개별주택가격 최초 공시일/);
  await card.waitFor();
  expect(await overflowCount(card), "최초 공시일 카드 밖으로 넘쳤다").toBe(0);
});

test("③ 375px 감면 PHD 공시지가 연도(LandPriceLookupField) — 조회 버튼(91px)이 카드 밖으로 넘치지 않는다", async ({ page }) => {
  test.setTimeout(60_000);
  // 단계 이동 버튼(사이드바)은 넓은 화면에만 있다 — 1280에서 「감면·공제」로 간 뒤 375로 줄인다
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedTransfer(page, {
    assets: [{
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing",
      acquisitionCause: "purchase", acquisitionDate: "2003-11-28", actualAcquisitionPrice: "200000000",
      reductions: [
        { ...getReductionDefault("new_99_3"), phdMode993: true },
        { ...getReductionDefault("unsold_98_8"), phdMode988: true },
      ],
    }],
    transferDate: "2026-03-02", filingDate: "2026-04-30", contractTotalPrice: "420000000", householdHousingCount: "2",
  });
  await page.getByRole("button", { name: "감면·공제", exact: true }).click();
  await expandReductionCategory(page, /신축주택/);
  await expandReductionCategory(page, /미분양주택/);
  await page.setViewportSize({ width: 375, height: 900 });
  const cards = page.locator("[data-slot=field-card]").filter({ has: page.locator(":scope > label", { hasText: /^공시지가 연도/ }) });
  await cards.first().waitFor();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if (!(await card.isVisible())) continue;
    expect(await overflowCount(card), `공시지가 연도 카드 ${i} 밖으로 넘쳤다`).toBe(0);
  }
});

test("③ 375px 겸용주택 3시점 공시지가 연도 — 조회 버튼이 아래 줄로 내려가 연도 칸이 짓눌리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  // 겸용 Case A(최초공시 2015 < 용도변경 2018) — transfer-phd-building-stdprice-calculator T6을 UI로 거친 상태
  await seedTransfer(page, {
    assets: [{
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
      acquisitionDate: "2010-06-15", useEstimatedAcquisition: true, hasSeperateLandAcquisitionDate: true,
      usePreHousingDisclosure: true, phdFirstDisclosureDate: "2015-04-30",
      isMixedUseHouse: true, residentialExclusiveArea: "120", commercialExclusiveArea: "80",
      residentialFloorArea: "120", nonResidentialFloorArea: "80", buildingFootprintArea: "100",
      hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", partialChangeDate: "2018-06-15",
    }],
    transferDate: "2025-05-01",
  });
  await expandAssetSection(page, 3);
  const cards = page.locator("[data-slot=field-card]").filter({ has: page.locator(":scope > label", { hasText: /^공시지가 연도/ }) });
  await cards.first().waitFor();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if (!(await card.isVisible())) continue;
    expect(await overflowCount(card), `공시지가 연도 카드 ${i} 밖으로 넘쳤다`).toBe(0);
    // 버튼과 한 줄에 묶이면 연도 칸이 버튼 몫(99px)을 뺀 몇십 px로 짓눌린다 — 8rem(또는 카드 안쪽 폭) 아래로 줄지 않아야 한다
    const [trigger, inner] = await card.evaluate((c) => {
      const cs = getComputedStyle(c);
      return [c.querySelector("[data-slot=select-trigger]")!.getBoundingClientRect().width, c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)];
    });
    expect(trigger, `공시지가 연도 카드 ${i} 연도 칸이 짓눌렸다`).toBeGreaterThanOrEqual(Math.min(128, inner) - 1);
  }
});

for (const width of [375, 1280]) test(`③ ${width}px 비사업용 토지 유예 「사유」 — 긴 사유가 카드 밖으로 넘치지 않고${width === 1280 ? " 잘리지 않는다" : " 한 줄로 말줄임된다"}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const c = NBL_FIELD_JUMP_CASES.find((x) => x.name === "nbl: 유예 개시일")!;
  await seedTransfer(page, c.form());
  // 검증 오류 → 입력칸 이동으로 유예기간 칸까지 연다(field-jump spec과 같은 경로)
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByTestId("validation-issues").getByRole("button", { name: c.message }).click();
  const card = cardByLabel(page, /^사유/);
  await card.waitFor();
  expect(await overflowCount(card), "사유 카드 밖으로 넘쳤다").toBe(0);
  const trigger = card.locator("[data-slot=select-trigger]");
  await expect(trigger).toContainText("법령상 사용 금지·제한 (영 §168의14①1호)");
  const { h, clipped } = await trigger.evaluate((t) => {
    const s = t.querySelector("[data-slot=select-value] > span")!;
    return { h: t.getBoundingClientRect().height, clipped: s.scrollWidth > s.clientWidth + 1 };
  });
  expect(h, "사유 트리거가 여러 줄로 늘어났다").toBeLessThanOrEqual(40);
  expect(clipped).toBe(width === 375);
});

test("③ 375px 건물 기준시가 부속시설 — 면적을 넣어 층 칸이 나타나도 카드·페이지 밖으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/tools/building-standard-price");
  await page.getByText("상속·증여(1시점)").click();
  await page.getByPlaceholder("신축연도 (4자리)").fill("2000");
  await page.getByLabel("연도", { exact: true }).fill("2026");
  await page.getByLabel("월", { exact: true }).fill("03");
  await page.getByLabel("일", { exact: true }).fill("15");
  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click();
  const kinds = ["주차장", "기계실", "보일러실", "대피소", "옥탑", "기타"];
  for (const k of kinds) await page.getByPlaceholder(`${k} 면적`).fill("10");
  await expect(page.getByPlaceholder("층(예 지하1)")).toHaveCount(kinds.length);
  for (const k of kinds) expect(await overflowCount(cardByLabel(page, new RegExp(`^${k}`))), `「${k}」 카드 밖으로 넘쳤다`).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "페이지 가로 스크롤").toBeLessThanOrEqual(375);
});

test("④ 375px 상속세 첫 화면 — 상속개시일 날짜칸이 페이지 밖으로 넘치지 않는다(640px 이상은 3열)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/calc/inheritance-tax");
  await page.getByText("상속개시일 (사망일)").waitFor();
  await expectNoPageHScroll(page);
  // 1280에서는 성명·주민등록번호·상속개시일이 한 줄 3열 그대로다
  await page.setViewportSize({ width: 1280, height: 900 });
  const tops = await page.evaluate(() => {
    const g = [...document.querySelectorAll(".grid")].find((x) => x.textContent?.includes("상속개시일 (사망일)") && x.textContent.includes("주민등록번호"))!;
    return [...g.children].map((c) => Math.round(c.getBoundingClientRect().top));
  });
  expect(new Set(tops).size, "1280 3열이 아니다").toBe(1);
});

test("④ 375px 법령 리서치 — 탭 5개가 모두 화면 안에 보이고 페이지가 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/law");
  const tabs = page.getByRole("tablist").getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expectNoPageHScroll(page);
  for (let i = 0; i < 5; i++) await expect(tabs.nth(i)).toBeInViewport({ ratio: 1 });
});
