/**
 * ⑧ 명부 행의 **1세대1주택 사실 답 누락** — 판정 메뉴와 계산기가 같은 leaf를 쓴다(3중 패턴: ⑤ 위젯이 유일한 입력 경로).
 *
 * 순서는 법정 순서가 아니라 종전 두 검증기의 push 순서 그대로다(오류 목록 `[0]`이 자동 이동 대상):
 *   ① §155⑦1호 상속 농어촌주택 동일세대 → ② §155⑦2·3호 재귀농 → ③ §155⑦3호 귀농주택 ⑩3·4호·⑪ → ④ §155① 신규 주택 취득 경위(결정 #43).
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import {
  ruralInheritedSameHouseholdIssue,
  ruralReturnedToFarmExitIssue,
  ruralReturnToFarmFactsIssue,
} from "./one-house-row-facts";
import { newHouseOriginIssue } from "./new-house-origin-scope";

export interface HouseRowFactIssue {
  field: string;
  message: string;
}

export function houseRowFactIssues(row: HouseEntry, newHouseRowId: string | undefined): HouseRowFactIssue[] {
  const out: HouseRowFactIssue[] = [];
  const sameHousehold = ruralInheritedSameHouseholdIssue(row);
  if (sameHousehold) out.push({ field: "decedentSameHouseholdAtInheritance", message: sameHousehold });
  const returned = ruralReturnedToFarmExitIssue(row);
  if (returned) out.push({ field: "ruralReturnedToFarmExitHouse", message: returned });
  const farm = ruralReturnToFarmFactsIssue(row);
  if (farm) out.push(farm);
  const origin = newHouseOriginIssue(row, newHouseRowId);
  if (origin) out.push(origin);
  return out;
}
