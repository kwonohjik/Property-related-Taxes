/**
 * 일반건물 **pre-1985 상속·증여** — §163⑨의 1985 하한 제거.
 *
 * ## 종전 실측 (2026-08-07)
 *
 * 1980년 상속 · 양도가 16.2억 · 상속개시일 평가액 5천만·2천만 **입력했는데**:
 *
 * | | 취득가액 | 산출세액 |
 * |---|---|---|
 * | pre-1985(1980) | **0 · 0** | **443,235,000** |
 * | post-1985(1988) 대조 | 205,000,000 · 150,000,000 | 334,920,000 |
 *
 * validate는 통과했다. ④가 `acquisitionByInheritance`에 `>= 1985-01-01`을 걸어 평가액을
 * payload에 싣지 않았고, 대체 경로인 `engineInput.acquisitionPrice`는 상속에서 채워지지
 * 않는다(`api-helpers.ts:526~532` `fixedAcqRaw` — purchase·gift·newConstruction만).
 *
 * ## 법령 — 1985 하한의 근거가 없다 (원문 확인)
 *
 * - **시행령 §163⑨**: 조건은 「상속 또는 증여받은 자산」과 단서의 「기준시가 고시 전」뿐이다.
 *   **「의제취득일」이라는 말이 나오지 않는다.**
 * - **법 §97①1호 단서**: 「**가목의 실지거래가액을 확인할 수 없는 경우에 한정하여** 나목」.
 *   §163⑨이 평가액을 「실지거래가액으로 **본다**」 ⇒ 가목 확인 가능 ⇒ 나목 미적용.
 * - **법 §97②1호 나목**: 물가상승률 가산은 「**환산취득가액에 의하여** … 계산하는 경우」가
 *   조건이다. 「상속 또는 증여받은 자산을 포함한다」는 괄호는 **가목을 확인할 수 없어 나목으로
 *   간 경우**를 뜻하지, 상속·증여를 §176의2④로 보낸다는 뜻이 아니다.
 *
 * ⇒ pre-1985도 §163⑨(가목)이 정본이다. 단건 경로는 이미 그렇게 한다(`calcPreDeemed` — 가목 우선).
 *   **GB만 예외였다.**
 *
 * ## 종전 근거 문구가 틀렸다
 *
 * 「pre-1985 증여는 §176의2④ 의제취득 영역 → 게이트 false → **기존 환산 fallback**(회귀-safe)」.
 * 두 군데가 어긋난다 — §176의2④는 나목 계열이라 가목이 확인되면 도달하지 않고, 그 「환산
 * fallback」도 **더 이상 없다**(O-3이 상속·증여 파트의 환산을 1985 하한 없이 차단했다).
 * 지금은 가목도 나목도 아닌 **0**이다.
 *
 * 설계: `docs/02-design/features/transfer-gb-pre1985-163-9.plan.md`
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { isGbLandPre1990Sec163_9 } from "@/lib/calc/transfer-pre1990-gb-bridge";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const T = 1_620_000_000;
const SEC164_LAND = 205_000_000; // 1,000,000 × 205㎡
const SEC164_BUILDING = 150_000_000;

/** 1980년 취득 — 의제취득일(1985-01-01) **전**. 토지·건물 §164 게이트 모두 안. */
function inherited(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "1980-05-01",
    acquisitionDate: "1980-05-01",
    decedentAcquisitionDate: "1970-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    publishedValueAtInheritance: "50000000",
    gbBuildingInheritedValue: "20000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: String(SEC164_BUILDING),
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    transferPrice: String(T),
    actualSalePrice: String(T),
    ...over,
  } as AssetForm;
}

/** 1980년 증여 — 분리 ON(파트별 신고가액이 ①). */
function gifted(over: Partial<AssetForm> = {}): AssetForm {
  return inherited({
    acquisitionCause: "gift",
    gbBuildingAcquisitionCause: "gift",
    donorAcquisitionDate: "1970-01-01",
    hasSeperateLandAcquisitionDate: true,
    publishedValueAtInheritance: "",
    gbBuildingInheritedValue: "",
    landAcquisitionPrice: "50000000",
    buildingAcquisitionPrice: "20000000",
    ...over,
  } as Partial<AssetForm>);
}

function run(a: AssetForm) {
  const p = buildGeneralBuildingValuation(a, "2026-02-16") as Record<string, unknown> | undefined;
  if (!p) throw new Error("API 변환이 payload를 drop했다 (④ 침묵 strip)");
  const r = dispatchGeneralBuilding(
    p, T, new Date("2026-02-16"), new Date("1980-05-01"),
    0, 0, 2026, 0, [], makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  return {
    landAcq: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    buildingAcq: ap.find((x) => x.assetKind === "building")?.allocatedAcquisitionPrice,
    calculatedTax: r.aggregated.calculatedTax,
  };
}
const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

describe("P85-1 — pre-1985 상속도 §163⑨이 정본이다", () => {
  it("🔴 취득가액이 0이 아니다 — max(평가액, §164)", () => {
    const r = run(inherited());
    expect(r.landAcq).toBe(SEC164_LAND);
    expect(r.buildingAcq).toBe(SEC164_BUILDING);
  });

  it("🔴 세액 443,235,000 → 334,920,000", () => {
    expect(run(inherited()).calculatedTax).toBe(334_920_000);
  });

  it("평가액이 §164보다 크면 평가액을 쓴다 (max이지 대체가 아니다)", () => {
    const r = run(inherited({ publishedValueAtInheritance: "900000000" }));
    expect(r.landAcq).toBe(900_000_000);
  });
});

describe("P85-2 — pre-1985 증여도 같다", () => {
  it("🔴 취득가액이 신고가액이 아니라 §164 가액", () => {
    const r = run(gifted());
    expect(r.landAcq).toBe(SEC164_LAND);
    expect(r.buildingAcq).toBe(SEC164_BUILDING);
  });

  it("🔴 세액 334,920,000", () => {
    expect(run(gifted()).calculatedTax).toBe(334_920_000);
  });
});

describe("P85-3 — ⑧·⑤도 pre-1985에서 켜진다", () => {
  it("🔴 상속 평가액을 요구한다", () => {
    expect(v(inherited({ publishedValueAtInheritance: "" }))).toMatch(/상속개시일 토지 평가액/);
  });

  it("🔴 ② 비교값을 요구한다", () => {
    expect(v(inherited({ gbAcqLandPricePerSqm: "" }))).toMatch(/취득시 토지 공시지가/);
  });

  it("🔴 §164④ 등급환산 UI 게이트가 켜진다", () => {
    expect(isGbLandPre1990Sec163_9(inherited())).toBe(true);
    expect(isGbLandPre1990Sec163_9(gifted())).toBe(true);
  });

  it("증여 파트의 추계는 여전히 차단한다 (V2 — §97①1호 단서)", () => {
    expect(v(gifted({ landAcqMode: "estimated" }))).toMatch(
      /환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다/,
    );
  });
});

describe("P85-4 — post-1985 회귀 0", () => {
  it("1988년 상속 — 종전 값 불변", () => {
    const r = run(inherited({ landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01" }));
    expect(r.landAcq).toBe(SEC164_LAND);
    expect(r.buildingAcq).toBe(SEC164_BUILDING);
    expect(r.calculatedTax).toBe(334_920_000);
  });

  it("2005년 상속 — §164 게이트 밖이라 평가액 그대로", () => {
    const r = run(inherited({ landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01" }));
    expect(r.landAcq).toBe(50_000_000);
    expect(r.buildingAcq).toBe(20_000_000);
  });
});
