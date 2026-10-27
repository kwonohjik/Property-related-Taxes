/**
 * 이월과세(§97의2) ⑧ ↔ ⑫ 정합 — H-5 (소유자 분리) · H-6 (일반건물 환산 방식).
 *
 * 계획서 `docs/00-pm/carryover-validate-parity.plan.md`.
 *
 * 경로: 폼 → ⑧ `collectStepIssues(0)` → ④ `callTransferTaxAPI` 본문 → route POST(⑫⑭).
 * 규칙 (`feedback_fe8_vs_12_parity_grid`): 같은 입력에서 **⑧ 차단 ⇔ ⑫ 400**. 한쪽만 막으면
 * 「UI 통과 → 400」(H-5) 또는 「칸 없는 차단」(H-6)이다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { CarryoverEstimationMode } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { carryoverEstimationModeSupported, carryoverPhdMode, phdPayloadActive } from "@/lib/calc/phd-toggle-scope";
import { runCalc } from "./_owned-at-transfer-pr1a-helpers";

const TRANSFER_DATE = "2025-06-02";

/** ⑧ step 0(자산 목록) 이슈 — 자산 카드 입력은 전부 여기서 검증된다 */
const step0 = (f: TransferFormData) => collectStepIssues(0, f);

/** ⑫ 400의 fieldErrors 키 */
async function fieldErrorKeys(body: unknown): Promise<string[]> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return Object.keys(json?.error?.fieldErrors ?? {});
}

function baseForm(): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = TRANSFER_DATE;
  f.contractTotalPrice = "1000000000";
  f.isOneHousehold = true;
  f.householdHousingCount = "1";
  f.householdNoOtherHousesConfirmed = true;
  f.householdNoPresaleRightsConfirmed = true;
  return f;
}

// ════════════════════════════════════════════════════════════════════════
// H-5 — 이월과세 호스트 × 토지·건물 소유자 분리
// ════════════════════════════════════════════════════════════════════════

/** 소유자 분리 입력 전부 — NonPurchaseSplitInputsBlock(취득시) + 양도가액 축(양도시) */
const SPLIT_FILL: Partial<AssetForm> = {
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "100",
  standardPriceAtAcq: "300000000",
  buildingStandardPriceAtAcq: "100000000",
  standardPricePerSqmAtTransfer: "1500000",
  transferArea: "100",
  buildingStandardPriceAtTransfer: "150000000",
  standardPriceAtTransfer: "450000000",
};
const SPLIT_KEYS = Object.keys(SPLIT_FILL) as (keyof AssetForm)[];

/** ⑧ 필드(AssetForm 키) → ⑫ fieldErrors 키 */
const API_KEY: Record<string, string> = {
  standardPricePerSqmAtAcq: "standardPricePerSqmAtAcquisition",
  acquisitionArea: "acquisitionArea",
  standardPriceAtAcq: "standardPriceAtAcquisition",
  buildingStandardPriceAtAcq: "buildingStandardPriceAtAcquisition",
  standardPricePerSqmAtTransfer: "landStandardPriceAtTransfer",
  transferArea: "landStandardPriceAtTransfer",
  buildingStandardPriceAtTransfer: "buildingStandardPriceAtTransfer",
  standardPriceAtTransfer: "standardPriceAtTransfer",
};

function carryoverHostForm(
  assetKind: "housing" | "building",
  selfOwns: "both" | "building_only" | "land_only",
  over: Partial<AssetForm> = {},
): TransferFormData {
  const f = baseForm();
  Object.assign(f.assets[0], {
    assetKind,
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2020-01-01",
    actualSalePrice: "1000000000",
    addressJibun: "서울특별시 테스트구 1",
    selfOwns,
    buildingOwnerSameHousehold: true,
    residenceInputMode: "direct",
    residencePeriods: [],
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2020-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "lineal",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
      donorSameHousehold: "no",
    },
    ...over,
  });
  return f;
}

describe("H-5 이월과세 × 소유자 분리 — ⑧ ≡ ⑫", () => {
  it("[RED→GREEN] 안분 칸을 비우면 ⑧이 막는다(종전 0건) · ⑫도 400 — 오류가 화면에 있는 첫 칸(㎡당 공시지가)으로 이동", async () => {
    for (const selfOwns of ["building_only", "land_only"] as const) {
      const f = carryoverHostForm("housing", selfOwns);
      const issues = step0(f);
      expect(issues.length, `${selfOwns}: ⑧ 차단`).toBe(1);
      expect(issues[0].field).toBe("standardPricePerSqmAtAcq");
      expect(issues[0].message).toContain("토지·건물 소유자가 다르면");
      const r = await runCalc(f);
      expect(r.status).toBe(400);
    }
  });

  it("[양성 대조군] 안분 칸을 채우면 ⑧ 통과 · ⑫ 200", async () => {
    for (const selfOwns of ["building_only", "land_only"] as const) {
      const f = carryoverHostForm("housing", selfOwns, SPLIT_FILL);
      expect(step0(f)).toEqual([]);
      expect((await runCalc(f)).status).toBe(200);
    }
  });

  it("[회귀 0] 소유자 분리가 아니면(selfOwns=both) 안분 칸을 비워도 ⑧ 통과 · ⑫ 200", async () => {
    const f = carryoverHostForm("housing", "both");
    expect(step0(f)).toEqual([]);
    expect((await runCalc(f)).status).toBe(200);
  });

  it("[격자] 자산종류 2 × 소유 3 × 칸 채움(없음/전부/한 칸씩 비움 8) — ⑧ 차단 ⇔ ⑫ 400, ⑧ 이동 칸 ∈ ⑫ 오류 키", async () => {
    const states: { name: string; fill: Partial<AssetForm> }[] = [
      { name: "none", fill: {} },
      { name: "full", fill: SPLIT_FILL },
      // 본인 파트 취득가액을 직접 넣으면 비율이 안 쓰인다(⑫·엔진 `requiresAcqStdPrice`) — ⑧도 같은 술어라 취득시 칸을 요구하지 않는다
      { name: "fixedAcq", fill: { fixedAcquisitionPrice: "300000000" } },
      { name: "fixedAcq+transfer", fill: { fixedAcquisitionPrice: "300000000", standardPricePerSqmAtTransfer: "1500000", transferArea: "100", buildingStandardPriceAtTransfer: "150000000" } },
      ...SPLIT_KEYS.map((k) => ({ name: `-${String(k)}`, fill: { ...SPLIT_FILL, [k]: "" } as Partial<AssetForm> })),
    ];
    let blockedCells = 0;
    for (const kind of ["housing", "building"] as const) {
      for (const selfOwns of ["both", "building_only", "land_only"] as const) {
        for (const st of states) {
          const f = carryoverHostForm(kind, selfOwns, st.fill);
          const issues = step0(f);
          const r = await runCalc(f);
          const cell = `${kind}/${selfOwns}/${st.name}`;
          expect(issues.length > 0, `${cell}: ⑧ 차단 ⇔ ⑫ 400 (⑧=${issues[0]?.message ?? "통과"} / ⑫=${r.status})`).toBe(r.status === 400);
          if (r.status === 400) {
            blockedCells++;
            const keys = await fieldErrorKeys(r.body);
            const apiKey = API_KEY[issues[0].field ?? ""];
            expect(keys, `${cell}: ⑧ 칸 ${issues[0].field}가 ⑫ 오류에 있어야 한다`).toContain(apiKey);
          }
        }
      }
    }
    // 격자가 실제로 막는 셀을 포함하는지 — 전부 통과하는 공회전 방지
    expect(blockedCells).toBeGreaterThan(6);
  });
});

// ════════════════════════════════════════════════════════════════════════
// H-6 — 일반건물 이월과세 환산 방식(phd·apd) × 증여자 취득 당시 기준시가
// ════════════════════════════════════════════════════════════════════════

type Mode = CarryoverEstimationMode | null;
type Part = "land" | "building";

/** 증여 사건 + 환산 파트 서브객체 */
const gbCarry = (over: object = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2021-03-01",
  donorAcquisitionDate: "2005-06-15",
  giftTaxCalculated: "30000000",
  giftTaxBase: "400000000",
  giftDateValuation: "400000000",
  donorRelation: "lineal" as const,
  donorSameHousehold: "no" as const,
  useEstimatedAcquisition: true,
  ...over,
});

/** 개별주택가격 미공시 3-시점 칸 일부 — 화면(PHD 패널)에서 사용자가 채울 수 있었던 값 */
const PHD_PARTIAL = {
  phdFirstDisclosureDate: "2008-04-30",
  phdFirstDisclosureHousingPrice: "500,000,000",
  phdTransferHousingPrice: "900,000,000",
  acquisitionArea: "100",
} as const;

function gbForm(part: Part, mode: Mode, std: string, phd: "none" | "partial"): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-03-01";
  f.contractTotalPrice = "1000000000";
  f.householdHousingCount = "2";
  const carry = gbCarry({ estimationMode: mode, donorStandardPriceAtAcquisition: std });
  f.assets[0] = {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: part === "land" ? "carryover_gift" : "purchase",
    gbBuildingAcquisitionCause: part === "building" ? "carryover_gift" : "purchase",
    acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    carryover: part === "land" ? carry : { ...CARRYOVER_DEFAULTS },
    ...(part === "building" ? { buildingCarryover: carry } : {}),
    ...(phd === "partial" ? PHD_PARTIAL : {}),
  } as unknown as AssetForm;
  return f;
}

describe("H-6 일반건물 이월과세 환산 방식 — 술어", () => {
  it("일반건물은 general만 지원 · 그 외 자산종류는 셋 다 · 미선택은 따지지 않는다", () => {
    expect(carryoverEstimationModeSupported("general_building", "general")).toBe(true);
    expect(carryoverEstimationModeSupported("general_building", "phd")).toBe(false);
    expect(carryoverEstimationModeSupported("general_building", "apd")).toBe(false);
    expect(carryoverEstimationModeSupported("general_building", null)).toBe(true);
    for (const kind of ["housing", "building", "land"] as const)
      for (const m of ["general", "phd", "apd"] as const) expect(carryoverEstimationModeSupported(kind, m)).toBe(true);
  });

  it("④ carryoverPhdMode: 일반건물의 phd 잔재는 PHD 전송을 켜지 않는다 · 주택은 종전대로", () => {
    const base = { acquisitionCause: "carryover_gift" as const, carryover: gbCarry({ estimationMode: "phd" }) };
    expect(carryoverPhdMode({ ...base, assetKind: "general_building" })).toBe(false);
    expect(carryoverPhdMode({ ...base, assetKind: "housing" })).toBe(true);
    expect(phdPayloadActive({ ...base, assetKind: "general_building" } as never)).toBe(false);
  });
});

describe("H-6 일반건물 이월과세 — ⑧ ≡ ⑫", () => {
  it("[RED→GREEN] phd + 기준시가 비움: ⑧이 막되 **화면에 있는 칸**(환산 방식 라디오)으로 보낸다 — 종전엔 없는 칸(기준시가)을 요구", () => {
    for (const part of ["land", "building"] as const) {
      for (const mode of ["phd", "apd"] as const) {
        const issues = step0(gbForm(part, mode, "", "none"));
        expect(issues.length, `${part}/${mode}`).toBe(1);
        expect(issues[0].field).toBe(part === "land" ? "carryover.estimationMode" : "buildingCarryover.estimationMode");
        expect(issues[0].message).toContain("일반 기준시가 환산");
      }
    }
  });

  it("[양성 대조군] general + 기준시가: ⑧ 통과 · ⑫ 200 — general + 비움은 기준시가 칸으로(그 칸은 general 패널에 렌더)", async () => {
    for (const part of ["land", "building"] as const) {
      expect(step0(gbForm(part, "general", "100000000", "none"))).toEqual([]);
      expect((await runCalc(gbForm(part, "general", "100000000", "none"))).status).toBe(200);
      const blank = step0(gbForm(part, "general", "", "none"));
      expect(blank[0].field).toBe(part === "land" ? "carryover.donorStandardPriceAtAcquisition" : "buildingCarryover.donorStandardPriceAtAcquisition");
    }
  });

  it("[격자] 파트 2 × 방식 4(미선택·general·phd·apd) × 기준시가 2 × PHD 칸 2 — ⑫ 400이면 반드시 ⑧ 차단(UI 통과→400 없음)", async () => {
    let supportedPass = 0;
    let uiOnlyBlocks = 0;
    for (const part of ["land", "building"] as const) {
      for (const mode of [null, "general", "phd", "apd"] as const) {
        for (const std of ["", "100000000"]) {
          for (const phd of ["none", "partial"] as const) {
            const f = gbForm(part, mode, std, phd);
            const issues = step0(f);
            const r = await runCalc(f);
            const cell = `${part}/${mode}/std=${std ? "Y" : "-"}/phd=${phd}`;
            if (r.status === 400) expect(issues.length, `${cell}: ⑫ 400인데 ⑧ 통과(UI 통과→400)`).toBeGreaterThan(0);
            // 지원하는 방식(general)에서는 ⑧ ⇔ ⑫가 정확히 일치한다
            if (mode === "general") expect(issues.length > 0, `${cell}: general ⑧≡⑫`).toBe(r.status === 400);
            if (mode === "general" && issues.length === 0) supportedPass++;
            // ⑧만 막는 셀(⑫ 200)은 **방식 선택 규칙**뿐이다 — 미선택, 또는 일반건물이 지원하지 않는 방식
            if (issues.length > 0 && r.status === 200) {
              uiOnlyBlocks++;
              expect(issues[0].field, cell).toMatch(/estimationMode$/);
            }
          }
        }
      }
    }
    expect(supportedPass).toBeGreaterThan(0);
    expect(uiOnlyBlocks).toBeGreaterThan(0);
  });
});
