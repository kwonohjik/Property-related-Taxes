/**
 * S3-2 — 겸용 E2E 시드의 **주택건물 기준시가(나목)** 항등 값.
 *
 * 겸용 주택분 기준시가의 토지·건물 분할이 뺄셈(`H − 가목`)에서 가목:나목 비례로 바뀌어, 비-PHD 겸용 시드는 두 나목 칸
 * (`mixedAcqHousingBuildingStdPrice`·`mixedTransferHousingBuildingStdPrice`)이 필수다. 이 헬퍼는 **N = H − 가목**(항등 —
 * 이때 비례 = 뺄셈이라 종전 기대 수치가 보존된다)을 시드 문자열로 채운다. 이미 값이 있는 칸은 건드리지 않는다.
 *
 * 앱 컴포넌트를 import하지 않는다(순수 leaf `computeDerivedAreas`·`multiplyByArea`만) — Playwright가 React 모듈 그래프를 끌어오지 않게.
 * 값은 시드용 **근사 없는 정수**다. 항등이 안 되는 시드(H < 가목)는 `over`로 현실적 값을 지정한다.
 */
import { computeDerivedAreas } from "../../lib/tax-engine/mixed-use-derived-areas";
import { multiplyByArea } from "../../lib/tax-engine/area-utils";

type Seed = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function withMixedHousingStd(asset: Seed, over: { acqN?: number; transferN?: number } = {}): Seed {
  const derived = computeDerivedAreas({
    residentialFloorArea: num(asset.residentialFloorArea),
    nonResidentialFloorArea: num(asset.nonResidentialFloorArea),
    buildingFootprintArea: num(asset.buildingFootprintArea),
    totalLandArea: num(asset.mixedUseTotalLandArea),
  });
  const landT = num(asset.mixedTransferLandPricePerSqm) || num(asset.phdLandPricePerSqmAtTransfer);
  const nT = num(asset.mixedTransferHousingPrice) - multiplyByArea(landT, derived.residentialLandArea);
  // 토지·건물 취득일이 다르면 항등의 가목은 건물 취득일 값(B0)이다
  const separate = !!asset.landAcquisitionDate && asset.landAcquisitionDate !== asset.acquisitionDate;
  const landA = (separate ? num(asset.mixedAcqLandPricePerSqmAtBuildingAcq) : 0) || num(asset.mixedAcqLandPricePerSqm) || num(asset.phdLandPricePerSqmAtAcq);
  const nA = num(asset.mixedAcqHousingPrice) - multiplyByArea(landA, derived.residentialLandArea);
  return {
    ...asset,
    ...(asset.mixedAcqHousingBuildingStdPrice ? {} : { mixedAcqHousingBuildingStdPrice: String(over.acqN ?? (nA > 0 ? nA : 1)) }),
    ...(asset.mixedTransferHousingBuildingStdPrice ? {} : { mixedTransferHousingBuildingStdPrice: String(over.transferN ?? (nT > 0 ? nT : 1)) }),
  };
}
