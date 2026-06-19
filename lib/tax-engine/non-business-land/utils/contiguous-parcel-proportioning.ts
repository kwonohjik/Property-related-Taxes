/**
 * §168의11⑤ 연접 다필지 취득시기순 안분
 *
 * 연접하여 있는 다수 필지가 하나의 용도로 일괄 사용되고 그 총면적이 기준면적을 초과하는 경우,
 * 초과분(E = 총면적 T − 기준면적 S)을 취득시기가 늦은 필지부터 순차 귀속(비사업용)한다.
 *  - 1호(건축물 없는 경우): 후보 = 전체 필지 면적
 *  - 2호(건축물 있는 경우): 후보 = max(0, 면적 − 건축물 바닥면적). 바닥면적분은 사업용 유지(귀속 후보 제외)
 *  - 가목: 취득시기 늦은 토지부터 / 나목: 취득시기 동일 시 거주자 선택(미지정 = 입력순 = 중립)
 *
 * 초과분 E가 후보 합계를 초과하면 후보 합계로 클램프(바닥면적분은 비사업용 귀속 불가) + 경고.
 * 면적 비율(nonBusinessRatio = 귀속면적 ÷ 총면적)을 반환해 기존 면적안분 중과 경로에 연결.
 */
import type { NblParcel, ContiguousParcelNbl } from "../types";

export interface ContiguousNblResult {
  /** 총면적 T = Σ 필지면적 */
  totalArea: number;
  /** 기준면적 S */
  standardArea: number;
  /** 초과분 E = max(0, T − S) */
  excessArea: number;
  /** 귀속 후보 합계 Σ candidateArea (2호 바닥면적 제외 합) */
  candidateTotal: number;
  /** 실제 비사업용 귀속 면적 = min(E, candidateTotal) */
  nonBusinessArea: number;
  /** 비사업용 면적 비율 = nonBusinessArea ÷ T (소수 4자리) */
  nonBusinessRatio: number;
  /** 필지별 귀속 상세 (입력 순서 유지) */
  detail: ContiguousParcelNbl[];
  /** E > candidateTotal 경계로 클램프 발생 여부 */
  clampWarning: boolean;
  /** 건축물 존재 필지 유무 — true면 ⑤2호 적용 */
  hasBuilding: boolean;
}

export function computeContiguousParcelNblAttribution(
  parcels: NblParcel[],
  standardArea: number,
): ContiguousNblResult {
  const totalArea = parcels.reduce((sum, p) => sum + p.landArea, 0);
  const excessArea = Math.max(0, totalArea - standardArea);
  const hasBuilding = parcels.some((p) => p.hasBuilding);

  // 필지별 귀속 후보 면적: 2호(건축물)면 바닥면적 제외, 1호면 전체.
  const candidate = parcels.map((p) => {
    const cand = p.hasBuilding ? Math.max(0, p.landArea - (p.buildingFootprintArea ?? 0)) : p.landArea;
    return { p, candidateArea: cand };
  });
  const candidateTotal = candidate.reduce((sum, c) => sum + c.candidateArea, 0);

  // 초과분은 후보 합계로 클램프(바닥면적분은 사업용 유지 → 비사업용 귀속 불가).
  const nonBusinessArea = Math.min(excessArea, candidateTotal);
  const clampWarning = excessArea > candidateTotal;

  // 취득시기 늦은 필지부터 귀속(가목). 동일 시 입력순 유지(나목 거주자 선택 fallback = 중립).
  const order = candidate
    .map((c, idx) => ({ ...c, idx }))
    .sort((a, b) => {
      const diff = b.p.acquisitionDate.getTime() - a.p.acquisitionDate.getTime();
      return diff !== 0 ? diff : a.idx - b.idx;
    });

  const attributed = new Map<string, number>();
  let remaining = nonBusinessArea;
  for (const c of order) {
    const take = Math.min(remaining, c.candidateArea);
    attributed.set(c.p.id, take);
    remaining -= take;
    if (remaining <= 0) break;
  }

  const detail: ContiguousParcelNbl[] = candidate.map((c) => ({
    id: c.p.id,
    landArea: c.p.landArea,
    acquisitionDate: c.p.acquisitionDate,
    candidateArea: c.candidateArea,
    nonBusinessArea: attributed.get(c.p.id) ?? 0,
  }));

  const nonBusinessRatio = totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;

  return {
    totalArea,
    standardArea,
    excessArea,
    candidateTotal,
    nonBusinessArea,
    nonBusinessRatio,
    detail,
    clampWarning,
    hasBuilding,
  };
}
