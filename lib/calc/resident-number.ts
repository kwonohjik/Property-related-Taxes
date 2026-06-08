/**
 * 주민등록번호 파싱 유틸 (앞 7자리 전용).
 *
 * 정책 (계획서 의견1, 2026-06-08):
 *  - 입력은 13자리(YYMMDD-GXXXXXX)를 받되, **계산에 필요한 앞 7자리만 파싱**한다.
 *    뒷 6자리(검증번호 포함)는 세금 계산에 불필요하므로 체크섬 검증을 하지 않는다.
 *  - 앞 6자리(YYMMDD) + 7번째 자리(세기·성별 코드)로 생년월일과 성별을 도출한다.
 *
 * 7번째 자리 → 세기·성별:
 *   | 코드 | 세기   | 성별 |
 *   | 1,2  | 1900   | 남/여 |
 *   | 3,4  | 2000   | 남/여 |
 *   | 5,6  | 1900   | 남/여 (외국인) |
 *   | 7,8  | 2000   | 남/여 (외국인) |
 *   | 9,0  | 1800   | 남/여 |
 *   (홀수=남, 짝수=여)
 *
 * birthDate는 상속세 미성년(§20①2호)·연로자(§20①3호)·장애인(§20①4호 기대여명)
 * 공제의 만 나이 단일 입력원이며, gender는 장애인 공제 기대여명 산정에 사용된다.
 */

export interface ParsedResidentNumber {
  /** "YYYY-MM-DD" */
  birthDate: string;
  gender: "male" | "female";
}

/** 7번째 자리 → 출생 세기(연도 prefix). 알 수 없으면 null. */
function centuryFromGenderCode(code: number): number | null {
  switch (code) {
    case 1:
    case 2:
    case 5:
    case 6:
      return 1900;
    case 3:
    case 4:
    case 7:
    case 8:
      return 2000;
    case 9:
    case 0:
      return 1800;
    default:
      return null;
  }
}

/** 7번째 자리 → 성별 (홀수=남, 짝수=여). */
function genderFromCode(code: number): "male" | "female" {
  return code % 2 === 1 ? "male" : "female";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 주민등록번호 앞 7자리에서 생년월일·성별을 도출한다.
 * 파싱 불가(7자리 미만·잘못된 세기코드·유효하지 않은 날짜)면 null.
 *
 * 하이픈·공백은 제거 후 처리. 7자리 이상이면 앞 7자리만 사용(뒷자리 무시).
 */
export function parseResidentNumber(raw: string): ParsedResidentNumber | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const code = Number(digits.slice(6, 7));

  const century = centuryFromGenderCode(code);
  if (century === null) return null;

  if (mm < 1 || mm > 12) return null;
  // 해당 연·월의 말일 (윤년 자동 반영)
  const year = century + yy;
  const lastDay = new Date(year, mm, 0).getDate();
  if (dd < 1 || dd > lastDay) return null;

  return {
    birthDate: `${year}-${pad2(mm)}-${pad2(dd)}`,
    gender: genderFromCode(code),
  };
}

/**
 * 신고서 인적사항 칸 완성을 위한 13자리 완전성 검사.
 * (앞 7자리 파싱과 별개 — validation 형식 메시지용.)
 */
export function isCompleteResidentNumber(raw: string): boolean {
  if (!raw) return false;
  return raw.replace(/\D/g, "").length === 13;
}
