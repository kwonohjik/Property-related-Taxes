/**
 * §99·§99의3 조항 기준일과 기준일 축 고급·고가주택 헬퍼 — `new-99-3.ts`에서 분리(800줄 정책, 리뷰 L1 2차).
 * `new-99-3.ts`가 같은 이름으로 다시 내보낸다(기존 import 경로 보존).
 */
import { isHighValueHouseAtDate } from "./new-99-3-era";

// UTC 자정 파싱 — API 경유 입력(new Date("YYYY-MM-DD") = UTC midnight)과 동일 기준.
const D = (s: string) => new Date(s);

// 고가주택 적용기준일 분기점
const HV_2002_09_30 = D("2002-09-30");
const HV_2002_12_31 = D("2002-12-31");

// ============================================================================
// 헬퍼: 고가주택 판정 (분양계약일 기준 4단계 정의)
// ============================================================================

/**
 * §99·§99의3의 **조항 기준일**을 취득유형으로 가른다 — 기간 게이트와 고가주택 단서가 **같은 축**을 써야 한다.
 *
 * 주택건설사업자로부터 취득한 갈래(§99①**2호** · §99의3①**1호**)는 **매매계약 체결·계약금 납부일**,
 * 자기건설 갈래(§99①**1호** · §99의3①**2호**)는 **사용승인·사용검사일**을 기준일로 삼는다 — 두 조문의 호 번호가
 * 서로 반대다(리뷰 NH-43). 그래서 호 번호가 아니라 취득유형(`from_builder`·`self_built`)으로 가른다.
 * 고가주택 단서도 같은 조항의 단서이므로 같은 기준일을 쓴다.
 *
 * 🔴 종전에는 기간 게이트만 취득유형으로 분기하고 고가주택 기준일은
 *   `contractDate ?? usageApprovalDate ?? acquisitionDate`로 **분기하지 않았다**(코드리뷰 D3-09).
 *   `contractDate993`에 전용 위젯이 없어 자산-수준 `assetContractDate`가 공급되는데
 *   그 위젯은 취득유형과 무관하게 항상 렌더되므로, 2호(자기건설)에서 계약일이 사용승인일을
 *   밀어내 고가주택 임계(165/149㎡ · 6억/9억/12억)가 갈렸다 — 감면 전액 ↔ 0.
 *   같은 식이 `new-99.ts`에도 복제돼 있어 헬퍼로 단일화한다.
 *
 * anchor: `__tests__/tax-engine/transfer/new99-high-value-base-date-axis.anchor.test.ts`
 */
export function resolveNew99BaseDate(
  acquisitionType: "from_builder" | "self_built",
  contractDate: Date | undefined,
  usageApprovalDate: Date | undefined,
  acquisitionDate: Date,
): Date {
  return acquisitionType === "from_builder"
    ? contractDate ?? acquisitionDate
    : usageApprovalDate ?? acquisitionDate;
}

/**
 * 고가주택 여부 판정 — 기준일은 `resolveNew99BaseDate`가 정한다(취득유형 축).
 *
 * - ~2002.9.30: 면적 165㎡ 이상 AND 양도가 6억 초과 (고급주택)
 * - 2002.10.1~2002.12.31: 면적 149㎡ 이상 AND 양도가 6억 초과 (고급주택)
 * - 2003.1.1~2008.10.5: 양도가 6억 초과 (고가주택)
 * - 2008.10.6~2021.12.7: 양도가 9억 초과 (고가주택)
 * - 2021.12.8~: 양도가 12억 초과 (고가주택)
 *
 * ⚠️ 이 함수는 «기준일 당시 기준»이다. §99의3의 2003.1.1. 이후 계약·승인분은 양도 당시 §89①3호 기준이라
 *    `checkIneligibility`가 `isHighValueHouseAtDate(양도일)`을 직접 부른다(NH-04 · `new-99-3-era.ts`).
 *    §99(`new-99.ts`)는 기준일이 모두 2003 전이라 이 함수를 그대로 쓴다.
 */
export function isHighValueHouseUnder993(
  baseDate: Date,
  /** **물건 전체(100%) 양도가액**. 지분분을 넘기면 판정이 뒤집힌다 — New993Input 주석 참조. */
  wholePropertyTransferPrice: number,
  exclusiveAreaSqm: number,
): boolean {
  if (baseDate <= HV_2002_09_30) {
    return exclusiveAreaSqm >= 165 && wholePropertyTransferPrice > 600_000_000;
  }
  if (baseDate <= HV_2002_12_31) {
    return exclusiveAreaSqm >= 149 && wholePropertyTransferPrice > 600_000_000;
  }
  return isHighValueHouseAtDate(baseDate, wholePropertyTransferPrice);
}

