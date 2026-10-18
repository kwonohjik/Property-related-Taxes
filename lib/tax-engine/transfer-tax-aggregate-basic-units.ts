/**
 * 다건 §103② 기본공제 **배분 단위** — 토지·건물 분리취득(split) 자산은 파트로 펼친다(F-B).
 *
 * 같은 날 양도한 자산 사이의 순서는 재일46014-1685 「납세자에게 유리하다고 판단되는 양도자산의 양도소득금액에서부터」로
 * 정하고, 무엇이 유리한지는 신고 전체 세액으로 후보를 평가한다(`pickFavorableTieRank`). split 자산을 **한 덩어리**로
 * 두면 그 후보가 「자산 순열」뿐이라, 분리 신고(토지 자산 + 건물 자산)가 고르는 「토지 파트 → 다른 자산 → 건물 파트」를
 * 고를 수 없다. 파트는 §104⑤ 후단이 「별개의 자산」으로 보는 합산 단위이고 양도일이 같으므로, 배분 후보에도 파트로 넣는다.
 *
 * 실측(계획서 `docs/02-design/features/transfer-split-basic-deduction-units-and-order-rounding.plan.md` §1·§3·§4):
 *   · 3건 신고 4/3,584셀 · §77 감면 + 이익 + 차손 62/2,688셀이 분리 신고와 같아진다(전부 하락).
 *   · 분리 신고·단건·§133 격자는 0셀 변동.
 *
 * 펼치는 자산: split 세액이 파트를 만드는 자산(`splitPartBasicUnits`)이고, 감면이 없거나 §77 감면 파트가 확정된 자산(5B
 * `partWise` — 감면소득은 그 파트 몫). 두 파트 모두 감면대상이면 감면소득을 파트에 나눌 근거가 없어 펼치지 않는다(Q-①b).
 * §155⑳ 특례 자산은 split 파트 모델을 쓰지 않으므로 펼치지 않는다.
 */
import { parseRatesFromMap } from "./transfer-tax";
import { aggregateSplitContextOf } from "./transfer-tax-aggregate-group-tax";
import { splitPartBasicUnits } from "./transfer-tax-split-part-seeds";
import type { AssetRecord, BasicDeductionEligible } from "./transfer-tax-aggregate-helpers";

export interface BasicDeductionUnits {
  /** 배분 행 — 자산 행은 자산 인덱스, 파트 행은 `records.length` 이상의 인덱스다. */
  eligible: BasicDeductionEligible[];
  /** 파트 행 인덱스 → 자산 · 파트 번호(`splitPartBasicUnits` 순서) · 파트 수. 자산 행은 없다. */
  partOf: Map<number, { asset: number; part: number; parts: number }>;
}

export function expandSplitBasicUnits(records: AssetRecord[], eligible: BasicDeductionEligible[]): BasicDeductionUnits {
  const partOf = new Map<number, { asset: number; part: number; parts: number }>();
  let next = records.length;
  const rows = eligible.flatMap((e): BasicDeductionEligible[] => {
    const r = records[e.idx];
    if (!r.result.splitDetail || r.result.rentalHousingExceptionDetail?.applied === true) return [e];
    const partWise =
      r.result.reductionTypeApplied === "public_expropriation" ? r.result.publicExpropriationDetail?.partWise : undefined;
    // 감면이 있으면 §77 감면 파트가 확정된 자산만 — 소득공제형(§99의3 등)은 세액 단계의 소득이 감면 전후 둘이라 펼치지 않는다.
    if ((r.result.reductionTypeApplied || (e.reducibleIncome ?? 0) > 0) && !partWise) return [e];
    const units = splitPartBasicUnits(aggregateSplitContextOf(r, e.income, 0, parseRatesFromMap(r.rates)));
    if (!units) return [e];
    const reducedKinds = partWise ? (partWise.eligiblePart === "land" ? ["land", "non_business_land"] : ["building"]) : [];
    // 감면소득(B)은 자산 하나의 값이다 — 감면 파트가 둘 이상으로 갈리면 나눌 근거가 없다.
    if (units.filter((u) => reducedKinds.includes(u.kind)).length > 1) return [e];
    return units.flatMap((u, part) => {
      const idx = next++;
      partOf.set(idx, { asset: e.idx, part, parts: units.length });
      if (u.income <= 0) return [];
      const reduced = reducedKinds.includes(u.kind);
      return [
        {
          ...e,
          idx,
          income: u.income,
          rate: u.rate,
          reducibleIncome: reduced ? e.reducibleIncome : 0,
          reducibleBuckets: reduced ? e.reducibleBuckets : [],
        },
      ];
    });
  });
  return { eligible: rows, partOf };
}

/** 행 단위 배분 → 자산별 배분(표시·감면 C) + split 자산의 파트별 배분(세액 — `partBasicDeduction`). */
export function foldBasicUnitAllocation(
  records: AssetRecord[],
  units: BasicDeductionUnits,
  allocation: { idx: number; amount: number }[],
): { allocatedBasic: number[]; partBasic: (number[] | undefined)[] } {
  const allocatedBasic = records.map(() => 0);
  const partBasic: (number[] | undefined)[] = records.map(() => undefined);
  for (const p of units.partOf.values()) partBasic[p.asset] ??= new Array<number>(p.parts).fill(0);
  for (const a of allocation) {
    const p = units.partOf.get(a.idx);
    if (!p) {
      allocatedBasic[a.idx] = a.amount;
      continue;
    }
    allocatedBasic[p.asset] += a.amount;
    partBasic[p.asset]![p.part] = a.amount;
  }
  return { allocatedBasic, partBasic };
}

/** 세액이 같은 후보 사이의 순서(propertyId 사전순)에 쓰는 행 식별자 — 파트 행은 `propertyId#파트번호`. */
export function unitIdOf(records: AssetRecord[], units: BasicDeductionUnits, idx: number): string {
  const p = units.partOf.get(idx);
  return p ? `${records[p.asset].item.propertyId}#${p.part}` : records[idx].item.propertyId;
}

/** 행이 속한 자산 인덱스. */
export const unitAssetOf = (units: BasicDeductionUnits, idx: number): number => units.partOf.get(idx)?.asset ?? idx;
