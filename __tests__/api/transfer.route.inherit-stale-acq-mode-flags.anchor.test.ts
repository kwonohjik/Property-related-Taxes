/**
 * 상속 자산 — 매매에서 고른 취득가액 산정 방식 플래그(감정·환산·매매사례)가 남은 상태. 계획서 `docs/02-design/features/inherit-stale-acq-mode-flags.plan.md`.
 *
 * 상속 카드에는 산정 방식 라디오가 없어(매매 블록은 매매·D2만 · 상가 환산 토글은 상속이면 숨김) 남은 플래그를 끌 수 없었다.
 * 감정은 ④가 `appraisal`로 실어 ⑧ 통과 ↔ 서버 400(`appraisalValue`), 환산·매매사례는 ⑧이 화면에 없는 칸을 요구했다.
 * 수정: 원인 전환(화면)과 복원(폼 단위 `clearInheritedStaleAcqInputs` — 축 B 지분 카드 제외)에서 비운다(`giftEstimationClearPatch` — 증여와 같은 patch). 「복원 후」 세액은 플래그 없는
 * 대조와 같다. 직접 필요경비·소유자 분리에서는 남은 플래그가 세액을 틀리게 만들고 있었다(TX-1·TX-2 — 이 변경이 세액을 바로잡는다). 세율 mock.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migratePersistedTransferForm } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const H: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", actualSalePrice: "500,000,000", publishedValueAtInheritance: "300,000,000",
  inheritanceValuationMethod: "supplementary", standardPriceAtTransfer: "400,000,000", fixedAcquisitionPrice: "",
};
/** 의제취득일(1985.1.1.) 전 상속 토지 — ①②③ 3자 비교 경로 */
const PD: Loose = {
  ...H, assetKind: "land", acquisitionArea: "100", transferArea: "100", acquisitionDate: "1980-06-01", decedentAcquisitionDate: "1970-01-01",
  publishedValueAtInheritance: "50,000,000", standardPriceAtAcq: "30,000,000",
};
const APPR = { isAppraisalAcquisition: true };
const EST = { useEstimatedAcquisition: true };
const SALES = { isSalesCaseAcquisition: true };

const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;
/** 저장된 폼 복원 — store의 `migratePersistedTransferForm`(자산 `migrateAsset` + 폼 단위 상속 정리)을 거친 단건 자산 */
const restored = (a: Loose): Loose =>
  migratePersistedTransferForm({ ...form(a), assets: [{ ...makeDefaultAsset(1), ...a }] }).assets[0] as unknown as Loose;

async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
  };
}

describe("IS — 상속 + 남은 산정 방식 플래그", () => {
  it("IS-0 대조: 플래그 없음 → 200 · 42,950,000", async () => {
    const r = await run(H);
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, 42_950_000]);
  });

  describe("수정 전 상태(플래그가 남은 폼)는 막다른 길이었다 — 계약 고정", () => {
    it("감정 → ⑧ 통과 ↔ 서버 400 appraisalValue", async () => {
      const r = await run({ ...H, ...APPR });
      expect(r.fields).toEqual([]);
      expect(r.status).toBe(400);
      expect(r.fieldErrors).toContain("appraisalValue");
    });
    it("환산 → ⑧ 「취득 당시 기준시가」 · 매매사례 → ⑧ 「매매사례가액」", async () => {
      expect((await run({ ...H, ...EST })).fields).toEqual(["standardPriceAtAcq"]);
      expect((await run({ ...H, ...SALES })).fields).toEqual(["similarSalesValue"]);
    });
  });

  describe("복원하면 세 플래그가 비고 대조와 같은 세액", () => {
    it.each([["감정", APPR], ["환산", EST], ["매매사례", SALES]] as const)("IS-1 %s", async (_n, flag) => {
      const a = restored({ ...H, ...flag });
      expect([a.useEstimatedAcquisition, a.isAppraisalAcquisition, a.isSalesCaseAcquisition]).toEqual([false, false, false]);
      const r = await run(a);
      expect([r.fields, r.status, r.tax]).toEqual([[], 200, 42_950_000]);
    });
    it("IS-2 남은 감정가액 값이 있어도 세액은 평가액 기준 그대로 — 직접 필요경비·소유자 분리가 없을 때(있으면 TX-1·TX-2)", async () => {
      const before = await run({ ...H, ...APPR, fixedAcquisitionPrice: "200,000,000" });
      const after = await run(restored({ ...H, ...APPR, fixedAcquisitionPrice: "200,000,000" }));
      expect([before.status, before.tax]).toEqual([200, 42_950_000]);
      expect([after.status, after.tax]).toEqual([200, 42_950_000]);
    });
    it.each([["감정 · 남은 값 2억", { ...APPR, fixedAcquisitionPrice: "200,000,000" }], ["환산", EST], ["매매사례 · 1억", { ...SALES, similarSalesValue: "100,000,000" }]] as const)(
      "IS-3 의제취득일 전 상속 토지 — %s: 복원 전후 세액 같음(99,060,000)",
      async (_n, flag) => {
        const before = await run({ ...PD, ...flag });
        const after = await run(restored({ ...PD, ...flag }));
        expect([before.status, before.tax]).toEqual([200, 99_060_000]);
        expect([after.status, after.tax]).toEqual([200, 99_060_000]);
      },
    );
  });

  /**
   * 세액이 바뀌는 경로(리뷰 게이트 실측 → 재현). 남은 플래그가 계산을 틀리게 만들고 있었다 — 복원 후 값은 플래그 없는 대조와 같다.
   *   TX-1 직접 필요경비: ④가 추계 모드면 `expenses`를 0으로 싣는다(`transfer-tax-api.ts` 경비 분기) — 상속은 §163⑨ 평가액이 가목 실지거래가액이라 실제 경비를 공제한다.
   *   TX-2 소유자 분리(건물만 본인): 파트 방식이 비어 있으면 자산 단위 플래그에서 파생된다(`effectivePartAcqMode`) — 상속 파트가 추계로 계산됐다.
   */
  describe("세액이 바뀌는 경로 — 남은 플래그가 틀린 값을 만들고 있었다", () => {
    const EXP: Loose = { ...H, directExpenses: "10,000,000" };
    it.each([["감정 · 남은 값 2억", { ...APPR, fixedAcquisitionPrice: "200,000,000" }], ["환산", { ...EST, standardPriceAtAcq: "200,000,000" }], ["매매사례 · 1억", { ...SALES, similarSalesValue: "100,000,000", standardPriceAtAcq: "200,000,000" }]] as const)(
      "TX-1 직접 필요경비 1천만 + 남은 %s: 42,950,000 → 39,758,000(대조와 같음)",
      async (_n, flag) => {
        const control = await run(EXP);
        const before = await run({ ...EXP, ...flag });
        const after = await run(restored({ ...EXP, ...flag }));
        expect([control.status, control.tax]).toEqual([200, 39_758_000]);
        expect([before.status, before.tax]).toEqual([200, 42_950_000]);
        expect([after.status, after.tax]).toEqual([200, 39_758_000]);
      },
    );
    const OWN: Loose = {
      ...H, actualSalePrice: "1,200,000,000", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "",
      selfOwns: "building_only", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000",
      buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000",
      buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
    };
    it.each([
      ["건물만 본인 · 감정 2억", { ...APPR, fixedAcquisitionPrice: "200,000,000" }, 171_756_960, 154_500_000],
      ["건물만 본인 · 환산", EST, 129_132_960, 154_500_000],
      ["토지만 본인 · 감정 2억", { selfOwns: "land_only", ...APPR, fixedAcquisitionPrice: "200,000,000" }, 105_524_640, 94_022_000],
    ] as const)("TX-2 소유자 분리 %s: ⑧ 통과인 채 다른 세액 → 복원 후 대조와 같음", async (_n, flag, staleTax, controlTax) => {
      const control = await run({ ...OWN, ...("selfOwns" in flag ? { selfOwns: flag.selfOwns } : {}) });
      const before = await run({ ...OWN, ...flag });
      const after = await run(restored({ ...OWN, ...flag }));
      expect([control.fields, control.status, control.tax]).toEqual([[], 200, controlTax]);
      expect([before.fields, before.status, before.tax]).toEqual([[], 200, staleTax]);
      expect([after.fields, after.status, after.tax]).toEqual([[], 200, controlTax]);
    });
    /** TX-3 명시 파트 방식 — 매매 「취득일 다름」에서 승격 기록된 값. 상속 소유자 분리는 `hasSeperateLandAcquisitionDate`를 켜지 않는다(화면과 같은 상태). */
    it.each([
      ["건물만 본인 · 건물 파트 환산", { buildingAcqMode: "estimated" }, 129_132_960, 154_500_000],
      ["건물만 본인 · 건물 파트 감정 1억", { buildingAcqMode: "appraisal", buildingAcquisitionPrice: "100,000,000" }, 178_697_808, 154_500_000],
      ["토지만 본인 · 토지 파트 환산", { selfOwns: "land_only", landAcqMode: "estimated" }, 77_956_208, 94_022_000],
    ] as const)("TX-3 소유자 분리 %s: ⑧ 통과인 채 다른 세액 → 복원 후 대조와 같음", async (_n, mode, staleTax, controlTax) => {
      const own = { ...OWN, hasSeperateLandAcquisitionDate: false, ...("selfOwns" in mode ? { selfOwns: mode.selfOwns } : {}) };
      const control = await run(own);
      const before = await run({ ...own, ...mode });
      const restoredAsset = restored({ ...own, ...mode });
      const after = await run(restoredAsset);
      expect([restoredAsset.landAcqMode, restoredAsset.buildingAcqMode]).toEqual(["", ""]);
      expect([control.fields, control.status, control.tax]).toEqual([[], 200, controlTax]);
      expect([before.fields, before.status, before.tax]).toEqual([[], 200, staleTax]);
      expect([after.fields, after.status, after.tax]).toEqual([[], 200, controlTax]);
    });
    /** TX-4 남은 파트 취득가 — 방식이 실거래가(기본)여도 화면에 칸 없는 금액이 상속 파트 취득가액으로 쓰였다. */
    it.each([
      ["건물만 본인 · 건물 파트 취득가액 1억", { buildingAcquisitionPrice: "100,000,000" }, 181_746_000, 154_500_000],
      ["토지만 본인 · 토지 파트 취득가액 1억", { selfOwns: "land_only", landAcquisitionPrice: "100,000,000" }, 100_740_000, 94_022_000],
    ] as const)("TX-4 소유자 분리 %s: ⑧ 통과인 채 다른 세액 → 복원 후 대조와 같음", async (_n, price, staleTax, controlTax) => {
      const own = { ...OWN, hasSeperateLandAcquisitionDate: false, ...("selfOwns" in price ? { selfOwns: price.selfOwns } : {}) };
      const control = await run(own);
      const before = await run({ ...own, ...price });
      const restoredAsset = restored({ ...own, ...price });
      const after = await run(restoredAsset);
      expect([restoredAsset.landAcquisitionPrice, restoredAsset.buildingAcquisitionPrice]).toEqual(["", ""]);
      expect([control.fields, control.status, control.tax]).toEqual([[], 200, controlTax]);
      expect([before.fields, before.status, before.tax]).toEqual([[], 200, staleTax]);
      expect([after.fields, after.status, after.tax]).toEqual([[], 200, controlTax]);
    });
    it("TX-2 소유자 분리 · 남은 매매사례(값 없음): ⑧이 화면에 없는 칸을 요구 → 복원 후 대조와 같음", async () => {
      expect((await run({ ...OWN, ...SALES })).fields).toEqual(["similarSalesValue"]);
      const after = await run(restored({ ...OWN, ...SALES }));
      expect([after.fields, after.status, after.tax]).toEqual([[], 200, 154_500_000]);
    });
  });

  describe("복원 범위 — 상속에서도 플래그에 의미가 있는 자산은 건드리지 않는다", () => {
    it("IS-4 매매는 그대로", () => {
      expect(restored({ ...H, acquisitionCause: "purchase", ...APPR }).isAppraisalAcquisition).toBe(true);
    });
    it.each(["redevelopment_apt", "right_to_move_in"])("IS-5 %s — §166③ 환산·승계 산정 방식 라디오가 같은 플래그를 쓴다", (assetKind) => {
      expect(restored({ ...H, assetKind, ...EST }).useEstimatedAcquisition).toBe(true);
    });
    it("IS-6 겸용주택 — 자체 경로", () => {
      expect(restored({ ...H, isMixedUseHouse: true, ...EST }).useEstimatedAcquisition).toBe(true);
    });
    it("IS-7 D2(건물 상속 + 토지 매매) — 토지 파트 방식이 비어 있으면 이 플래그에서 파생된다", () => {
      const d2 = { ...H, hasSeperateLandAcquisitionDate: true, landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2016-01-01", landAcqMode: "actual", landAcquisitionPrice: "100,000,000", ...APPR };
      const a = restored(d2);
      expect([a.isAppraisalAcquisition, a.landAcqMode, a.landAcquisitionPrice]).toEqual([true, "actual", "100,000,000"]);
    });
    /**
     * AX-1 축 B(같은 물건 지분 분할) 둘째 지분 카드 — 저장된 `assetKind`는 기본값 «주택»(① 기본정보 숨김)이지만 실제 물건은 첫 카드의
     * 일반건물이다. 일반건물 분리 ON(토지 상속 + 건물 매매)의 건물 파트 방식·취득가액은 정당한 입력 — 복원이 지우면 ⑧이 「건물 취득가액」으로
     * 막았다(취득가액 리뷰 게이트 재현). 폼 단위 복원은 지분 카드를 건너뛴다.
     */
    it("AX-1 축 B 일반건물 지분 카드(저장 종류 «주택») — 복원 전후 파트 입력·⑧ 결과가 같다", () => {
      const GB: Loose = {
        addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
        gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
      };
      const parts: Loose = {
        acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
        acquisitionDate: "2010-03-01", landAcquisitionDate: "2010-03-01", landAcqMode: "actual", buildingAcqMode: "actual",
        buildingAcquisitionPrice: "120,000,000", gbAcqLandPricePerSqm: "1,000,000", decedentAcquisitionDate: "2000-01-01",
        publishedValueAtInheritance: "300,000,000", inheritanceValuationMethod: "supplementary",
      };
      const saved = Object.assign(createDefaultTransferFormData(), {
        ...HH, transferDate: "2024-03-01", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
        assets: [
          { ...makeDefaultAsset(1), ...GB, ...parts, ownershipNumerator: "60", ownershipDenominator: "100" },
          { ...makeDefaultAsset(2), ...parts, ownershipNumerator: "40", ownershipDenominator: "100" },
        ],
      }) as TransferFormData;
      const after = migratePersistedTransferForm(saved);
      const pick = (x: Loose) => [x.assetKind, x.buildingAcqMode, x.buildingAcquisitionPrice, x.landAcqMode];
      expect(pick(after.assets[1] as unknown as Loose)).toEqual(["housing", "actual", "120,000,000", "actual"]);
      const fields = (f: TransferFormData) => allIssues(f).map((i) => `${i.field}:${i.message}`);
      expect(fields(after)).toEqual(fields(saved));
    });
    it("IS-8 D2 잔재(토지 매매 흔적만 남고 꺼짐) — 토지 파트 값은 보존(D2를 다시 켜면 복원하는 설계 · C10), 건물 파트 값은 비운다", () => {
      const residue = {
        ...H, landAcquisitionCause: "purchase", landCauseHost: "", hasSeperateLandAcquisitionDate: false,
        landAcqMode: "appraisal", landAcquisitionPrice: "300,000,000", landSalesCaseValue: "250,000,000",
        buildingAcqMode: "estimated", buildingAcquisitionPrice: "100,000,000", buildingSalesCaseValue: "90,000,000", ...APPR,
      };
      const a = restored(residue);
      expect([a.landAcqMode, a.landAcquisitionPrice, a.landSalesCaseValue]).toEqual(["appraisal", "300,000,000", "250,000,000"]);
      expect([a.buildingAcqMode, a.buildingAcquisitionPrice, a.buildingSalesCaseValue, a.isAppraisalAcquisition]).toEqual(["", "", "", false]);
    });
  });
});
