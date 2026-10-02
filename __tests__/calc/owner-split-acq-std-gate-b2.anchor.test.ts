/**
 * 별건 B2 — 소유자 분리(동시 취득) + 매매 + 실거래가: 취득시 기준시가 3종은 **비율이 쓰일 때만** 요구한다
 *
 * ⑧ V8(`validateSplitDirectInputs`)은 ㎡당 개별공시지가·면적·총액을 **무조건** 요구했다. 그런데
 *   · ⑫(`refineSplitAcquisitionInputs`)는 `requiresAcqStdPrice`(엔진 소비 지점 1:1 술어)로 좁혀 요구하고,
 *   · 화면(`CompanionAcqPurchaseBlock`)의 취득시 기준시가 카드도 같은 술어로 열린다.
 * 본인 파트 취득가액을 직접 입력하면 술어가 거짓이라 카드가 닫히는데 V8만 요구 → 칸 없는 영구 차단(⑧ 과잉).
 * 비율이 쓰이는 쪽(두 파트 비움)은 주택에서 ㎡당 칸이 화면에 없었다(`StandardPriceInput`은 주택에 총액 칸만) → 칸을 연다.
 *
 * ⇒ 요구를 뺄지 칸을 열지는 **엔진이 그 값을 쓰는가**로 가른다: 쓰이는 쪽(비율 안분)은 칸을 열고(E2E가 고정),
 *   쓰이지 않는 쪽(본인 파트 취득가액 입력)은 ⑧을 ⑫·술어와 맞춘다(여기서 엔진 소비 증거와 함께 고정).
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const asset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    hasSeperateLandAcquisitionDate: true, // 소유자 분리 토글이 강제로 켠다(`CompanionAcquisitionCauseSection` onSelfOwnsChange)
    landAcquisitionDate: "",
    selfOwns: "land_only",
    useEstimatedAcquisition: false,
    saleSplitMode: "apportioned",
    ...over,
  }) as never;
const OWNER_MSG = /토지·건물 소유자가 다르면 본인 소유분만 과세하므로/;
const v8 = (over: Record<string, unknown>) => validateSplitDirectInputs(asset(over), "자산 1");

describe("⑧ V8 — 비율이 쓰이는가로 좁힌다 (⑫와 같은 술어)", () => {
  it("🔑 본인 파트(토지) 취득가액을 입력 → 기준시가 3종을 요구하지 않는다", () => {
    expect(v8({ landAcquisitionPrice: "200000000" })).not.toMatch(OWNER_MSG);
  });
  it("🔑 토지 파트 감정가액·실가 모두 — 환산이 아닌 파트 실가면 같다", () => {
    expect(v8({ landAcquisitionPrice: "200000000", landAcqMode: "actual", buildingAcqMode: "actual" })).not.toMatch(OWNER_MSG);
  });
  it("긍정 짝: 두 파트를 모두 비우면 요구한다 (비율 안분이 유일한 도출 수단)", () => {
    expect(v8({})).toMatch(OWNER_MSG);
  });
  it("긍정 짝: 환산이면 요구한다 (환산 분자)", () => {
    expect(v8({ useEstimatedAcquisition: true })).toMatch(OWNER_MSG);
  });
  it("긍정 짝: 요구하는 쪽에서 3종을 채우면 통과", () => {
    expect(
      v8({ standardPricePerSqmAtAcq: "2000000", acquisitionArea: "100", standardPriceAtAcq: "500000000" }),
    ).not.toMatch(OWNER_MSG);
  });
});

describe("엔진 소비 증거 — 본인 파트 취득가액이 있으면 기준시가 없이도 분리 계산이 성립한다", () => {
  const split = (over: Record<string, unknown>) =>
    calcSplitGain(
      baseTransferInput({
        propertyType: "housing",
        transferDate: new Date("2024-03-01"),
        transferPrice: 900_000_000,
        acquisitionDate: new Date("2015-03-01"),
        landAcquisitionDate: new Date("2015-03-01"),
        acquisitionPrice: 0,
        selfOwns: "land_only",
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        saleSplitMode: "apportioned",
        // 양도가액 안분 근거는 **양도시** 기준시가(§166⑥→부가세령 §64①1호) — 취득시 기준시가와 별개 축이다
        landStandardPriceAtTransfer: 600_000_000,
        buildingStandardPriceAtTransfer: 300_000_000,
        ...over,
      } as never),
    );
  it("🔑 토지 파트 취득가액 입력 — 기준시가 없이 계산된다 (null=분리 포기가 아니다)", () => {
    expect(split({ landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000 })).not.toBeNull();
  });
  it("긍정 짝: 두 파트가 모두 비면 비율이 필요하다 — 기준시가가 없으면 분리 계산을 포기(null)한다", () => {
    expect(split({})).toBeNull();
  });
});
