/**
 * 주택 split 파트 이월과세 P2 C — ⑧≡⑫ 격자 + ④ body 계약 (2026-10-19)
 *
 * 폼(AssetForm/TransferFormData) → ④(`callTransferTaxAPI` body) → ⑫(route Zod) → 엔진, 그리고 ⑧(`collectStepIssues` 0·1)을 같은 폼에서 나란히 돌린다.
 * 기대의 정본은 엔진 leaf(`collectSplitPartCauseIssues`)가 ⑫ 400으로 내는 칸이다 — ⑧ 기대값을 따로 손으로 적지 않는다(`feedback_fe8_vs_12_parity_grid`).
 *
 * 불변식
 *   (A) 막다른 길 0 — ⑧이 통과한 폼은 ⑫가 200이다.
 *   (B) leaf 소관 사유(함께 양도 자산·1세대1주택 겹침·증여자 취득일 > 증여일·파트 평가액 합 > 과세가액·필수 칸)는 ⑧ 차단 ⇔ ⑫ 400.
 *   (C) ⑧ 전용 사유(관계 「그 외」·등기접수일 ≥ 양도일·가업상속 선언·보이는 이전 형식 필요경비)는 ⑧이 ⑫보다 엄격하다 — ⑧ 차단 확인만.
 *   (D) 화면에 없는 잔재(숨은 총액·PHD·환산·취득일 분리·legacy 필요경비)는 ④ body·세액을 바꾸지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { cAsset, cForm, bodyOf, routeOf, issuesOf } from "./_helpers/split-carryover-c-form";
import { registerP6Cells } from "./_helpers/split-carryover-p6-grid";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Cell = {
  name: string;
  /** 폼 변형 */
  make: () => TransferFormData;
  /** leaf 소관이면 ⑫가 내야 하는 칸(부분 일치) — 없으면 leaf 소관 아님 */
  leafKey?: string;
  /** ⑧ 전용(⑫보다 엄격) */
  strictOnly?: boolean;
  /** 양방향 — ⑧ 차단 ⇔ ⑫ 400(통과 셀은 ⑧ 통과 ⇔ ⑫ 200). 경계 셀용 */
  bothWays?: boolean;
};

const withCarry = (patch: Record<string, unknown>) => cAsset({ carryover: { ...cAsset().carryover, ...patch } });
const withLand = (patch: Record<string, unknown>) => cAsset({ landCarryover: { ...cAsset().landCarryover, ...patch } });
/** 함께 양도하는 두 번째 자산(건물 단독 소유 아닌 일반 매매 주택) */
const companion = (): AssetForm =>
  ({
    ...makeDefaultAsset(2),
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "400,000,000",
  }) as unknown as AssetForm;

/** 증여 등기접수일·증여자 취득일을 한꺼번에 옮긴 C 폼 — 건물 기준시가(2005.4.30.)·개별공시지가(1990.8.30.) 고시 전 증여 경계 */
const giftOn = (gift: string, donor: string, assetKind: "housing" | "building" = "housing", landDonor = "1980-03-01") =>
  cForm({}, cAsset({ assetKind, carryover: { ...cAsset().carryover, giftRegistryDate: gift, donorAcquisitionDate: donor }, landCarryover: { ...cAsset().landCarryover, donorAcquisitionDate: landDonor } }));

const CELLS: Cell[] = [
  { name: "기준 — 모든 칸 입력", make: () => cForm() },
  // ── leaf 소관 ──
  // P5 — 1세대1주택 겹침은 막지 않는다(S9 삭제 → 해결자의 §97의2②2호 판정)
  { name: "1세대1주택 해당(주택) — 계산한다", make: () => cForm({ isOneHousehold: true }) },
  { name: "1세대 + 미등기", make: () => cForm({ isOneHousehold: true, isUnregistered: true }) },
  { name: "비주택 건물 + 1세대", make: () => cForm({ isOneHousehold: true }, cAsset({ assetKind: "building" })) },
  { name: "S5/F-6 토지 증여자 취득일 > 증여일", make: () => cForm({}, withLand({ donorAcquisitionDate: "2023-03-02" })), leafKey: "landCarryoverPart.donorAcquisitionDate" },
  { name: "F-6 건물 증여자 취득일 > 증여일", make: () => cForm({}, withCarry({ donorAcquisitionDate: "2023-03-02" })), leafKey: "buildingCarryoverPart.donorAcquisitionDate" },
  { name: "증여자 취득일 = 증여일(허용)", make: () => cForm({}, withLand({ donorAcquisitionDate: "2023-03-01" })) },
  { name: "Σ 파트 평가액 > 과세가액", make: () => cForm({}, withCarry({ giftTaxBase: "800,000,000" })), leafKey: "carryoverGiftEvent.giftTaxBase" },
  { name: "과세가액 비움", make: () => cForm({}, withCarry({ giftTaxBase: "" })), leafKey: "carryoverGiftEvent.giftTaxBase" },
  { name: "산출세액 비움(0 허용)", make: () => cForm({}, withCarry({ giftTaxCalculated: "" })) },
  { name: "토지 증여자 취득가액 비움", make: () => cForm({}, withLand({ donorAcquisitionPrice: "" })), leafKey: "landCarryoverPart.donorAcquisitionPrice" },
  { name: "건물 증여자 취득가액 비움", make: () => cForm({}, withCarry({ donorAcquisitionPrice: "" })), leafKey: "buildingCarryoverPart.donorAcquisitionPrice" },
  { name: "토지 증여자 취득일 비움", make: () => cForm({}, withLand({ donorAcquisitionDate: "" })), leafKey: "landCarryoverPart.donorAcquisitionDate" },
  { name: "건물 증여자 취득일 비움", make: () => cForm({}, withCarry({ donorAcquisitionDate: "" })), leafKey: "buildingCarryoverPart.donorAcquisitionDate" },
  { name: "토지 증여 신고가액 비움(S7)", make: () => cForm({}, cAsset({ landAcquisitionPrice: "" })), leafKey: "landAcquisitionPrice" },
  { name: "건물 증여 신고가액 비움(S7)", make: () => cForm({}, cAsset({ buildingAcquisitionPrice: "" })), leafKey: "buildingAcquisitionPrice" },
  { name: "증여 등기접수일 비움", make: () => cForm({}, withCarry({ giftRegistryDate: "" })), leafKey: "carryoverGiftEvent" },
  // ── 증여일이 고시 전인 구간(영 §163⑨ 단서 1호·2호) — ④가 건물 종류·§164 가액을 싣지 않아 C는 막힌다. ⑧ 차단 ⇔ ⑫ 400 ──
  { name: "증여일 2005-04-29(주택·건물 몫 단서 2호)", make: () => giftOn("2005-04-29", "1995-06-01"), leafKey: "acquisitionDate", bothWays: true },
  { name: "증여일 2005-04-30 경계(엄격 미만이라 통과)", make: () => giftOn("2005-04-30", "1995-06-01"), bothWays: true },
  { name: "증여일 2005-04-29(비주택 건물)", make: () => giftOn("2005-04-29", "1995-06-01", "building"), leafKey: "acquisitionDate", bothWays: true },
  { name: "증여일 2005-04-30 경계(비주택 건물)", make: () => giftOn("2005-04-30", "1995-06-01", "building"), bothWays: true },
  { name: "증여일 1990-08-29(토지 단서 1호 + 건물 단서 2호)", make: () => giftOn("1990-08-29", "1980-06-01"), leafKey: "landSec164Value", bothWays: true },
  { name: "증여일 1990-08-29(비주택 건물)", make: () => giftOn("1990-08-29", "1980-06-01", "building"), leafKey: "landSec164Value", bothWays: true },
  // ── ⑧ 전용(⑫보다 엄격) ──
  { name: "등기접수일 ≥ 양도일", make: () => cForm({}, withCarry({ giftRegistryDate: "2025-06-30" })), strictOnly: true },
  { name: "관계 그 외", make: () => cForm({}, withCarry({ donorRelation: "other" })), strictOnly: true },
  { name: "사망 선언 + 관계 미선택", make: () => cForm({}, withCarry({ donorDeceased: true, donorRelation: "" })), strictOnly: true },
  { name: "가업상속 선언", make: () => cForm({}, withCarry({ exclusionDeclared: { ...CARRYOVER_DEFAULTS.exclusionDeclared, isFamilyBusinessInheritedAsset: true } })), strictOnly: true },
  { name: "보이는 이전 형식 필요경비(directExpenses)", make: () => cForm({}, cAsset({ directExpenses: "5,000,000" })), strictOnly: true },
  // ── 양도 정보(축 A · 파트 자본적지출) — ⑧이 C에서도 같은 규칙으로 검증한다 ──
  { name: "축 A: 구분양도인데 양도가액·기준시가 근거 없음", make: () => cForm({}, cAsset({ landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" })), strictOnly: true },
  { name: "축 A: 자산 전체 자본적지출만 입력(파트 칸 비움)", make: () => cForm({}, cAsset({ capitalExpenditure: "5,000,000" })), strictOnly: true },
  // ── 잔재(D) — 통과하고 세액이 기준과 같아야 한다 ──
  { name: "잔재: 숨은 취득가액 총액", make: () => cForm({}, cAsset({ fixedAcquisitionPrice: "1,000,000,000" })) },
  // 파트 합(9억)보다 작은 총액 — ④가 그대로 싣으면 ⑫ `refineSplitAcquisitionInputs`의 «파트 합 ≤ 총액» 400이 난다(자산 단위 칸은 화면에 없다)
  { name: "잔재: 숨은 취득가액 총액(파트 합보다 작음)", make: () => cForm({}, cAsset({ fixedAcquisitionPrice: "500,000,000" })) },
  { name: "잔재: 자산 단위 환산 latch(pre1990Enabled)", make: () => cForm({}, cAsset({ pre1990Enabled: true })) },
  { name: "잔재: PHD 자동 ON + 옛 취득일", make: () => cForm({}, cAsset({ usePreHousingDisclosure: true, acquisitionDate: "2000-01-01" })) },
  { name: "잔재: 증여자 환산 phd", make: () => cForm({}, withCarry({ useEstimatedAcquisition: true, estimationMode: "phd" })) },
  { name: "잔재: 증여자 환산 general", make: () => cForm({}, withCarry({ useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "1,000", donorStandardPriceAtTransfer: "2,000" })) },
  { name: "잔재: 자산 단위 환산·감정·매매사례 플래그", make: () => cForm({}, cAsset({ useEstimatedAcquisition: true, isAppraisalAcquisition: true })) },
  { name: "잔재: 취득일 분리 + 옛 토지 취득일", make: () => cForm({}, cAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", acquisitionDate: "2012-02-02" })) },
  { name: "잔재: 옛 취득일(acquisitionDate)", make: () => cForm({}, cAsset({ acquisitionDate: "2019-05-05" })) },
  { name: "잔재: 파트 방식 라디오 estimated", make: () => cForm({}, cAsset({ landAcqMode: "estimated", buildingAcqMode: "appraisal" })) },
];

describe("P2 C — ⑧≡⑫ 격자", () => {
  const baseTaxPromise = (async () => {
    const r = await routeOf(POST, await bodyOf(cForm()));
    return r.json?.data?.result?.determinedTax as number;
  })();

  it("기준 셀: ⑧ 통과 · ④ body에 새 키 3종 · 최상위 carryoverTaxation 없음 · ⑫ 200 · 결정세액 300,018,000(엔진 anchor C_NEW 파트별 ②3호)", async () => {
    const form = cForm();
    expect(issuesOf(form)).toEqual([]);
    const body = await bodyOf(form);
    expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000, donorRelation: "lineal" });
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000 });
    expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 50_000_000 });
    expect(body.landAcquisitionCause).toBe("carryover_gift");
    expect(body.acquisitionCause).toBe("carryover_gift");
    expect(body.landAcquisitionDate).toBe("2023-03-01");
    expect(body.acquisitionDate).toBe("2023-03-01");
    expect(body.isSeparateAcquisition).toBe(false);
    expect(body.landAcqMode).toBe("actual");
    expect(body.buildingAcqMode).toBe("actual");
    expect("carryoverTaxation" in body).toBe(false);
    expect("landDecedentAcquisitionDate" in body).toBe(false);
    expect("landSec164Value" in body).toBe(false);
    expect("preHousingDisclosure" in body).toBe(false);
    expect(body.expenses).toBe(0);
    expect(body.acquisitionPrice).toBe(0);
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.json.error ?? {})).toBe(200);
    expect(r.json.data.result.determinedTax).toBe(300_018_000);
    expect(r.json.data.result.splitDetail.land.carryover.judgment).toBe("excluded");
    expect(r.json.data.result.splitDetail.building.carryover.judgment).toBe("applied");
  });

  for (const cell of CELLS) {
    it(`${cell.name}`, async () => {
      const form = cell.make();
      const issues = issuesOf(form);
      const body = await bodyOf(form);
      const r = await routeOf(POST, body);
      const keys = Object.keys(r.fieldErrors);
      const blocked8 = issues.length > 0;
      // (A) 막다른 길 0
      if (!blocked8) expect(r.status, `⑧ 통과인데 ⑫ ${r.status} ${JSON.stringify(r.fieldErrors)}`).toBe(200);
      // (B) leaf 소관 ⇔
      if (cell.leafKey) {
        expect(blocked8, `⑧ 차단 기대(${cell.leafKey})`).toBe(true);
        expect(keys.some((k) => k.includes(cell.leafKey!)), `⑫ 칸 ${cell.leafKey} ← ${JSON.stringify(keys)}`).toBe(true);
      }
      // 양방향 — ⑧ 차단 ⇔ ⑫ 400
      if (cell.bothWays) expect(blocked8, `⑧ ${JSON.stringify(issues.map((i) => i.field))} ↔ ⑫ ${r.status}`).toBe(r.status === 400);
      // (C) ⑧ 전용
      if (cell.strictOnly) expect(blocked8).toBe(true);
      // (D) 잔재 — 세액 불변
      if (cell.name.startsWith("잔재:")) {
        expect(blocked8, JSON.stringify(issues)).toBe(false);
        expect(r.json.data.result.determinedTax).toBe(await baseTaxPromise);
      }
    });
  }

  it("고시 전 증여 차단 문구는 C에 있는 조치만 안내한다 — «토지는 다른 원인으로 취득»(D2 스위치)은 C에 없다", async () => {
    for (const kind of ["housing", "building"] as const) {
      const form = giftOn("2005-04-29", "1995-06-01", kind);
      const r = await routeOf(POST, await bodyOf(form));
      const msg = (r.fieldErrors.acquisitionDate ?? []).join(" ");
      expect(msg, kind).toContain("「증여자가 토지·건물을 다른 날 취득」을 끄세요");
      expect(msg, kind).not.toContain("토지는 다른 원인으로 취득");
      // ⑧은 같은 leaf 문구를 그대로 낸다
      expect(issuesOf(form).some((i) => i.message.includes("「증여자가 토지·건물을 다른 날 취득」을 끄세요")), kind).toBe(true);
    }
  });

  it("S2′ 함께 양도 자산 1건 — ⑧(첫 자산 카드)과 ⑫가 같이 막는다: field 앵커는 토글(carryoverDonorSplit)", async () => {
    const form = cForm({ assets: [cAsset(), companion()], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
    const issues = issuesOf(form);
    expect(issues.some((i) => i.field === "carryoverDonorSplit")).toBe(true);
    const r = await routeOf(POST, await bodyOf(form));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).some((k) => k.includes("landCarryoverPart"))).toBe(true);
  });

  it("P5 ④ 사건 — 통째 증여(C)는 배우자 예외(관계 배우자일 때만)와 세대 사실을 싣는다 · ⑫ 200 · 엔진 echo", async () => {
    const spouse = cAsset({ carryover: { ...cAsset().carryover, donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true } });
    const body = await bodyOf(cForm({}, spouse));
    expect(body.carryoverGiftEvent).toMatchObject({ spouseGiftOneHouseAtGiftDate: true, donorSameHouseholdContinuous: false });
    expect(issuesOf(cForm({}, spouse))).toEqual([]);
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    // 관계가 배우자가 아니면 남은 답은 싣지 않는다(자산 단위와 같은 규칙)
    const lineal = cAsset({ carryover: { ...cAsset().carryover, spouseGiftOneHouseAtGiftDate: true } });
    expect("spouseGiftOneHouseAtGiftDate" in ((await bodyOf(cForm({}, lineal))).carryoverGiftEvent as object)).toBe(false);
  });

  it("P5 ⑧≡⑫ — C의 세대 보유 시작일은 건물 증여자 취득일 기준(시작일 < 건물 증여자 취득일이면 둘 다 막는다)", async () => {
    const bad = cAsset({ carryover: { ...cAsset().carryover, donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2010-01-01" } });
    const form = cForm({}, bad);
    expect(issuesOf(form).some((i) => i.field === "carryover.donorHouseholdHoldingStartDate")).toBe(true);
    const r = await routeOf(POST, await bodyOf(form));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).some((k) => k.includes("donorHouseholdHoldingStartDate"))).toBe(true);
  });

  it("P5 — 1세대1주택이어도 자산 단계(0)·보유 상황 단계(1) 모두 막지 않는다(S9 삭제 · ②2호는 엔진이 판정)", async () => {
    const form = cForm({ isOneHousehold: true });
    expect(collectStepIssuesStep(0, form)).toEqual([]);
    expect(collectStepIssuesStep(1, form).some((i) => i.field === "isOneHousehold")).toBe(false);
  });

  it("숨은 legacy 필요경비(양도비 입력으로 칸이 숨음) — ⑧ 통과 · ④는 expenses 0 · 양도비만 입력한 것과 세액 동일", async () => {
    const hidden = cForm({}, cAsset({ directExpenses: "5,000,000", transferExpense: "1,000,000" }));
    const ref = cForm({}, cAsset({ transferExpense: "1,000,000" }));
    expect(issuesOf(hidden)).toEqual([]);
    const b = await bodyOf(hidden);
    expect(b.expenses).toBe(0);
    const [rh, rr] = [await routeOf(POST, b), await routeOf(POST, await bodyOf(ref))];
    expect(rh.status).toBe(200);
    expect(rh.json.data.result.determinedTax).toBe(rr.json.data.result.determinedTax);
  });

  it("토글 OFF(자산 전체 이월과세 종전 경로) — 새 키 3종을 하나도 싣지 않는다(stray 400 방지)", async () => {
    const form = cForm({}, cAsset({ carryoverDonorSplit: false, carryover: { ...cAsset().carryover, giftDateValuation: "900,000,000" } }));
    const body = await bodyOf(form);
    expect("carryoverGiftEvent" in body).toBe(false);
    expect("landCarryoverPart" in body).toBe(false);
    expect("buildingCarryoverPart" in body).toBe(false);
    expect(body.landAcquisitionCause).toBeUndefined();
    expect(body.carryoverTaxation).toBeTruthy();
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.json.error ?? {})).toBe(200);
  });

  it("잔재 환산(general·phd)이 body에 새지 않는다 — 환산 플래그·기준시가 override·PHD payload 부재(④ 직접 단언 — 세액 동일만으로는 못 잡는다)", async () => {
    for (const carry of [
      { useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "1,000", donorStandardPriceAtTransfer: "2,000" },
      { useEstimatedAcquisition: true, estimationMode: "phd" },
    ]) {
      const body = await bodyOf(cForm({}, withCarry(carry)));
      expect(body.useEstimatedAcquisition, JSON.stringify(carry)).toBe(false);
      expect(body.acquisitionMethod).toBe("actual");
      expect(body.standardPriceAtAcquisition).toBeUndefined();
      expect(body.standardPriceAtTransfer).toBeUndefined();
      expect("preHousingDisclosure" in body && body.preHousingDisclosure !== undefined).toBe(false);
    }
    // 자산 단위 추계 플래그 잔재 — 감정 모드로 새면 ⑫가 «감정가액 방식 선택 시 감정가액» 400
    const flags = await bodyOf(cForm({}, cAsset({ useEstimatedAcquisition: true, isAppraisalAcquisition: true })));
    expect(flags.acquisitionMethod).toBe("actual");
    expect(flags.appraisalValue).toBeUndefined();
  });

  it("소유자 분리·부담부증여·겸용이면 토글 ON이어도 C가 아니다(읽는 쪽 파생) — 새 키 부재", async () => {
    for (const patch of [{ selfOwns: "building_only" }, { transferType: "burdened_gift" }, { isMixedUseHouse: true }]) {
      const body = await bodyOf(cForm({}, cAsset(patch)));
      expect("carryoverGiftEvent" in body, JSON.stringify(patch)).toBe(false);
      expect("landCarryoverPart" in body, JSON.stringify(patch)).toBe(false);
    }
  });
});

import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
function collectStepIssuesStep(step: number, form: TransferFormData) {
  return collectStepIssues(step, form);
}

/**
 * 조합 격자(64셀) — leaf 소관 4축(자산 종류 · 1세대 · 미등기 · 함께 양도 자산 · 증여자 토지 취득일 · 평가액 합)의 모든 조합에서
 * «⑧이 leaf 소관 사유로 막는가 ⇔ ⑫가 leaf 소관 칸으로 400을 내는가»가 같다. ⑧은 자산당 첫 오류 1건만 내므로 사유별이 아니라 «막는가» 전체로 대조한다.
 * 기대값을 손으로 적지 않는다 — ⑫(엔진 leaf)가 정본이다(`feedback_fe8_vs_12_parity_grid`).
 */
describe("P2 C — leaf 소관 조합 격자 (⑧ 차단 ⇔ ⑫ 400)", () => {
  // P5 — 1세대 축은 남겨 둔다: S9 삭제 후에는 어느 조합에서도 1세대 여부가 차단을 만들지 않아야 한다.
  const LEAF8 = new Set(["isOneHousehold", "carryoverDonorSplit", "landCarryover.donorAcquisitionDate", "carryover.giftTaxBase"]);
  const LEAF12 = ["isOneHousehold", "landCarryoverPart", "carryoverGiftEvent.giftTaxBase"];
  const kinds = ["housing", "building"] as const;
  const bools = [false, true] as const;
  for (const kind of kinds)
    for (const oneHouse of bools)
      for (const unreg of bools)
        for (const companionCount of [0, 1] as const)
          for (const landDateAfter of bools)
            for (const sumOver of bools) {
              const name = `${kind} · 1세대 ${oneHouse} · 미등기 ${unreg} · 함께양도 ${companionCount} · 토지증여자일>증여일 ${landDateAfter} · Σ초과 ${sumOver}`;
              it(name, async () => {
                const a = cAsset({ assetKind: kind });
                if (landDateAfter) (a.landCarryover as { donorAcquisitionDate: string }).donorAcquisitionDate = "2023-03-02";
                if (sumOver) (a.carryover as { giftTaxBase: string }).giftTaxBase = "800,000,000";
                const form = cForm(
                  companionCount
                    ? { assets: [a, companion()], contractTotalPrice: "1600000000", bundledSaleMode: "actual", isOneHousehold: oneHouse, isUnregistered: unreg }
                    : { isOneHousehold: oneHouse, isUnregistered: unreg },
                  a,
                );
                const issues = issuesOf(form);
                const blocked8 = issues.some((i) => LEAF8.has(String(i.field)));
                const r = await routeOf(POST, await bodyOf(form));
                const blocked12 = Object.keys(r.fieldErrors).some((k) => LEAF12.some((l) => k.includes(l)));
                expect(blocked8, `⑧ ${JSON.stringify(issues.map((i) => i.field))} ↔ ⑫ ${JSON.stringify(Object.keys(r.fieldErrors))}`).toBe(blocked12);
                // 기대 도출(엔진 leaf 규칙을 사람이 읽는 형태로 한 번 더) — S2′ · F-6 · Σ 중 하나라도 걸리면 막힌다(P5: 1세대 여부는 무관)
                expect(blocked12).toBe(companionCount === 1 || landDateAfter || sumOver);
              });
            }
});

// P6 — 증여자 취득가액을 모를 때 파트 환산(토지·건물 각각): 분자·분모·같은 날·지분·잔재 비누출. 셀 정의는 A·B·C가 공유한다(`split-carryover-p6-grid.ts`).
registerP6Cells(
  {
    kind: "C",
    parts: ["land", "building"],
    make: (p = {}, a = {}, f = {}) => cForm(f, cAsset({ landCarryover: { ...cAsset().landCarryover, ...p.land }, carryover: { ...cAsset().carryover, ...p.building }, ...a })),
    sameDay: (part) => (part === "land" ? { land: { donorAcquisitionDate: "2015-06-01" } } : { building: { donorAcquisitionDate: "1995-03-01" } }),
    early: {
      patches: { land: { donorAcquisitionDate: "1995-03-01" }, building: { giftRegistryDate: "2012-03-01", donorAcquisitionDate: "2008-06-01" } },
      assetOver: {},
      formOver: { transferDate: "2015-09-30", filingDate: "2015-11-30" },
    },
  },
  POST,
);
