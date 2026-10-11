/**
 * §89①4호 나목 「그 1주택 취득일」 이중 입력의 정합 검증 — 판정 메뉴 ⑧ (S10-4).
 *
 * ## 🔴 같은 사실을 두 곳에서 받는다
 *
 * 나목 「양도일 현재 1조합원입주권 외에 1주택을 보유한 경우 … **해당 1주택**을 취득한 날부터 3년 이내」의 다른 주택
 * **수**는 보유 주택 명부(`houses[]`)에서 도출되는데(엔진 `oneRightOtherHouseCount`), 기산일은 ② 카드의 별도 칸
 * (`redevOtherHouseAcquisitionDate`)에서만 읽는다. 둘이 어긋나면 결론이 조용히 바뀐다 — 칸이 명부보다 늦으면 비과세로,
 * 이르면 과세로 뒤집히고(양방향), 칸이 양도일 이후여도 비과세가 나왔다.
 *
 * ## 왜 칸을 없애지 않고 ⑧로 막는가 (결정 근거)
 *
 * 사용자 결정 Q-20(같은 사실을 두 곳에서 받지 않고 목록에서 도출)과 §155① 명부 도출 선례(`household-house-count.ts`
 * `resolveTemporaryTwoHouse`)가 가리키는 방향은 「명부 도출」이다. 그러나 나목의 「그 1주택」은 **혼인합가(영 §155⑤ ·
 * 서면-2015-부동산-1200)로 배우자 쪽 1채를 뺀 뒤 남는 행**이라, 행을 특정하려면 엔진이 합가 구성 판정의
 * `excludedHouseIds`를 거쳐야 하고(`resolveRightSaleMarriageMerge`) 상속 행의 기산일(시행령 §162①5호 — 코드 주석 인용,
 * 원문 미확인)도 걸린다. 칸을 지우고 도출로 바꾸면 그 두 축이 한꺼번에 입력 경로 없이 판정에 들어간다.
 * 그래서 칸은 두고, **명부로 한 행이 확정되는 구간에서만** 어긋남을 막는다 — 사용자는 어느 쪽을 고쳐도 되고(채울
 * 칸이 있다), 가목이면 이 칸을 비우면 된다. 명부가 2행 이상이면(합가 제외 등) 어느 행인지 ⑧이 알 수 없어 검증하지 않는다.
 *
 * ⚠️ 상속 행(`isInherited`)은 비교하지 않는다 — 그 행의 「취득한 날」이 상속개시일인지 피상속인 취득일인지(§162①5호)를
 *    확인하지 못했다(확인 필요).
 */
import { housesOwnedAtTransfer } from "./household-house-count";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

export type OneRightNaFactIssue = { field: string; message: string };

export function oneRightNaFactIssues(form: OneHouseJudgmentFormData): OneRightNaFactIssue[] {
  const primary = form.assets?.[0];
  // 입주권 양도에서만 나목 칸이 있다(⑤ `RedevelopmentRightExemptionSection`과 같은 게이트).
  if (!primary || judgmentSaleIsHousing(form)) return [];
  const na = primary.redevOtherHouseAcquisitionDate;
  if (!na) return []; // 미입력은 「판정 불가 + 사유 안내」(엔진) — 가목이면 비워 둔다.

  const issues: OneRightNaFactIssue[] = [];
  if (form.transferDate && na > form.transferDate) {
    issues.push({
      field: "redevOtherHouseAcquisitionDate",
      message: `나목 기산일(${na})이 양도 예정일(${form.transferDate})보다 뒤입니다 — 「그 1주택을 취득한 날」은 양도일 전이어야 합니다. (소득세법 §89①4호나목)`,
    });
  }

  const rows = housesOwnedAtTransfer(form.houses, form.transferDate, primary.assetKind);
  if (rows.length === 1) {
    const row = rows[0];
    if (!row.isInherited && row.acquisitionDate && row.acquisitionDate !== na) {
      issues.push({
        field: "redevOtherHouseAcquisitionDate",
        message:
          `나목 기산일(${na})이 보유 주택 명부의 1주택 취득일(${row.acquisitionDate})과 다릅니다 — ` +
          `나목은 양도일 현재 보유한 그 1주택의 취득일부터 3년을 셉니다. 같은 날짜로 맞추세요(다른 주택이 없는 가목이면 이 칸을 비우세요). (소득세법 §89①4호나목)`,
      });
    }
  }
  return issues;
}
