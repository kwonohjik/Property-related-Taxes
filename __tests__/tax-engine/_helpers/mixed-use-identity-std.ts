/**
 * S3-2 테스트 보충 — **항등 나목** 채우기 (겸용주택 주택분 가목:나목 비례 전환).
 *
 * 겸용 주택분 기준시가의 토지·건물 분할이 뺄셈(`H − 가목`)에서 가목:나목 비례로 바뀌면서
 * 주택건물 기준시가(나목, `housingBuildingPrice`)가 엔진·⑫의 필수 입력이 됐다. 이 모듈은 **나목이 없는
 * 기존 fixture**에 `N = H − 가목`(항등 — 이때 비례 = 뺄셈)을 채워 **기대값을 바꾸지 않고** 통과시킨다.
 * 설계: `docs/02-design/features/housing-std-split-proportional-s3-2.engine.design.md` §5.
 *
 * 항등이 성립하지 않는 곳(= 값 갱신 대상)은 이 모듈이 숨기지 않고 **FILL = 1**(H < 가목이라 N ≤ 0이거나
 * H 자체가 없음)로 둔다 — 그 테스트는 개별로 현실적 나목을 정해 기대값을 갱신한다.
 *
 * ⚠️ 이 모듈은 「이미 나목을 가진 입력」은 건드리지 않는다. 나목 동작 자체를 검증하는 테스트
 *    (`…s3-2.*.anchor.test.ts`)는 이 모듈을 쓰지 않고 실제 엔진을 직접 호출한다.
 */
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { computeAcqDerivedAreas } from "@/lib/tax-engine/transfer-tax-mixed-use-helpers";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { isBuildingDayLandPriceRequired } from "@/lib/tax-engine/mixed-use-acq-date";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
} from "@/lib/tax-engine/mixed-use-housing-std";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

type Std = { housingPrice?: number; landPricePerSqm: number; housingBuildingPrice?: number; landPricePerSqmAtBuildingAcq?: number };

/** 겸용 자산(엔진 입력 또는 route body의 `mixedUse`)에 항등 나목을 채운 **새 객체**를 돌려준다. */
export interface IdentityStdOverride {
  /** 취득시 나목 — **항등이 성립하지 않는 fixture**(H < 가목 × 면적이라 N = H − 가목 ≤ 0)가 현실적 값을 지정한다. */
  acqN?: number;
  /** 양도시 나목 — 위와 같다. */
  transferN?: number;
  /**
   * 취득시 개별주택가격(H_A)이 없을 때 항등 H로 채우는가(기본 true — 엔진 직접 호출용).
   * route body shim은 false — H 부재는 ⑫가 400으로 막는 **검증 대상**이라 shim이 가리면 안 된다.
   */
  fillHousingPrice?: boolean;
}

export function withIdentityHousingBuildingStd<T extends object>(asset: T, over?: IdentityStdOverride): T {
  const a = asset as unknown as MixedUseAssetInput & {
    transferStandardPrice: Std;
    acquisitionStandardPrice: Std;
  };
  const derived = computeDerivedAreas(a);
  const acqDerived = computeAcqDerivedAreas(a, derived);
  // 엔진은 PHD **환산 결과**가 있을 때만 PHD 분기를 탄다(토글 + `preHousingDisclosure` 객체 — helpers `calcHousingEstimatedAcq`).
  // 토글만 켠 엔진 직접 입력(⑫는 400으로 막는다)은 일반 §97 흐름이라 나목이 필요하다.
  const phdArg = {
    usePhd: a.usePreHousingDisclosure === true && !!a.preHousingDisclosure,
    partialDirection: a.partialUsageChange?.direction,
  };

  const t = { ...a.transferStandardPrice };
  if (isHousingBuildingStdAtTransferRequired(phdArg) && !((t.housingBuildingPrice ?? 0) > 0)) {
    const landT = multiplyByArea(t.landPricePerSqm, derived.residentialLandArea);
    const n = (t.housingPrice ?? 0) - landT;
    t.housingBuildingPrice = over?.transferN ?? (n > 0 ? n : 1);
  }

  const q = { ...a.acquisitionStandardPrice };
  if (isHousingBuildingStdAtAcqRequired(phdArg) && !((q.housingBuildingPrice ?? 0) > 0)) {
    const H = q.housingPrice ?? 0;
    const buildingDay = isBuildingDayLandPriceRequired({
      landDate: a.landAcquisitionDate,
      buildingDate: a.buildingAcquisitionDate,
      usePhd: a.usePreHousingDisclosure,
      partialDirection: a.partialUsageChange?.direction,
      housingPrice: H,
    });
    // B0이면 항등의 가목은 **건물 취득일** 값(비례 분모), 아니면 취득시 가목.
    const perSqm = buildingDay && q.landPricePerSqmAtBuildingAcq ? q.landPricePerSqmAtBuildingAcq : q.landPricePerSqm;
    const landA = multiplyByArea(perSqm, acqDerived.residentialLandArea);
    const n = H - landA;
    q.housingBuildingPrice = over?.acqN ?? (H > 0 && n > 0 ? n : 1);
  }
  // 취득시 개별주택가격(H_A) — 상속·증여 외에는 필수(없으면 엔진 throw). H가 없는 fixture는 항등 H = 가목 + 나목으로 채운다.
  if (
    over?.fillHousingPrice !== false &&
    isHousingPriceAtAcqRequired({ ...phdArg, byInheritanceOrGift: a.acquisitionByInheritance === true || a.acquisitionByGift === true }) &&
    !((q.housingPrice ?? 0) > 0)
  ) {
    const buildingDay = isBuildingDayLandPriceRequired({
      landDate: a.landAcquisitionDate,
      buildingDate: a.buildingAcquisitionDate,
      usePhd: a.usePreHousingDisclosure,
      partialDirection: a.partialUsageChange?.direction,
      housingPrice: 1,
    });
    // H가 생기면 토지·건물 취득일이 다른 fixture는 B0(건물 취득일 가목 필수)로 들어선다 — 가목은 토지 취득일 값과 같게 둔다(항등).
    if (buildingDay && !((q.landPricePerSqmAtBuildingAcq ?? 0) > 0)) q.landPricePerSqmAtBuildingAcq = q.landPricePerSqm;
    const perSqm = buildingDay && q.landPricePerSqmAtBuildingAcq ? q.landPricePerSqmAtBuildingAcq : q.landPricePerSqm;
    q.housingPrice = multiplyByArea(perSqm, acqDerived.residentialLandArea) + (q.housingBuildingPrice ?? 1);
  }
  return { ...asset, transferStandardPrice: t, acquisitionStandardPrice: q } as T;
}

/** `calcMixedUseTransferTax` — 나목이 없으면 항등 나목을 채워 호출한다. */
export function calcMixedUseTransferTaxIdN(
  transferPrice: number,
  transferDate: Date,
  asset: MixedUseAssetInput,
  ...rest: [Parameters<typeof calcMixedUseTransferTax>[3], Parameters<typeof calcMixedUseTransferTax>[4]?]
): ReturnType<typeof calcMixedUseTransferTax> {
  return calcMixedUseTransferTax(transferPrice, transferDate, withIdentityHousingBuildingStd(asset), ...rest);
}

/**
 * route body(단건 `mixedUse` + `companionAssets[].mixedUse`)에 항등 나목을 채운 **새 객체**.
 * ⚠️ **raw body 테스트 전용 shim**이다 — body를 손으로 적어 ④를 거치지 않는 route 테스트(엔진·⑫ 계약이 주제)용.
 *    ④(`callTransferTaxAPI`)는 이미 폼의 나목 필드(`mixedAcqHousingBuildingStdPrice`·`mixedTransferHousingBuildingStdPrice`)를 싣는다 —
 *    폼을 거치는 테스트는 이 shim이 아니라 `mixed-use-identity-std-form.ts`로 폼 필드에 값을 넣는다.
 */
export function withIdentityStdInBody<T>(payload: T, over?: IdentityStdOverride): T {
  over = { ...over, fillHousingPrice: false };
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p };
  const mu = p.mixedUse as Record<string, unknown> | undefined;
  if (mu && mu.transferStandardPrice && mu.acquisitionStandardPrice) {
    out.mixedUse = withIdentityHousingBuildingStd(mu, over);
  }
  const companions = p.companionAssets;
  if (Array.isArray(companions)) {
    out.companionAssets = companions.map((c) => {
      const cm = (c as Record<string, unknown>)?.mixedUse as Record<string, unknown> | undefined;
      return cm && cm.transferStandardPrice && cm.acquisitionStandardPrice
        ? { ...(c as object), mixedUse: withIdentityHousingBuildingStd(cm, over) }
        : c;
    });
  }
  return out as T;
}
