/**
 * 일반건물 상속 — 「상속세 신고가액」 칸은 **토지분**이다 (Pre-Do anchor, 2026-08-09).
 *
 * ## 무엇이 문제였나
 *
 * 일반건물은 상속개시일 평가액 칸이 **둘**이다:
 *
 * | 폼 필드 | 화면 라벨 (종전) | 엔진 소비 |
 * |---|---|---|
 * | `publishedValueAtInheritance` | **「상속세 신고가액」** | `landAcq` (토지분) |
 * | `gbBuildingInheritedValue` | 「상속개시일 **건물** 신고가액」 | `buildingAcq` (건물분) |
 *
 * 건물 칸은 「건물」을 명시하는데 토지 칸은 파트를 말하지 않았다 — 힌트도
 * 「상속세 신고서 또는 결정통지서에 기재된 평가가액」이라 **신고서 총액**으로 읽힌다.
 * 총액을 넣고 아래 건물 칸에도 건물분을 넣으면 **건물분이 이중계상**된다.
 *
 * ## Pre-Do 실측 (2026-08-09)
 *
 * 상속 2010-05-01 · 양도 2023-02-19 16.2억 · 신고서 총액 5억(토지 3억 + 건물 2억):
 *
 * | 입력 | 취득가액 | 산출세액 |
 * |---|---|---|
 * | 정상 — 토지분 3억 | 500,000,000 | **320,514,000** |
 * | 라벨대로 — 총액 5억 | 700,000,000 | **256,674,000** |
 * | | | **63,840,000 과소** |
 *
 * ⚠️ **두 경우 다 ⑧ validate가 통과한다**(아래 L-3). 차단으로는 막을 수 없어
 *    **라벨이 유일한 방어선**이다 — 그래서 고칠 대상은 UI 문구다.
 *
 * ## 🔒 이 파일이 지키는 것 — 엔진은 **고치지 않는다**
 *
 * `general-building-route-actual.ts:349`의 `landAcq = inheritedLandValue`는 옳다.
 * §163⑨은 파트별 평가액을 각각 취득가액으로 하고, 상속은 「구분 불분명」(법 §100②)이
 * 아니라 §166⑥ 안분 대상도 아니다. **엔진을 「총액을 안분」으로 바꾸면 안 된다** —
 * 그러면 건물 칸(`gbBuildingInheritedValue`)이 갈 곳을 잃는다.
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_PRICE = 1_620_000_000;
const ACQ_DATE = "2010-05-01";
const TR_DATE = "2023-02-19";

/** 신고서 총액 5억 = 토지 3억 + 건물 2억 */
const LAND_REPORTED = 300_000_000;
const BUILDING_REPORTED = 200_000_000;
const TOTAL_REPORTED = LAND_REPORTED + BUILDING_REPORTED;

/** 정상 입력(토지분만)의 산출세액 */
const TAX_CORRECT = 320_514_000;
/** 총액 오독 시의 산출세액 — 건물분 이중계상 */
const TAX_MISREAD = 256_674_000;

/** 의제취득일(1985.1.1.) **이후** 상속 → post-deemed. §164 max 게이트 밖(토지 ≥1990.8.30). */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: ACQ_DATE,
    acquisitionDate: ACQ_DATE,
    inheritanceStartDate: ACQ_DATE,
    decedentAcquisitionDate: "1995-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    inheritanceValuationMethod: "supplementary",
    publishedValueAtInheritance: String(LAND_REPORTED),
    gbBuildingInheritedValue: String(BUILDING_REPORTED),
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    transferPrice: String(TRANSFER_PRICE),
    actualSalePrice: String(TRANSFER_PRICE),
    transferDate: TR_DATE,
    ...over,
  } as AssetForm;
}

function run(a: AssetForm) {
  const payload = buildGeneralBuildingValuation(a) as Record<string, unknown> | undefined;
  if (!payload) throw new Error("④ API 변환이 payload를 drop했다");
  const r = dispatchGeneralBuilding(
    payload,
    TRANSFER_PRICE,
    new Date(TR_DATE),
    new Date(ACQ_DATE),
    0,
    0,
    2023,
    0,
    [],
    makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  return {
    landAcq: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    buildingAcq: ap.find((x) => x.assetKind === "building")?.allocatedAcquisitionPrice,
    tax: r.aggregated.calculatedTax,
  };
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", TR_DATE);

describe("L-1 — 엔진은 신고가액 칸을 토지분으로만 소비한다 (🔒 고정)", () => {
  it("토지분 3억 · 건물분 2억 → 파트별로 그대로 배정된다 (안분 아님)", () => {
    const r = run(asset());
    expect(r.landAcq).toBe(LAND_REPORTED);
    expect(r.buildingAcq).toBe(BUILDING_REPORTED);
  });

  it("파이프라인 끝 — 산출세액까지 단언한다", () => {
    expect(run(asset()).tax).toBe(TAX_CORRECT);
  });
});

describe("L-2 — 총액을 넣으면 건물분이 이중계상된다 (라벨이 고칠 대상)", () => {
  it("취득가액이 신고서 총액 5억이 아니라 7억이 된다", () => {
    const r = run(asset({ publishedValueAtInheritance: String(TOTAL_REPORTED) }));
    expect(r.landAcq).toBe(TOTAL_REPORTED);
    expect(r.buildingAcq).toBe(BUILDING_REPORTED);
    expect((r.landAcq ?? 0) + (r.buildingAcq ?? 0)).toBe(700_000_000);
  });

  it("🔴 산출세액 63,840,000원 과소", () => {
    const r = run(asset({ publishedValueAtInheritance: String(TOTAL_REPORTED) }));
    expect(r.tax).toBe(TAX_MISREAD);
    expect(TAX_CORRECT - (r.tax ?? 0)).toBe(63_840_000);
  });
});

describe("L-3 — ⑧ validate로는 막을 수 없다 (라벨이 유일한 방어선)", () => {
  it("정상 입력은 통과한다 — 양성 대조군", () => {
    expect(v(asset())).toBeNull();
  });

  it("🔴 총액 오독도 **똑같이 통과한다** — 두 값을 구분할 근거가 폼에 없다", () => {
    expect(v(asset({ publishedValueAtInheritance: String(TOTAL_REPORTED) }))).toBeNull();
  });

  it("토지 평가액이 비면 차단한다 — 차단 문구는 실재하는 경로를 가리켜야 한다", () => {
    const msg = v(asset({ publishedValueAtInheritance: "" }));
    expect(msg).toMatch(/상속개시일 토지 평가액/);
    // 「자산 구분 "토지" 선택」 라디오는 폐지됐다(CompanionAcqInheritanceBlock.tsx 주석) —
    // 없는 컨트롤을 가리키면 사용자가 입력 경로를 찾지 못한다.
    expect(msg).not.toMatch(/자산 구분/);
  });
});
