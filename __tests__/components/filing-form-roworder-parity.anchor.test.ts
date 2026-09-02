/**
 * anchor: 신고서 표의 두 rowOrder가 갈라지지 않는다
 *
 * ## 발견 경위
 *
 * 신고서 정본 반영(PR #1407) 중 ⑨세율 행을 단건 `rowOrder`(`FilingFormTableRowDefs.ts`)에만
 * 넣었더니, 합산 표에는 행이 없어 **합계 셀 단언이 공허하게 통과**했다(`cell()`이 행을 못 찾으면
 * null을 돌려주는데 기대값도 null이었다). 값 배관은 멀쩡했으므로 타입도 테스트도 잡지 못했다.
 *
 * `FilingFormTableAggregateHelpers.ts`가 **별도 rowOrder 배열**을 갖기 때문이다.
 *
 * ## 왜 합치지 않는가
 *
 * 두 표는 정당하게 다르다 — 합산에만 기납부세액(§111③)·차감납부세액이 있고, 단건에만
 * 「감면후 소득금액」이 있다. 하나로 합치면 그 차이를 조건 분기로 표현해야 해서 더 나빠진다.
 * 대신 **공통 행의 집합과 상대 순서**를 여기서 고정한다 — 한쪽에만 행을 추가하면 실패한다.
 */
import { describe, it, expect } from "vitest";
import { buildRowsFromOrder } from "@/components/calc/results/transfer/FilingFormTableRowDefs";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

/** 합산에만 있는 행 — 신고 단위 개념이라 단건 표에는 없다 */
const AGGREGATE_ONLY = [
  "기납부세액 (예정신고, §111③)",
  "차감납부할세액",
  "기납부세액 (지방, 예정신고)",
  "차감납부할 지방소득세",
];
/** 단건에만 있는 행 — 현재 없다(합산이 단건의 상위집합이다). */
const SINGLE_ONLY: string[] = [];

const singleLabels = () => buildRowsFromOrder({}, {}, "취득일자", undefined).map((r) => r.label);

const aggregateLabels = () => {
  const meta: AggregateMeta = {
    properties: [],
    aggregated: {} as unknown as AggregateMeta["aggregated"],
  };
  return buildAggregateRows({} as TransferTaxResult, meta, createDefaultTransferFormData()).map(
    (r) => r.label,
  );
};

describe("[rowOrder parity] 단건 ↔ 합산 신고서 표", () => {
  it("🔴 한쪽에만 있는 행은 허용 목록뿐이다 (새 행을 한쪽에만 넣으면 실패)", () => {
    const s = singleLabels();
    const a = aggregateLabels();
    expect(s.filter((l) => !a.includes(l))).toEqual(SINGLE_ONLY);
    expect(a.filter((l) => !s.includes(l))).toEqual(AGGREGATE_ONLY);
  });

  it("🔴 공통 행의 상대 순서가 같다", () => {
    const s = singleLabels();
    const a = aggregateLabels();
    const commonInSingle = s.filter((l) => a.includes(l));
    const commonInAggregate = a.filter((l) => s.includes(l));
    expect(commonInAggregate).toEqual(commonInSingle);
  });

  it("정본 순서 — 과세표준 → 세율구분 코드 → 세율 → 산출세액 (양쪽 모두)", () => {
    for (const labels of [singleLabels(), aggregateLabels()]) {
      const i = labels.indexOf("과세표준");
      expect(labels.slice(i, i + 4)).toEqual(["과세표준", "세율구분 코드", "세율", "산출세액"]);
    }
  });
});
