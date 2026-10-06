/**
 * B0 — 겸용주택 「건물 취득일 기준 ㎡당 공시지가」 필수 술어 격자 + 엔진 소비 계약.
 *
 * 술어(`isBuildingDayLandPriceRequired`) 5조건: 두 취득일 다름 ∧ PHD OFF ∧ 용도변경 `commercial_to_house` 아님
 *   ∧ 취득시 개별주택가격 > 0 (+ 겸용은 호출부 컨텍스트).
 * 엔진: 필수인데 값이 없음/0이면 throw · 필수가 아니면 값 무시 · 토지분(`landPricePerSqm`, 토지일)은 불변.
 */
import { describe, it, expect } from "vitest";
import {
  areMixedAcqDatesSeparate,
  isBuildingDayLandPriceRequired,
} from "@/lib/tax-engine/mixed-use-acq-date";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";

const ALL_TRUE = {
  landDate: "1992-01-01",
  buildingDate: "1997-09-12",
  usePhd: false,
  partialDirection: undefined,
  housingPrice: 400_000_000,
} as const;

describe("술어 격자 — 5조건 각각을 하나씩 뒤집으면 거짓", () => {
  it("전부 충족 → 필수", () => {
    expect(isBuildingDayLandPriceRequired(ALL_TRUE)).toBe(true);
  });
  it("① 두 날짜 같음 → 불필요 (함께 취득)", () => {
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, landDate: "1997-09-12" })).toBe(false);
  });
  it("② PHD ON → 불필요", () => {
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, usePhd: true })).toBe(false);
  });
  it("③ 용도변경 상가→주택 → 불필요 / 주택→상가는 필수 유지", () => {
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, partialDirection: "commercial_to_house" })).toBe(false);
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, partialDirection: "house_to_commercial" })).toBe(true);
  });
  it("④ 개별주택가격 0·미입력 → 불필요", () => {
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, housingPrice: 0 })).toBe(false);
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, housingPrice: undefined })).toBe(false);
  });
  it("⑤ 토지일 미입력(빈 문자열·undefined) → 불필요 (④ 폴백: 건물일과 같음)", () => {
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, landDate: "" })).toBe(false);
    expect(isBuildingDayLandPriceRequired({ ...ALL_TRUE, landDate: undefined })).toBe(false);
  });
});

describe("날짜 비교는 날짜 단위 — Date·문자열 혼용·같은 날의 시각 차이", () => {
  it("Date 와 ISO 문자열이 같은 날이면 같다", () => {
    expect(areMixedAcqDatesSeparate(new Date("2010-03-15"), "2010-03-15")).toBe(false);
  });
  it("같은 날 다른 시각의 Date → 같다", () => {
    expect(areMixedAcqDatesSeparate(new Date("2010-03-15T00:00:00Z"), new Date("2010-03-15T09:00:00Z"))).toBe(false);
  });
  it("하루 차이 → 다르다", () => {
    expect(areMixedAcqDatesSeparate("2010-03-14", "2010-03-15")).toBe(true);
  });
  it("무효 Date → 비교 불가라 별개 취득이 아니다", () => {
    expect(areMixedAcqDatesSeparate(new Date("x"), "2010-03-15")).toBe(false);
  });
});

// ── 엔진 소비 계약 ────────────────────────────────────────────────────
const rates = makeMockRatesWithHouseEngine();
const L1 = 2_380_000; // 토지 취득일(1992) 기준
const L2 = 3_000_000; // 건물 취득일(1997) 기준

function asset(
  acqOver: Partial<MixedUseAssetInput["acquisitionStandardPrice"]> = {},
  over: Partial<MixedUseAssetInput> = {},
): MixedUseAssetInput {
  const base = mixedUseCase14();
  return {
    ...base,
    isOneHouseExempt: false,
    acquisitionStandardPrice: {
      housingPrice: 400_000_000,
      commercialBuildingPrice: 30_000_000,
      landPricePerSqm: L1,
      ...acqOver,
    },
    ...over,
  };
}
const run = (a: MixedUseAssetInput) =>
  calcMixedUseTransferTax(3_000_000_000, new Date("2022-02-16"), a, rates);

describe("엔진 — 필수인데 없음/0이면 throw (토지 취득일 값으로 대체하지 않는다)", () => {
  it("미입력 → throw + 필드명 지목", () => {
    expect(() => run(asset())).toThrow(/landPricePerSqmAtBuildingAcq/);
  });
  it("0 → throw", () => {
    expect(() => run(asset({ landPricePerSqmAtBuildingAcq: 0 }))).toThrow(/landPricePerSqmAtBuildingAcq/);
  });
});

describe("엔진 — 건물분 역산에만 신규 값, 토지분은 토지일 값 그대로", () => {
  const r = run(asset({ landPricePerSqmAtBuildingAcq: L2 }));
  const h = r.housingPart;
  const src = mixedUseCase14();
  const area = computeDerivedAreas({
    residentialFloorArea: src.residentialFloorArea,
    nonResidentialFloorArea: src.nonResidentialFloorArea,
    buildingFootprintArea: src.buildingFootprintArea,
    totalLandArea: src.totalLandArea,
  }).residentialLandArea;
  it("토지분 = L1 × 주택부수토지 / 건물분 = 개별주택가격 − L2 × 주택부수토지", () => {
    expect(h.landStdPriceAtAcq).toBe(L1 * area);
    expect(h.buildingStdPriceAtAcq).toBe(400_000_000 - multiplyByArea(L2, area));
  });
  it("신규 값을 바꾸면 건물분만 움직이고, 토지일 값을 바꾸면 토지분만 움직인다", () => {
    const l2Changed = run(asset({ landPricePerSqmAtBuildingAcq: L2 + 100_000 })).housingPart;
    expect(l2Changed.landStdPriceAtAcq).toBe(h.landStdPriceAtAcq);
    expect(l2Changed.buildingStdPriceAtAcq).toBeLessThan(h.buildingStdPriceAtAcq!);
    const l1Changed = run(asset({ landPricePerSqmAtBuildingAcq: L2, landPricePerSqm: L1 + 100_000 })).housingPart;
    expect(l1Changed.buildingStdPriceAtAcq).toBe(h.buildingStdPriceAtAcq);
    expect(l1Changed.landStdPriceAtAcq).toBeGreaterThan(h.landStdPriceAtAcq!);
  });
});

describe("엔진 — 필수가 아니면 값을 무시한다 (함께 취득·개별주택가격 0)", () => {
  it("두 날짜 같음 → 신규 값이 와도 결과 동일 (현행 경로)", () => {
    const same = { landAcquisitionDate: new Date("1997-09-12") };
    const without = JSON.stringify(run(asset({}, same)));
    const withField = JSON.stringify(run(asset({ landPricePerSqmAtBuildingAcq: 9_999_999 }, same)));
    expect(withField).toBe(without);
  });
  it("개별주택가격 미입력(환산 분자 0) → throw 없이 계산", () => {
    expect(() => run(asset({ housingPrice: undefined }))).not.toThrow();
  });
});
