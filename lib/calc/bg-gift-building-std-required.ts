/**
 * 부담부증여 × 건물·일반건물 × 기준시가 평가 — 「증여일 건물 기준시가」(상속·증여용) 필수 술어 (⑤ 필수 표시·⑧·⑫ 공용 · 3중 패턴).
 *
 * 증여가액 C는 「상속세 및 증여세법」 제61조 제1항 제2호 가액이다. 「국세청 건물 기준시가 계산방법 고시」상 상증법 건물 기준시가에는
 * 양도세용(「소득세법」 제99조 제1항 제1호 나목)에 없는 개별건물 특성 조정률이 붙고(제5조 제2항·제11조) 잔가율 표도 따로다(제10조 제2항).
 * 비우면 엔진이 양도세용 값으로 C를 대신했다 — 실측(2026-11-13): 비주거 300㎡는 조정률 0.9라 상증법 값이 약 10% 낮고,
 * 채무 1억 결정세액 3,947,741(대신 계산) vs 3,666,239(상증법 값). 자동 대체값 금지 원칙에 따라 비우면 막는다(사용자 결정).
 *
 * 범위 밖: 주택·공동주택(제4호 — 두 법 모두 고시주택가격)·상업용 일괄고시(제3호)는 두 값이 같다 · 토지는 건물이 없다 ·
 * 시가 평가는 C가 시가다 · 토지만 증여(소유자 분리)는 건물이 증여재산이 아니다(엔진 계약이 이 값을 거부한다).
 * 엔진은 직접 호출 호환을 위해 «미입력 = 양도세용 값»을 그대로 둔다 — 화면·API 경로는 여기서 먼저 막힌다.
 */
const KINDS: ReadonlySet<string> = new Set(["building", "general_building"]);

export function bgGiftBuildingStdRequired(x: {
  kind: string | undefined;
  transferType: string | undefined;
  valuationMode: string | undefined;
  selfOwns: string | undefined;
}): boolean {
  return (
    x.transferType === "burdened_gift" &&
    KINDS.has(x.kind ?? "") &&
    x.valuationMode === "sangjeungbeop_standard" &&
    x.selfOwns !== "land_only"
  );
}

export function bgGiftBuildingStdMissingMessage(kind: string | undefined): string {
  const what = kind === "general_building" ? "증여일 건물 기준시가(건물분)" : "증여일 기준시가(부수토지 포함)";
  return (
    `부담부증여 기준시가 평가 — ${what}를 입력하세요. 증여가액은 「상속세 및 증여세법」 제61조 제1항 제2호 가액이고, ` +
    "상속·증여용 건물 기준시가에는 양도세용에 없는 조정률이 붙어 값이 다를 수 있습니다(「국세청 건물 기준시가 계산방법 고시」 제11조). 칸 옆 계산기로 산정할 수 있습니다."
  );
}
