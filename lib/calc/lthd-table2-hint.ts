/**
 * 재개발 입력 화면의 장기보유특별공제 **표2 안내 문구** — 양도일의 표2 연혁(`resolveLthdTable2Era`)대로 말한다.
 *
 * 종전 힌트는 현행 식(보유 4%/년 + 거주 4%/년 · 거주 2년)만 말했다. 엔진은 재개발 경로도 연혁을 따르므로(#2176) 2009~2020 양도분에는
 * 화면 문구와 계산이 어긋났다 — 2009~2019 양도분은 보유 연 8%(10년 80%) 단일축이고 거주 요건이 없다.
 * 양도일을 아직 입력하지 않았으면 현행 식 문구를 쓴다(일반 경로 화면과 같다).
 *
 * 연혁 판정은 엔진 leaf(`lthd-table2-era`)를 그대로 읽는다 — 날짜 경계를 여기서 다시 쓰지 않는다.
 */
import { resolveLthdTable2Era, type LthdTable2Era } from "@/lib/tax-engine/data/lthd-table2-era";
import { toOptionalDate } from "@/lib/api/date-coerce";

/** 양도일 문자열 → 표2 연혁. 양도일이 비었거나 읽을 수 없으면 `undefined`(현행 식 문구). */
export function table2EraOfTransferDate(transferDate: string | undefined): LthdTable2Era | undefined {
  const d = toOptionalDate(transferDate);
  return d ? resolveLthdTable2Era(d) : undefined;
}

/** 「신축주택 거주기간」 입력 칸의 힌트. */
export function table2ResidenceMonthsHint(transferDate: string | undefined): string {
  const lead = "준공일~양도일 사이 신축아파트에 실제 거주한 개월 수.";
  switch (table2EraOfTransferDate(transferDate)) {
    case "holding_8pct":
      return `${lead} 1세대1주택이면 장기보유특별공제가 표2(보유 8%/년, 최대 80%)로 적용됩니다. 2019년까지 양도분은 표2에 거주 요건이 없어 이 거주기간은 공제율에 쓰이지 않습니다.`;
    case "holding_8pct_residence_2y":
      return `${lead} 1세대1주택이고 24개월 이상이면 장기보유특별공제가 표2(보유 8%/년, 최대 80%)로 적용됩니다. 2020년 양도분의 표2는 보유기간만 보고 거주 24개월 이상이 요건입니다.`;
    case "unsupported":
      return `${lead} 1세대1주택이고 24개월 이상이면 장기보유특별공제가 표2로 적용됩니다. 2009년 1월 1일 전 양도분은 표2 연혁을 지원하지 않아 현행 식(보유 4%/년 + 거주 4%/년)으로 계산합니다.`;
    default:
      return `${lead} 1세대1주택이고 24개월 이상이면 장기보유특별공제가 표2(보유 4%/년 + 거주 4%/년, 최대 80%)로 적용됩니다.`;
  }
}

/** 「승계조합원 신축APT 양도 분기」 안내 카드의 표2 진입 조건 한 줄. */
export function table2EntryBullet(transferDate: string | undefined): string {
  if (table2EraOfTransferDate(transferDate) === "holding_8pct") {
    return "1세대1주택 → 장특공제 표2 (2019년까지 양도분은 거주 요건 없음 · §95② 단서)";
  }
  return "1세대1주택 + 신축주택 거주 2년 이상 → 장특공제 표2 (§95② 단서·시행령 §159의4)";
}
