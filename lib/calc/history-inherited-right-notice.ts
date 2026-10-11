/**
 * 이력 재계산 고지 — 상속 권리의 「상속개시 당시 보유」 판정 방식 변경(결정 #8 조건 6).
 *
 * 종전에는 「양도하는 주택을 상속개시 당시 이미 보유」 토글(`generalHouseHeldAtInheritance`)을 켜지 않으면 날짜를 보지 않고 판정 보류
 * (비과세)로 두었다. 지금은 양도 주택 취득일과 상속 권리 행의 상속개시일(분양권은 취득일, 입주권은 상속개시일 칸)로 판정하고,
 * 모르면 「불성립 + 확인 필요」다. 그래서 **이 변경 전에 저장한 이력**은 「이 조건으로 재계산」하면 결론이 바뀔 수 있다.
 *
 *   - 토글을 「예」로 저장했지만 날짜와 모순되는 이력 → 불성립(과세)으로 바뀔 수 있다.
 *   - 상속 분양권·입주권 행이 있는 이력(10-05~10-09 저장분 포함) → 미선언 판정 보류(비과세)였던 것이 날짜 판정으로 바뀔 수 있다.
 *
 * 이력에는 판정 결과만 남고 어느 쪽으로 바뀔지는 재계산해야 알므로, 바뀐다고 단정하지 않고 「바뀔 수 있다」로만 고지한다.
 * 저장분 자체는 바꾸지 않는다(저장된 결과는 저장 당시 기준 그대로).
 */
import type { CalculationRecord } from "@/lib/storage/types";

/**
 * 이 시각 **이전에 마지막으로 저장된** 이력만 고지 대상이다 — 날짜 판정 방식이 들어간 날(2026-10-12, KST 0시).
 * ⚠️ 배포일이 이날보다 늦으면 그 사이 옛 빌드로 저장된 이력은 고지에서 빠진다. 배포일이 정해지면 이 값을 그날로 맞출 것.
 */
export const INHERITED_RIGHT_DATE_RULE_SINCE = "2026-10-11T15:00:00.000Z";

export const INHERITED_RIGHT_HISTORY_NOTICE =
  "이 이력은 상속 분양권·입주권의 「상속개시 당시 보유」를 날짜로 판정하기 전에 저장했습니다. 다시 계산하면 양도 주택 취득일과 상속개시일을 비교하므로 결과가 바뀔 수 있습니다(날짜를 알 수 없으면 특례를 적용하지 않고 확인 필요로 알립니다).";

/** 판정 방식이 바뀐 축을 쓰는 세목 — 양도세(단건·다건)와 1세대1주택 판정 메뉴. */
const AFFECTED_TAX_TYPES: ReadonlySet<string> = new Set(["transfer", "one_house_exemption"]);

function hasInheritedRightRow(input: Record<string, unknown>): boolean {
  const rows = input.presaleRights;
  return Array.isArray(rows) && rows.some((r) => (r as { isInherited?: unknown } | null)?.isInherited === true);
}

/** 재계산하면 결과가 바뀔 수 있는 옛 이력이면 고지 문구, 아니면 null. */
export function inheritedRightHistoryNotice(
  record: Pick<CalculationRecord, "taxType" | "inputData" | "updatedAt">,
): string | null {
  if (!AFFECTED_TAX_TYPES.has(record.taxType)) return null;
  const savedAt = Date.parse(record.updatedAt);
  // 저장 시각을 읽지 못하면 옛 이력인지 알 수 없다 — 고지하지 않는다(근거 없이 경고를 붙이지 않는다).
  if (!Number.isFinite(savedAt) || savedAt >= Date.parse(INHERITED_RIGHT_DATE_RULE_SINCE)) return null;
  const input = record.inputData ?? {};
  const oldToggleOn = (input as { generalHouseHeldAtInheritance?: unknown }).generalHouseHeldAtInheritance === true;
  return oldToggleOn || hasInheritedRightRow(input) ? INHERITED_RIGHT_HISTORY_NOTICE : null;
}
