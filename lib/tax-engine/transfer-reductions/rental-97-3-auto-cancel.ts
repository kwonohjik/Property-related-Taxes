/**
 * §97의3 — 자동말소 아파트 매입임대 8년 등록·임대 간주 (구 조특령 §97의3②2호) · 엔진 ⑤ ⑧ ⑫ 단일 소스 leaf
 *
 * 계획서 docs/01-plan/features/rental-97-3-auto-cancel-deemed-8y.plan.md (Q-1~Q-7 권장안, 사용자 결정 2026-11-13).
 *
 * 구 령 ②2호(대통령령 제31086호 2020.10.7. 신설 — 대통령령 제33264호 2023.2.28. 삭제):
 * 「종전의 「민간임대주택에 관한 특별법」(법률 제17482호 … 개정되기 전의 것을 말한다) 제2조제5호에 따른 장기일반민간임대주택 중
 *  아파트를 임대하는 민간매입임대주택이 「민간임대주택에 관한 특별법」 제6조제5항에 따라 등록이 말소되는 경우: 해당 주택은
 *  8년 동안 등록 및 임대한 것으로 본다.」
 * - 신설 부칙 §2: 「2020년 8월 18일 이후 … 제6조제5항에 따라 임대사업자 등록이 말소되는 경우부터 적용」.
 * - 삭제 부칙에 §97의3 경과조치는 없지만, 국세청은 2020.12.31. 이전 등록분을 2023.2.28. 이후 양도해도 구 령 ②를 적용한다
 *   (기준-2024-법규재산-0079 · 사전-2024-법규재산-0768 · 사전-2025-법규재산-0726·0869 · 사전-2026-법규재산-0401).
 * - 효과는 법 §97의3① **본문 50%**뿐 — 「같은 항 단서는 적용하지 않는 것」(서면-2020-법령해석재산-3286).
 *
 * 화면은 종료 칸(「임대 종료일 또는 등록 말소일」)에 말소일을 받고, §97의3 전용 토글로 자동말소 여부를 받는다(Q-1 a).
 * 「아파트 매입임대」는 토글 문구에 담는다 — 민특법 §6⑤ 자동말소는 장기일반 중 아파트 매입임대만 해당한다(Q-2).
 */

/** 신설 부칙(대통령령 제31086호) §2 — 이 날 이후 말소분부터 */
export const AUTO_CANCEL_DEEMED_973_FROM = "2020-08-18";
/** 「종전의 민특법(법률 제17482호 개정 전) 제2조제5호」 장기일반 — 개정법 시행일(2020-08-18) 전 등록분 */
export const AUTO_CANCEL_DEEMED_973_REG_BEFORE = "2020-08-18";
/** 간주 연수 · 공제율 (본문 50%만 — 3286) */
export const AUTO_CANCEL_DEEMED_973_YEARS = 8;
export const AUTO_CANCEL_DEEMED_973_RATE = 0.5;

/**
 * 간주 적용 여부 — 날짜는 `YYYY-MM-DD` 문자열 또는 UTC 자정 Date(엔진). 미입력은 적용하지 않는다.
 * @param longRegistrationDate 장기일반 등록일 — 변경신고 주택은 변경신고 수리일
 */
export function autoCancelDeemed973Applies(a: {
  autoCancelled?: boolean;
  rentalContinuesToTransfer?: boolean | null;
  cancelledDate?: Date | string;
  longRegistrationDate?: Date | string;
}): boolean {
  if (a.autoCancelled !== true || a.rentalContinuesToTransfer !== false) return false;
  const end = iso(a.cancelledDate);
  const reg = iso(a.longRegistrationDate);
  if (!end || !reg) return false;
  return end >= AUTO_CANCEL_DEEMED_973_FROM && reg < AUTO_CANCEL_DEEMED_973_REG_BEFORE;
}

function iso(d: Date | string | undefined): string | undefined {
  if (d === undefined || d === "") return undefined;
  if (typeof d === "string") return d.slice(0, 10);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * 토글을 켰는데 간주가 성립하지 않는 입력 — ⑧(화면)·⑫(직접 API) 같은 문구. 성립하면 null.
 * 말소일 미입력은 여기서 보지 않는다(종료일 칸 필수 검사가 따로 막는다).
 */
export function autoCancelDeemed973Issue(a: {
  rentalContinuesToTransfer?: boolean | null;
  cancelledDate?: Date | string;
  longRegistrationDate?: Date | string;
}): { field: "rentalEndDate" | "autoCancelled973"; message: string } | null {
  if (a.rentalContinuesToTransfer !== false)
    return {
      field: "autoCancelled973",
      message: "자동말소 8년 간주(구 조특령 §97의3②2호)는 「양도 전에 임대 종료 또는 등록 말소」를 고르고 말소일을 넣었을 때만 적용합니다.",
    };
  const end = iso(a.cancelledDate);
  const reg = iso(a.longRegistrationDate);
  if (end && end < AUTO_CANCEL_DEEMED_973_FROM)
    return {
      field: "rentalEndDate",
      message:
        "자동말소 8년 간주(구 조특령 §97의3②2호)는 2020.8.18. 이후 말소분부터 적용합니다(대통령령 제31086호 부칙 §2). " +
        "2020.8.18. 전에 임대의무기간이 끝난 주택은 2020.8.18.에 말소된 것으로 봅니다(「민간임대주택에 관한 특별법」 부칙(법률 제17482호) §7) — 그 날을 넣으세요.",
    };
  if (reg && reg >= AUTO_CANCEL_DEEMED_973_REG_BEFORE)
    return {
      field: "autoCancelled973",
      message:
        "자동말소 8년 간주(구 조특령 §97의3②2호)는 종전 민간임대주택법(2020.8.18. 개정 전)에 따라 등록한 장기일반 아파트 매입임대에만 적용합니다 — " +
        "장기일반 등록일(변경신고 주택은 수리일)이 2020.8.18. 이후입니다.",
    };
  return null;
}
