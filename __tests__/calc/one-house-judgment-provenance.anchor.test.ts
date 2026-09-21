/**
 * P5-b-1 앵커 — 출처 표시 + staleness
 *
 * 계획서 §5.3 「출처 표시」 · §26.6.
 *
 * ## 🔴 이 PR이 닫는 것은 **결함 서식지**다
 *
 * P5-a가 `sourceJudgmentId`를 심었는데 **읽는 곳이 0건**이었다. 「사본 + 원본 식별자」를 들고
 * 다니면서 원본이 움직인 것을 아무도 보지 않는 상태 — 이 저장소가 다건 합산에서 이미 한 번
 * 당한 모양이고(실측 9,902,200원 과대), 그 교훈이
 * `feedback_snapshot_copy_without_staleness_detection`이다.
 *
 * ## 🔑 비교 축을 **고정한다**
 *
 * `record.inputHash` ↔ `form.sourceJudgmentInputHash`. P-4가 「폼이 달라져도 기준선이 같으면
 * fresh」를 단언해 **폼 해시 축으로 되돌아가는 것**을 막는다 — 그 축은 정상 편집마다 오탐이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectJudgmentProvenance,
  hasJudgmentProvenance,
  readJudgmentInputHash,
} from "@/lib/calc/one-house-judgment-provenance";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import type { CalculationRecord } from "@/lib/storage/types";

const store = new Map<string, CalculationRecord>();

vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    get: async (id: string) => store.get(id) ?? null,
  },
}));

function seed(over: Partial<CalculationRecord> = {}): CalculationRecord {
  const rec = {
    id: "rec-1",
    userId: "u1",
    taxType: "one_house_exemption",
    title: "1세대1주택 판정",
    inputData: {},
    resultData: { judgment: { isExempt: true, isPartialExempt: false } },
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId: null,
    inputHash: "abc123",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T01:00:00.000Z",
    ...over,
  } as CalculationRecord;
  store.set(rec.id, rec);
  return rec;
}

beforeEach(() => store.clear());

describe("P5-b-1 술어 — 출처를 붙일 근거가 있는가", () => {
  it("[P-1] 판정 메뉴를 거치지 않았으면 근거가 없다", () => {
    expect(hasJudgmentProvenance({})).toBe(false);
    expect(hasJudgmentProvenance(null)).toBe(false);
    expect(hasJudgmentProvenance(undefined)).toBe(false);
  });

  /**
   * 🔴 **id만 보면 안 된다.** 판정 메뉴 CTA는 자동저장의 `savedId`를 넘기는데 그 값은 저장이
   *    끝나야 채워진다 — 결과 화면이 뜨자마자 누르면 `undefined`로 넘어온다. 그때도 사실은
   *    실제로 전달됐고, id만 게이트로 쓰면 출처가 **조용히 사라진다**.
   */
  it("[P-2] id가 없어도 넘겨받은 사실이 있으면 근거가 있다", () => {
    expect(
      hasJudgmentProvenance({ importedOneHouseFacts: { ...oneHouseJudgmentExtraDefaults } }),
    ).toBe(true);
    expect(hasJudgmentProvenance({ sourceJudgmentId: "rec-1" })).toBe(true);
  });
});

describe("P5-b-1 staleness — 3상태", () => {
  it("[P-3] 기준선이 record와 같으면 fresh다", async () => {
    seed();
    const p = await detectJudgmentProvenance({
      sourceJudgmentId: "rec-1",
      sourceJudgmentInputHash: "abc123",
    });
    expect(p?.state).toBe("fresh");
    expect(p?.record?.judgedFor).toBe("2026-06-01");
    expect(p?.record?.verdictLabel).toBe("비과세");
  });

  /**
   * 🔴 **비교 축 고정.** 계산기에서 사용자가 입력을 고쳐도(= 폼이 달라져도) 기준선과 원본
   *    해시가 같으면 **fresh**다. 이 단언이 없으면 누군가 「폼 해시와 비교」로 되돌려도 초록이고,
   *    그 축은 정상 편집마다 오탐을 낸다(`feedback_snapshot_copy_without_staleness_detection` 3번).
   */
  it("[P-4] 계산기 폼이 달라져도 기준선이 같으면 fresh다 (폼 해시 축 금지)", async () => {
    seed();
    const p = await detectJudgmentProvenance({
      sourceJudgmentId: "rec-1",
      sourceJudgmentInputHash: "abc123",
      // 폼에 무엇이 들어 있든 판정에 쓰이지 않는다 — 축은 저장소 해시 하나뿐이다.
      importedOneHouseFacts: { ...oneHouseJudgmentExtraDefaults, winWinRentalSpecial: true },
    });
    expect(p?.state).toBe("fresh");
  });

  /** 🔴 P-3의 **부정 짝**. 원본이 다시 판정되면 감지돼야 한다. */
  it("[P-5] 원본 record가 바뀌면 source_changed다", async () => {
    seed({ inputHash: "zzz999" });
    const p = await detectJudgmentProvenance({
      sourceJudgmentId: "rec-1",
      sourceJudgmentInputHash: "abc123",
    });
    expect(p?.state).toBe("source_changed");
  });

  it("[P-6] 기준선이 없으면 unknown이다 (추측하지 않는다)", async () => {
    seed();
    const p = await detectJudgmentProvenance({ sourceJudgmentId: "rec-1" });
    expect(p?.state).toBe("unknown");
  });

  it("[P-6b] record 쪽 해시가 없어도 unknown이다", async () => {
    seed({ inputHash: undefined });
    const p = await detectJudgmentProvenance({
      sourceJudgmentId: "rec-1",
      sourceJudgmentInputHash: "abc123",
    });
    expect(p?.state).toBe("unknown");
  });
});

describe("P5-b-1 조용한 실패 — 결과 화면이 죽지 않는다", () => {
  it("[P-7] record가 지워졌으면 판정 내용 없이 unknown만 말한다", async () => {
    const p = await detectJudgmentProvenance({
      sourceJudgmentId: "없는-id",
      sourceJudgmentInputHash: "abc123",
    });
    expect(p?.state).toBe("unknown");
    expect(p?.record).toBeNull();
  });

  /** 다른 세목 record를 가리키면 출처로 인정하지 않는다 — 엉뚱한 판정 내용을 보여주지 않는다. */
  it("[P-8] 세목이 다르면 판정 내용을 읽지 않는다", async () => {
    seed({ taxType: "transfer" });
    const p = await detectJudgmentProvenance({
      sourceJudgmentId: "rec-1",
      sourceJudgmentInputHash: "abc123",
    });
    expect(p?.record).toBeNull();
  });

  it("[P-9] 근거가 아예 없으면 null이다 (카드를 렌더하지 않는다)", async () => {
    expect(await detectJudgmentProvenance({})).toBeNull();
  });

  it("[P-10] id만 있고 record가 없으면 기준선을 읽을 수 없다", async () => {
    expect(await readJudgmentInputHash("없는-id")).toBeUndefined();
    seed();
    expect(await readJudgmentInputHash("rec-1")).toBe("abc123");
  });
});

describe("P5-b-1 기준선 생산 — 전달이 그것을 심는다", () => {
  /**
   * 🔴 **staleness 전체가 이 한 줄에 달려 있다.** 전달이 기준선을 심지 않으면 비교 축의
   *    한쪽이 영원히 비어 모든 판정이 `unknown`이 된다 — 기능이 살아 있는 채로 **아무것도
   *    감지하지 못한다**. 뮤테이션 M8이 그 줄을 지워도 초록이길래 이 시료를 넣었다
   *    (`feedback_api_trigger_without_input_path_is_noop` 형제 축).
   */
  it("[P-11] 전달 patch가 기준선(inputHash)을 함께 싣는다", () => {
    const form = createInitialOneHouseJudgmentForm();
    const patch = toTransferFormPatch(form, "rec-1", "abc123");
    expect(patch.sourceJudgmentId).toBe("rec-1");
    expect(patch.sourceJudgmentInputHash).toBe("abc123");
  });

  /** 기준선을 못 읽었으면 **비워 둔다** — 빈 문자열로 채우면 「있는데 다르다」로 오판한다. */
  it("[P-12] 기준선을 못 읽었으면 키를 만들지 않는다", () => {
    const patch = toTransferFormPatch(createInitialOneHouseJudgmentForm(), "rec-1");
    expect(patch.sourceJudgmentId).toBe("rec-1");
    expect(patch).not.toHaveProperty("sourceJudgmentInputHash");
  });
});
