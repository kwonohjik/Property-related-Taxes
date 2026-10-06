/**
 * S3-2 — 겸용주택 주택분 기준시가 분할(뺄셈 → 가목:나목 비례) UI E2E
 *
 * 입력 「취득시/양도시 주택건물 기준시가」(나목) 2칸: 노출(⑤) · 필수 ⑧(+입력칸 이동) · 전송 ④ · 결과 산식 ⑦ · 컴패니언 · 모달.
 * 노출·필수·전송·⑫·엔진이 **같은 술어**(엔진 leaf `mixed-use-housing-std.ts`)라 「칸이 없는데 막히는」 막다른 길이 없어야 한다.
 *
 * 설계: docs/02-design/features/housing-std-split-proportional-s3-2.ui.design.md §8 (H1~H13)
 * 규약: 미노출 단언에는 같은 spec의 긍정 단언이 짝으로 있다(`feedback_negative_anchor_needs_positive_twin`).
 *
 * worktree 실행: E2E_PORT=3132 npx playwright test e2e/mixed-use-housing-std-proportional.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const ACQ_CARD = "mixed-acq-housing-building-std-card";
const TR_CARD = "mixed-transfer-housing-building-std-card";
const ACQ_IN = "mixed-acq-housing-building-std";
const TR_IN = "mixed-transfer-housing-building-std";

/**
 * 시드 — 주택 100㎡ · 상가 100㎡ · 대지 200㎡(주택 부수토지 100㎡).
 * 취득: 개별주택가격 300M · 가목 2.5M×100㎡=250M · 나목 150M / 양도: H_T 600M · 가목 5M×100㎡=500M · 나목 300M.
 */
function mixedAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetId: "mx1",
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    isMixedUseHouse: true,
    acquisitionDate: "2010-03-15",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedAcqHousingBuildingStdPrice: "150000000",
    mixedTransferHousingBuildingStdPrice: "300000000",
    mixedIsMetropolitanArea: true,
    useEstimatedAcquisition: true,
    fixedAcquisitionPrice: "700000000",
    actualSalePrice: "1500000000",
    decedentAcquisitionDate: "2005-01-01", // 상속 시드 필수(피상속인 취득일) — 상속이 아니면 쓰이지 않는다
    inheritanceStartDate: "2010-03-15",
    inheritanceDate: "2010-03-15",
    ...over,
  };
}

function formOf(assets: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return {
    ...createDefaultTransferFormData(),
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets,
    transferDate: "2026-02-16",
    filingDate: "2026-04-30",
    contractTotalPrice: "1500000000",
    householdHousingCount: "1",
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    ...extra,
  };
}

async function seedForm(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function seed(page: Page, asset: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  await seedForm(page, formOf([asset], extra));
  await expandAssetSection(page, 3);
}

/** CurrencyInput은 값이 있는 칸에 fill하면 이어붙는다 — 비운 뒤 입력한다. */
async function setAmount(page: Page, testid: string, v: string) {
  const input = page.getByTestId(testid);
  await input.fill("");
  await input.fill(v);
}

interface CapturedMixedUse {
  acquisitionStandardPrice: { housingBuildingPrice?: number; landPricePerSqm?: number };
  transferStandardPrice: { housingBuildingPrice?: number };
}
async function calcAndCapture(page: Page): Promise<CapturedMixedUse> {
  const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const req = await reqPromise;
  const body = req.postDataJSON() as { mixedUse?: CapturedMixedUse; assets?: Array<{ mixedUse?: CapturedMixedUse }> };
  return (body.mixedUse ?? body.assets?.[0]?.mixedUse) as CapturedMixedUse;
}

const H2C = { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", partialChangeDate: "2020-01-01" };
const C2H = { hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house", partialChangeDate: "2020-01-01" };
const SEPARATE = {
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-06-10",
  mixedAcqLandPricePerSqmAtBuildingAcq: "1800000",
};

test.describe("S3-2 겸용 — 주택건물 기준시가(나목) 칸", () => {
  test("H1 노출·순서·라벨 · H2 PHD ON 부정 짝", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset());
    // H1 긍정 — 두 칸 1개씩
    await expect(page.getByTestId(ACQ_CARD)).toHaveCount(1);
    await expect(page.getByTestId(TR_CARD)).toHaveCount(1);
    await expect(page.getByTestId(ACQ_CARD)).toContainText("취득시 주택건물 기준시가");
    await expect(page.getByTestId(TR_CARD)).toContainText("양도시 주택건물 기준시가");
    await expect(page.getByTestId(ACQ_CARD)).not.toContainText("건물 취득일 기준"); // 같은 날짜 — 별개 취득 안내 없음(H6의 짝)
    // 앵커 = ⑧의 입력칸 이동 키
    await expect(page.locator('[data-field="mixedAcqHousingBuildingStdPrice"]')).toHaveCount(1);
    await expect(page.locator('[data-field="mixedTransferHousingBuildingStdPrice"]')).toHaveCount(1);
    // 기존 상가건물 기준시가 칸과 구별된다(data-field가 다르다)
    await expect(page.locator('[data-field="mixedAcqCommercialBuildingPrice"]')).toHaveCount(1);
    // DOM 순서(계산 순서): 취득 H → 취득 N → 양도 H_T → 양도 N → ③ 상가
    const order = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!;
      const pos = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const hAcq = q('[data-field="mixedAcqHousingPrice"]');
      const nAcq = q('[data-testid="mixed-acq-housing-building-std-card"]');
      const hTr = q('[data-field="mixedTransferHousingPrice"]');
      const nTr = q('[data-testid="mixed-transfer-housing-building-std-card"]');
      const comm = q('[data-field="mixedAcqCommercialBuildingPrice"]');
      return [pos(hAcq, nAcq), pos(nAcq, hTr), pos(hTr, nTr), pos(nTr, comm)];
    });
    expect(order).toEqual([true, true, true, true]);
    // 입력칸은 보이고 수정된다
    await setAmount(page, ACQ_IN, "160000000");
    await expect(page.getByTestId(ACQ_IN)).toHaveValue(/^160,?000,?000$/);

    // H2 부정 — 같은 시드에서 PHD ON → 두 칸 0개 (위 긍정의 짝)
    await seed(page, mixedAsset({ usePreHousingDisclosure: true, acquisitionDate: "2000-01-01" }));
    await expect(page.getByTestId(ACQ_CARD)).toHaveCount(0);
    await expect(page.getByTestId(TR_CARD)).toHaveCount(0);
  });

  test("H3 용도변경 주택→상가(양쪽) · H4 상가→주택(양도만)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset(H2C));
    await expect(page.getByTestId(ACQ_CARD)).toHaveCount(1);
    await expect(page.getByTestId(TR_CARD)).toHaveCount(1);
    await seed(page, mixedAsset(C2H));
    await expect(page.getByTestId(ACQ_CARD)).toHaveCount(0); // 취득시 주택이 없다
    await expect(page.getByTestId(TR_CARD)).toHaveCount(1); // 양도시 비율은 쓴다
  });

  test("H5 상속(≥1985) — 라벨 「상속개시일」 · H6 별개 취득(B0) — B0 칸 → 나목 순서", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset({ acquisitionCause: "inheritance", useEstimatedAcquisition: false }));
    await expect(page.getByTestId(ACQ_CARD)).toContainText("상속개시일 주택건물 기준시가");
    await expect(page.getByTestId(TR_CARD)).toHaveCount(1);

    await seed(page, mixedAsset(SEPARATE));
    const b0 = page.getByTestId("mixed-acq-land-price-at-building-acq");
    await expect(b0).toBeVisible();
    await expect(page.getByTestId(ACQ_CARD)).toBeVisible();
    // 별개 취득이면 취득시 나목은 건물 취득일 기준 — 라벨·hint가 밝힌다(같은 날짜 시드의 H1 라벨과 짝)
    await expect(page.getByTestId(ACQ_CARD)).toContainText("건물 취득일 기준");
    const b0First = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="mixed-acq-land-price-at-building-acq"]')!;
      const b = document.querySelector('[data-testid="mixed-acq-housing-building-std-card"]')!;
      return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(b0First).toBe(true);
  });

  test("H7 ⑧ 차단 + 입력칸 이동(포커스·뷰포트) — 취득·양도 각각", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset({ mixedAcqHousingBuildingStdPrice: "", mixedTransferHousingBuildingStdPrice: "" }));
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const issues = page.getByTestId("validation-issues");
    await expect(issues).toContainText(/양도시 주택건물 기준시가를 입력하세요/);
    // 양도 검사가 취득 검사보다 먼저 보고된다(이 파일의 기존 검증 순서) — 양도 칸으로 이동
    await issues.getByText(/양도시 주택건물 기준시가를 입력하세요/).first().click();
    await expect(page.getByTestId(TR_IN)).toBeFocused();
    await expect(page.getByTestId(TR_IN)).toBeInViewport();
    // 채우면 오류가 소멸하고 다음 오류(취득)가 나온다
    await page.getByTestId(TR_IN).fill("300000000");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText(/취득시 주택건물 기준시가를 입력하세요/);
    await expect(page.getByTestId("validation-issues")).not.toContainText(/양도시 주택건물 기준시가를 입력하세요/);
    await page.getByTestId("validation-issues").getByText(/취득시 주택건물 기준시가를 입력하세요/).first().click();
    await expect(page.getByTestId(ACQ_IN)).toBeFocused();
    await expect(page.getByTestId(ACQ_IN)).toBeInViewport();
    await page.getByTestId(ACQ_IN).fill("150000000");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
  });

  test("H8 막다른 길 없음 — 상태마다 나목을 비우고 「다음」: 오류가 나면 그 칸이 보이고, 칸이 없으면 오류도 없다", async ({ page }) => {
    test.setTimeout(240_000);
    const BLANK = { mixedAcqHousingBuildingStdPrice: "", mixedTransferHousingBuildingStdPrice: "" };
    const STATES: Array<[string, Record<string, unknown>, { acq: boolean; transfer: boolean }]> = [
      ["매매 환산", {}, { acq: true, transfer: true }],
      ["상속", { acquisitionCause: "inheritance", useEstimatedAcquisition: false }, { acq: true, transfer: true }],
      ["별개 취득(B0)", SEPARATE, { acq: true, transfer: true }],
      ["용도변경 주택→상가", H2C, { acq: true, transfer: true }],
      ["용도변경 상가→주택", C2H, { acq: false, transfer: true }],
    ];
    for (const [name, over, expected] of STATES) {
      await seed(page, mixedAsset({ ...over, ...BLANK }));
      // 칸 노출 = 술어
      await expect(page.getByTestId(ACQ_CARD), `${name} 취득 칸`).toHaveCount(expected.acq ? 1 : 0);
      await expect(page.getByTestId(TR_CARD), `${name} 양도 칸`).toHaveCount(expected.transfer ? 1 : 0);
      await page.getByRole("button", { name: "다음", exact: true }).click();
      const issues = page.getByTestId("validation-issues");
      await expect(issues, `${name} — 나목 오류는 반드시 난다(양도는 항상)`).toContainText(/양도시 주택건물 기준시가를 입력하세요/);
      // 요구되는 칸은 모두 DOM에 있다(양도 칸 → 채우고 → 취득 요구 확인)
      await expect(page.getByTestId(TR_IN)).toBeVisible();
      await page.getByTestId(TR_IN).fill("300000000");
      await page.getByRole("button", { name: "다음", exact: true }).click();
      const acqErr = issues.getByText(/(취득시|상속개시일) 주택건물 기준시가를 입력하세요/);
      if (expected.acq) {
        await expect(issues).toContainText(/취득시 주택건물 기준시가를 입력하세요|상속개시일 주택건물 기준시가를 입력하세요/);
        await expect(page.getByTestId(ACQ_IN)).toBeVisible();
      } else {
        // 상가→주택: 취득 칸이 없으니 취득 나목 오류도 없다(위 H4 긍정의 짝)
        await expect(acqErr).toHaveCount(0);
        await expect(page.getByTestId("validation-issues")).toHaveCount(0);
      }
    }
  });

  test("H9 request body — 입력값이 두 시점에 실린다 · PHD면 키 없음(짝) · 상가→주택은 취득측 키 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, mixedAsset());
    await setAmount(page, ACQ_IN, "150000000");
    await setAmount(page, TR_IN, "300000000");
    const mu = await calcAndCapture(page);
    expect(mu.acquisitionStandardPrice.housingBuildingPrice).toBe(150_000_000);
    expect(mu.transferStandardPrice.housingBuildingPrice).toBe(300_000_000);
    // 상가건물 기준시가·토지 단가와 섞이지 않는다(서로 다른 키)
    expect(mu.acquisitionStandardPrice.landPricePerSqm).toBe(2_500_000);

    // 상가→주택: 취득측 키 없음 · 양도측 있음 (Legacy 레이아웃)
    await seed(page, mixedAsset(C2H));
    const c2h = await calcAndCapture(page);
    expect(c2h.acquisitionStandardPrice.housingBuildingPrice).toBeUndefined();
    expect(c2h.transferStandardPrice.housingBuildingPrice).toBe(300_000_000);
  });

  test("H9' stale — PHD ON 시드에 나목 값이 남아 있어도 미전송 · H10'' PHD 결과에는 분할 블록이 없다(H10 긍정의 짝)", async ({ page }) => {
    test.setTimeout(90_000);
    // 환산(PHD)은 필수 PHD 입력을 채워야 계산이 통과하므로 요청 본문만 본다(⑧ 통과 여부와 무관하게 본문은 ④가 만든다 — 차단되면 요청이 없다)
    await seed(
      page,
      mixedAsset({
        usePreHousingDisclosure: true,
        acquisitionDate: "2000-01-01",
        phdFirstDisclosureDate: "2005-04-30",
        phdFirstDisclosureHousingPrice: "200000000",
        phdLandPricePerSqmAtFirst: "1500000",
        phdLandPricePerSqmAtAcq: "1000000",
        phdBuildingStdPriceAtAcq: "40000000",
        phdBuildingStdPriceAtFirst: "45000000",
        phdBuildingStdPriceAtTransfer: "90000000",
        phdLandPricePerSqmAtTransfer: "5000000",
      }),
    );
    await expect(page.getByTestId(ACQ_CARD)).toHaveCount(0);
    const mu = await calcAndCapture(page);
    expect(mu.acquisitionStandardPrice.housingBuildingPrice).toBeUndefined();
    expect(mu.transferStandardPrice.housingBuildingPrice).toBeUndefined();
    // H10'' — PHD 결과에는 주택분 기준시가 분할 블록이 없다(PHD가 자체 3시점 + 비례를 쓴다 — echo 없음)
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30000 });
    await expect(page.getByTestId("mixed-housing-std-split")).toHaveCount(0);
  });

  test("H10 결과 산식 — 분할 블록의 숫자 = 입력(H·가목·나목)에서 나온 값 · 한국어 라벨", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, mixedAsset());
    await calcAndCapture(page);
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30000 });
    const block = page.getByTestId("mixed-housing-std-split");
    await expect(block).toBeAttached();
    // 취득: 300M × 250M ÷ (250M + 150M) = 187,500,000 / 건물분 112,500,000
    await expect(page.getByTestId("mixed-housing-std-split-acq-land")).toHaveText("187,500,000");
    await expect(page.getByTestId("mixed-housing-std-split-acq-building")).toHaveText("112,500,000");
    // 양도: 600M × 500M ÷ (500M + 300M) = 375,000,000 / 225,000,000
    await expect(page.getByTestId("mixed-housing-std-split-transfer-land")).toHaveText("375,000,000");
    await expect(page.getByTestId("mixed-housing-std-split-transfer-building")).toHaveText("225,000,000");
    const t = (await block.textContent()) ?? "";
    expect(t).toContain("개별주택가격 300,000,000");
    expect(t).toContain("토지 기준시가 250,000,000");
    expect(t).toContain("주택건물 기준시가 150,000,000");
    expect(t).not.toMatch(/floor|Math\./);
    // 개산공제 괄호가 같은 분할값을 가리킨다
    await expect(page.locator("body")).toContainText("취득시 토지분 기준시가 187,500,000");
    await expect(page.locator("body")).toContainText("취득시 건물분 기준시가 112,500,000");
  });

  test("H10' 상속 신고가액만(H 없음) — Q-B: 나목만 필수 · 결과는 raw_ratio 문구", async ({ page }) => {
    test.setTimeout(150_000);
    // 상속 + 신고가액만 + 나목 — Q-B: H 없이도 계산되고 raw_ratio로 표시된다
    await seed(
      page,
      mixedAsset({
        acquisitionCause: "inheritance",
        useEstimatedAcquisition: false,
        mixedAcqHousingPrice: "",
        mixedHousingInheritedValueOverride: "450000000",
        mixedCommercialInheritedValueOverride: "100000000",
      }),
    );
    // Q-B — 상속은 H를 요구하지 않는다: 나목만 있으면 통과
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30000 });
    const acq = page.getByTestId("mixed-housing-std-split-acq");
    await expect(acq).toHaveAttribute("data-kind", "raw_ratio");
    await expect(acq).toContainText("개별주택가격 없음");
    // 가목 250M : 나목 150M 원값 — 개별주택가격 0을 곱하지 않는다
    await expect(page.getByTestId("mixed-housing-std-split-acq-land")).toHaveText("250,000,000");
    await expect(page.getByTestId("mixed-housing-std-split-acq-building")).toHaveText("150,000,000");
  });

  test("H11 B0 경로 — 별개 취득: 나목이 건물 취득일 비례로 실리고 결과 문구가 B0 형태", async ({ page }) => {
    test.setTimeout(150_000);
    // 토지 취득일 가목 250M(2.5M×100㎡) · 건물 취득일 가목 180M(1.8M×100㎡) · 나목(건물일) 120M · H 300M
    await seed(page, mixedAsset({ ...SEPARATE, mixedAcqHousingBuildingStdPrice: "120000000" }));
    const mu = await calcAndCapture(page);
    expect(mu.acquisitionStandardPrice.housingBuildingPrice).toBe(120_000_000);
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30000 });
    const acq = page.getByTestId("mixed-housing-std-split-acq");
    await expect(acq).toHaveAttribute("data-kind", "separate_date_converted");
    // 집행기준 99-164-9(γ1): 취득당시 주택가격 = 300M × (250M + 120M) ÷ (180M + 120M) = 370M
    //   → 토지분 = 370M × 250 ÷ 370 = 250M · 건물분 = 370M − 250M = 120M (H = 건물일 가목 + 나목인 항등 픽스처라 토지분 = 토지일 가목)
    await expect(page.getByTestId("mixed-housing-std-split-acq-converted")).toHaveText("370,000,000");
    await expect(page.getByTestId("mixed-housing-std-split-acq-land")).toHaveText("250,000,000");
    await expect(page.getByTestId("mixed-housing-std-split-acq-building")).toHaveText("120,000,000");
  });

  test("H12 모달 적용 — 양도시: 계산기 결과가 양도시 나목 칸으로 · 반대 시점 적용 버튼 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, mixedAsset({ mixedTransferHousingBuildingStdPrice: "" }));
    await page.getByRole("button", { name: "양도시 주택건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();
    // prefill — 연면적은 주택 연면적(100) · 상가 연면적(100)이 아니다
    await expect(modal.getByPlaceholder("건물 연면적")).toHaveValue("100");
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
    await modal.getByText("구조 선택", { exact: false }).first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택", { exact: false }).first().click();
    await page.getByRole("option", { name: /아파트/ }).first().click();
    // 양도시 개별공시지가(원/㎡)는 자산 값(5,000,000)으로 이미 prefill — 다시 채우지 않는다(이어붙는다)
    await expect(modal.getByPlaceholder("원/㎡").first()).toHaveValue(/^5,?000,?000$/);
    await modal.getByRole("button", { name: "기준시가 계산하기" }).click();
    await expect(modal.getByRole("button", { name: /^취득시 적용/ })).toHaveCount(0);
    await modal.getByRole("button", { name: /^양도시 적용/ }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId(TR_IN)).toHaveValue(/^[1-9][0-9,]+$/);
    // 취득 칸은 건드리지 않는다
    await expect(page.getByTestId(ACQ_IN)).toHaveValue(/^150,?000,?000$/);
  });

  test("H13 구 세션(나목 필드 없음) — ⑧이 막고 그 칸으로 이동한다(막다른 길 아님)", async ({ page }) => {
    test.setTimeout(90_000);
    const a = mixedAsset() as Record<string, unknown>;
    delete a.mixedAcqHousingBuildingStdPrice;
    delete a.mixedTransferHousingBuildingStdPrice;
    await seed(page, a);
    await expect(page.getByTestId(ACQ_IN)).toHaveValue("");
    await expect(page.getByTestId(TR_IN)).toHaveValue("");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByTestId("validation-issues").getByText(/양도시 주택건물 기준시가를 입력하세요/).first().click();
    await expect(page.getByTestId(TR_IN)).toBeFocused();
  });
});

test.describe("S3-2 컴패니언(함께 양도) 겸용", () => {
  test("H11c 컴패니언 겸용 — 같은 카드·같은 칸 · request body companionAssets[*].mixedUse에 나목", async ({ page }) => {
    test.setTimeout(150_000);
    const primary = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-01",
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "300000000",
      actualSalePrice: "600000000",
      standardPriceAtTransfer: "500000000",
      standardPriceAtAcq: "250000000",
    };
    // ⚠️ `...makeDefaultAsset(2)`를 펼치면 기본값(isMixedUseHouse:false 등)이 시드를 덮는다 — assetId만 바꾼다.
    const comp = mixedAsset({
      assetId: "mx2",
      useEstimatedAcquisition: false,
      acquisitionDate: "2009-03-01",
      residentialFloorArea: "60",
      nonResidentialFloorArea: "40",
      buildingFootprintArea: "50",
      mixedUseTotalLandArea: "600",
      mixedZoneType: "general_residential",
      mixedTransferHousingPrice: "900000000",
      mixedTransferCommercialBuildingPrice: "300000000",
      mixedTransferLandPricePerSqm: "2000000",
      mixedAcqHousingPrice: "300000000",
      mixedAcqCommercialBuildingPrice: "100000000",
      mixedAcqLandPricePerSqm: "1000000",
      mixedAcqHousingBuildingStdPrice: "90000000",
      mixedTransferHousingBuildingStdPrice: "180000000",
      fixedAcquisitionPrice: "300000000",
      actualSalePrice: "600000000",
      standardPriceAtTransfer: "500000000",
      standardPriceAtAcq: "250000000",
    });
    await seedForm(
      page,
      formOf([primary, comp], {
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "2",
      }),
    );
    await expandAssetSection(page, 3, 1);
    // 컴패니언 카드 안에 같은 칸 — testid는 화면에서 유일(주 자산은 겸용이 아니다)
    await expect(page.getByTestId(ACQ_CARD)).toHaveCount(1);
    await expect(page.getByTestId(TR_CARD)).toHaveCount(1);
    await expect(page.locator('[data-asset-card-index="1"]').getByTestId(ACQ_IN)).toHaveValue(/^90,?000,?000$/);

    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click();
    const sent = (await reqPromise).postDataJSON() as { companionAssets?: { mixedUse?: CapturedMixedUse }[] };
    expect(sent.companionAssets?.[0].mixedUse?.acquisitionStandardPrice.housingBuildingPrice).toBe(90_000_000);
    expect(sent.companionAssets?.[0].mixedUse?.transferStandardPrice.housingBuildingPrice).toBe(180_000_000);
  });
});
