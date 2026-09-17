/**
 * transfer-multi-replace-provenance.spec.ts
 *
 * **다건 record 전체 replace 편입분의 provenance** — `buildPropertiesFromMultiRecord`의
 * `?? record.id` 폴백이 원본 없는 **수동 추가 자산**에 「원본 있음」 표지를 붙였다.
 *
 * 🔴 **이 spec이 유일한 안전망인 축이 있다.** 뮤테이션 P-2(`doLoadMulti`에서
 *    `loadedFromRecordId` 세팅 제거)는 vitest anchor를 **한 건도** 빨갛게 만들지 못했다
 *    — 컴포넌트 배선이라 순수 함수 테스트가 닿지 않는다. 이 저장소에서 **여섯 번째** 재현이다
 *    (#1646 P-8 · #1647 P-7 · #1648 Q-7 · #1649 R-1 · #1650 S-2).
 *
 * 계획서: `docs/00-pm/multi-replace-source-provenance.plan.md` §6
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { computeInputHash } from "../lib/storage/content-hash";

const SINGLE_ID = "e2e-rp-single";
const MULTI_ID = "e2e-rp-multi";

function singleForm(unregistered: boolean) {
  return {
    ...createDefaultTransferFormData(),
    assets: [
      {
        ...makeDefaultAsset(1),
        addressJibun: "서울 강남구 테스트동 1-1", // ⑧ 소재지 필수
        assetKind: "land",
        acquisitionDate: "2020-04-01",
        acquisitionArea: "1000",
        useEstimatedAcquisition: false,
        isAppraisalAcquisition: false,
        isSalesCaseAcquisition: false,
        fixedAcquisitionPrice: "120000000",
        directExpenses: "0",
        isNonBusinessLand: false,
        reductions: [],
      },
    ],
    transferDate: "2026-06-03",
    filingDate: "",
    contractTotalPrice: "200000000",
    householdHousingCount: "1",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: unregistered,
    isOneHousehold: false,
  };
}

/** 화면에서 직접 추가한 자산 — **원본 record가 없다**(sourceCalculationId 부재) */
function manualProperty() {
  return {
    propertyId: "prop-e2e-manual",
    propertyLabel: "양도 2번",
    form: {
      ...createDefaultTransferFormData(),
      assets: [
        {
          ...makeDefaultAsset(1),
          addressJibun: "서울 마포구 테스트동 2-2",
          assetKind: "land",
          acquisitionDate: "2019-03-01",
          acquisitionArea: "500",
          useEstimatedAcquisition: false,
          isAppraisalAcquisition: false,
          isSalesCaseAcquisition: false,
          fixedAcquisitionPrice: "50000000",
          directExpenses: "0",
          isNonBusinessLand: false,
          reductions: [],
        },
      ],
      transferDate: "2026-07-01",
      filingDate: "",
      contractTotalPrice: "90000000",
      householdHousingCount: "1",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isOneHousehold: false,
    },
    completionPercent: 100,
    // sourceCalculationId·sourceInputHash 없음 — 수동 추가의 정의다
  };
}

/** ⚠️ `mode: "single"`이 있어야 `classifyLoadableTransfer`가 단건으로 인정한다 */
const singleRecord = async (unregistered: boolean) => ({
  id: SINGLE_ID,
  userId: "local-user",
  taxType: "transfer",
  title: "단건 A (E2E)",
  inputData: singleForm(unregistered),
  /** 저장소가 실제로 붙이는 값 — 빠뜨리면 감지가 「판정 불가」로 떨어져 오탐이 난다 */
  inputHash: await computeInputHash(singleForm(unregistered) as unknown as Record<string, unknown>),
  resultData: { mode: "single", result: { determinedTax: 1000000, localIncomeTax: 100000 } },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
});

/**
 * 다건 record — 자동저장과 동형(`{ __multiTransfer: true, ...form }`).
 * 자산 2건: ① 단건 A에서 편입(원본 있음) · ② 화면에서 직접 추가(원본 없음).
 *
 * ⚠️ `resultData.mode`가 없고 `properties[]`가 top-level이어야 multi로 분류된다
 *    (`transfer-amendment-entry.ts:76~79` — `inputData.properties[0].form`도 필요).
 */
const multiRecord = async () => ({
  id: MULTI_ID,
  userId: "local-user",
  taxType: "transfer",
  title: "다건 M (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      {
        propertyId: "prop-e2e-from-single",
        propertyLabel: "양도 1번",
        form: singleForm(false),
        completionPercent: 100,
        sourceCalculationId: SINGLE_ID,
        sourceInputHash: await computeInputHash(
          singleForm(false) as unknown as Record<string, unknown>,
        ),
      },
      manualProperty(),
    ],
    activePropertyIndex: 0,
    activeStep: "list",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
    priorPaidTax: "0",
    priorPaidLocalTax: "0",
    priorPaidTaxEdited: false,
    priorPaidLocalTaxEdited: false,
  },
  resultData: { properties: [{}, {}], determinedTax: 2000000, localIncomeTax: 200000 },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-09-17T01:00:00.000Z",
  updatedAt: "2026-09-17T01:00:00.000Z",
});

async function seedBoth(page: Page, unregistered = false) {
  await page.goto("/history");
  await putCalculationRecord(page, await singleRecord(unregistered));
  await putCalculationRecord(page, await multiRecord());
}

async function replaceLoadMulti(page: Page) {
  await page.goto("/calc/transfer-tax/multi");
  await openHistoryModal(
    page,
    page.getByTestId("multi-load-history-btn").first(),
    page.getByText("다건 M (E2E)"),
  );
  await page.getByTestId(`load-record-${MULTI_ID}`).click();
}

/**
 * ⚠️ replace 로드는 **공통 설정**(`activeStep: "settings"`)에 착지한다
 *    (`MultiTransferTaxCalculator.tsx` `doLoadMulti`). 「이력에서 불러오기」 버튼과 자산 라벨은
 *    **자산 목록**(Step A)에 있으므로 거기로 돌아가야 한다. 이 한 걸음을 빠뜨리면
 *    「요소 없음」으로 실패하는데, 그것은 제품 결함이 아니라 spec이 다른 화면을 본 것이다.
 */
async function backToList(page: Page) {
  await page.getByRole("button", { name: "자산 목록으로" }).first().click();
  await expect(page.getByTestId("multi-load-history-btn").first()).toBeVisible({ timeout: 15000 });
}

test.describe("다건 replace 편입분의 provenance", () => {
  test("RP-1 🔴: 원본 없는 수동 추가 자산에 「원본 변경」 배너가 붙지 않는다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedBoth(page);
    await replaceLoadMulti(page);

    // 폴백이 살아 있으면 수동 자산이 다건 M을 원본으로 물고 들어온다.
    // 지금은 하류 가드가 걸러 배너가 안 뜨지만, 그 무해함은 가드 한 줄에만 매달려 있었다.
    await expect(page.getByText("원본 이력과 동기화 확인이 필요합니다")).toHaveCount(0);

    // 두 자산이 실제로 편입됐는지 확인 — 배너 부재가 「자산이 없어서」이면 무의미하다
    await backToList(page);
    await expect(page.getByText("양도 1번", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("양도 2번", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("원본 이력과 동기화 확인이 필요합니다")).toHaveCount(0);
  });

  test("RP-2: 단건 출처 자산은 replace 경로에서도 원본 변경이 감지된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedBoth(page);
    await replaceLoadMulti(page);
    await expect(page.getByText("원본 이력과 동기화 확인이 필요합니다")).toHaveCount(0);

    // 원본 A를 미등기 ON으로 갱신 — 단건 화면에서 고쳐 재계산한 것과 동등
    await putCalculationRecord(page, await singleRecord(true));
    await page.reload();

    await expect(
      page.getByText("원본 이력과 동기화 확인이 필요합니다"),
      "선행 계획서 §7은 이 경로가 감지되지 않는다고 적었으나 실측은 반대다",
    ).toBeVisible({ timeout: 15000 });
    // 바뀐 것은 「양도 1번」뿐이다 — 수동 추가 자산이 섞이면 안 된다
    await expect(page.getByText(/합산에 넣은 뒤 원본 계산이 변경/)).toBeVisible();
  });

  test("RP-3 🔴: replace 로드한 다건 record에 「불러옴」 배지가 붙는다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedBoth(page);
    await replaceLoadMulti(page);

    // 배지는 종전에 **자산 수준 폴백**이 만들던 것이다. 세션 수준으로 옮긴 뒤에도
    // 살아 있어야 한다 — 뮤테이션 P-2·P-3이 노리는 자리이고, vitest는 P-2를 못 본다.
    await backToList(page);
    await openHistoryModal(
      page,
      page.getByTestId("multi-load-history-btn").first(),
      page.getByText("다건 M (E2E)"),
    );
    const row = page.getByTestId(`load-record-${MULTI_ID}`);
    await expect(row, "이 세션을 만든 다건에 「불러옴」이 붙어야 한다").toContainText("불러옴");
    // 편입된 단건도 같은 배지를 유지한다(자산 수준 축)
    await expect(page.getByTestId(`load-record-${SINGLE_ID}`)).toContainText("불러옴");
  });
});
