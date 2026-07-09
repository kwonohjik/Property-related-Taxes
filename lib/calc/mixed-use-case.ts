/**
 * 겸용주택 Case A 판정 + 4부분 토지 auto 공용 헬퍼.
 *
 * Case A = 보유 중 일부 용도변경(house→commercial) + 최초공시일 < 용도변경일.
 * 취득시·최초공시 시점에 건물 전체가 주택이었다가 양도시 일부 상가로 변경된 케이스로,
 * 토지·건물 기준시가를 주택분/상가분 4부분으로 분리 안분한다(시행령 §166⑥).
 *
 * 판정 로직은 `MixedUseLegacyStdPrice`·오케스트레이터·자산-우선 렌더가 공유(single-source).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** Case A(용도변경 house→commercial + 최초공시<용도변경) 여부. */
export function isMixedUseCaseA(asset: AssetForm): boolean {
  if (!asset.hasPartialUsageChange || asset.partialChangeDirection !== "house_to_commercial") {
    return false;
  }
  if (!asset.phdFirstDisclosureDate || !asset.partialChangeDate) return false;
  const fd = new Date(asset.phdFirstDisclosureDate);
  const uc = new Date(asset.partialChangeDate);
  return !Number.isNaN(fd.getTime()) && !Number.isNaN(uc.getTime()) && fd < uc;
}

/**
 * 자산분 토지기준시가 = floor(공시지가 × 그 자산분 면적).
 * area는 호출부에서 `parseFloat(x.toFixed(2))`로 사전 반올림해 전달(표시=계산 일치).
 * 값이 없으면 null(미표시).
 */
export function landStdForArea(pricePerSqm: number, area: number): number | null {
  return pricePerSqm > 0 && area > 0 ? Math.floor(pricePerSqm * area) : null;
}
