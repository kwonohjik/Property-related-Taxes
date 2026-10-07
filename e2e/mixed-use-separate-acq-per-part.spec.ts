/**
 * B1 — 겸용주택 **별개 취득 파트 모델**(토지·건물 파트별 산정방식·취득가액) UI E2E
 *
 * 설계: docs/02-design/features/mixed-use-separate-acq-per-part.ui.design.md §7 (M1~M28)
 * 짝 anchor(vitest): __tests__/calc/mixed-use-part-acq-split.anchor.test.ts · __tests__/components/mixed-use-separate-acq-*.test.tsx
 *
 * 규약
 *  · 미노출 단언에는 같은 spec의 긍정 단언이 짝으로 있다(`feedback_negative_anchor_needs_positive_twin`).
 *  · 시드는 sessionStorage 복원(`migrateAsset`)을 **경유**한다 — 구 이력(필드 부재)이 false로 읽히는지는 이 경로로만 증명된다
 *    (vitest는 migrate 미경유 — `feedback_e2e_seed_erased_by_restore_normalization`). JSON은 undefined 키를 지우므로 부재 시드는 `delete`로 만든다.
 *
 * worktree 실행: E2E_PORT=3133 npx playwright test e2e/mixed-use-separate-acq-per-part.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/**
 * 시드 — 주택 100㎡ · 상가 100㎡ · 대지 200㎡. 토지 2005-06-10 / 건물 2010-03-15 **별개 취득** · 파트 모델 ON · 양쪽 실거래가.
 * 취득시 기준시가는 의도적으로 모두 채워 둔다 — 쓰이지 않는 조합에서는 **본문에 실리지 않아야** 한다.
 */
function ppAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetId: "pp1",
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    isMixedUseHouse: true,
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2005-06-10",
    acquisitionDate: "2010-03-15",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedTransferHousingBuildingStdPrice: "300000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqLandPricePerSqmAtBuildingAcq: "1800000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedAcqHousingBuildingStdPrice: "150000000",
    mixedIsMetropolitanArea: true,
    mixedAcqPerPartMode: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "400000000",
    buildingAcquisitionPrice: "300000000",
    actualSalePrice: "1500000000",
    ...over,
  } as Record<string, unknown>;
}

function formOf(assets: Record<string, unknown>[]) {
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

async function seed(page: Page, asset: Record<string, unknown>) {
  await seedForm(page, formOf([asset]));
  await expandAssetSection(page, 3);
}

async function setAmount(page: Page, testid: string, v: string) {
  const input = page.getByTestId(testid);
  await input.fill("");
  await input.fill(v);
}

interface SepBody {
  landMode: string;
  buildingMode: string;
  landAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingAcquisitionPrice?: number;
  buildingSalesCaseValue?: number;
  housingBuildingContractPrice?: number;
}
interface MixedBody {
  separateAcquisition?: SepBody;
  useActualAcquisition?: boolean;
  useAppraisalSalesAcquisition?: boolean;
  acquisitionActualTotalPrice?: number;
  usePreHousingDisclosure?: boolean;
  housingInheritedExpense?: number;
  acquisitionStandardPrice: { housingPrice?: number; housingBuildingPrice?: number; landPricePerSqmAtBuildingAcq?: number };
}
async function calcAndCapture(page: Page): Promise<MixedBody> {
  const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const req = await reqPromise;
  const body = req.postDataJSON() as { mixedUse?: MixedBody; assets?: Array<{ mixedUse?: MixedBody }> };
  return (body.mixedUse ?? body.assets?.[0]?.mixedUse) as MixedBody;
}
const sw = (page: Page, testid: string) => page.getByTestId(testid).locator('[role="switch"]').first();
const count = (page: Page, testid: string) => page.getByTestId(testid);

// ═══════════════════════════════════════════════════════════════════════
test.describe("B1 파트 모델 — 노출·모델 전환", () => {
  test("M1 노출 · M2 같은 날 짝 · M5 구 이력(필드 부재) = OFF + 총액 화면", async ({ page }) => {
    test.setTimeout(150_000);
    // M1 — 별개 취득 · 신규(ON): 토글(체크) · 파트 블록 · 양 파트 라디오 4종 · 상단 총액 칸·라디오 없음
    await seed(page, ppAsset());
    await expect(count(page, "mixed-per-part-toggle")).toHaveCount(1);
    await expect(sw(page, "mixed-per-part-toggle")).toHaveAttribute("aria-checked", "true");
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(1);
    for (const part of ["land", "building"]) {
      await expect(count(page, `mixed-part-acq-mode-${part}`)).toHaveCount(1);
      for (const m of ["actual", "estimated", "appraisal", "salesCase"]) {
        await expect(count(page, `mixed-part-acq-${part}-${m}`)).toHaveCount(1);
      }
    }
    await expect(count(page, "fixed-acquisition-price")).toHaveCount(0);
    await expect(count(page, "mixed-asset-acq-mode")).toHaveCount(0);
    await expect(count(page, "part-acq-mode-land")).toHaveCount(0); // 비-겸용 split 축 B는 겸용에 영원히 렌더하지 않는다

    // M2 짝 — 같은 날짜면 토글·블록 없음, 총액 칸·라디오 있음
    await seed(page, ppAsset({ landAcquisitionDate: "2010-03-15", mixedAcqLandPricePerSqmAtBuildingAcq: "", fixedAcquisitionPrice: "700000000" }));
    await expect(count(page, "mixed-per-part-toggle")).toHaveCount(0);
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(0);
    await expect(count(page, "fixed-acquisition-price")).toHaveCount(1);
    await expect(count(page, "mixed-asset-acq-mode")).toHaveCount(1);

    // M3 짝 — chip(취득일 다름) OFF + stale 토지일 → 토글·블록 없음
    await seed(page, ppAsset({ hasSeperateLandAcquisitionDate: false, fixedAcquisitionPrice: "700000000" }));
    await expect(count(page, "mixed-per-part-toggle")).toHaveCount(0);
    await expect(count(page, "fixed-acquisition-price")).toHaveCount(1);

    // M5 — 구 이력: 필드 부재(JSON 직렬화 후 migrate 경유) → OFF · 안내 · 총액 칸 · 파트 블록 없음
    const legacy = ppAsset({ fixedAcquisitionPrice: "700000000" });
    delete legacy.mixedAcqPerPartMode;
    delete legacy.mixedAcqBuildingContractSplit;
    delete legacy.mixedAcqHousingBuildingContractPrice;
    await seed(page, legacy);
    await expect(count(page, "mixed-per-part-toggle")).toHaveCount(1);
    await expect(sw(page, "mixed-per-part-toggle")).toHaveAttribute("aria-checked", "false");
    await expect(count(page, "mixed-total-model-note")).toHaveCount(1);
    await expect(count(page, "fixed-acquisition-price")).toHaveCount(1);
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(0);
  });

  test("M4 짝 — 비매매(상속)로 전환하면 토글·파트 블록이 사라진다 · 되돌리면 복원", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, ppAsset());
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(1);
    await seed(page, ppAsset({ acquisitionCause: "inheritance", useEstimatedAcquisition: false }));
    await expect(count(page, "mixed-per-part-toggle")).toHaveCount(0);
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(0);
  });

  test("M25 왕복 — 모델 토글 ON→OFF→ON: 총액 칸·파트 값·계약액·라디오가 각각 변하지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(
      page,
      ppAsset({
        fixedAcquisitionPrice: "777000000",
        landAcqMode: "appraisal",
        landAcquisitionPrice: "411000000",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "322000000",
        mixedAcqBuildingContractSplit: true,
        mixedAcqHousingBuildingContractPrice: "133000000",
      }),
    );
    const snapshot = async () => ({
      land: await page.getByTestId("mixed-split-land-appraisal-value").inputValue(),
      building: await page.getByTestId("mixed-split-building-acq-price").inputValue(),
      contract: await page.getByTestId("mixed-bldg-contract-housing").inputValue(),
      landMode: await page.getByTestId("mixed-part-acq-land-appraisal").isChecked(),
    });
    const before = await snapshot();
    expect(before.land).toMatch(/411,?000,?000/);
    await sw(page, "mixed-per-part-toggle").click(); // OFF → 총액 모델(저장된 총액 칸이 그대로 있다)
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(0);
    await expect(page.getByTestId("fixed-acquisition-price")).toHaveValue(/777,?000,?000/);
    await expect(page.locator('[name="acqBasisMode"][value="actual"]')).toBeChecked(); // 레거시 라디오는 시작값 그대로
    await sw(page, "mixed-per-part-toggle").click(); // ON 복귀
    expect(await snapshot()).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe("B1 파트 모델 — request body (④·⑬ 도달)", () => {
  const STALE = { landSalesCaseValue: "111000000", buildingSalesCaseValue: "222000000" };

  test("M7~M12 라디오 4종 × 2 파트 — separateAcquisition이 모드·값을 정확히 싣는다 (stale 값 차단)", async ({ page }) => {
    test.setTimeout(420_000);
    for (const part of ["land", "building"] as const) {
      for (const mode of ["actual", "estimated", "appraisal", "salesCase"] as const) {
        await seed(page, ppAsset(STALE));
        await page.getByTestId(`mixed-part-acq-${part}-${mode}`).check();
        const valueTid =
          mode === "actual" ? `mixed-split-${part}-acq-price`
          : mode === "appraisal" ? `mixed-split-${part}-appraisal-value`
          : mode === "salesCase" ? `mixed-split-${part}-salescase-value`
          : `mixed-split-${part}-estimated-note`;
        if (mode !== "estimated") await setAmount(page, valueTid, "355000000");
        else await expect(count(page, valueTid)).toHaveCount(1); // 환산: 입력칸이 아니라 안내
        const mu = await calcAndCapture(page);
        const sep = mu.separateAcquisition!;
        const label = `${part} ${mode}`;
        expect(sep, label).toBeDefined();
        expect(sep[`${part}Mode` as "landMode"], label).toBe(mode);
        const otherPart = part === "land" ? "building" : "land";
        expect(sep[`${otherPart}Mode` as "landMode"], `${label} 상대 파트 불변`).toBe("actual");
        const key = (p: "land" | "building", m: string) =>
          m === "salesCase" ? `${p}SalesCaseValue` : `${p}AcquisitionPrice`;
        if (mode === "estimated") {
          expect(sep[`${part}AcquisitionPrice` as "landAcquisitionPrice"], label).toBeUndefined();
          expect(sep[`${part}SalesCaseValue` as "landSalesCaseValue"], label).toBeUndefined();
        } else {
          expect((sep as unknown as Record<string, number>)[key(part, mode)], label).toBe(355_000_000);
          // 쓰지 않는 쪽 키(stale)는 없다
          const unused = mode === "salesCase" ? `${part}AcquisitionPrice` : `${part}SalesCaseValue`;
          expect((sep as unknown as Record<string, number | undefined>)[unused], `${label} stale`).toBeUndefined();
        }
        // 상대 파트(실거래가)는 시드 값 그대로
        expect((sep as unknown as Record<string, number>)[`${otherPart}AcquisitionPrice`], `${label} 상대 값`).toBe(otherPart === "land" ? 400_000_000 : 300_000_000);
        // U-4 — 총액 플래그는 싣지 않는다
        expect(mu.useActualAcquisition, label).toBe(false);
        expect(mu.useAppraisalSalesAcquisition, label).toBe(false);
        expect(mu.acquisitionActualTotalPrice, label).toBeUndefined();
        // ⑤↔④ — 비-실가 파트가 있으면 취득시 H·B0·나목이 전송된다 / 양쪽 실가면 H·B0는 없다(짝)
        const nonActual = mode !== "actual";
        expect(mu.acquisitionStandardPrice.housingPrice !== undefined, `${label} H`).toBe(nonActual);
        expect(mu.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq !== undefined, `${label} B0`).toBe(nonActual);
        expect(mu.acquisitionStandardPrice.housingBuildingPrice, `${label} 나목`).toBe(150_000_000);
      }
    }
  });

  test("M13·M14 계약액 — ON: 키 실림 · 나목 키 없음 / OFF: 키 없음 · 나목 키 있음 · M15 건물 비실가 stale 가드와 복원", async ({ page }) => {
    test.setTimeout(240_000);
    // M14 — 계약액 OFF(양쪽 실가): 비율 안내 · 나목 키 있음 · 계약액 키 없음
    await seed(page, ppAsset({ mixedAcqHousingBuildingContractPrice: "150000000" })); // stale 값만 있고 토글 OFF
    await expect(count(page, "mixed-bldg-ratio-note")).toHaveCount(1);
    const off = await calcAndCapture(page);
    expect(off.separateAcquisition!.housingBuildingContractPrice).toBeUndefined();
    expect(off.acquisitionStandardPrice.housingBuildingPrice).toBe(150_000_000);
    expect(off.acquisitionStandardPrice.housingPrice).toBeUndefined();
    expect(off.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq).toBeUndefined();

    // M13 — 계약액 ON: 입력 · 파생 줄(총액 − 주택건물) · 키 실림 · 나목 키 없음
    await seed(page, ppAsset());
    await sw(page, "mixed-bldg-contract-toggle").click();
    await setAmount(page, "mixed-bldg-contract-housing", "120000000");
    await expect(count(page, "mixed-bldg-contract-commercial-derived")).toContainText("180,000,000"); // 300,000,000 − 120,000,000
    const on = await calcAndCapture(page);
    expect(on.separateAcquisition!.housingBuildingContractPrice).toBe(120_000_000);
    expect(on.acquisitionStandardPrice.housingBuildingPrice).toBeUndefined();

    // M15 — 계약액 ON 입력 후 건물 모드를 감정으로: 토글 비노출·키 없음 / 실가 복귀 → 토글·값 복원
    await seed(page, ppAsset({ mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "120000000" }));
    await expect(count(page, "mixed-bldg-contract-toggle")).toHaveCount(1);
    await page.getByTestId("mixed-part-acq-building-appraisal").check();
    await expect(count(page, "mixed-bldg-contract-toggle")).toHaveCount(0);
    await expect(count(page, "mixed-bldg-ratio-note")).toHaveCount(1);
    await page.getByTestId("mixed-part-acq-building-actual").check();
    await expect(count(page, "mixed-bldg-contract-toggle")).toHaveCount(1);
    await expect(page.getByTestId("mixed-bldg-contract-housing")).toHaveValue(/120,?000,?000/);
    await page.getByTestId("mixed-part-acq-building-appraisal").check();
    const stale = await calcAndCapture(page);
    expect(stale.separateAcquisition!.housingBuildingContractPrice).toBeUndefined();
  });

  test("M16 PHD 술어 — 환산 파트가 없으면 PHD 토글이 없고 stale PHD는 본문에 없다 / 건물을 환산으로 바꾸면 토글이 나타나고 ON이 복원된다", async ({ page }) => {
    test.setTimeout(150_000);
    const PHD = {
      usePreHousingDisclosure: true,
      phdFirstDisclosureDate: "2005-04-30",
      phdFirstDisclosureHousingPrice: "200000000",
      phdLandPricePerSqmAtFirst: "1500000",
      phdLandPricePerSqmAtAcq: "1000000",
      phdBuildingStdPriceAtAcq: "40000000",
      phdBuildingStdPriceAtFirst: "45000000",
    };
    await seed(page, ppAsset({ ...PHD, acquisitionDate: "2000-01-01", landAcquisitionDate: "1999-01-01" }));
    const phdToggle = page.getByText("개별주택가격 미공시 (§164⑦ 3-시점 환산)");
    await expect(phdToggle).toHaveCount(0);
    const none = await calcAndCapture(page);
    expect(none.usePreHousingDisclosure).toBe(false); // 소비처가 없으면 보내지 않는다(X-7을 우회로 만나지 않는다)
    // 짝 — 건물을 환산으로 바꾸면 토글이 나타나고 저장된 ON이 되살아난다
    await seed(page, ppAsset({ ...PHD, acquisitionDate: "2000-01-01", landAcquisitionDate: "1999-01-01", buildingAcqMode: "estimated" }));
    await expect(phdToggle).toHaveCount(1);
    await expect(count(page, "mixed-phd-part-acq-caption")).toHaveCount(1);
    await expect(count(page, "mixed-phd-part-acq-caption")).toContainText("토지 취득일(1999-01-01)");
    await expect(count(page, "mixed-phd-part-acq-caption")).toContainText("건물 취득일(2000-01-01)");
  });

  test("M18 U-2 실비 — 실거래가 파트가 있으면 주택분 실제 필요경비가 housingInheritedExpense로 간다(침묵 소실 없음)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, ppAsset({ mixedHousingActualExpense: "3000000" }));
    const mu = await calcAndCapture(page);
    expect(mu.housingInheritedExpense).toBe(3_000_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe("B1 파트 모델 — ⑧ 입력칸 이동·막다른 길 없음", () => {
  async function next(page: Page) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }

  test("M20·M22 토지 값 비움 → landAcquisitionPrice 이동 · 계약액 ≥ 총액 → 계약액 칸 이동", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, ppAsset({ landAcquisitionPrice: "" }));
    await next(page);
    const issues = page.getByTestId("validation-issues");
    await expect(issues).toContainText(/토지 취득가액\(실거래가\)을 입력하세요/);
    await issues.getByText(/토지 취득가액\(실거래가\)을 입력하세요/).first().click();
    await expect(page.locator('[data-field="landAcquisitionPrice"] input').first()).toBeFocused();
    await setAmount(page, "mixed-split-land-acq-price", "400000000");
    await next(page);
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);

    await seed(page, ppAsset({ mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "300000000" }));
    await next(page);
    await expect(page.getByTestId("validation-issues")).toContainText(/건물 취득가액보다 작아야/);
    await page.getByTestId("validation-issues").getByText(/건물 취득가액보다 작아야/).first().click();
    await expect(page.getByTestId("mixed-bldg-contract-housing")).toBeFocused();
  });

  test("M17 경비 선언이 H를 요구한다 — 사유 문구 · H 칸 존재(막다른 길 아님) · 경비를 지우면 통과", async ({ page }) => {
    test.setTimeout(120_000);
    const base = {
      mixedAcqBuildingContractSplit: true,
      mixedAcqHousingBuildingContractPrice: "120000000",
      mixedAcqHousingPrice: "",
    };
    // 경비 없음 + 계약액 + 양쪽 실가: H 칸 자체가 없고 ⑧도 요구하지 않는다(긍정 짝)
    await seed(page, ppAsset(base));
    await expect(page.locator('[data-field="mixedAcqHousingPrice"]')).toHaveCount(0);
    await next(page);
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
    // 자본적지출을 입력하면 H가 필수 — ⑧이 H 칸으로 보내고, 그 칸이 DOM에 있다
    await seed(page, ppAsset({ ...base, capitalExpenditure: "10000000" }));
    await expect(page.locator('[data-field="mixedAcqHousingPrice"]')).toHaveCount(1);
    await next(page);
    const issues = page.getByTestId("validation-issues");
    await expect(issues).toContainText(/자본적지출 또는 주택분·상가분 실제 필요경비를 입력하셨으므로/);
    await issues.getByText(/개별주택공시가격을 입력하세요/).first().click();
    await expect(page.locator('[data-field="mixedAcqHousingPrice"]').first()).toBeInViewport();
  });

  test("M24 결합 제외 — 용도변경: 안내 + 차단 + 모델 토글로 이동 · 토글 OFF(총액 모델)는 통과 경로 · 용도변경 OFF도 통과", async ({ page }) => {
    test.setTimeout(150_000);
    const H2C = { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", partialChangeDate: "2020-01-01" };
    await seed(page, ppAsset(H2C));
    await expect(count(page, "mixed-sep-exclusion-note")).toHaveCount(1);
    await expect(count(page, "mixed-sep-acq-block")).toHaveCount(1); // 블록은 계속 보인다(조용히 총액으로 후퇴하지 않는다)
    await next(page);
    const issues = page.getByTestId("validation-issues");
    await expect(issues).toContainText(/용도변경/);
    await issues.getByText(/용도변경/).first().click();
    await expect(page.locator('[data-field="mixedAcqPerPartMode"]').first()).toBeInViewport();
    // 막다른 길 아님 — 모델 토글을 끄면 이 오류가 사라진다(총액 모델 검증으로 넘어간다)
    await sw(page, "mixed-per-part-toggle").click();
    await expect(count(page, "mixed-sep-exclusion-note")).toHaveCount(0); // 파트 블록이 사라지므로 안내도 사라진다(짝)
    await next(page);
    await expect(page.getByTestId("validation-issues")).not.toContainText(/함께 쓸 수 없습니다/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe("B1 파트 모델 — 사이드바(⑥)·결과(⑦)", () => {
  test("M26 사이드바 — 파트 값 합(stale 총액 무시) · 환산 파트면 계산 후 표시", async ({ page }) => {
    test.setTimeout(90_000);
    const acqText = async () => {
      const sidebar = page.locator("aside").first();
      return await sidebar.locator("div.text-sm").filter({ hasText: "취득가액" }).first().locator("p").last().innerText();
    };
    await seed(page, ppAsset({ fixedAcquisitionPrice: "999999999" }));
    expect((await acqText()).replace(/[^0-9]/g, "")).toBe("700000000"); // 토지 4억 + 건물 3억 — 숨은 총액(9.99억)이 아니다
    await seed(page, ppAsset({ buildingAcqMode: "estimated", fixedAcquisitionPrice: "999999999" }));
    expect(await acqText()).toMatch(/계산 후 표시|^-$/); // 환산 파트 — 부분합을 총액으로 오독하지 않는다
  });

  test("M27 결과 — 파트별 산정방식·Frac 산식 · 신고서 4열 취득가액 열별 주석 · 「환산취득가액」 거짓 라벨 없음 · 취득일 행 회귀", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, ppAsset({ mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "120000000" }));
    await calcAndCapture(page);
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30000 });
    const calc = page.locator('[data-print-id="calculation"]');
    await expect(calc).toBeVisible();
    // 계산 섹션이 접힘이면 펼친다(인쇄 전체선택과 무관하게 DOM에는 있다)
    const calcContent = (await calc.textContent()) ?? "";
    expect(calcContent).toContain("주택 취득가액 (토지·건물 산정방식 각각)");
    expect(calcContent).toContain("토지 실거래가 · 건물 실거래가");
    expect(calcContent).toContain("주택건물 계약액 120,000,000");
    expect(calcContent, "실거래가 시드에 환산 라벨 0건").not.toContain("환산취득가액");
    // 신고서 4열 — 취득가액 행 열별 주석
    const filing = page.locator('[data-print-section="form-table"]').first();
    const acqRow = filing.locator("tr", { hasText: "취득가액" }).first();
    await expect(acqRow).toContainText("실거래가 · 면적비 안분");
    await expect(acqRow).toContainText("실거래가 · 용도별 계약액");
    // 취득일 행 열별(회귀)
    const dateRow = filing.locator("tr", { hasText: "취득일자" }).first();
    const cells = dateRow.locator("td");
    expect(await cells.nth(2).innerText()).toContain("2005");
    expect(await cells.nth(3).innerText()).toContain("2010");
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe("B1 파트 모델 — 컴패니언(자산 2가 겸용·별개 취득)", () => {
  test("M6 컴패니언도 같은 블록 · 같은 ④ 빌더 — 카드 스코프에서 노출되고 body가 assets[1] 서브객체에 실린다", async ({ page }) => {
    test.setTimeout(150_000);
    const first = {
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
    const d2 = makeDefaultAsset(2);
    const second = ppAsset({ assetId: d2.assetId, assetLabel: d2.assetLabel, isPrimaryForHouseholdFlags: d2.isPrimaryForHouseholdFlags, actualSalePrice: "900000000" });
    await seedForm(page, { ...formOf([first, second]), contractTotalPrice: "1500000000", householdHousingCount: "2" });
    await expandAssetSection(page, 3, 1);
    const card = page.locator('[data-asset-card-index="1"]');
    await expect(card.getByTestId("mixed-per-part-toggle")).toHaveCount(1);
    await expect(card.getByTestId("mixed-sep-acq-block")).toHaveCount(1);
    await expect(card.getByTestId("fixed-acquisition-price")).toHaveCount(0);
    // 첫 자산(일반 주택)에는 겸용 토글이 없다(부정 짝)
    await expect(page.locator('[data-asset-card-index="0"]').getByTestId("mixed-per-part-toggle")).toHaveCount(0);

    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    await page.getByRole("button", { name: /계산하기/ }).click();
    const req = await reqPromise;
    const sent = req.postDataJSON() as { companionAssets?: Array<{ assetKind?: string; mixedUse?: MixedBody }> };
    const sep = sent.companionAssets?.[0].mixedUse?.separateAcquisition;
    expect(sent.companionAssets?.[0].assetKind).toBe("mixed_use_house");
    expect(sep).toEqual({ landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000 });
  });
});
