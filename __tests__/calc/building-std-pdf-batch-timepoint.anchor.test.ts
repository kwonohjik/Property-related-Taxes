/**
 * F-30 Pre-Do anchor — 배치(일괄) 계산서가 **PDF 에서만** 「상속」으로 찍힌다.
 *
 * ── 결함 구조: 화면에 있는 분기가 PDF 데이터 조립에 통째로 없다
 *   배치 스냅샷은 계산서를 **valuation(`taxType: "inheritance_gift"`) 스냅샷으로 재구성**한다.
 *   그래서 양도 계산인데도 Ⅰ.구분이 상속 칸에 찍히고 PDF 부제도 「상속」이 된다.
 *
 *   화면(`BuildingStdPriceReportSection.tsx:138·172`)은 이를 **두 경로**로 교정한다:
 *     ① `phdTimepointLabel(key)` — 배치 전용 키(`-phd-{acq|first|transfer}`·`-cb-first`)
 *     ② `snapshotKeyTimepoint(key)` — 그 외 재구성 키(`-gb-acq` 등)
 *   그런데 `lib/calc/building-std-pdf-data.ts` 는 **② 만** 쓴다(:49). ⇒ ① 에만 걸리는 키가
 *   그물을 빠져나가 markCell 이 재구성 그대로(`inheritance`) 남는다.
 *
 * ── 실측 대상 키(전 경로 grep 으로 확정한 20종 중 ① 에만 걸리는 것)
 *   `-phd-first`(§164⑤ 최초공시일) · `-cb-first`(§164⑥ 최초고시) · `-phd-acq` · `-phd-transfer`
 *   ⚠️ 리뷰는 이 결함을 **`-gb-first`** 로 적었으나 그 키는 **어디서도 생성되지 않는다**
 *      (lib·components·app 전 경로 grep). 실재하는 `first` 키는 위 둘뿐이다.
 *
 * ── 왜 markCell 만으로는 부족한가
 *   `-phd-acq` 와 `-phd-first` 는 둘 다 「취득당시」 칸이라, markCell 만 고치면 PDF 에
 *   **같은 부제 두 장**이 나온다(`BuildingStdReportPdfPages.tsx:88` 이 `MARK_LABEL[markCell]`
 *   만 찍는다). 화면은 `titleOverride` 로 「최초공시일 · 주택분」처럼 구별한다.
 *   ⇒ 인스턴스에 시점 라벨을 실어 PDF 가 그것을 우선 쓰게 한다.
 *
 * 법령: 소득세법 시행령 제164조 제5항·제6항(최초 고시 전 취득 환산). 표시 사항이며 산식 무관.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { buildBuildingStdReportsFromInput } from "@/lib/calc/building-std-pdf-data";
import { initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

/** 배치가 만드는 재구성 스냅샷 — 상증 모드로 저장되지만 실제로는 양도 자산의 한 시점이다 */
const batchSnap = (valuationYear: string): BuildingStdPriceFormState => ({
  ...initialBuildingStdPriceForm,
  taxType: "inheritance_gift",
  valuationYear,
  builtYear: "2000",
  floorArea: "200",
  valStructureKey: "rc",
  valUsageNo: "1",
  valLandPrice: "2500000",
  landAreaM2: "130",
});

const build = (keys: Record<string, BuildingStdPriceFormState>) =>
  buildBuildingStdReportsFromInput({ buildingStdSnapshots: keys });

describe("F-30 배치 계산서 PDF — §1 시점 매핑 (수정 전 실패)", () => {
  it("`-phd-first`(최초공시일)가 「상속」으로 남지 않는다", () => {
    const [m] = build({ "bsp-asset-1-phd-first": batchSnap("2005") });
    expect(m.instances[0].markCell).not.toBe("inheritance");
  });

  it("`-cb-first`(§164⑥ 최초고시)도 마찬가지다", () => {
    const [m] = build({ "bsp-asset-1-cb-first": batchSnap("2005") });
    expect(m.instances[0].markCell).not.toBe("inheritance");
  });

  it("`-phd-transfer`는 양도당시 칸이다", () => {
    const [m] = build({ "bsp-asset-1-phd-transfer": batchSnap("2024") });
    expect(m.instances[0].markCell).toBe("transfer");
  });

  it("취득시·최초공시일이 **같은 부제**로 두 장 나오지 않는다 — 시점 라벨을 싣는다", () => {
    const models = build({
      "bsp-asset-1-phd-acq": batchSnap("2001"),
      "bsp-asset-1-phd-first": batchSnap("2005"),
    });
    expect(models).toHaveLength(2);
    const labels = models.map((m) => m.instances[0].timepointLabel);
    expect(labels.every(Boolean)).toBe(true);
    expect(new Set(labels).size).toBe(2); // 두 장이 서로 구별된다
  });
});

describe("F-30 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("상증 전용 키(`bsp-estate-*`)는 상속 맥락 그대로다", () => {
    const [m] = build({ "bsp-estate-1": batchSnap("2025") });
    expect(m.instances[0].markCell).toBe("inheritance");
    expect(m.instances[0].timepointLabel).toBeUndefined();
  });

  it("재구성 키 `-gb-acq`는 종전대로 취득당시로 매핑된다 (② 경로)", () => {
    const [m] = build({ "bsp-asset-1-gb-acq": batchSnap("2010") });
    expect(m.instances[0].markCell).toBe("acq2001");
  });

  it("재구성 키는 평가연도로 취득 칸을 가른다 — 2001 은 acq2001", () => {
    const [m] = build({ "bsp-asset-1-gb-acq": batchSnap("2001") });
    expect(m.instances[0].markCell).toBe("acq2001");
  });
});
