/**
 * E3-③ A — 주택 구간(`buildingKind = "house"`)의 «배율 판정» 표시 문구 — ⑤ 입력 미리보기·철거 행 허용 면적 미리보기·⑦ 결과 구간표가 **같은 함수**를 읽는다
 * (입력 화면에서 본 숫자 = 결과에서 판정한 숫자). 입력은 엔진 leaf의 echo(`houseOutcome`·`houseCheck`)뿐이다 — 허용 면적·배율을 여기서 다시 계산하지 않는다.
 *
 * 숫자 옆에 변수명 라벨을 붙이고(정착면적·허용 면적·토지 면적), 약어·`floor()`를 쓰지 않는다. 문구는 판정 결과만 말하고 법 근거는 엔진 고지 상수가 맡는다.
 */
import type { HouseCheck, HouseOutcome } from "@/lib/tax-engine/non-business-land/land-usage.types";

const nf = (n: number): string => n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });

/** 정착면적 × 배율 = 허용 면적 · 토지 면적 → 이내 / 초과(그 구간 전체 비사업용 — Q-5 (나)). 근거(`houseCheck`)가 없으면 null. */
export function houseCheckText(check: HouseCheck): string {
  const base = `정착면적 ${nf(check.footprint)}㎡ × ${check.multiplierDetail} = 허용 면적 ${nf(check.allowedArea)}㎡`;
  return check.excessArea > 0
    ? `${base} < 토지 면적 ${nf(check.landArea)}㎡ (초과 ${nf(check.excessArea)}㎡) → 배율 초과 — 이 구간 전체를 비사업용으로 봅니다`
    : `${base} ≥ 토지 면적 ${nf(check.landArea)}㎡ → 배율 이내`;
}

/** 결과 구간표·입력 미리보기의 «재산세 구분·배율» 칸 — 과거 주택 구간. 꼬리(양도일 현재 주택 — 근거 echo 없음)는 호출자가 따로 쓴다. */
export function houseIntervalText(iv: { houseOutcome?: HouseOutcome; houseCheck?: HouseCheck }): string | undefined {
  if (iv.houseOutcome === "unconfirmed") return "철거 직전 정착면적을 확인하지 못해 비사업용으로 봄 — 확인 필요";
  return iv.houseCheck ? houseCheckText(iv.houseCheck) : undefined;
}
