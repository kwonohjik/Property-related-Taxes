/**
 * S3-1 — 일반 주택 비-별개 취득(소유자 분리)의 「취득시 건물 기준시가(나목)」 입력칸 · 비례 안분 결과
 *
 * 계획서 `docs/00-pm/housing-std-split-proportional.plan.md` §8 · UI 설계 `…s3-1.ui.design.md` §7.1.
 *
 * 개별주택가격(부수토지 포함 결합 공시)을 토지분·건물분으로 나누는 법정 방식은 뺄셈이 아니라 **가목:나목 비례 안분**이다
 * (집행기준 99-164-9). 나목이 비례의 분모라 소유자 분리(`selfOwns ≠ both`) 화면에 입력칸이 열린다.
 *   E1 매매 + 소유자 분리: 칸 노출(토지 단가 아래 · 별개 전용 카드와 배타)
 *   E2 상속 + 소유자 분리: 같은 칸이 `non-purchase-split-inputs` 안에
 *   E3 노출 해제 부정 짝(본인 파트 취득가액 입력 · 소유자 분리 OFF · 「취득일 다름」만)
 *   E4 별개 취득 전환: 별개 전용 카드로 바뀐다
 *   E6 모달 → 적용 → 칸 채움(취득시 적용 버튼만)
 *   E7 request body: 나목 + 결합 총액이 함께 나간다(별개 취득의 총액 undefined 덮어쓰기와 다르다)
 *   E8 결과: 「개별주택가격 분할」 비례 산식(엔진 echo 그대로)
 *   E9 환산 파트: 양도시 개별주택가격 칸(D-1 ⓑ) 노출 · 요구 · 전송
 *   막다른 길 없음: 소유자 분리 ON → 단가 입력 → OFF 후에도 계산이 막히지 않는다(E-4)
 *
 * worktree 실행: E2E_PORT=3119 npx playwright test e2e/transfer-housing-acq-building-std-nonseparate.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { withPrimary } from "./_helpers/validation-field-jump-cases";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function seedFormAndOpen(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

const card = (page: Page) => page.locator('[data-asset-card-index="0"]');
const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true });
const panel = (page: Page) => page.getByTestId("validation-issues");
const nField = (page: Page) => page.getByTestId("acq-building-std-card");
const focusIn = (page: Page, key: string) =>
  expect.poll(() => page.evaluate((k) => !!document.activeElement?.closest(`[data-field="${k}"]`), key)).toBe(true);

/** 소유자 분리 + 매매 + 실거래가 + 두 파트 비움(비율 안분이 유일한 도출 수단) — 소유자 분리 토글이 「취득일 다름」을 강제로 켠다 */
const ownerSplit = (extra: Record<string, unknown> = {}) =>
  withPrimary({
    assetKind: "housing",
    acquisitionCause: "purchase",
    selfOwns: "building_only",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "",
    useEstimatedAcquisition: false,
    acquisitionArea: "100",
    standardPricePerSqmAtTransfer: "5600000",
    transferArea: "100",
    buildingStandardPriceAtTransfer: "840000000",
    ...extra,
  });
const FILLED = {
  standardPricePerSqmAtAcq: "2400000",
  standardPriceAtAcq: "480000000",
  buildingStandardPriceAtAcq: "360000000",
};

test.describe("E1 — 매매 + 소유자 분리: 취득시 건물 기준시가 칸이 토지 단가 아래에 열린다", () => {
  for (const selfOwns of ["building_only", "land_only"] as const) {
    test(`${selfOwns}`, async ({ page }) => {
      await seedFormAndOpen(page, ownerSplit({ selfOwns }));
      await expandAssetSection(page, 3);
      await expect(nField(page)).toHaveCount(1);
      await expect(nField(page)).toBeVisible();
      // 별개 취득 전용 카드와 배타 — 합이 1을 넘지 않는다
      await expect(card(page).getByTestId("split-building-std-acq-card")).toHaveCount(0);
      // DOM 순서 = 계산 순서: 토지 단가 → 건물(나목). (양도시 기준시가 축 A는 ② 양도 섹션이라 위쪽에 있다)
      const order = await page.evaluate(() => {
        const pos = (sel: string) => {
          const el = document.querySelector(sel);
          return el ? Array.from(document.querySelectorAll("*")).indexOf(el) : -1;
        };
        return {
          total: pos('[data-field="standardPriceAtAcq"]'),
          perSqm: pos('[data-field="standardPricePerSqmAtAcq"]'),
          n: pos('[data-testid="acq-building-std-card"]'),
        };
      });
      expect(order.total).toBeGreaterThan(-1);
      expect(order.perSqm).toBeGreaterThan(order.total);
      expect(order.n).toBeGreaterThan(order.perSqm);
    });
  }
});

test.describe("E2 — 상속 + 소유자 분리: 같은 칸이 비-매매 입력 블록 안에 열린다", () => {
  test("non-purchase-split-inputs 안의 acq-building-std-card", async ({ page }) => {
    await seedFormAndOpen(
      page,
      ownerSplit({
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: "2015-03-01",
        publishedValueAtInheritance: "300000000",
        hasSeperateLandAcquisitionDate: false,
      }),
    );
    await expandAssetSection(page, 3);
    const block = page.getByTestId("non-purchase-split-inputs");
    await expect(block).toBeVisible();
    await expect(block.getByTestId("acq-building-std-card")).toHaveCount(1);
    await expect(page.getByTestId("acq-building-std-card")).toHaveCount(1);
  });
});

test.describe("E3 — 노출 해제 부정 짝", () => {
  test("본인 파트(건물) 취득가액을 입력하면 비율이 안 쓰여 칸이 닫힌다", async ({ page }) => {
    await seedFormAndOpen(page, ownerSplit({ buildingAcquisitionPrice: "400000000" }));
    await expect(nField(page)).toHaveCount(0);
  });

  test("소유자 분리를 끄면(「취득일 다름」만 남아 같은 날짜) 칸이 없다", async ({ page }) => {
    await seedFormAndOpen(page, ownerSplit({ selfOwns: "both", ...FILLED }));
    await expect(nField(page)).toHaveCount(0);
    await expect(card(page).locator('[data-field="buildingStandardPriceAtAcq"]')).toHaveCount(0);
  });
});

test.describe("E4 — 별개 취득 전환: 별개 전용 카드로 바뀐다", () => {
  test("토지 취득일을 다르게 입력하면 acq-building-std-card 0 · split-building-std-acq-card 1", async ({ page }) => {
    await seedFormAndOpen(
      page,
      ownerSplit({
        selfOwns: "both",
        landAcquisitionDate: "2008-07-01",
        acquisitionDate: "2015-03-01",
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: "100000000",
        standardPriceAtTransfer: "1120000000",
        standardPricePerSqmAtAcq: "2400000",
      }),
    );
    await expect(nField(page)).toHaveCount(0);
    await expect(card(page).getByTestId("split-building-std-acq-card")).toHaveCount(1);
  });
});

test.describe("E5 — 나목을 비우면 ⑧이 막고 그 칸으로 이동한다", () => {
  test("3종만 채우고 다음 → 오류 → 나목 칸 포커스 → 채우면 통과", async ({ page }) => {
    await seedFormAndOpen(page, ownerSplit({ standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000" }));
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: /토지·건물 소유자가 다르면 본인 소유분만 과세하므로/ });
    await expect(issue).toBeVisible();
    await issue.click();
    await focusIn(page, "buildingStandardPriceAtAcq");
    await card(page).locator('[data-field="buildingStandardPriceAtAcq"] input').first().fill("360000000");
    await next(page).click();
    await expect(panel(page).getByText(/토지·건물 소유자가 다르면 본인 소유분만 과세하므로/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  });
});

test.describe("E6 — 건물 기준시가 계산 모달: 취득시 적용만 노출 · 적용하면 칸이 채워진다", () => {
  test("모달 → 계산 → 취득시 적용 → acq-building-std 값", async ({ page }) => {
    test.setTimeout(120_000);
    await seedFormAndOpen(page, ownerSplit({ ...FILLED, buildingStandardPriceAtAcq: "", buildingFloorArea: "100", acquisitionDate: "2010-07-12" }));
    await expandAssetSection(page, 3);
    await card(page).getByRole("button", { name: "취득시 건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();
    // 자산 값 prefill — 취득연도는 취득일(2010-07-12)에서 파생
    await expect(modal.getByText("2010년", { exact: true })).toBeVisible();
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2005");
    const pick = async (trigger: string, option: RegExp) => {
      await modal.getByText(trigger, { exact: false }).first().click();
      await page.getByRole("option", { name: option }).first().click();
    };
    await pick("구조 선택", /철근콘크리트조/);
    await pick("용도 선택", /아파트/);
    await modal.getByPlaceholder("원/㎡").first().fill("500000");
    await modal.getByRole("button", { name: "기준시가 계산하기" }).click();
    await expect(modal.getByRole("button", { name: /취득시 적용/ })).toBeVisible();
    await expect(modal.getByRole("button", { name: /양도시 적용/ })).toHaveCount(0);
    await modal.getByRole("button", { name: /취득시 적용/ }).click();
    await expect(modal).toBeHidden();
    const v = await page.getByTestId("acq-building-std").inputValue();
    expect(parseInt(v.replace(/,/g, ""), 10)).toBeGreaterThan(0);
  });
});

/** 계산 요청 body — 「가산세」 단계로 이동해 계산을 누르고 /api/calc/transfer 본문을 잡는다 */
async function calcAndCapture(page: Page): Promise<Record<string, unknown>> {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const req = await reqPromise;
  return req.postDataJSON() as Record<string, unknown>;
}

test.describe("E7·E8 — request body와 결과의 비례 산식", () => {
  test("body: 나목 + 결합 총액이 함께 나가고 · 결과에 개별주택가격 분할 비례 산식이 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedFormAndOpen(page, ownerSplit({ ...FILLED, acquisitionDate: "2018-03-02", fixedAcquisitionPrice: "700000000", actualSalePrice: "1200000000" }, ), );
    const body = await calcAndCapture(page);
    expect(body.buildingStandardPriceAtAcquisition).toBe(360_000_000);
    // 별개 취득은 결합 총액을 undefined로 덮어쓰지만 비례는 총액이 분자라 그대로 나간다
    expect(body.standardPriceAtAcquisition).toBe(480_000_000);
    expect(body.isSeparateAcquisition).toBe(false);

    const detail = page.getByTestId("split-std-split-detail");
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await expect(detail).toContainText("개별주택가격 분할");
    await expect(page.getByTestId("split-std-split-land")).toHaveText("192,000,000");
    await expect(page.getByTestId("split-std-split-building")).toHaveText("288,000,000");
    // 한국어 풀어쓰기 — 변수 약어·함수 표기 없음
    await expect(detail).toContainText("토지 기준시가 240,000,000");
    await expect(detail).toContainText("건물 기준시가 360,000,000");
    await expect(detail).not.toContainText(/floor|H ×/);
  });
});

test.describe("E9 — 환산 파트(D-1 ⓑ): 양도시 개별주택가격 칸 노출 · 요구 · 전송", () => {
  // 파트 모드만 환산이고 자산 환산 토글은 꺼진 상태 — 매매 경로의 「양도시 기준시가」 칸(토글 의존)이 열리지 않는다.
  const estimatedPart = (extra: Record<string, unknown> = {}) =>
    ownerSplit({
      ...FILLED,
      acquisitionDate: "2018-03-02",
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      ...extra,
    });

  test("axis A 카드에 양도시 개별주택가격 칸이 열리고 · 비우면 ⑧이 막아 그 칸으로 이동한다", async ({ page }) => {
    await seedFormAndOpen(page, estimatedPart());
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("split-housing-std-transfer-card")).toHaveCount(1);
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: /개별주택가격으로 환산취득가액을 구하려면 양도시 개별주택가격이 필요합니다/ });
    await expect(issue).toBeVisible();
    await issue.click();
    await focusIn(page, "standardPriceAtTransfer");
    await card(page).locator('[data-field="standardPriceAtTransfer"] input').first().fill("1120000000");
    await next(page).click();
    await expect(panel(page).getByText(/개별주택가격으로 환산취득가액을 구하려면/)).toHaveCount(0);
  });

  test("body: 자산 환산 토글이 꺼져 있어도 양도시 개별주택가격이 전송되고 · 결과는 비례 분모로 계산된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedFormAndOpen(page, estimatedPart({ standardPriceAtTransfer: "1120000000", actualSalePrice: "1200000000" }));
    const body = await calcAndCapture(page);
    expect(body.standardPriceAtTransfer).toBe(1_120_000_000);
    expect(body.buildingAcqMode).toBe("estimated");
    await expect(page.getByTestId("split-std-split-detail")).toBeVisible({ timeout: 20_000 });
  });

  test("부정 짝: 환산 파트가 없으면(실거래가 + 파트 비움) 양도시 개별주택가격 칸도 전송도 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedFormAndOpen(page, ownerSplit({ ...FILLED, acquisitionDate: "2018-03-02", standardPriceAtTransfer: "1120000000", actualSalePrice: "1200000000", fixedAcquisitionPrice: "700000000" }));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("split-housing-std-transfer-card")).toHaveCount(0);
    const body = await calcAndCapture(page);
    expect(body.standardPriceAtTransfer).toBeUndefined();
  });
});

test.describe("E-4 — 소유자 분리 ON → 단가 입력 → OFF: 칸 없는 요구(막다른 길)가 없다", () => {
  test("OFF 후 남은 단가·면적·총액(stale)으로도 계산이 막히지 않고 나목은 전송되지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedFormAndOpen(
      page,
      ownerSplit({
        selfOwns: "both", // OFF — hasSeperateLandAcquisitionDate는 켜진 채 남는다
        standardPricePerSqmAtAcq: "2400000",
        standardPriceAtAcq: "480000000",
        acquisitionDate: "2018-03-02",
        landAcquisitionDate: "2018-03-02",
        fixedAcquisitionPrice: "700000000",
        actualSalePrice: "1200000000",
        useEstimatedAcquisition: true,
        standardPriceAtTransfer: "1120000000",
      }),
    );
    await expandAssetSection(page, 3);
    await expect(nField(page)).toHaveCount(0);
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calcAndCapture(page);
    expect(body.buildingStandardPriceAtAcquisition).toBeUndefined();
    expect((await responsePromise).status()).toBe(200);
  });
});
