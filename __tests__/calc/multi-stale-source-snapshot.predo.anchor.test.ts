/**
 * Pre-Do anchor — **합산에 편입된 자산이 원본과 끊긴 동결 스냅샷이다**
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * `buildPropertyFromSingleRecord`는 `record.inputData`의 **사본**을 property에 싣고
 * (`transfer-multi-load-entry.ts:44`), 그 사본이 sessionStorage에 persist된다
 * (`multi-transfer-tax-store.ts:246`). `sourceCalculationId`를 **들고 있으면서도**
 * 원본 변경을 감지하는 장치가 없어, 단건에서 입력을 고쳐도 합산은 옛 값으로 계속 계산한다.
 *
 * 실측(제보 4자산): 미등기 플래그가 반영되지 않아 **9,902,200원 과대**.
 *
 * ── 🔑 비교 축은 **하나뿐이다** ────────────────────────────────────────
 * `record.inputHash` ↔ `property.sourceInputHash` — **둘 다 저장소가 `record.inputData`에
 * 대해 계산한 같은 값**이라 정규화 잡음이 끼지 않는다.
 *
 * ⛔ **`computeInputHash(property.form)`과 비교하면 안 된다.** 두 실측 사실이 그 축을 죽인다:
 *   · 저장 시 `inputData`에 키가 덧붙는다 — `use-auto-save-calculation.ts:103`
 *     (`{ ...inputData, buildingStdSnapshots }`) ⇒ `record.inputData ≠ formData`
 *   · 편집 왕복이 **기본값 키를 덧붙인다** — `syncToWizardStore`가 `resetWizard()` 후
 *     `updateFormData`를 부르고 그 구현이 `{ ...state.formData, ...data }`
 *     (`calc-wizard-store.ts:280`) ⇒ **사용자가 아무것도 안 고쳐도 해시가 바뀐다**
 *   ⇒ 「로컬 편집함」과 「폼이 정규화됨」을 구분할 수 없다. S-2가 이 함정을 고정한다.
 *
 * 계획서: `docs/00-pm/multi-aggregate-stale-source-snapshot.plan.md`
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { calculationRepository, resetLocalDB } from "@/lib/storage";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import {
  buildPropertyFromSingleRecord,
  backfillPriorPaid,
  detectStaleSources,
  reloadPropertyFromSource,
  adoptSourceBaseline,
} from "@/lib/calc/transfer-multi-load-entry";

const TAX_YEAR = 2026;

/** 단건 양도세 record 입력 — `isUnregistered`만 바꿔 「원본이 바뀐」 상황을 만든다 */
function singleInput(isUnregistered: boolean, transferDate = "2026-06-03") {
  return {
    taxType: "transfer" as const,
    title: "단건 A",
    inputData: {
      assets: [{ assetKind: "land", addressJibun: "강남 1-1" }],
      transferDate,
      isUnregistered,
    },
    resultData: { mode: "single", result: { determinedTax: 1_000_000, localIncomeTax: 100_000 } },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
  };
}

let recId = "";
async function seed(isUnregistered = false, transferDate = "2026-06-03") {
  const { id } = await calculationRepository.saveOrUpdateByBusinessKey(
    singleInput(isUnregistered, transferDate),
  );
  recId = id;
  return (await calculationRepository.get(id))!;
}

describe("§합산 편입 자산의 원본 변경 감지", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  // ── 🔴 S-0 ────────────────────────────────────────────────────────
  it("S-0: 편입 시 sourceInputHash === record.inputHash", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    expect(rec.inputHash, "저장소가 record에 inputHash를 부여한다").toBeTruthy();
    expect(p.sourceInputHash).toBe(rec.inputHash);
  });

  // ── 🔴 S-1 ────────────────────────────────────────────────────────
  it("S-1: 원본 record만 바뀌면 stale로 잡힌다", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    // 같은 businessKey(addr|양도일) → 같은 id로 update + inputHash 갱신
    const { id, created } = await calculationRepository.saveOrUpdateByBusinessKey(singleInput(true));
    expect(created, "미등기 토글은 주소·양도일을 바꾸지 않아 같은 record가 갱신된다").toBe(false);
    expect(id).toBe(recId);

    const stale = await detectStaleSources([p], TAX_YEAR);
    expect(stale).toHaveLength(1);
    expect(stale[0].propertyId).toBe(p.propertyId);
    expect(stale[0].reason).toBe("source_changed");
    expect(stale[0].blockedByTaxYear).toBeUndefined();
  });

  // ── 🔴 S-2 — **이 수정의 가장 큰 함정** ───────────────────────────
  it("S-2: 로컬 편집만 했으면 stale이 **아니다** (폼이 정규화돼도)", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    // 편집 왕복이 기본값 키를 덧붙이고 사용자가 값도 고친 상태를 흉내낸다
    const edited: PropertyItem = {
      ...p,
      form: { ...p.form, isUnregistered: true, someNormalizedDefault: "" } as PropertyItem["form"],
    };
    expect(await detectStaleSources([edited], TAX_YEAR)).toHaveLength(0);
  });

  // ── 🔴 S-3 ────────────────────────────────────────────────────────
  it("S-3: record.inputHash가 없으면 판정 불가(unknown)", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    await calculationRepository.update(recId, { inputHash: undefined });
    const stale = await detectStaleSources([p], TAX_YEAR);
    expect(stale.map((s) => s.reason)).toEqual(["unknown"]);
  });

  // ── 🔴 S-4 ────────────────────────────────────────────────────────
  it("S-4: sourceInputHash가 없으면(레거시 세션) 판정 불가(unknown)", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    const legacy: PropertyItem = { ...p, sourceInputHash: undefined };
    const stale = await detectStaleSources([legacy], TAX_YEAR);
    expect(stale.map((s) => s.reason)).toEqual(["unknown"]);
  });

  // ── 🔴 S-5 ────────────────────────────────────────────────────────
  /**
   * ⚠️ **가드를 «삭제»하는 뮤테이션에는 구별력이 0이다** — `calculationRepository.get(undefined)`도
   *   아무것도 내지 않아 `if (!rec) return null`이 같은 결과를 만든다. 즉 그 가드는
   *   **정확성이 아니라 「쓸데없이 DB를 읽지 않는다」**를 위한 것이다.
   *   이 단언이 실제로 잡는 회귀는 **반대 방향** — 「원본이 없으면 unknown으로 본다」로 바꾸면
   *   수동 추가 자산 전부에 배너가 뜬다(실측 M4' → 이 건 1건 red).
   *   (memory `feedback_mutation_zero_discrimination_is_not_proof`)
   */
  it("S-5: sourceCalculationId 없는 수동 추가 자산은 검사 대상이 아니다", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    const manual: PropertyItem = { ...p, sourceCalculationId: undefined, sourceInputHash: undefined };
    expect(await detectStaleSources([manual], TAX_YEAR)).toHaveLength(0);
  });

  // ── 🔴 S-6 ────────────────────────────────────────────────────────
  it("S-6: 원본 record가 삭제됐으면 조용히 통과한다(throw 금지)", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    await calculationRepository.remove(recId);
    await expect(detectStaleSources([p], TAX_YEAR)).resolves.toHaveLength(0);
  });

  // ── 🔴 S-7 ────────────────────────────────────────────────────────
  it("S-7: 단건이 아닌 record는 건너뛴다", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    // mode를 지워 classifyLoadableTransfer가 null을 내게 만든다
    await calculationRepository.update(recId, { resultData: {}, inputHash: "deadbeefdeadbeef" });
    expect(await detectStaleSources([p], TAX_YEAR)).toHaveLength(0);
  });

  // ── 🔴 S-8 ────────────────────────────────────────────────────────
  it("S-8: 재편입이 form·sourceInputHash를 갱신하고 식별자는 보존한다", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    await calculationRepository.saveOrUpdateByBusinessKey(singleInput(true));
    const next = await calculationRepository.get(recId);

    const reloaded = await reloadPropertyFromSource(p);
    expect((reloaded.form as unknown as { isUnregistered: boolean }).isUnregistered).toBe(true);
    expect(reloaded.sourceInputHash).toBe(next!.inputHash);
    expect(reloaded.propertyId).toBe(p.propertyId);
    expect(reloaded.propertyLabel).toBe("양도 1번");
    expect(reloaded.sourceCalculationId).toBe(recId);
    // 재편입 후에는 더 이상 stale이 아니다
    expect(await detectStaleSources([reloaded], TAX_YEAR)).toHaveLength(0);
  });

  // ── 🔴 S-9 ────────────────────────────────────────────────────────
  it("S-9: 재편입이 기존 priorPaidNational을 덮지 않는다", async () => {
    const rec = await seed(false);
    const p: PropertyItem = {
      ...buildPropertyFromSingleRecord(rec, "양도 1번"),
      priorPaidNational: 999,
      priorPaidLocal: 99,
    };
    await calculationRepository.saveOrUpdateByBusinessKey(singleInput(true));
    const reloaded = await reloadPropertyFromSource(p);
    expect(reloaded.priorPaidNational).toBe(999);
    expect(reloaded.priorPaidLocal).toBe(99);
  });

  // ── 🔴 S-10 ───────────────────────────────────────────────────────
  it("S-10: 원본 양도연도가 과세기간과 달라지면 차단 사유로 반환한다", async () => {
    const rec = await seed(false, "2026-06-03");
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    // 양도일이 다른 연도로 바뀌면 businessKey가 달라져 **새 record**가 생기므로,
    // 같은 record의 양도일을 직접 갱신해 「원본이 연도를 넘어간」 상태를 만든다.
    await calculationRepository.update(recId, {
      inputData: { ...singleInput(true, "2027-02-01").inputData },
      inputHash: "ffffffffffffffff",
    });
    const stale = await detectStaleSources([p], TAX_YEAR);
    expect(stale).toHaveLength(1);
    expect(stale[0].reason).toBe("source_changed");
    expect(stale[0].blockedByTaxYear, "2027년이라 재편입하면 엔진이 예외를 던진다").toBe(2027);
  });

  // ── 🔴 S-11 ───────────────────────────────────────────────────────
  it("S-11: 「그대로 두기」는 form을 건드리지 않고 기준선만 확정한다", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    await calculationRepository.saveOrUpdateByBusinessKey(singleInput(true));

    const adopted = await adoptSourceBaseline(p);
    expect(adopted.form, "폼은 그대로다").toBe(p.form);
    expect(await detectStaleSources([adopted], TAX_YEAR), "더는 뜨지 않는다").toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════
  // 🟢 감시 — 기존 거동 불변
  // ══════════════════════════════════════════════════════════════════

  it("S-12 🟢: backfillPriorPaid 거동 불변", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    const [filled] = await backfillPriorPaid([{ ...p, priorPaidNational: undefined, priorPaidLocal: undefined }]);
    expect(filled.priorPaidNational).toBe(1_000_000);
    expect(filled.priorPaidLocal).toBe(100_000);
  });

  it("S-13 🟢: buildPropertyFromSingleRecord는 **동기**다 (async면 enterMultiAggregate가 깨진다)", async () => {
    const rec = await seed(false);
    const p = buildPropertyFromSingleRecord(rec, "양도 1번");
    expect(p, "Promise를 반환하면 안 된다").not.toBeInstanceOf(Promise);
    expect(p.propertyLabel).toBe("양도 1번");
  });
});
