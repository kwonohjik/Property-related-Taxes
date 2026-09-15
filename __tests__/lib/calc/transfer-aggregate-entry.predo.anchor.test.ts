/**
 * Pre-Do anchor — 이력에서 단건 신고서를 골라 **다건 합산**으로 재계산 (진입점)
 *
 * 계획서: `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md`
 *
 * ## 이 anchor가 지키는 것
 *
 * 이 기능은 **엔진을 건드리지 않는다** — 이미 완성된 다건 집계 엔진에 이력을 실어 주는
 * 진입 경로다. 그래서 세액이 아니라 **편입의 정확성**이 전부다:
 *
 *  - 누구를 목록에 넣는가(같은 양도인 = `clientId`, 같은 과세연도, 단건만)
 *  - 어떤 순서로 「양도 N번」을 붙이는가(양도일 오름차순 — §111③ 신고일 필터의 직관)
 *  - **직전 세션의 정정 플래그가 묻어가지 않는가**(묻어가면 조용히 다른 세액이 된다)
 *  - 자산별 예정세액을 실어 기납부세액(§111③) 자동 파생이 성립하는가
 *
 * ⚠️ 마지막 두 항목은 **세액을 바꾸는데 tsc·lint가 못 본다**. 여기가 유일한 안전망이다.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  canAggregateFromHistory,
  selectAggregateCandidates,
  enterMultiAggregate,
} from "@/lib/calc/transfer-aggregate-entry";
import { useMultiTransferStore } from "@/lib/stores/multi-transfer-tax-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { computeAutoPriorPaid } from "@/lib/calc/multi-prior-filed";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import type { CalculationRecord } from "@/lib/storage/types";

/** 실제로 저장되는 단건 이력의 모양 — 계산이 끝난 폼 + `mode:"single"` 결과 */
function singleRec(o: {
  id: string;
  clientId?: string | null;
  transferDate: string;
  filingDate?: string;
  determinedTax?: number;
  localIncomeTax?: number;
}): CalculationRecord {
  return {
    id: o.id,
    userId: "local-user",
    taxType: "transfer",
    title: `양도소득세 — ${o.transferDate}`,
    inputData: {
      assets: [
        {
          assetKind: "apartment",
          addressJibun: "서울 강남구 대치동 1-1",
          acquisitionDate: "2015-03-02",
        },
      ],
      transferDate: o.transferDate,
      filingDate: o.filingDate ?? "",
      contractTotalPrice: "1500000000",
      householdHousingCount: "1",
    },
    resultData: {
      mode: "single",
      result: {
        determinedTax: o.determinedTax ?? 0,
        localIncomeTax: o.localIncomeTax ?? 0,
      },
    },
    taxLawVersion: o.transferDate.slice(0, 4),
    linkedCalculationId: null,
    clientId: o.clientId === undefined ? "client-A" : o.clientId,
    createdAt: "2026-09-16T07:30:00.000Z",
    updatedAt: "2026-09-16T07:30:00.000Z",
  } as unknown as CalculationRecord;
}

/** 첨부 화면의 두 건 — 기준(10.05)과 합산 대상(01.05) */
const BASE = singleRec({
  id: "rec-1005",
  transferDate: "2026-10-05",
  filingDate: "2026-12-31",
  determinedTax: 23_017_500,
  localIncomeTax: 2_301_750,
});
const EARLIER = singleRec({
  id: "rec-0105",
  transferDate: "2026-01-05",
  filingDate: "2026-03-31",
  determinedTax: 100_540_000,
  localIncomeTax: 10_054_000,
});
const PRIOR_YEAR = singleRec({ id: "rec-2025", transferDate: "2025-03-02" });
const OTHER_CLIENT = singleRec({
  id: "rec-other",
  clientId: "client-B",
  transferDate: "2026-05-05",
});
const MULTI_REC = {
  ...singleRec({ id: "rec-multi", transferDate: "2026-02-02" }),
  inputData: { __multiTransfer: true, taxYear: 2026, properties: [{ form: {} }] },
  resultData: { properties: [{}], determinedTax: 1 },
} as unknown as CalculationRecord;
const MIXED_USE = {
  ...singleRec({ id: "rec-mixed", transferDate: "2026-06-06" }),
  resultData: { mode: "mixed-use", result: { splitMode: "post-2022", total: { transferTax: 1 } } },
} as unknown as CalculationRecord;

function routerMock() {
  const pushed: string[] = [];
  return { pushed, router: { push: (href: string) => pushed.push(href) } as never };
}

beforeEach(() => {
  useMultiTransferStore.getState().reset();
  useProfessionalStore.getState().clearActiveClient();
});

describe("A-0. 버튼 노출 술어 — 단건 이력만", () => {
  it("단건은 합산 진입 가능", () => {
    expect(canAggregateFromHistory(BASE)).toBe(true);
  });

  it("🔴 다건 이력은 제외 — 이미 합산 결과라 §107② 러닝 합산분이 이중 계상된다", () => {
    expect(canAggregateFromHistory(MULTI_REC)).toBe(false);
  });

  it("겸용주택은 제외 — 다건 경로가 §160①단서 분리계산을 지원하지 않는다", () => {
    expect(canAggregateFromHistory(MIXED_USE)).toBe(false);
  });

  it("양도세가 아닌 이력은 제외", () => {
    expect(
      canAggregateFromHistory({ ...BASE, taxType: "gift" } as unknown as CalculationRecord),
    ).toBe(false);
  });
});

describe("A-1. 후보 선별 — 같은 양도인 · 같은 과세연도 · 단건", () => {
  const all = [BASE, EARLIER, PRIOR_YEAR, OTHER_CLIENT, MULTI_REC, MIXED_USE];

  it("같은 의뢰인의 단건만 목록에 오른다 (다건·겸용·타 의뢰인은 아예 제외)", () => {
    const ids = selectAggregateCandidates(all, BASE).map((c) => c.record.id);
    expect(ids).toEqual(["rec-1005", "rec-0105", "rec-2025"]);
  });

  it("기준 record가 맨 앞이고 isBase다", () => {
    const [first] = selectAggregateCandidates(all, BASE);
    expect(first.record.id).toBe("rec-1005");
    expect(first.isBase).toBe(true);
    expect(first.disabledReason).toBeNull();
  });

  it("[D3] 과세연도가 다르면 사유와 함께 비활성 — 목록에서 지우지는 않는다", () => {
    const c = selectAggregateCandidates(all, BASE).find((x) => x.record.id === "rec-2025")!;
    expect(c.taxYear).toBe(2025);
    expect(c.disabledReason).toContain("2025");
  });

  it("[V-4] 타 의뢰인 이력은 같은 연도라도 빠진다 — 「같은 양도인」이 요건이다", () => {
    const ids = selectAggregateCandidates(all, BASE).map((c) => c.record.id);
    expect(ids).not.toContain("rec-other");
  });

  it("개인 모드(clientId=null)도 같은 그룹으로 묶인다", () => {
    const a = singleRec({ id: "p1", clientId: null, transferDate: "2026-01-05" });
    const b = singleRec({ id: "p2", clientId: null, transferDate: "2026-07-07" });
    expect(selectAggregateCandidates([a, b, OTHER_CLIENT], a).map((c) => c.record.id)).toEqual([
      "p1",
      "p2",
    ]);
  });
});

describe("A-2. 진입 — 다건 store hydrate", () => {
  it("[D6] 양도일 오름차순으로 「양도 N번」을 붙인다 (입력 순서와 무관)", () => {
    const { router, pushed } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router); // 내림차순으로 넘긴다

    const { form } = useMultiTransferStore.getState();
    expect(form.properties.map((p) => p.propertyLabel)).toEqual(["양도 1번", "양도 2번"]);
    expect(form.properties.map((p) => p.form.transferDate)).toEqual(["2026-01-05", "2026-10-05"]);
    expect(form.properties.map((p) => p.sourceCalculationId)).toEqual(["rec-0105", "rec-1005"]);
    expect(pushed).toEqual(["/calc/transfer-tax/multi"]);
  });

  it("[D3] 과세연도는 기준 연도로 고정된다", () => {
    const { router } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router);
    expect(useMultiTransferStore.getState().form.taxYear).toBe(2026);
  });

  /**
   * 🔴 위 단언만으로는 **구별력이 0**이다 — fixture가 올해(2026)라
   *    `new Date().getFullYear()` fallback과 같은 값이 나온다(뮤테이션 M1 실측: 16건 전부 통과).
   *    과거연도 이력을 함께 고정해야 「기준 연도로 고정」이 실제로 검증된다.
   */
  it("[D3·M1] 과거연도 이력을 합산하면 과세연도도 그 해다 — 올해로 흐르지 않는다", () => {
    const a = singleRec({ id: "y1", transferDate: "2024-02-02", filingDate: "2024-04-30" });
    const b = singleRec({ id: "y2", transferDate: "2024-08-08", filingDate: "2024-10-31" });
    const { router } = routerMock();
    enterMultiAggregate([a, b], router);
    expect(useMultiTransferStore.getState().form.taxYear).toBe(2024);
  });

  it("🔴 직전 세션의 정정(수정신고) 플래그가 묻어가지 않는다 — 묻어가면 조용히 다른 세액이다", () => {
    useMultiTransferStore.getState().setForm({
      amendmentMode: true,
      correctionKind: "refund_claim",
      originalDeterminedTax: "999999",
      priorPaidTax: "888888",
      priorPaidTaxEdited: true,
      annualBasicDeductionUsed: "2500000",
    });

    const { router } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router);

    const { form } = useMultiTransferStore.getState();
    expect(form.amendmentMode).toBe(false);
    expect(form.correctionKind).toBe("amend");
    expect(form.originalDeterminedTax).toBe("");
    expect(form.priorPaidTax).toBe("0");
    expect(form.priorPaidTaxEdited).toBe(false);
    expect(form.annualBasicDeductionUsed).toBe("0");
  });

  it("자산 목록 단계에서 시작한다 (편입 결과를 먼저 확인)", () => {
    const { router } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router);
    const { form } = useMultiTransferStore.getState();
    expect(form.activeStep).toBe("list");
    expect(form.activePropertyIndex).toBe(0);
  });

  it("의뢰인을 자동 활성화한다 — 결과 이력이 같은 양도인으로 묶여야 한다", () => {
    const { router } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router);
    expect(useProfessionalStore.getState().activeClientId).toBe("client-A");
  });

  it("[V-3] 편입 자산은 완성도 100 — 「계산하기」가 열린다", () => {
    const { router } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router);
    for (const p of useMultiTransferStore.getState().form.properties) {
      expect(p.completionPercent).toBe(100);
      expect(calcPropertyCompletion(p.form)).toBe(100);
    }
  });
});

describe("A-3. 기납부세액(§111③) 자동 파생과의 연동", () => {
  it("[V-5] 자산별 예정세액을 실어, 신고일이 빠른 건만 기납부로 잡힌다", () => {
    const { router } = routerMock();
    enterMultiAggregate([BASE, EARLIER], router);

    const { properties } = useMultiTransferStore.getState().form;
    expect(properties.map((p) => p.priorPaidNational)).toEqual([100_540_000, 23_017_500]);

    // 신고일: 01.05분 2026-03-31 < 10.05분 2026-12-31 ⇒ 앞건만 기납부(예정신고분)
    expect(computeAutoPriorPaid(properties)).toEqual({
      national: 100_540_000,
      local: 10_054_000,
    });
  });
});
