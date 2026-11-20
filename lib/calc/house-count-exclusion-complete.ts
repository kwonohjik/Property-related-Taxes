/**
 * 명부 행 조특법 주택 수 제외(`HouseEntry.countExclusion`) 판별 유니온의 **정규화 leaf** (2026-11 리뷰 D-18 · 결정 Q-9 ④).
 *
 * 화면 select는 종류를 고르는 순간 하위 payload(`reduction`·`special`)를 기본값과 함께 만든다. AI 추출·바로 답하기·옛 저장 상태는
 * `kind`만 쓴 행을 만들 수 있었고, 그 행이 route 500(`rowCountExclusionReductions`)·행 편집 크래시(「reading 'article'」)·
 * 사이드바 ⑧ throw로 판정 화면 전체를 죽였다. 기본값은 화면 select와 같은 소스다.
 *
 * - special: payload가 없거나 일부만 있으면 화면 기본값으로 채운다.
 * - reduction: 하위 판별 칸(`reduction.type`)이 없으면 어떤 감면인지 알 수 없어 **뺀다**(선언 없음) — 화면에서 다시 고르게 한다.
 * - kind가 없으면 payload(`reduction`·`special`)로 정한다. 그 밖(모르는 kind)은 뺀다.
 */
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { HouseCountExclusionRowFact, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";

const ROW_REDUCTION_TYPES = new Set(["new_99_4_rural", "new_99_4_hometown", "unsold_98_9"]);

/** 화면 select와 같은 기본값(`HouseEntryCountExclusionSection`). */
export function defaultSpecialCountExclusion(): SpecialHouseExclusionFormItem {
  return { article: "", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false } as SpecialHouseExclusionFormItem;
}

export function completeCountExclusion(raw: unknown): HouseCountExclusionRowFact | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const x = raw as { kind?: unknown; special?: unknown; reduction?: unknown };
  // kind가 없으면 payload로 정한다 — 추출은 `reduction.type`만 줄 수 있고, 화면(`choiceOf`)은 그 상태를 선택된 것으로 보였는데
  //   ⑧·④는 kind가 없어 무시했다(화면 ↔ 판정 불일치).
  const kind = x.kind ?? (x.reduction ? "reduction" : x.special ? "special" : undefined);
  if (kind === "special") {
    const special = x.special && typeof x.special === "object" ? x.special : {};
    return { kind: "special", special: { ...defaultSpecialCountExclusion(), ...(special as object) } as SpecialHouseExclusionFormItem };
  }
  if (kind === "reduction") {
    const r = x.reduction as { type?: unknown } | undefined;
    if (!r || typeof r.type !== "string" || !ROW_REDUCTION_TYPES.has(r.type)) return undefined;
    return {
      kind: "reduction",
      reduction: { ...getReductionDefault(r.type as RowCountExclusionReduction["type"]), ...(r as object) } as RowCountExclusionReduction,
    };
  }
  return undefined;
}

/** 명부 전체에 적용 — 바뀐 행만 새 객체. */
export function withCompleteCountExclusions<H extends { countExclusion?: HouseCountExclusionRowFact }>(houses: H[] | undefined): H[] {
  return (houses ?? []).map((h) => {
    if (h.countExclusion === undefined) return h;
    const c = completeCountExclusion(h.countExclusion);
    return c === h.countExclusion ? h : { ...h, countExclusion: c };
  });
}
