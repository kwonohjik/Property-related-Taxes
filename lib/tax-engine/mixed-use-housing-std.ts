/**
 * 겸용주택 — **주택분** 기준시가의 토지·건물 분할 (S3-2 · 단일 소스).
 *
 * 개별주택가격(H — 「소득세법」 §99①1호 라목, 부수토지 포함 결합 공시)을 토지분·건물분으로 나눌 때
 * 뺄셈(`H − 가목`)이 아니라 **가목:나목 비례**를 쓴다(양도소득세 집행기준 99-164-9 · 조심2016중0801 ·
 * 기재부 재산세제과-802). 가목 = 개별공시지가 × 주택부수토지 면적, 나목 = 주택 건물 기준시가.
 * 설계: `docs/02-design/features/housing-std-split-proportional-s3-2.engine.design.md`.
 *
 * 두 가지를 한 파일에 둔다.
 *  1. **필수 술어** — 나목(주택건물 기준시가) 입력이 필요한가. 엔진(`transfer-tax-mixed-use-housing.ts`)·
 *     ⑫ Zod(`lib/api/transfer-tax-schema-mixed-use.ts`)·UI 어댑터(④ 전송 · ⑤ 노출 · ⑧ 필수)가
 *     **모두 이 함수를 부른다**. 규칙을 두 곳에 쓰면 UI 통과 ↔ 서버 차단 모순이 생긴다(dual-truth).
 *  2. **분할 함수** — `splitMixedUseHousingStd`. 비례 산식은 S3-1 공용 leaf `apportionByStdPrice`를 쓴다.
 *
 * 순수 함수다(DB·Date 없음). 미입력은 **차단**이고 뺄셈으로 후퇴하지 않는다(자동 안분 fallback 금지).
 */
import { apportionByStdPrice } from "./std-price-apportion";
import { safeMultiplyThenDivide } from "./tax-utils";
import { multiplyByArea } from "./area-utils";
import { isBuildingDayLandPriceRequired } from "./mixed-use-acq-date";
import type {
  MixedUseAssetInput,
  MixedUseDerivedAreas,
  MixedUseHousingStdSplitDetail,
} from "./types/transfer-mixed-use.types";

/** 보유 중 일부 용도변경 방향 (`MixedUseAssetInput.partialUsageChange.direction`와 같은 값). */
export type HousingStdPartialDirection = "house_to_commercial" | "commercial_to_house";

export interface HousingStdNeedInput {
  /** 미공시 주택 §164⑦ 3시점 환산(PHD) 사용 여부 — ON이면 PHD가 자체 3시점 + 비례를 쓴다(요구 안 함). */
  usePhd?: boolean;
  /** 보유 중 용도변경 방향 — 취득측 요구 여부만 가른다. */
  partialDirection?: HousingStdPartialDirection | undefined;
  /**
   * 상속·증여 취득 여부 — **개별주택가격(H) 필수 여부(`isHousingPriceAtAcqRequired`)만** 가른다.
   * 신고가액이 취득가액이라 H 없이도 계산이 성립하는 유일한 경로(Q-B)다. 나목 술어는 이 값을 보지 않는다.
   */
  byInheritanceOrGift?: boolean;
}

/**
 * **양도시** 주택건물 기준시가(나목)가 필수인가.
 *
 * 양도가액·양도비·(상가→주택 용도변경의) 취득시 주택 합계의 토지:건물 분할이 양도시 가목:나목에 의존한다.
 * PHD ON이면 PHD 자체 양도시 분할(`phd.landHousingAtTransfer/buildingHousingAtTransfer`)을 쓰므로 불요.
 */
export function isHousingBuildingStdAtTransferRequired(i: HousingStdNeedInput): boolean {
  return i.usePhd !== true;
}

/**
 * **취득시** 주택건물 기준시가(나목)가 필수인가.
 *
 * 환산·실가·감정·매매사례·상속·증여의 취득가액 분할 + 개산공제 base + 취득시 비용 안분이 의존한다.
 * 상가→주택 용도변경은 취득 시점에 주택이 없어 **양도시 비율을 차용**하므로(집행기준 99-164-10) 불요.
 * 토지·건물 취득일이 다르면(B0) 이 값은 **건물 취득일** 기준 나목이다 — 필수 여부는 같다.
 */
export function isHousingBuildingStdAtAcqRequired(i: HousingStdNeedInput): boolean {
  return i.usePhd !== true && i.partialDirection !== "commercial_to_house";
}

/**
 * **양도시** 개별주택가격(H_T)이 필수인가 — 양도가액·양도비의 토지:건물 분할 분자다.
 * PHD ON이면 PHD 자체 양도시 가격(`preHousingDisclosure.transferHousingPrice`)을 쓰므로 불요.
 * H_T가 없으면 분할할 결합 가격이 없다 — 가목:나목 원값 비율로 대신하지 않고 차단한다(자동 안분 fallback 금지).
 */
export function isHousingPriceAtTransferRequired(i: HousingStdNeedInput): boolean {
  return i.usePhd !== true;
}

/**
 * **취득시** 개별주택가격(H_A)이 필수인가.
 *
 * 필수가 아닌 경우: PHD(자체 3시점) · 상가→주택 용도변경(양도시 비율 차용) · **상속·증여**(신고가액이 취득가액 — Q-B,
 * 이때만 가목:나목 **원값 비율**로 나눈다). 그 밖의 취득(환산·실가·감정·매매사례)은 H가 분할 분자이자 환산 분자라
 * 없으면 차단한다 — 원값 비율로 대신하지 않는다(자동 안분 fallback 금지).
 */
export function isHousingPriceAtAcqRequired(i: HousingStdNeedInput): boolean {
  return i.usePhd !== true && i.partialDirection !== "commercial_to_house" && i.byInheritanceOrGift !== true;
}

export interface SplitMixedUseHousingStdArgs {
  /**
   * 개별주택가격(H). 0·미입력이면 `allowRawRatio`일 때만 가목:나목 **원값 비율**로 나눈다
   * (상속·증여 신고가액만 입력 — Q-B). 그 밖에는 throw — 호출부가 먼저 `isHousingPriceAt*Required`로 거른다.
   */
  housingTotal: number;
  /** H가 없을 때 원값 비율 분할을 허용하는가 — **취득시 상속·증여만** true (Q-B). 기본 false. */
  allowRawRatio?: boolean;
  /** 가목 — 개별공시지가 × 주택부수토지 면적 (같은 취득일이면 그 시점, B0이면 **토지 취득일** 값). */
  landStd: number;
  /** 나목 — 주택건물 기준시가 (B0이면 **건물 취득일** 값). 호출부가 > 0을 보장한다. */
  buildingStd: number;
  /**
   * B0(토지·건물 취득일 상이) 전용 — **건물 취득일** 기준 가목. 있으면 `landStd`는 **토지 취득일** 가목으로 읽고
   * 양도소득세 집행기준 99-164-9의 절차를 따른다(Q-A γ1 — 「최초공시 주택가격」 자리에 건물 취득일 개별주택가격):
   *   취득당시 주택가격 P = floor(H × (가목_토지일 + 나목_건물일) ÷ (가목_건물일 + 나목_건물일))
   *   토지분 = floor(P × 가목_토지일 ÷ (가목_토지일 + 나목_건물일)), 건물분 = P − 토지분(잔액 흡수 · 합 = P).
   * H = 가목_건물일 + 나목_건물일이면 P = 가목_토지일 + 나목_건물일이라 토지분 = 토지일 가목 원값(종전 B0와 1원 동일).
   */
  landStdAtBuildingDay?: number;
}

/**
 * 주택분 기준시가 토지·건물 분할.
 *
 * | 경우 | 토지분(landBasis) | 건물분(buildingBasis) | kind |
 * |---|---|---|---|
 * | H > 0 | `floor(H × 가목 ÷ (가목 + 나목))` | `H − 토지분` (잔액 흡수 · 합 = H) | `proportional` |
 * | H > 0 + B0 | `floor(P × 가목_토지일 ÷ (가목_토지일 + 나목_b))` (P = 취득당시 주택가격 — 집행기준 99-164-9) | `P − 토지분` (합 = P) | `separate_date_converted` |
 * | H 없음 + `allowRawRatio`(Q-B — 취득시 상속·증여) | 가목 **원값** | 나목 **원값** (가목:나목 비율로만 쓰인다) | `raw_ratio` |
 * | H 없음 + `allowRawRatio` 아님 | — throw — | | |
 *
 * `landBasis`·`buildingBasis`가 호출부(`transfer-tax-mixed-use-housing.ts`)의 `acqLandStd`·`acqBuildingStd`·
 * `transferLandStd`·`transferBuildingStd`가 된다 — 어느 경우에도 「그 파트의 기준시가 값」 한 의미다.
 */
export function splitMixedUseHousingStd(args: SplitMixedUseHousingStdArgs): MixedUseHousingStdSplitDetail {
  const { housingTotal, landStd, buildingStd, landStdAtBuildingDay, allowRawRatio } = args;
  if (!(housingTotal > 0)) {
    if (allowRawRatio !== true) {
      throw new Error("겸용주택: 개별주택가격이 없으면 가목:나목 비율로 대신 나눌 수 없습니다(상속·증여 신고가액 취득만 예외).");
    }
    return { housingTotal: 0, landStd, buildingStd, landBasis: landStd, buildingBasis: buildingStd, kind: "raw_ratio" };
  }
  if (landStdAtBuildingDay !== undefined) {
    // 집행기준 99-164-9: 토지·건물 취득 당시 기준시가의 합을 같은 시점(여기서는 건물 취득일) 공시의
    // 토지·건물 기준시가 합으로 나눈 비율을 주택가격에 곱해 「취득당시 주택가격」을 구하고, 그것을
    // 자산별 취득당시 기준시가(토지일 가목 : 건물일 나목)로 안분한다. 토지분도 원값이 아니라 비례 몫이다.
    const convertedTotal = Math.floor(
      safeMultiplyThenDivide(housingTotal, landStd + buildingStd, landStdAtBuildingDay + buildingStd),
    );
    const c = apportionByStdPrice(convertedTotal, landStd, buildingStd);
    return {
      housingTotal,
      landStd: landStdAtBuildingDay,
      buildingStd,
      landStdAtLandAcq: landStd,
      convertedHousingTotal: convertedTotal,
      landBasis: c.land,
      buildingBasis: c.building,
      kind: "separate_date_converted",
    };
  }
  const p = apportionByStdPrice(housingTotal, landStd, buildingStd);
  return { housingTotal, landStd, buildingStd, landBasis: p.land, buildingBasis: p.building, kind: "proportional" };
}

/**
 * 주택분 §97 환산취득가액의 **분자**(취득당시 기준시가).
 *
 * 토지·건물 취득일이 다르면(B0) 분자는 건물 취득일 개별주택가격 H가 아니라 그것을 토지 취득일로 옮긴
 * **취득당시 주택가격 P**다 — 집행기준 99-164-9에서 비례로 구한 「취득당시 주택가격」(사례 60백만)이 곧
 * 환산의 취득당시 기준시가이고, 토지분·건물분 분할(`splitMixedUseHousingStd`)의 합도 P다. 분자만 H로 두면
 * 한 계산 안에서 취득당시 기준시가가 둘(H·P)이 된다.
 *
 * B0이 아니면(같은 취득일·PHD·상가→주택·H 없음) H 그대로. B0인데 건물일 공시지가·나목이 없으면 H를 돌려주고
 * 차단은 `calcHousingGainSplit`이 한다(같은 술어 `isBuildingDayLandPriceRequired` — 여기서 대체값을 만들지 않는다).
 */
export function acqHousingStdNumerator(asset: MixedUseAssetInput, acqDerived: MixedUseDerivedAreas): number {
  const sp = asset.acquisitionStandardPrice;
  const housingTotal = sp.housingPrice ?? 0;
  const required = isBuildingDayLandPriceRequired({
    landDate: asset.landAcquisitionDate,
    buildingDate: asset.buildingAcquisitionDate,
    usePhd: asset.usePreHousingDisclosure,
    partialDirection: asset.partialUsageChange?.direction,
    housingPrice: housingTotal,
  });
  const perSqmAtBuildingAcq = sp.landPricePerSqmAtBuildingAcq;
  const buildingStd = sp.housingBuildingPrice;
  if (!required || !(perSqmAtBuildingAcq !== undefined && perSqmAtBuildingAcq > 0) || !(buildingStd !== undefined && buildingStd > 0)) {
    return housingTotal;
  }
  const area = acqDerived.residentialLandArea;
  return splitMixedUseHousingStd({
    housingTotal,
    landStd: multiplyByArea(sp.landPricePerSqm, area),
    buildingStd,
    landStdAtBuildingDay: multiplyByArea(perSqmAtBuildingAcq, area),
  }).convertedHousingTotal as number;
}
