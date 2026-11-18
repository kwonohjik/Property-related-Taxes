/**
 * 종부령 §3①1호·2호 — 2020.2.11. 전 세무서에만 등록한 다가구(T-14 · 부칙<대통령령 제30404호> 제6조) 화면이 「무엇을 하는가」의 단일 소스.
 * ⑤ 칸 표시(RentalExclusionMultiFamilyFields) · ⑧ 차단(validateDeemedMultiFamilyInputs) · ④ 전송(deemedMultiFamilyApiFields)이 모두
 * `deemedMultiFamilyApplies`를 쓴다 — 토글 값만 보고 따로 판단하지 않는다(다가구 입력을 껐는데 토글이 남아 있어도 적용되지 않는다 · 3중 패턴).
 * 토글 노출 술어는 별도(`asksDeemedMultiFamilyToggle`): 유형 1·2호 ∧ 다가구 층별 입력 ON.
 * 판정은 엔진 `lib/tax-engine/comprehensive-exclusion-multifamily.ts`(세무서 등록일을 §5 등록일로 정규화 · 구별 가격·면적 · 지자체 날짜 무시).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-multifamily-deemed.plan.md §3.2·§3.3
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";

/** 대통령령 제30404호 시행일(YYYY-MM-DD) — 세무서 사업자등록일이 이 날 전이어야 한다(문자열 비교 · ⑫ refine과 같은 값) */
const CUTOFF = "2020-02-11";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BASIS = "(종합부동산세법 시행령 부칙<대통령령 제30404호> 제6조)";

/** 1호(민간건설)·2호(민간매입) — 결정 ①(사용자가 기존 유형으로 고른다) */
function isDeemedType(registrationType: string): boolean {
  return registrationType === "private_construction" || registrationType === "private_purchase_short";
}

/** 의제 다가구 ON일 때 세무서 사업자등록일 칸 hint — 1·2호 단서 hint 대신 */
export const DEEMED_BUSINESS_REG_HINT = "본인 세무서 주택임대업 사업자등록일(2020.2.10. 이전)";

/** 토글을 보이는가 — 유형 1·2호 ∧ 다가구 층별 입력 ON */
export function asksDeemedMultiFamilyToggle(registrationType: string, p: PropertyEntry): boolean {
  return isDeemedType(registrationType) && p.multiFamilyEnabled;
}

/** 1·2호인데 다가구 층별 입력이 꺼져 있는가 — 토글 대신 안내 한 줄(Q-7 a) */
export function suggestsMultiFamilyInputFirst(registrationType: string, p: PropertyEntry): boolean {
  return isDeemedType(registrationType) && !p.multiFamilyEnabled;
}

/** 이 주택에 의제 다가구 경로가 적용되는가 — ⑤ 표시·④ 전송·⑧ 검증 공용 */
export function deemedMultiFamilyApplies(registrationType: string, p: PropertyEntry): boolean {
  return asksDeemedMultiFamilyToggle(registrationType, p) && p.deemedMultiFamily === true;
}

/**
 * ④ — 적용되면 지자체 등록일·신청일·말소일을 보내지 않고(엔진이 세무서 등록일로 정규화) 구별 값을 보낸다.
 * 적용이 아니면 빈 객체라 기존 본문이 한 글자도 바뀌지 않는다.
 */
export function deemedMultiFamilyApiFields(p: PropertyEntry, registrationType: string) {
  if (!deemedMultiFamilyApplies(registrationType, p)) return {};
  return {
    rentalRegistrationDate: undefined,
    rentalApplicationDate: undefined,
    registrationRevokedDate: undefined,
    deemedMultiFamily: {
      units: p.floorUnits.map((u, i) => ({
        label: u.label.trim() || `구분${i + 1}`,
        area: parseDecimal(u.area),
        assessedValue: parseAmount(u.officialValue ?? ""),
      })),
      noConversionAfterCutoff: p.deemedNoConversionAfterCutoff === "yes",
    },
  };
}

/** ⑧ — 적용될 때 보이는 칸이 비면 차단. 반환: 첫 오류 문구 또는 null. 적용이 아니면 null. */
export function validateDeemedMultiFamilyInputs(p: PropertyEntry, registrationType: string, label: string): string | null {
  if (!deemedMultiFamilyApplies(registrationType, p)) return null;
  const biz = p.businessRegistrationDate ?? "";
  if (!biz) {
    return `${label}: 세무서 주택임대업 사업자등록일을 입력하세요 — 지자체 등록 없이 세무서 등록일로 판정합니다 ${BASIS}.`;
  }
  if (!ISO_DATE.test(biz)) return `${label}: 세무서 사업자등록일을 날짜 형식으로 입력하세요.`;
  if (biz >= CUTOFF) {
    return `${label}: 2020.2.11. 이후 등록은 이 경로를 쓸 수 없습니다 — 세무서 사업자등록일이 2020.2.10. 이전이어야 합니다. 토글을 끄고 지자체 임대사업자 등록일로 판정하세요 ${BASIS}.`;
  }
  if (p.floorUnits.length === 0) {
    return `${label}: 구별(층별) 행이 없습니다 — 주택 편집 › 고급 옵션의 층별(구별) 면적 입력에서 구를 추가하세요 (종합부동산세법 시행령 §3⑥ 1구를 1호로 봄).`;
  }
  for (const [i, u] of p.floorUnits.entries()) {
    const name = u.label.trim() || `구분${i + 1}`;
    if (!(parseDecimal(u.area) > 0)) return `${label}: ${name} 구의 전용면적을 입력하세요 (종합부동산세법 시행령 §3⑥ 1구를 1호로 봄).`;
    if (!(parseAmount(u.officialValue ?? "") > 0)) {
      return `${label}: ${name} 구의 공시가격을 입력하세요 — 1구를 1호로 보아 구별 공시가격으로 판정합니다 (종합부동산세법 시행령 §3⑥).`;
    }
  }
  if (!p.deemedNoConversionAfterCutoff) {
    return `${label}: 2020.2.11. 이후 임대로 바꾼 호실이 없는지 고르세요 ${BASIS}.`;
  }
  return null;
}

/**
 * ⑧ 지자체 임대사업자 등록일 빈칸 차단 문구(의제 다가구가 적용되지 않을 때). 1·2호에는 토글로 가는 길을 함께 알린다.
 * 8호 등 그 밖 유형은 종전 문구 그대로(A14-1).
 */
export function missingRentalRegistrationMessage(p: PropertyEntry, registrationType: string, label: string): string {
  const head = `${label}: 지자체 임대사업자 등록일이 없으면 합산배제를 계산할 수 없습니다.`;
  const tail = "일반 주택으로 계산하려면 합산배제 유형을 '없음'으로 바꾸세요.";
  const lead = "2020.2.11. 전에 세무서에 주택임대업 등록을 한 다가구주택은 지자체 등록 없이도 배제될 수 있으니";
  if (asksDeemedMultiFamilyToggle(registrationType, p)) {
    return `${head} ${lead}(종합부동산세법 시행령 부칙<대통령령 제30404호> §6) '2020.2.11. 전 세무서에만 등록한 다가구' 토글을 켜세요. ${tail}`;
  }
  if (suggestsMultiFamilyInputFirst(registrationType, p)) {
    return `${head} ${lead}(종합부동산세법 시행령 부칙<대통령령 제30404호> §6) 주택 편집 › 고급 옵션에서 층별(구별) 면적 입력을 먼저 켜세요. ${tail}`;
  }
  return `${head} ${lead}(종합부동산세법 시행령 부칙<대통령령 제30404호> §6) 관할 세무서에 확인하세요. ${tail}`;
}
