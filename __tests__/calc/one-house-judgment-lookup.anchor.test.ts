/**
 * P5-b-2 앵커 — 「판정 불러오기」 후보 조회 + 적용
 *
 * 계획서 §5.3 표 2행 · §27.6.
 *
 * ## 이 파일이 지키는 두 가지
 *
 * 1. **후보 목록**(`filterOneHouseJudgmentCandidates`) — 세목 가드·정렬 축·배지·폼 복원.
 * 2. 🔴 **적용 경로**(`applyOneHouseFactsToTransferForm`) — P5-a가 만들었으나 **소비자가 없어
 *    한 번도 실행되지 않은** 함수다. P5-b-1의 P-11은 `toTransferFormPatch`를 **직접** 불러
 *    검증했으므로, 그 앞단에서 **기준선 해시를 저장소에서 읽어 오는 부분**은 지금까지
 *    안전망이 0이었다. 그 줄이 죽으면 불러온 판정이 **영원히 `unknown`**이 된다 —
 *    기능이 살아 있는 채로 아무것도 감지하지 못하는 상태(P5-b-1 뮤테이션 M8과 같은 모양).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  filterOneHouseJudgmentCandidates,
  type OneHouseJudgmentCandidate,
} from "@/lib/calc/one-house-judgment-lookup";
import { applyOneHouseFactsToTransferForm } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { CalculationRecord } from "@/lib/storage/types";

const store = new Map<string, CalculationRecord>();

vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    get: async (id: string) => store.get(id) ?? null,
  },
}));

function rec(over: Partial<CalculationRecord> = {}): CalculationRecord {
  const r = {
    id: "ohh-1",
    userId: "u1",
    taxType: "one_house_exemption",
    title: "1세대1주택 판정 — 서울 강남구 대치동 316 (양도예정 2026-06-01)",
    inputData: {
      isOneHousehold: true,
      transferDate: "2026-06-01",
      contractTotalPrice: "900000000",
      assets: [{ id: "a1", addressRoad: "서울 강남구 대치동 316" }],
    },
    resultData: { judgment: { isExempt: true, isPartialExempt: false, pending: [] } },
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId: null,
    inputHash: "hash-abc",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-21T01:00:00.000Z",
    ...over,
  } as CalculationRecord;
  store.set(r.id, r);
  return r;
}

beforeEach(() => store.clear());

describe("P5-b-2 후보 목록", () => {
  /**
   * 🔴 호출부가 `list({ taxType })`의 인자를 빠뜨려도 양도세 record가 목록에 새지 않는다.
   *    `normalizeOneHouseJudgmentForm`은 **어떤 입력에도 완전한 폼을 돌려주므로**, 이 가드가
   *    없으면 엉뚱한 세목이 조용히 후보가 된다.
   */
  it("[LU-1] 세목이 다른 record는 후보가 아니다", () => {
    const out = filterOneHouseJudgmentCandidates([
      rec(),
      rec({ id: "t-1", taxType: "transfer" }),
      rec({ id: "g-1", taxType: "gift" }),
    ]);
    expect(out.map((c) => c.calculationId)).toEqual(["ohh-1"]);
  });

  /**
   * 🔴 **정렬 축은 `updatedAt`이다.** 저장소 기본 정렬은 `createdAt` 역순인데
   *    (`calculation-repository.ts:358`), 판정은 같은 주소·양도예정일이면 **제자리 갱신**된다
   *    (`business-key.ts:85`). 그래서 방금 다시 판정한 건이 `createdAt` 순서로는 아래에 깔린다.
   *    이 시료가 두 축을 **반대로** 세워 구별한다 — `createdAt`으로 정렬하면 순서가 뒤집힌다.
   */
  it("[LU-2] 최근에 저장한 판정이 위다 (createdAt 축이 아니다)", () => {
    const out = filterOneHouseJudgmentCandidates([
      rec({
        id: "old-created-new-saved",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-09-21T09:00:00.000Z",
      }),
      rec({
        id: "new-created-old-saved",
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
      }),
    ]);
    expect(out.map((c) => c.calculationId)).toEqual([
      "old-created-new-saved",
      "new-created-old-saved",
    ]);
  });

  it("[LU-3] 배지는 저장된 판정 결과에서 온다", () => {
    const [exempt] = filterOneHouseJudgmentCandidates([rec()]);
    expect(exempt.verdict).toEqual({ label: "비과세", tone: "emerald", detail: expect.any(String) });

    const [taxed] = filterOneHouseJudgmentCandidates([
      rec({ resultData: { judgment: { isExempt: false, isPartialExempt: false, pending: [] } } }),
    ]);
    expect(taxed.verdict?.label).toBe("과세");
    expect(taxed.verdict?.tone).toBe("rose");
  });

  /** 🔑 모르는 것을 지어내지 않는다 — 구 스키마면 배지를 **띄우지 않는다**(「과세」가 아니다). */
  it("[LU-4] 판정 내용이 없으면 배지가 null이다", () => {
    const [a] = filterOneHouseJudgmentCandidates([rec({ resultData: {} })]);
    expect(a.verdict).toBeNull();
    const [b] = filterOneHouseJudgmentCandidates([rec({ resultData: { judgment: "옛 문자열" } })]);
    expect(b.verdict).toBeNull();
  });

  /**
   * 🔴 `record.inputData`를 **그대로** 넘기면 §155의2·§155의3 기본값 보정과 자산 마이그레이션이
   *    건너뛰어져, 구 record가 `undefined` 토글을 계산기로 밀어 넣는다.
   */
  it("[LU-5] 폼은 normalize를 거쳐 기본값이 채워진다", () => {
    const [c] = filterOneHouseJudgmentCandidates([rec()]);
    const defaults = createInitialOneHouseJudgmentForm();
    // 저장된 값은 살아 있다.
    expect(c.form.transferDate).toBe("2026-06-01");
    expect(c.form.contractTotalPrice).toBe("900000000");
    // 저장에 없던 판정 전용 13필드는 기본값으로 채워진다(undefined가 아니다).
    expect(c.form.winWinRentalSpecial).toBe(defaults.winWinRentalSpecial);
    expect(c.form.longTermMortgageSpecial).toBe(defaults.longTermMortgageSpecial);
  });

  /** 손상 record로 화면이 죽지 않는다 — throw 0, 완전한 폼. */
  it("[LU-6] inputData가 비어 있어도 throw하지 않는다", () => {
    const out = filterOneHouseJudgmentCandidates([
      rec({ id: "empty", inputData: {} }),
      rec({ id: "nullish", inputData: null as never }),
    ]);
    expect(out).toHaveLength(2);
    for (const c of out) expect(c.form.assets).toBeInstanceOf(Array);
  });

  /**
   * ⛔ **`excludeIds`를 받지 않는다 — 재제안 금지.**
   *
   * 이미 불러온 판정을 목록에서 빼면 **선택 해제가 불가능**해진다는 이유로 이 저장소에서 이미
   * 한 번 기각된 설계다(`project_stock_prior_aggregation_overwrite` ⛔절). 이 축에는 더 강한
   * 이유가 있다: 「이미 불러온 판정을 다시 불러오기」가 P5-b-1의 `source_changed` 경고를
   * 해소하는 **정규 경로**다. 그 건이 목록에서 빠지면 사용자가 경고를 없앨 방법이 사라진다.
   */
  it("[LU-7] 후보 함수는 제외 목록 인자를 받지 않는다", () => {
    expect(filterOneHouseJudgmentCandidates.length).toBe(1);
  });
});

describe("P5-b-2 적용 — 기준선까지 함께 심는다", () => {
  /**
   * 🔴 **P5-a가 만들고 아무도 부르지 않던 경로다.** `readJudgmentInputHash`로 원본 record의
   *    `inputHash`를 읽어 `sourceJudgmentInputHash`에 심는 것이 staleness 비교 축의 **한쪽**이다.
   *    이 줄이 죽으면 불러온 판정은 영원히 「확인 불가」가 되고, 그래도 화면은 멀쩡히 뜬다.
   */
  it("[LU-8] 불러오기가 판정 id와 기준선 해시를 계산기 폼에 심는다", async () => {
    rec({ id: "ohh-9", inputHash: "hash-xyz" });
    const { useCalcWizardStore } = await import("@/lib/stores/calc-wizard-store");

    await applyOneHouseFactsToTransferForm(createInitialOneHouseJudgmentForm(), "ohh-9");

    const form = useCalcWizardStore.getState().formData;
    expect(form.sourceJudgmentId).toBe("ohh-9");
    expect(form.sourceJudgmentInputHash).toBe("hash-xyz");
    // 전달 사실 상자도 함께 실린다 — id 없이 온 경합 경로에서 출처를 살리는 직접 증거다.
    expect(form.importedOneHouseFacts).toBeDefined();
  });

  /** 기준선을 못 읽었으면 **비워 둔다** — 빈 문자열로 채우면 「있는데 다르다」로 오판한다. */
  it("[LU-9] record가 없으면 기준선 키를 만들지 않는다", async () => {
    const { useCalcWizardStore } = await import("@/lib/stores/calc-wizard-store");
    useCalcWizardStore.getState().updateFormData({ sourceJudgmentInputHash: undefined });

    await applyOneHouseFactsToTransferForm(createInitialOneHouseJudgmentForm(), "없는-id");

    const form = useCalcWizardStore.getState().formData;
    expect(form.sourceJudgmentId).toBe("없는-id");
    expect(form.sourceJudgmentInputHash).toBeUndefined();
  });

  /**
   * 🔴 **이동하지 않는다.** 이 함수가 `router.push`를 하면 다건 편집 화면에서 단건 마법사로
   *    튕겨 나간다(계획서 V-12). 인자에 router가 없다는 것이 그 보증이다 — 형제 함수
   *    `openTransferWithOneHouseFacts`는 router를 **요구**한다.
   */
  it("[LU-10] 적용 헬퍼는 router를 받지 않는다", () => {
    expect(applyOneHouseFactsToTransferForm.length).toBe(2);
  });
});

/** 후보 타입이 모달이 쓰는 모양 그대로인지 — 필드명이 바뀌면 여기서 먼저 깨진다. */
const _shape: OneHouseJudgmentCandidate = {
  calculationId: "x",
  title: "t",
  updatedAt: "2026-09-21T00:00:00.000Z",
  verdict: null,
  form: createInitialOneHouseJudgmentForm(),
};
void _shape;
