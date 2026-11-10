/**
 * 조특법 §99·§99의3·§99의4 리뷰 수정분 — 입력 화면 브라우저 확인 (갈래 B1)
 *
 * 각 시나리오: 폼 입력 → 화면 표시 확인 → 계산 → 요청 body에 신규 필드가 실렸는지(`page.waitForRequest`) → 결과 값/문구.
 * 세액 시료·기대값은 PR의 route anchor(`__tests__/api/transfer.route.new-99-4-l2b.anchor.test.ts` ·
 * `transfer.route.nh99-redev-member.anchor.test.ts` · `nh99-l14-redev-inherited-member.anchor.test.ts`)와 같다.
 * 외부 API(주소·시가표준액)는 호출하지 않는다 — 기준시가는 손으로 입력한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const EUMSEONG = "4377037000";
const YANGPYEONG = "4183025000";

type Body = {
  reductions?: Record<string, unknown>[];
  specialHouseExclusions?: Record<string, unknown>[];
  redevelopment?: Record<string, unknown>;
};

/** 음성 일반주택(2010 취득·4억) 9억 양도 · 거주 60개월 · 비조정 — L2b route anchor와 같은 시료. */
async function openUmseong(
  page: Page,
  o: { transferDate: string; rowAcq: string; genAcq?: string; rowRegion?: string; rowJibun?: string },
) {
  await gotoTransferHoldingsStep(page, {
    houses: [
      otherHouse("r", o.rowAcq, {
        regionCode: o.rowRegion ?? EUMSEONG,
        addressJibun: o.rowJibun ?? "충청북도 음성군 감곡면 리 1",
      }),
    ],
    assetOver: {
      regionCode: EUMSEONG,
      acquisitionDate: o.genAcq ?? "2010-01-01",
      fixedAcquisitionPrice: "400000000",
      residencePeriodMonthsAsset: "60",
    },
    formOver: { transferDate: o.transferDate, contractTotalPrice: "900000000", residencePeriodMonths: "60" },
  });
  // hydration — 클릭이 React에 닿기 전에 유실되지 않게(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector("button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function openRowDeclaration(page: Page) {
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("house-row-count-exclusion-new_99_4_rural").click();
  await expect(dialog.getByTestId("new994-adjacent")).toBeVisible();
  return dialog;
}

/** 포커스·스크롤 영향 없이 모달을 닫는다. */
async function done(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "완료" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

function trackPosts(page: Page) {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posts.push(r.url());
  });
  return posts;
}

async function toCalculateStep(page: Page) {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
}

/** 「세금 계산하기」 → 요청 body + 응답 JSON. */
async function calculate(page: Page) {
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Body;
  const res = await resP;
  return { body, status: res.status(), json: (await res.json()) as { data?: { result: Record<string, unknown> } } };
}

/** 계산 단계로 가서 「세금 계산하기」를 눌렀는데 요청이 나가지 않고 문구가 뜨는지. */
async function expectBlocked(page: Page, posts: string[], text: string | RegExp) {
  const before = posts.length;
  await toCalculateStep(page);
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  expect(posts.length, "차단되어야 하는데 계산 요청이 나갔다").toBe(before);
}

test.describe("§99의4 (PR #2943·#2949) — 명부 행 농어촌주택 선언", () => {
  test("[A-1] 연접 질문: 기본값 없음 → 미응답 차단 → 「아니오」 body adjacentArea994 → 세액 0 · 적용 한도 echo", async ({ page }) => {
    test.setTimeout(120_000);
    const posts = trackPosts(page);
    await openUmseong(page, { transferDate: "2025-06-02", rowAcq: "2018-05-01" });
    const dialog = await openRowDeclaration(page);

    // 예/아니오/모름 3지선다, 기본값 없음
    await expect(dialog.getByText(/같은 .* 또는 연접한 .*에 있나요\?/)).toBeVisible();
    for (const v of ["yes", "no", "unknown"]) {
      await expect(dialog.getByTestId(`new994-adjacent-${v}`)).toBeVisible();
      await expect(dialog.getByTestId(`new994-adjacent-${v}`)).not.toBeChecked();
    }
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a1-adjacent-radios.png", fullPage: true });

    await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
    await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    await done(page);

    // 미응답이면 계산 전에 막는다 (⑧)
    await expectBlocked(page, posts, /예·아니오·모름/);
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a1-blocked.png", fullPage: true });

    // 「아니오」 → 계산 요청 body에 adjacentArea994
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await page.getByRole("dialog").getByTestId("new994-adjacent-no").click();
    await expect(page.getByRole("dialog").getByTestId("new994-adjacent-no")).toBeChecked();
    await done(page);
    await toCalculateStep(page);
    const { body, status, json } = await calculate(page);
    expect(status).toBe(200);
    expect(body.reductions).toEqual([
      expect.objectContaining({
        type: "new_99_4_rural",
        houseId: "r",
        adjacentArea994: "no",
        meetsLocationRequirement: true,
        ruralHouseAcquisitionDate: "2018-05-01",
      }),
    ]);
    // 2025 양도 — 면적 필드는 싣지 않는다
    expect(body.reductions![0]).not.toHaveProperty("ruralLandAreaSqm994");
    expect(json.data!.result.totalTax).toBe(0);

    // 결과 화면 「적용 한도」 echo
    const limit = page.getByTestId("new994-applied-limit");
    await expect(limit).toBeVisible();
    await expect(limit).toContainText("적용 한도");
    await expect(limit).toContainText("3억 이하");
    await expect(limit).toContainText("조특법 §99의4");
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a1-result-limit.png", fullPage: true });
  });

  test("[A-2] 「모름」 → 계산 진행 · body unknown · 불성립 + 확인 필요 · 세액 124,366,000 (= 선언 없는 대조)", async ({ page }) => {
    test.setTimeout(120_000);
    await openUmseong(page, { transferDate: "2025-06-02", rowAcq: "2018-05-01" });
    const dialog = await openRowDeclaration(page);
    await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
    await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    await dialog.getByTestId("new994-adjacent-unknown").click();
    await expect(dialog.getByTestId("new994-adjacent-unknown")).toBeChecked();
    await done(page);
    await toCalculateStep(page);
    const { body, json } = await calculate(page);
    expect(body.reductions![0]).toEqual(expect.objectContaining({ adjacentArea994: "unknown" }));
    expect(json.data!.result.totalTax).toBe(124_366_000);
    const detail = json.data!.result.new994Detail as { isEligible: boolean; ineligibleReasons: { code: string }[] };
    expect(detail.isEligible).toBe(false);
    expect(detail.ineligibleReasons.map((x) => x.code)).toEqual(["ADJACENT_UNCONFIRMED"]);
    await expect(page.getByText("적용 불가").first()).toBeVisible();
    await expect(page.getByText(/확인 필요/).first()).toBeVisible();
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a2-unknown-result.png", fullPage: true });
  });

  test("[A-3] 2019 양도: 대지면적 칸 표시·필수 → 661㎡ body → 불성립 160,160,000 (짝 2026 양도는 숨김)", async ({ page }) => {
    test.setTimeout(120_000);
    const posts = trackPosts(page);
    await openUmseong(page, { transferDate: "2019-06-01", rowAcq: "2015-03-01", genAcq: "2012-01-01" });
    const dialog = await openRowDeclaration(page);
    await expect(dialog.getByTestId("new994-size-fields")).toBeVisible();
    await expect(dialog.getByTestId("new994-land-area")).toBeVisible();
    await expect(dialog.getByText("2021.1.1. 전 양도분은 대지면적이 660㎡ 이내여야 합니다", { exact: false })).toBeVisible();
    await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
    await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    await dialog.getByTestId("new994-adjacent-no").click();
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a3-land-area-field.png", fullPage: true });
    await done(page);

    // 대지면적 미입력 → 차단
    await expectBlocked(page, posts, /대지면적/);

    // 661㎡ → 요청 body에 ruralLandAreaSqm994
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await page.getByRole("dialog").getByTestId("new994-land-area").fill("661");
    await done(page);
    await toCalculateStep(page);
    const { body, json } = await calculate(page);
    expect(body.reductions![0]).toEqual(expect.objectContaining({ adjacentArea994: "no", ruralLandAreaSqm994: 661 }));
    const detail = json.data!.result.new994Detail as { isEligible: boolean; ineligibleReasons: { code: string }[] };
    expect(detail.ineligibleReasons.map((x) => x.code)).toEqual(["LAND_AREA_EXCEEDED"]);
    expect(json.data!.result.totalTax).toBe(160_160_000);
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a3-result-661.png", fullPage: true });
  });

  test("[A-3+] 짝: 2019 양도 대지 660㎡ → 적격 · 세액 0 · body 660", async ({ page }) => {
    test.setTimeout(120_000);
    await openUmseong(page, { transferDate: "2019-06-01", rowAcq: "2015-03-01", genAcq: "2012-01-01" });
    const dialog = await openRowDeclaration(page);
    await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
    await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    await dialog.getByTestId("new994-adjacent-no").click();
    await dialog.getByTestId("new994-land-area").fill("660");
    await done(page);
    await toCalculateStep(page);
    const { body, json } = await calculate(page);
    expect(body.reductions![0]).toEqual(expect.objectContaining({ ruralLandAreaSqm994: 660 }));
    expect(json.data!.result.totalTax).toBe(0);
    const limit = page.getByTestId("new994-applied-limit");
    await expect(limit).toBeVisible();
  });

  test("[A-4] 2026 양도: 대지면적·주택 유형 칸이 숨겨지고 body에도 면적 필드가 없다", async ({ page }) => {
    test.setTimeout(120_000);
    await openUmseong(page, { transferDate: "2026-06-01", rowAcq: "2018-05-01" });
    const dialog = await openRowDeclaration(page);
    await expect(dialog.getByTestId("new994-size-fields")).toHaveCount(0);
    await expect(dialog.getByTestId("new994-land-area")).toHaveCount(0);
    await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
    await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    await dialog.getByTestId("new994-adjacent-no").click();
    await done(page);
    await toCalculateStep(page);
    const { body, status } = await calculate(page);
    expect(status).toBe(200);
    for (const k of ["ruralLandAreaSqm994", "ruralHouseType994", "ruralHouseAreaSqm994"]) {
      expect(body.reductions![0]).not.toHaveProperty(k);
    }
  });

  test("[A-5] 수도권(양평) 행 + 소재지 「예」 → 입력 화면 차단 문구 · 요청 없음 · 끄면 진행", async ({ page }) => {
    test.setTimeout(120_000);
    const posts = trackPosts(page);
    await openUmseong(page, {
      transferDate: "2025-06-02",
      rowAcq: "2018-05-01",
      rowRegion: YANGPYEONG,
      rowJibun: "경기도 양평군 양평읍 테스트리 1",
    });
    const dialog = await openRowDeclaration(page);
    await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
    await dialog.getByTestId("new994-adjacent-no").click();
    // 소재지 OFF — 충돌 안내 없음
    await expect(dialog.getByTestId("new994-capital-conflict")).toHaveCount(0);
    await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    const conflict = dialog.getByTestId("new994-capital-conflict");
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText("수도권으로 조회됩니다");
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a5-capital-conflict.png", fullPage: true });
    await done(page);

    // 계산 단계에서도 같은 문장으로 막힌다
    await expectBlocked(page, posts, /수도권으로 조회됩니다/);
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-a5-blocked.png", fullPage: true });

    // 소재지를 끄면 진행(선언 불성립 = 대조 124,366,000)
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await page.getByRole("dialog").getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
    await expect(page.getByRole("dialog").getByTestId("new994-capital-conflict")).toHaveCount(0);
    await done(page);
    await toCalculateStep(page);
    const { json } = await calculate(page);
    expect(json.data!.result.totalTax).toBe(124_366_000);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 2. 재개발 원조합원 (PR #2944) — 감면 패널 「신축주택」 준공일 칸 · 잔여주택 계약 3-state
// ─────────────────────────────────────────────────────────────────────────────

/** 주택 출자 원조합원 완공 아파트 — `transfer.route.nh99-redev-member.anchor.test.ts`의 apt()와 같은 시료. */
const REDEV_APT = {
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  acquisitionCause: "purchase",
  acquisitionDate: "1995-03-01",
  addressJibun: "경기도 테스트시 테스트동 1",
  regionCode: "4113510100",
  actualSalePrice: "600000000",
  transferType: "regular",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "1999-01-01",
  redevOriginalAssetType: "housing",
  redevRightsValue: "300000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "50000000",
  redevPreApprovalExpenses: "0",
  useEstimatedAcquisition: false,
  redevActualAcquisitionPrice: "100000000",
  redevIsSuccessorMember: "no",
  redevCompletionDate: "",
};
const r993 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "self_built",
  standardPriceAtAcquisition993: "200000000",
  standardPriceAt5Years: "300000000",
  standardPriceAtTransfer993: "350000000",
  exclusiveAreaSqm993: "84",
  region993: "outside_speculation",
  isResident993: true,
  isHousingConstructionBusiness993: false,
  houseType993: "apartment",
  previousHouseStdPrice993: "100000000",
  ...over,
});
const r99 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99"),
  acquisitionType99: "self_built",
  standardPriceAtAcquisition99: "200000000",
  standardPriceAt5Years99: "300000000",
  standardPriceAtTransfer99: "400000000",
  exclusiveAreaSqm99: "84",
  houseType99: "apartment",
  isResident99: true,
  isHousingConstructionBusiness99: false,
  previousHouseStdPrice99: "100000000",
  ...over,
});

async function openRedev(page: Page, o: { assetOver: Record<string, unknown>; transferDate: string; contractTotalPrice?: string }) {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: { ...REDEV_APT, ...o.assetOver },
    formOver: {
      transferDate: o.transferDate,
      filingDate: o.transferDate,
      totalTransferExpense: "0",
      contractTotalPrice: o.contractTotalPrice ?? "600000000",
      isOneHousehold: false,
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
    },
  });
  await page.waitForFunction(() => {
    const el = document.querySelector("button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function openReductionPanel(page: Page) {
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  const header = page.getByRole("button", { name: /신축주택/ }).first();
  await header.waitFor();
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
}

const completionField = (page: Page) => page.locator('[data-field="redevCompletionDate"]').first();
const dateOf = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return { year, month: String(Number(month)), day: String(Number(day)) };
};

test.describe("재개발 원조합원 §99의3·§99 (PR #2944) — 준공일 칸 · 잔여주택 계약", () => {
  // B: 인가 2004-01-01 · 준공 2008-06-30(신축주택취득기간 2003.6.30. 뒤) · 양도 2016-06-01 — anchor B: 예 73,375,000 · 아니오/모름 109,285,000
  const B = { redevApprovalDate: "2004-01-01" };

  test("[B-1] §99의3: 준공일 칸 표시·미입력 차단 → 입력하면 잔여주택 계약 질문 → 미응답 차단 → 「예」 body → 73,375,000", async ({ page }) => {
    test.setTimeout(120_000);
    const posts = trackPosts(page);
    await openRedev(page, {
      transferDate: "2016-06-01",
      assetOver: { ...B, reductions: [r993({ standardPriceAtTransfer993: "400000000" })] },
    });
    await openReductionPanel(page);
    await expect(completionField(page)).toBeVisible();
    await expect(page.getByText("준공일 (사용승인·사용검사일", { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId("new993-redev-member")).toBeVisible();
    // 준공일이 비어 있으면 잔여주택 질문은 아직 없다
    await expect(page.getByTestId("new993-remainder-contract")).toHaveCount(0);
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-b1-completion-field.png", fullPage: true });

    // 준공일 비움 → 차단
    await expectBlocked(page, posts, /준공일\(사용승인·사용검사일\)로 신축주택취득기간과 5년을 판정합니다 — 준공일을 입력하세요/);

    // 준공일 2008-06-30 → 잔여주택 계약 3-state
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await fillDateAndVerify(page, dateOf("2008-06-30"), { scope: completionField(page) });
    const q = page.getByTestId("new993-remainder-contract");
    await expect(q).toBeVisible();
    for (const v of ["yes", "no", "unknown"]) {
      await expect(page.getByTestId(`new993-remainder-contract-${v}`)).toBeVisible();
      await expect(page.getByTestId(`new993-remainder-contract-${v}`)).not.toBeChecked();
    }
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-b1-remainder-question.png", fullPage: true });

    // 질문 미응답 → 차단
    await expectBlocked(page, posts, /잔여주택 매매계약을 직접 체결하고 계약금을 받았는지\(예·아니오·모름\)/);

    // 「예」 → 계산
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByTestId("new993-remainder-contract-yes").click();
    await expect(page.getByTestId("new993-remainder-contract-yes")).toBeChecked();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const { body, status, json } = await calculate(page);
    expect(status).toBe(200);
    expect(body.redevelopment).toEqual(expect.objectContaining({ completionDate: "2008-06-30" }));
    expect(body.reductions).toEqual([expect.objectContaining({ type: "new_99_3", remainderContract993: "yes" })]);
    const d = json.data!.result.new993Detail as { isEligible: boolean };
    expect(d.isEligible).toBe(true);
    expect(json.data!.result.totalTax).toBe(73_375_000);
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-b1-result.png", fullPage: true });
  });

  for (const [answer, code, tax] of [
    ["no", "NO_REMAINDER_CONTRACT", 109_285_000],
    ["unknown", "REMAINDER_CONTRACT_UNCONFIRMED", 109_285_000],
  ] as const) {
    test(`[B-2] §99의3 잔여주택 계약 「${answer === "no" ? "아니오" : "모름"}」 → body ${answer} · 불성립 ${code} · ${tax.toLocaleString("en-US")}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openRedev(page, {
        transferDate: "2016-06-01",
        assetOver: { ...B, redevCompletionDate: "2008-06-30", reductions: [r993({ standardPriceAtTransfer993: "400000000" })] },
      });
      await openReductionPanel(page);
      await expect(page.getByTestId("new993-remainder-contract")).toBeVisible();
      await page.getByTestId(`new993-remainder-contract-${answer}`).click();
      await page.getByRole("button", { name: "가산세", exact: true }).first().click();
      const { body, json } = await calculate(page);
      expect(body.reductions).toEqual([expect.objectContaining({ remainderContract993: answer })]);
      const d = json.data!.result.new993Detail as { isEligible: boolean; ineligibleReasons: { code: string }[] };
      expect(d.isEligible).toBe(false);
      expect(d.ineligibleReasons.map((x) => x.code)).toEqual([code]);
      expect(json.data!.result.totalTax).toBe(tax);
    });
  }

  test("[B-3] 짝: 준공일이 신축주택취득기간 안(2002-06-30)이면 잔여주택 질문이 없다 → 50,723,998 · body completionDate", async ({ page }) => {
    test.setTimeout(120_000);
    await openRedev(page, {
      transferDate: "2006-03-01",
      assetOver: { redevCompletionDate: "2002-06-30", reductions: [r993()] },
    });
    await openReductionPanel(page);
    await expect(completionField(page)).toBeVisible();
    await expect(page.getByTestId("new993-remainder-contract")).toHaveCount(0);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const { body, json } = await calculate(page);
    expect(body.redevelopment).toEqual(expect.objectContaining({ completionDate: "2002-06-30" }));
    expect(body.reductions![0]).not.toHaveProperty("remainderContract993");
    expect(json.data!.result.totalTax).toBe(50_723_998);
  });

  test("[B-4] §99: 준공 2000-06-30(기간 뒤) → 잔여주택 질문(new99) 「예」 body remainderContract99 → 73,375,000", async ({ page }) => {
    test.setTimeout(120_000);
    const posts = trackPosts(page);
    await openRedev(page, {
      transferDate: "2016-06-01",
      assetOver: {
        acquisitionDate: "1990-03-01",
        redevApprovalDate: "1997-01-01",
        redevCompletionDate: "2000-06-30",
        reductions: [r99()],
      },
    });
    await openReductionPanel(page);
    await expect(page.getByTestId("new99-remainder-contract")).toBeVisible();
    await expectBlocked(page, posts, /§99 적용: 준공일이 신축주택취득기간 뒤입니다/);
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByTestId("new99-remainder-contract-yes").click();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const { body, json } = await calculate(page);
    expect(body.reductions).toEqual([expect.objectContaining({ type: "new_99", remainderContract99: "yes" })]);
    expect(body.redevelopment).toEqual(expect.objectContaining({ completionDate: "2000-06-30" }));
    expect(json.data!.result.totalTax).toBe(73_375_000);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 3. 보유 감면주택 유형 (PR #2951) — 명부 행 ⑥ 「조특법 … 신축주택 특례」(소령 §167의3①5호)
// ─────────────────────────────────────────────────────────────────────────────
// 시료(`nh23-24-new-housing-kind.anchor.test.ts`): 양도 2026-09-18 · 20억 · 강남 조정대상지역 · 2주택 중 한 채(행 s)가 보유 감면주택.
//   5호로 인정 → 영 §167의10①10호 중과 배제 582,598,500 / 인정 안 됨 → 2주택 중과 1,141,178,500.
const GANGNAM = "1168010100";
const EXCLUDED = 582_598_500;
const SURCHARGED = 1_141_178_500;

async function openSpecial(page: Page, rowAcq: string) {
  await gotoTransferHoldingsStep(page, {
    houses: [
      otherHouse("s", rowAcq, {
        region: "capital",
        regionCode: GANGNAM,
        addressJibun: "서울특별시 강남구 테스트동 2",
        officialPrice: "300000000",
        isApartment: true,
      }),
    ],
    assetOver: {
      regionCode: GANGNAM,
      addressJibun: "서울특별시 강남구 테스트동 1",
      acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: "300000000",
      actualSalePrice: "2000000000",
      residencePeriodMonthsAsset: "0",
    },
    formOver: {
      transferDate: "2026-09-18",
      contractTotalPrice: "2000000000",
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: "0",
    },
  });
  await page.waitForFunction(() => {
    const el = document.querySelector("button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function chooseNew993Article(page: Page) {
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("house-row-count-exclusion-special").click();
  // 「적용 조문」 Select — 같은 모달에 공시가격 연도 Select도 있으므로 라벨 옆 combobox로 한정
  await dialog.locator('div:has(> label:has-text("적용 조문"))').getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("listbox").getByRole("option", { name: /§99의3 — 신축주택의 취득자에 대한 양도소득세의 과세특례/ }).click();
  await expect(dialog.getByTestId("special-house-exclusion-kind")).toBeVisible();
  return dialog;
}

/** 3-state 라디오(예·아니오·모름) — 보유 감면주택 칸의 선택지는 testid가 없어 그룹 testid + 이름으로 잡는다. */
const tri = (dialog: ReturnType<Page["getByRole"]>, group: "outside" | "national", v: "yes" | "no" | "unknown") =>
  dialog
    .getByTestId(`special-house-exclusion-original-${group}`)
    .getByRole("radio", { name: { yes: "예", no: "아니오", unknown: "모름" }[v], exact: true });

const dateAfterLabel = (dialog: ReturnType<Page["getByRole"]>, label: string) =>
  dialog.locator(`label:has-text("${label}")`).locator("xpath=following-sibling::*[1]");

test.describe("보유 감면주택 §99·§99의3 유형 (PR #2951) — 명부 행 ⑥ special", () => {
  test("[C-1] §99의3 유형 4지선다(기본값 없음)·기준일 칸 미표시 → 미선택 차단 → 매수 → 계약일 칸만 → body housingKind → 582,598,500", async ({ page }) => {
    test.setTimeout(60_000);
    const posts = trackPosts(page);
    await openSpecial(page, "2002-08-01");
    const dialog = await chooseNew993Article(page);
    for (const k of ["purchase", "self_built", "original_purchase", "original_self_built"]) {
      await expect(dialog.getByTestId(`special-house-exclusion-kind-${k}`)).toBeVisible();
      await expect(dialog.getByTestId(`special-house-exclusion-kind-${k}`)).not.toBeChecked();
    }
    // 유형 선택 전에는 기준일 칸이 없다
    await expect(dialog.getByText("감면주택 최초 매매계약일")).toHaveCount(0);
    await expect(dialog.getByText("감면주택 사용승인일(취득일)")).toHaveCount(0);
    await expect(dialog.getByTestId("special-house-exclusion-original-outside")).toHaveCount(0);
    await dialog.getByRole("switch", { name: /해당 조문 본 요건 충족 확인/ }).click();
    await dialog.screenshot({ path: "e2e/_artifacts/nh99-b1-c1-kind-radios.png" });
    await done(page);

    // 유형 미선택 → 계산 차단
    await expectBlocked(page, posts, /감면주택의 유형\(주택건설사업자로부터 매수 \/ 자기가 건설\)을 선택하세요/);

    // 매수 → 계약일 칸만
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    const d2 = page.getByRole("dialog");
    await d2.getByTestId("special-house-exclusion-kind-purchase").click();
    await expect(d2.getByTestId("special-house-exclusion-kind-purchase")).toBeChecked();
    await expect(d2.getByText("감면주택 최초 매매계약일")).toBeVisible();
    await expect(d2.getByText("감면주택 취득일", { exact: true })).toHaveCount(0);
    await fillDateAndVerify(page, dateOf("2002-05-01"), { scope: dateAfterLabel(d2, "감면주택 최초 매매계약일") });
    await done(page);
    await toCalculateStep(page);
    const { body, status, json } = await calculate(page);
    expect(status).toBe(200);
    expect(body.specialHouseExclusions).toEqual([
      expect.objectContaining({ houseId: "s", article: "new_99_3", housingKind: "purchase", houseContractDate: "2002-05-01" }),
    ]);
    expect(body.specialHouseExclusions![0]).not.toHaveProperty("originalOutsideMetropolitan");
    expect(json.data!.result.totalTax).toBe(EXCLUDED);
    await expect(page.getByTestId("special-house-exclusion-card")).toBeVisible();
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-c1-result.png", fullPage: true });
  });

  test("[C-2] 짝: 매수 · 계약일이 창 밖(2004-01-01) → 불성립 = 1,141,178,500 (취득일이 창 안이어도 통과하지 않는다)", async ({ page }) => {
    test.setTimeout(120_000);
    await openSpecial(page, "2002-08-01");
    const dialog = await chooseNew993Article(page);
    await dialog.getByRole("switch", { name: /해당 조문 본 요건 충족 확인/ }).click();
    await dialog.getByTestId("special-house-exclusion-kind-purchase").click();
    await fillDateAndVerify(page, dateOf("2004-01-01"), { scope: dateAfterLabel(dialog, "감면주택 최초 매매계약일") });
    await done(page);
    await toCalculateStep(page);
    const { body, json } = await calculate(page);
    expect(body.specialHouseExclusions).toEqual([expect.objectContaining({ housingKind: "purchase", houseContractDate: "2004-01-01" })]);
    expect(json.data!.result.totalTax).toBe(SURCHARGED);
  });

  test("[C-3] 종전(원시) §99의3 매수: 계약일·수도권 밖·국민주택 3-state 표시 → 미선택 차단 → 「예·예」 body → 582,598,500", async ({ page }) => {
    test.setTimeout(60_000);
    const posts = trackPosts(page);
    await openSpecial(page, "2001-05-01");
    const dialog = await chooseNew993Article(page);
    await dialog.getByRole("switch", { name: /해당 조문 본 요건 충족 확인/ }).click();
    await dialog.getByTestId("special-house-exclusion-kind-original_purchase").click();
    await expect(dialog.getByText("감면주택 최초 매매계약일")).toBeVisible();
    await expect(dialog.getByTestId("special-house-exclusion-original-outside")).toBeVisible();
    await expect(dialog.getByTestId("special-house-exclusion-original-national")).toBeVisible();
    for (const g of ["outside", "national"]) {
      for (const v of ["yes", "no", "unknown"]) {
        await expect(tri(dialog, g as "outside" | "national", v as "yes")).not.toBeChecked();
      }
    }
    await fillDateAndVerify(page, dateOf("2001-03-01"), { scope: dateAfterLabel(dialog, "감면주택 최초 매매계약일") });
    await dialog.screenshot({ path: "e2e/_artifacts/nh99-b1-c3-original-fields.png" });
    await done(page);

    // 3-state 미선택 → 차단
    await expectBlocked(page, posts, /종전 §99의3: 대통령령이 정하는 수도권 밖 지역에 소재하는지\(예·아니오·모름\) 선택하세요/);

    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    const d2 = page.getByRole("dialog");
    await tri(d2, "outside", "yes").click();
    await tri(d2, "national", "yes").click();
    await done(page);
    await toCalculateStep(page);
    const { body, json } = await calculate(page);
    expect(body.specialHouseExclusions).toEqual([
      expect.objectContaining({
        houseId: "s",
        article: "new_99_3",
        housingKind: "original_purchase",
        houseContractDate: "2001-03-01",
        originalOutsideMetropolitan: "yes",
        originalNationalHousing: "yes",
      }),
    ]);
    expect(json.data!.result.totalTax).toBe(EXCLUDED);
  });

  test("[C-4] 짝: 종전 유형 · 국민주택 「모름」 → body unknown · 불성립 + 확인 필요 = 1,141,178,500", async ({ page }) => {
    test.setTimeout(120_000);
    await openSpecial(page, "2001-05-01");
    const dialog = await chooseNew993Article(page);
    await dialog.getByRole("switch", { name: /해당 조문 본 요건 충족 확인/ }).click();
    await dialog.getByTestId("special-house-exclusion-kind-original_purchase").click();
    await fillDateAndVerify(page, dateOf("2001-03-01"), { scope: dateAfterLabel(dialog, "감면주택 최초 매매계약일") });
    await tri(dialog, "outside", "yes").click();
    await tri(dialog, "national", "unknown").click();
    await done(page);
    await toCalculateStep(page);
    const { body, json } = await calculate(page);
    expect(body.specialHouseExclusions).toEqual([expect.objectContaining({ originalNationalHousing: "unknown" })]);
    expect(json.data!.result.totalTax).toBe(SURCHARGED);
    // 결과 화면 — 소령 §167의3①5호 축 「모름」: 불성립이지만 「확인 필요」가 중과 판정 고지(응답 `multiHouseSurchargeEvaluation.warnings` · 화면 중과 상세)에 나온다 (L15 C-4).
    const evaluation = json.data!.result.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; warnings?: string[] };
    expect(evaluation.surchargeApplicable).toBe(true);
    const notice = (evaluation.warnings ?? []).find((w) => w.startsWith("확인 필요: 주택 수 제외로 선언한 감면주택이 소득세법 시행령 §167의3①5호에 해당하는지"));
    expect(notice, "응답 warnings에 5호 확인 필요").toContain("국민주택(모름·미답)");
    await expect(page.getByTestId("special-house-exclusion-card")).toBeVisible();
    await expect(page.getByText("확인 필요: 주택 수 제외로 선언한 감면주택이 소득세법 시행령 §167의3①5호에 해당하는지", { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-c4-unknown-result.png", fullPage: true });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 4. 상속 원조합원 (PR #2963) — 종전주택 상속 + §99의3 → 「확인 필요 — 정면 해석례 없음」 고지 · 매매 대조와 같은 세액
// ─────────────────────────────────────────────────────────────────────────────
// 시료(`nh99-l14` route anchor Q-1 a S1): 종전주택 상속개시 1996-03-01 · 인가 2000-09-01 · 준공 2002-05-25 · 양도 2005-03-01 · 5억 · 권리가액 3억 · 청산금 납부 5천만.
//   수정 전 98,476,714(불성립 ACQUIRED_BY_INHERITANCE_OR_GIFT) → 후 25,815,247 → 29,593,927(W1 #3154 — 2005 양도분 9/18/27/36 세율표·장특 표1 3단계, route anchor `nh99-l14` S1과 같음) = 매매 대조.
const NOTICE_HEAD = "확인 필요: 종전주택을 상속·증여로 취득했으나 관리처분계획 인가일 전부터 조합원이므로";
const NOTICE_TAIL = /정면으로 다룬 해석례는 확인하지 못했습니다/;

async function runInheritedMember(page: Page, cause: "inheritance" | "purchase") {
  const inherited =
    cause === "inheritance"
      ? {
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "1985-01-01",
          publishedValueAtInheritance: "100000000",
          inheritanceValuationMethod: "supplementary",
        }
      : { acquisitionCause: "purchase" };
  await openRedev(page, {
    transferDate: "2005-03-01",
    contractTotalPrice: "500000000",
    assetOver: {
      acquisitionDate: "1996-03-01",
      actualSalePrice: "500000000",
      redevApprovalDate: "2000-09-01",
      redevCompletionDate: "2002-05-25",
      ...inherited,
      reductions: [
        r993({ standardPriceAtAcquisition993: "100000000", standardPriceAt5Years: "160000000", standardPriceAtTransfer993: "250000000", previousHouseStdPrice993: "60000000" }),
      ],
    },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await toCalculateStep(page);
  return calculate(page);
}

test.describe("상속 원조합원 §99의3 (PR #2963) — 종전주택 상속 · 확인 필요 고지", () => {
  test("[D-1] 상속 취득 종전주택 원조합원 + §99의3 → 적용 · 「확인 필요」 고지가 결과 화면에 보이고 세액이 매매 대조와 같다", async ({ page }) => {
    test.setTimeout(120_000);
    const inh = await runInheritedMember(page, "inheritance");
    expect(inh.status).toBe(200);
    expect((inh.body as Record<string, unknown>).transferPrice).toBe(500_000_000);
    expect(inh.body).toEqual(expect.objectContaining({ acquisitionCause: "inheritance" }));
    const d = inh.json.data!.result.new993Detail as { isEligible: boolean; warnings?: string[]; ineligibleReasons?: { code: string }[] };
    expect(d.isEligible).toBe(true);
    expect(d.ineligibleReasons ?? []).toEqual([]);
    expect((d.warnings ?? []).some((w) => w.startsWith(NOTICE_HEAD) && NOTICE_TAIL.test(w))).toBe(true);
    // 결과 화면(ReductionDetailWarnings)에 같은 문구
    await expect(page.getByText(NOTICE_HEAD, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(NOTICE_TAIL).first()).toBeVisible();
    await expect(page.getByText("신고 전 관할 세무서 확인이 필요합니다", { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: "e2e/_artifacts/nh99-b1-d1-inherited-notice.png", fullPage: true });

    // 매매 대조 — 같은 사실에서 취득 원인만 매매
    const pur = await runInheritedMember(page, "purchase");
    expect((pur.body as Record<string, unknown>).transferPrice).toBe(500_000_000);
    const pd = pur.json.data!.result.new993Detail as { isEligible: boolean; warnings?: string[] };
    expect(pd.isEligible).toBe(true);
    expect((pd.warnings ?? []).some((w) => NOTICE_TAIL.test(w))).toBe(false);
    await expect(page.getByText(NOTICE_HEAD, { exact: false })).toHaveCount(0);
    expect(inh.json.data!.result.totalTax).toBe(pur.json.data!.result.totalTax);
    expect(inh.json.data!.result.totalTax).toBe(29_593_927);
  });
});
