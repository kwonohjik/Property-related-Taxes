/**
 * 농지·목장용지 「도시지역」 판정의 **지역 열거** (법 §104의3①1호나목·3호가목).
 *
 * 1호나목 verbatim (KoreanLaw `get_law_text(mst=280405)` 직접 확인 2026-09-02):
 *   「특별시ㆍ광역시(**광역시에 있는 군은 제외한다. 이하 이 항에서 같다**)ㆍ특별자치시
 *    (특별자치시에 있는 **읍ㆍ면지역은 제외한다**. 이하 이 항에서 같다)ㆍ특별자치도
 *    (「제주특별자치도 설치 및 국제자유도시 조성을 위한 특별법」 제10조제2항에 따라 설치된
 *    **행정시의 읍ㆍ면지역은 제외한다**. 이하 이 항에서 같다) 및 시지역(「지방자치법」
 *    제3조제4항에 따른 **도농 복합형태인 시의 읍ㆍ면지역은 제외한다**. 이하 이 항에서 같다)
 *    중 「국토의 계획 및 이용에 관한 법률」에 따른 도시지역…에 있는 농지」
 *
 * 괄호마다 「이하 **이 항**에서 같다」이므로 같은 항 3호가목(목장용지)의
 * 「특별시ㆍ광역시ㆍ특별자치시ㆍ특별자치도 및 시지역의 도시지역」에도 그대로 미친다.
 *
 * **도(道)의 군은 열거 자체에 없으므로** 애초 대상이 아니다.
 *
 * ⚠️ 이 판정을 `isUrbanForFarmland`·`isUrbanForPasture` **leaf 안에 넣지 말 것** —
 *    `unconditional-exemption.ts`가 §168의14③1의2호(「양도 당시 …도시지역(녹지지역 및
 *    개발제한구역은 제외한다) 안의 토지는 제외한다」 — **지역 열거가 없는 조문**)로 같은
 *    leaf를 부른다. leaf를 고치면 그쪽이 조용히 틀어진다.
 *
 * 판정 재료는 시·군·구 코드(자치단체 종류)와 **읍·면/동 구분** 둘이다. 후자는 코드에서
 * 도출되지 않으므로 사용자 입력을 받고, 없으면 추정하지 않고 `undefined`(판정 불가)를 낸다.
 */

import { lookupSigungu } from "@/lib/korean-law/sigungu-codes";

/** 토지 소재지의 행정구역 단위 — 법 §104의3①1호나목 괄호의 「읍ㆍ면지역」 판별용. */
export type LandDivision = "dong" | "eup_myeon";

/**
 * 해당 토지가 법 §104의3①1호나목·3호가목의 **지역 열거 안**에 있는지.
 *
 * - `false` → 지역 열거 밖 → 도시지역 판정 자체를 하지 않는다(용도지역과 무관하게 지역기준 미적용)
 * - `true`  → 열거 안 → 종전대로 용도지역으로 도시지역을 판정
 * - `undefined` → 판정 불가(코드 미입력 또는 읍·면 구분 미입력) — **추정하지 않는다**
 *
 * @param sigunguCode 5자리 또는 10자리 시·군·구 코드
 * @param division    읍·면/동 구분. 읍·면이 없는 자치단체(자치구·일반구)에서는 불요
 */
export function isUrbanCriteriaRegion(
  sigunguCode: string | undefined,
  division: LandDivision | undefined,
): boolean | undefined {
  if (!sigunguCode) return undefined;
  const record = lookupSigungu(sigunguCode.slice(0, 5));
  if (!record) return undefined;

  const unitName = record.name.trim().split(/\s+/).pop() ?? "";

  // 군 — 광역시의 군은 명문 제외, 도의 군은 열거에 없다. 어느 쪽이든 대상 밖.
  if (unitName.endsWith("군")) return false;

  // 자치구·일반구는 읍·면이 존재하지 않는다 → 구분 입력 없이 대상.
  if (unitName.endsWith("구")) return true;

  // 시·특별자치시 — 읍·면지역이면 제외. 구분을 모르면 판정 불가.
  if (division === undefined) return undefined;
  return division === "dong";
}
