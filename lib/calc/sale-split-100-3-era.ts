/**
 * 「소득세법」 제100조 제3항(구분 기장 가액 30% 이상 차이 → 불분명 의제)의 **양도일 연혁** — 클라이언트(validate·API 변환·UI) 쪽 술어.
 *
 * 엔진과 **같은 leaf**(`sec100_3Era`)에서 파생한다. 이 파일은 그 위에 «화면이 묻는 질문» 몇 개를 이름 붙여 둘 뿐이며,
 * 구간 경계를 다시 쓰지 않는다(경계는 `lib/tax-engine/data/sec100-3-split-era.ts` 한 곳).
 *
 * 계획서: `docs/00-pm/sale-split-100-3-era-gate.plan.md` §4.2 · §5.1
 */
import { sec100_3Era, type Sec100_3Era } from "@/lib/tax-engine/data/sec100-3-split-era";

/** 양도일(`YYYY-MM-DD`)로 본 §100③ 적용 구간. 양도일이 비면 `body`(엔진과 동일). */
export function saleSplitEra(transferDate: string | undefined): Sec100_3Era {
  return sec100_3Era(transferDate);
}

/**
 * 영 §166⑧ 예외(단서)가 **효력을 갖는** 양도일인가 — 2025.1.1. 이후만(법률 제20615호 부칙 제9조).
 * 그 전에는 예외 입력 칸을 숨기고, 근거 필수 검증·API 전송도 하지 않는다. 저장된 값은 지우지 않는다(엔진도 era로 무시한다).
 */
export function saleSplitProvisoApplies(transferDate: string | undefined): boolean {
  return sec100_3Era(transferDate) === "body_and_proviso";
}

/**
 * 양도시 토지·건물 기준시가 **필수 입력을 푸는가** (계획서 Q-2).
 *
 * 양도일이 2016.1.1. 전(`none`)이면 30% 판정이 없어 이 값이 판정에는 쓰이지 않는다. 그러나 기준시가는 다른 계산에도 쓰이므로
 * **세 조건이 모두 맞을 때만** 푼다:
 *  1. 양도일 `none`
 *  2. 구분 기재(`saleSplitMode === "actual"`) — 안분 방식(`appraisal`·`apportioned`)에서는 이 값이 양도가액 구분의 **기준**이다
 *  3. 어느 파트도 환산 취득(`estimated`)이 아님 — 환산취득가액의 **분모**다(엔진이 환산 파트 누락 시 차단한다)
 */
export function saleStdPriceWaivedByEra(ctx: {
  transferDate: string | undefined;
  saleSplitMode: string | undefined;
  landMode: string;
  buildingMode: string;
}): boolean {
  return (
    sec100_3Era(ctx.transferDate) === "none" &&
    ctx.saleSplitMode === "actual" &&
    ctx.landMode !== "estimated" &&
    ctx.buildingMode !== "estimated"
  );
}
