/**
 * anchor: B0 — 「건물 취득일 기준 ㎡당 공시지가」 ⑤ 노출 · ④ 전송 · ⑧ 필수가 **같은 술어**를 쓴다.
 *
 * 설계: `docs/02-design/features/mixed-use-acq-std-date-mismatch.ui.design.md` §2.1·§2.7·§5.
 * 술어 규칙 자체는 엔진 leaf(`mixed-use-acq-date.ts`)에만 있다 — 여기서는 폼 문자열 → leaf 인자 변환과
 * ④⇔⑧ 일치(UI 통과 ↔ validate 차단 모순 없음), 폴백 없음, stale sessionStorage 안전을 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  isMixedAcqDatesSeparate,
  mixedAcqLandPricePerSqmAtBuildingAcq,
  needsMixedAcqLandPriceAtBuildingAcq,
} from "@/lib/calc/mixed-use-acq-date-split";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { validateMixedUseAsset } from "@/lib/calc/transfer-tax-validate-mixed-use-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_DATE = "2024-08-20";

/** 시나리오 2 — 겸용·매매·환산·날짜 다름·PHD OFF·주택가격 입력 → 노출·필수 */
function mixed(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "2010-03-15",
    landAcquisitionDate: "2005-06-10",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "200",
    mixedTransferHousingPrice: "1,600,000,000",
    mixedTransferCommercialBuildingPrice: "100,000,000",
    mixedTransferLandPricePerSqm: "12,000,000",
    mixedAcqHousingPrice: "400,000,000",
    mixedAcqCommercialBuildingPrice: "80,000,000",
    mixedAcqLandPricePerSqm: "1,200,000",
    ...over,
  } as AssetForm;
}

function form(asset: AssetForm): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "3,000,000,000",
    assets: [asset],
  } as unknown as TransferFormData;
}

/** ④ 가 엔진에 보내는 신규 키 (없으면 undefined) */
function sentValue(a: AssetForm): number | undefined {
  const p = buildMixedUsePayload(a, form(a)) as
    | { acquisitionStandardPrice: { landPricePerSqmAtBuildingAcq?: number } }
    | undefined;
  return p?.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq;
}
/** ⑧ 이 신규 칸 때문에 막는가 */
function blockedByNewField(a: AssetForm): boolean {
  const err = validateMixedUseAsset(a, "자산", TRANSFER_DATE);
  return !!err && /건물 취득일\(.*\) 기준 주택부수토지/.test(err);
}

const GRID: Array<[string, Partial<AssetForm>, boolean]> = [
  ["2 날짜 다름·PHD OFF·주택가격 입력", {}, true],
  ["1 함께 취득(날짜 같음)", { landAcquisitionDate: "2010-03-15" }, false],
  ["1' 토지일 미입력(④ 폴백 = 건물일)", { landAcquisitionDate: "" }, false],
  ["3 주택가격 미입력", { mixedAcqHousingPrice: "" }, false],
  ["4 PHD ON", { usePreHousingDisclosure: true }, false],
  [
    "5 용도변경 주택→상가(PHD OFF)",
    { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" },
    true,
  ],
  [
    "7 용도변경 상가→주택",
    { hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house" },
    false,
  ],
  [
    "7' 용도변경 플래그 OFF + 방향 값 잔존 → ④는 방향을 안 보낸다 → 필수",
    { hasPartialUsageChange: false, partialChangeDirection: "commercial_to_house" },
    true,
  ],
  [
    "8 상속 + 보충적평가가(주택가격) 입력 + 날짜 다름(stale 토지일 포함)",
    { acquisitionCause: "inheritance" },
    true,
  ],
  ["9 상속 + 주택가격 미입력(신고가액 override만)", { acquisitionCause: "inheritance", mixedAcqHousingPrice: "" }, false],
  ["10 비겸용(일반 주택)", { isMixedUseHouse: false }, false],
  ["10' 일반건물", { assetKind: "building" as AssetForm["assetKind"] }, false],
];

describe("⑤ 술어 격자", () => {
  it.each(GRID)("%s", (_name, over, expected) => {
    expect(needsMixedAcqLandPriceAtBuildingAcq(mixed(over))).toBe(expected);
  });
});

describe("④ 전송 ⇔ ⑤ 노출 일치 (술어 참일 때만 키를 싣는다)", () => {
  it.each(GRID.filter(([, over]) => (over as Partial<AssetForm>).isMixedUseHouse !== false && (over as Partial<AssetForm>).assetKind === undefined))(
    "%s",
    (_name, over, expected) => {
      const a = mixed({ ...over, mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000" });
      expect(sentValue(a) !== undefined).toBe(expected);
      if (expected) expect(sentValue(a)).toBe(1_800_000);
    },
  );

  it("날짜를 같게 되돌려도 store 값은 남아 있지만 미전송·미요구 (useEffect 정리 없음)", () => {
    const a = mixed({ mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000", landAcquisitionDate: "2010-03-15" });
    expect(a.mixedAcqLandPricePerSqmAtBuildingAcq).toBe("1,800,000");
    expect(sentValue(a)).toBeUndefined();
    expect(blockedByNewField(mixed({ landAcquisitionDate: "2010-03-15" }))).toBe(false);
  });

  it("토지 취득일 값(mixedAcqLandPricePerSqm)·PHD 값으로 대체하지 않는다 — 비어 있으면 0 그대로 전송", () => {
    const a = mixed({ mixedAcqLandPricePerSqmAtBuildingAcq: "", phdLandPricePerSqmAtAcq: "1,500,000" });
    expect(sentValue(a)).toBe(0);
    expect(sentValue(a)).not.toBe(1_200_000);
  });

  it("stale sessionStorage(필드 자체가 없음) → 예외 없이 0", () => {
    const a = mixed() as Partial<AssetForm>;
    delete a.mixedAcqLandPricePerSqmAtBuildingAcq;
    expect(mixedAcqLandPricePerSqmAtBuildingAcq(a as AssetForm)).toBe(0);
    expect(() => validateMixedUseAsset(a as AssetForm, "자산", TRANSFER_DATE)).not.toThrow();
  });
});

describe("⑧ validate ⇔ ⑤ 일치 — 술어 참이면 미입력 차단, 입력하면 통과, 거짓이면 요구 안 함", () => {
  it("술어 참 + 미입력 → 차단(앵커 = mixedAcqLandPricePerSqmAtBuildingAcq) + 두 날짜 표기", () => {
    const err = validateMixedUseAsset(mixed(), "자산", TRANSFER_DATE);
    expect(err).toContain("건물 취득일(2010-03-15) 기준 주택부수토지 개별공시지가");
    expect(err).toContain("토지 취득일(2005-06-10)");
  });
  it("술어 참 + 입력 → 이 필드로는 안 막힘", () => {
    expect(blockedByNewField(mixed({ mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000" }))).toBe(false);
  });
  it.each(GRID)("격자: ⑧이 신규 칸을 요구하는가 = 술어 (%s)", (_name, over, expected) => {
    // 신규 칸 비움 상태에서 ⑧ 차단 ⇔ 술어 참. (다른 오류가 먼저 나오면 이 필드 오류는 가려질 수 있어
    // 격자 입력은 다른 필수값을 모두 채웠다 — 비겸용·일반건물은 이 검증 경로를 타지 않는다.)
    const a = mixed(over);
    const isMixed = a.assetKind === "housing" && a.isMixedUseHouse;
    if (!isMixed) return expect(needsMixedAcqLandPriceAtBuildingAcq(a)).toBe(false);
    const err = validateMixedUseAsset(a, "자산", TRANSFER_DATE);
    if (expected) expect(err).toMatch(/건물 취득일\(.*\) 기준 주택부수토지/);
    else expect(err ?? "").not.toMatch(/건물 취득일\(.*\) 기준 주택부수토지/);
  });
  it("주택가격 미입력이면 주택가격 오류가 먼저 (신규 칸 오류 없음)", () => {
    const err = validateMixedUseAsset(mixed({ mixedAcqHousingPrice: "" }), "자산", TRANSFER_DATE);
    expect(err).toContain("취득시 개별주택공시가격");
  });
});

describe("isMixedAcqDatesSeparate — ④ 폴백과 같은 규칙", () => {
  it("토지일이 비면 건물일로 폴백 → 같음", () => {
    expect(isMixedAcqDatesSeparate({ acquisitionDate: "2010-03-15", landAcquisitionDate: "" })).toBe(false);
  });
  it("건물일이 비면 별개 취득이 아니다", () => {
    expect(isMixedAcqDatesSeparate({ acquisitionDate: "", landAcquisitionDate: "2005-06-10" })).toBe(false);
  });
});
