/**
 * ⑧ — 동거봉양 합가일을 입력했는데 직계존속 연령 요건을 선택하지 않은 경우(결정 #9 하위 1 가: 입력 단계에서 막는다).
 * 판정 메뉴 · 양도세 계산기(단건·다건) · 증여세 부담부증여 ⑧이 **같은 술어·같은 문구**를 쓴다. 엔진의 「미선택 = 불성립 + 확인 필요」는
 * 직접 호출·판정→계산기 인계·오래된 세션 방어용 안전망으로 남는다.
 *
 * 호출부가 **칸이 실제로 보이는 구간**(각 화면의 노출 게이트)에서만 부른다 — 보이지 않는 칸을 요구하면 막다른 오류다.
 */
export const PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE =
  "동거봉양 합가일을 입력했다면 합가일 현재 직계존속의 연령을 선택하세요 — 고르지 않으면 동거봉양 합가 특례를 불성립으로 판정합니다(합가일 현재 만 나이 기준).";

export function parentalCareParentAgeMissing(f: { parentalCareMergeDate?: string; parentalCareParentAge?: string }): boolean {
  return !!f.parentalCareMergeDate && !f.parentalCareParentAge;
}

/**
 * §155② 단서 칩(「동거봉양 합가 전부터 보유하던 상속주택」)과 연령 칸이 같은 사실을 다르게 말하는가(결정 #9 조건, 원칙 4 — 진실을 둘로 두지 않는다).
 * 칩은 §155② 단서(요양급여 갈래 없음, 60세 이상 전제)에 쓰이므로 연령 칸이 「해당 없음」·「요양급여 60세 미만」이면 어긋난다. 비차단 경고.
 */
export function parentalCareChipConflict(form: {
  parentalCareMergeDate?: string;
  parentalCareParentAge?: string;
  houses?: { isInherited?: boolean; parentalCareMergeInheritedHouse?: boolean }[];
  assets?: { acquisitionCause?: string; parentalCareMergeInheritedHouse?: boolean }[];
}): boolean {
  if (!form.parentalCareMergeDate) return false;
  if (form.parentalCareParentAge !== "none" && form.parentalCareParentAge !== "care_benefit") return false;
  return (
    (form.houses ?? []).some((h) => h.isInherited && h.parentalCareMergeInheritedHouse === true) ||
    (form.assets?.[0]?.acquisitionCause === "inheritance" && form.assets[0].parentalCareMergeInheritedHouse === true)
  );
}

export const PARENTAL_CARE_CHIP_CONFLICT_MESSAGE =
  "「동거봉양 합가 전부터 보유하던 상속주택」을 선택했는데 직계존속 연령은 합가일 현재 만 60세 이상이 아니라고 선택했습니다 — 상속주택 특례(§155② 단서)는 60세 이상 직계존속(요양급여 갈래 없음)을 전제하므로 두 선택이 어긋납니다. 사실에 맞게 한쪽을 고치세요.";

/** 판정 메뉴 ⑧ — 칸이 보이는 구간에서 부른다: 미선택(차단) + 칩 어긋남(경고). */
export function parentalCareAgeIssues(
  form: Parameters<typeof parentalCareChipConflict>[0],
): { severity: "error" | "warning"; message: string }[] {
  return [
    ...(parentalCareParentAgeMissing(form) ? [{ severity: "error" as const, message: PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE }] : []),
    ...(parentalCareChipConflict(form) ? [{ severity: "warning" as const, message: PARENTAL_CARE_CHIP_CONFLICT_MESSAGE }] : []),
  ];
}
