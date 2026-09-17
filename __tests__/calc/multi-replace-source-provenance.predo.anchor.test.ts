/**
 * Pre-Do anchor — **다건 record 전체 replace 편입분의 가짜 provenance**
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * `buildPropertiesFromMultiRecord`(`transfer-multi-load-entry.ts:70`)의
 * `sourceCalculationId: p.sourceCalculationId ?? record.id` 폴백이 **원본이 없는 수동 추가
 * 자산**에 「원본 있음」 표지를 붙인다. 가리키는 것은 자기를 담고 있던 **다건 record**다.
 *
 * 착수 전 실측(계획서 §3):
 *   · M-1 — 폴백을 통째로 제거해도 `__tests__/calc`+`components`+`stores` **5,656건 전건 통과**
 *   · M-2 — `buildPropertiesFromMultiRecord` 참조가 `__tests__/`·`e2e/` 통틀어 **0건**
 *   ⇒ 이 축은 **무방비**다. 그래서 「이미 옳은 것」(R-2·R-3·R-6)까지 함께 고정한다.
 *
 * ── 🔑 선행 계획서의 전제가 실측으로 뒤집혔다 ──────────────────────────
 * `multi-aggregate-stale-source-snapshot.plan.md` §7은 「replace 편입분은 감지 🟡」로 적었으나,
 * **단건 출처 자산은 replace 경로에서도 정상 감지된다**(R-2·R-3이 그 사실을 고정한다).
 * PropertyItem이 id·해시를 자기 안에 들고 다니고 그것이 다건 record의 `inputData.properties[]`에
 * persist되기 때문이다.
 *
 * 계획서: `docs/00-pm/multi-replace-source-provenance.plan.md`
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { calculationRepository, resetLocalDB } from "@/lib/storage";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import {
  generatePropertyId,
  defaultMultiTransferFormData,
  useMultiTransferStore,
} from "@/lib/stores/multi-transfer-tax-store";
import {
  buildPropertyFromSingleRecord,
  buildPropertiesFromMultiRecord,
  detectStaleSources,
  buildExistingSourceIds,
} from "@/lib/calc/transfer-multi-load-entry";

const TAX_YEAR = 2026;

function singleInput(isUnregistered: boolean) {
  return {
    taxType: "transfer" as const,
    title: "단건 A",
    inputData: {
      assets: [{ assetKind: "land", addressJibun: "강남 1-1" }],
      transferDate: "2026-06-03",
      isUnregistered,
    },
    resultData: { mode: "single", result: { determinedTax: 1_000_000, localIncomeTax: 100_000 } },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
  };
}

/** 화면에서 직접 추가한 자산 — **원본이 없다** */
function manualProperty(label = "양도 2번"): PropertyItem {
  return {
    propertyId: generatePropertyId(),
    propertyLabel: label,
    form: { transferDate: "2026-07-01" } as never,
    completionPercent: 50,
  };
}

/** 단건 A 저장 → 편입 → 그 둘을 담은 다건 record 저장. 실제 자동저장과 같은 모양. */
async function seedSession(opts: { manual: boolean } = { manual: true }) {
  const { id: aId } = await calculationRepository.saveOrUpdateByBusinessKey(singleInput(false));
  const a = (await calculationRepository.get(aId))!;
  const fromSingle = buildPropertyFromSingleRecord(a, "양도 1번");
  const properties = opts.manual ? [fromSingle, manualProperty()] : [fromSingle];
  const { id: mId } = await calculationRepository.saveOrUpdateByBusinessKey({
    taxType: "transfer",
    title: "다건 M",
    // 자동저장과 동형 — `MultiTransferTaxCalculator.tsx:150` autoSaveInput
    inputData: { __multiTransfer: true, taxYear: TAX_YEAR, properties } as never,
    resultData: { properties: [{}, {}], determinedTax: 2_000_000, localIncomeTax: 200_000 } as never,
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
  });
  return { aId, mId, m: (await calculationRepository.get(mId))! };
}

describe("§다건 replace 편입분의 provenance", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  // ── 🔴 R-1 ────────────────────────────────────────────────────────
  it("R-1 🔴: replace 후 **수동 추가** 자산의 sourceCalculationId는 undefined다", async () => {
    const { mId, m } = await seedSession();
    const props = buildPropertiesFromMultiRecord(m);
    // 폴백이 살아 있으면 여기에 다건 record 자신의 id가 박힌다.
    expect(props[1].sourceCalculationId).toBeUndefined();
    expect(props[1].sourceCalculationId).not.toBe(mId);
  });

  // ── 🟢 R-2 (회귀 고정 — 이미 옳다) ────────────────────────────────
  it("R-2 🟢: replace 후 **단건 출처** 자산은 원본 A.id를 그대로 유지한다", async () => {
    const { aId, m } = await seedSession();
    const props = buildPropertiesFromMultiRecord(m);
    expect(props[0].sourceCalculationId).toBe(aId);
  });

  // ── 🟢 R-3 (선행 계획서 §7의 전제를 반증한 실측을 고정) ──────────
  it("R-3 🟢: replace 후에도 원본 변경이 감지된다 (sourceInputHash 보존)", async () => {
    const { m } = await seedSession();
    // 원본 A를 고쳐 재계산 — 같은 businessKey라 같은 id로 update되고 inputHash가 바뀐다
    await calculationRepository.saveOrUpdateByBusinessKey(singleInput(true));
    const props = buildPropertiesFromMultiRecord(m);
    const found = await detectStaleSources(props, TAX_YEAR);
    expect(found).toHaveLength(1);
    expect(found[0].propertyLabel).toBe("양도 1번");
    expect(found[0].reason).toBe("source_changed");
  });

  // ── 🟢 R-4 (V-1 고정) ─────────────────────────────────────────────
  /**
   * ⚠️ **초판은 이것을 🔴로 적었다** — 「폼에 `loadedFromRecordId`가 남는다」는 단언은
   *    객체 리터럴을 만들어 확인하는 꼴이라 **런타임 구별력이 0**이다(필드가 타입에 없어도
   *    통과한다). 타입 존재를 지키는 것은 anchor가 아니라 `tsc`다.
   *    ⇒ 실제로 깨질 수 있는 것을 고정한다: **초기값에 키가 없고, `reset`이 세션 출처를 지운다**
   *    (계획서 V-1). `reset`이 부분 merge로 바뀌면 이 anchor가 빨개진다.
   */
  it("R-4 🟢: 초기 폼에 세션 출처가 없고 reset이 그것을 지운다 (V-1)", async () => {
    expect("loadedFromRecordId" in defaultMultiTransferFormData).toBe(false);

    const { mId, m } = await seedSession();
    const store = useMultiTransferStore.getState();
    store.setForm({ properties: buildPropertiesFromMultiRecord(m), loadedFromRecordId: mId });
    expect(useMultiTransferStore.getState().form.loadedFromRecordId).toBe(mId);

    useMultiTransferStore.getState().reset();
    expect(useMultiTransferStore.getState().form.loadedFromRecordId).toBeUndefined();
    expect(useMultiTransferStore.getState().form.properties).toEqual([]);
  });

  // ── 🔴 R-5 ────────────────────────────────────────────────────────
  it("R-5 🔴: 「이미 로드함」 집합이 자산 출처 ∪ 세션 출처다 (배지 보존)", async () => {
    const { aId, mId, m } = await seedSession();
    const ids = buildExistingSourceIds({
      properties: buildPropertiesFromMultiRecord(m),
      loadedFromRecordId: mId,
    });
    expect(ids.has(aId)).toBe(true); // 자산으로 편입된 단건
    expect(ids.has(mId)).toBe(true); // 이 세션을 만든 다건 ← 폴백이 하던 일
  });

  // ── 🟢 R-6 ────────────────────────────────────────────────────────
  it("R-6 🟢: 수동 추가 자산은 감지 대상이 아니다 (오탐 0)", async () => {
    const { m } = await seedSession();
    const props = buildPropertiesFromMultiRecord(m);
    const found = await detectStaleSources(props, TAX_YEAR);
    expect(found.some((f) => f.propertyLabel === "양도 2번")).toBe(false);
  });

  // ── 🟢 R-7 ────────────────────────────────────────────────────────
  it("R-7 🟢: ④ API payload에 loadedFromRecordId가 **없다** (의도된 strip)", async () => {
    const { mId, m } = await seedSession();
    const { callMultiTransferTaxAPI } = await import("@/lib/calc/multi-transfer-tax-api");
    const originalFetch = global.fetch;
    let sent: Record<string, unknown> = {};
    global.fetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ properties: [] }) };
    }) as never;
    try {
      await callMultiTransferTaxAPI(
        { ...defaultMultiTransferFormData, taxYear: TAX_YEAR, loadedFromRecordId: mId },
        buildPropertiesFromMultiRecord(m),
      );
    } catch {
      /* 응답 형태는 이 anchor의 관심사가 아니다 — body만 본다 */
    } finally {
      global.fetch = originalFetch;
    }
    expect(sent).not.toHaveProperty("loadedFromRecordId");
    expect(JSON.stringify(sent)).not.toContain(mId);
  });

  // ── 🟢 R-8 ────────────────────────────────────────────────────────
  it("R-8 🟢: properties가 빈 다건 record도 터지지 않는다", async () => {
    const { id } = await calculationRepository.saveOrUpdateByBusinessKey({
      taxType: "transfer",
      title: "빈 다건",
      inputData: { __multiTransfer: true, taxYear: TAX_YEAR } as never,
      resultData: { properties: [], determinedTax: 0, localIncomeTax: 0 } as never,
      taxLawVersion: "2026",
      linkedCalculationId: null,
      clientId: null,
    });
    const rec = (await calculationRepository.get(id))!;
    expect(buildPropertiesFromMultiRecord(rec)).toEqual([]);
    expect(buildExistingSourceIds({ properties: [], loadedFromRecordId: undefined }).size).toBe(0);
  });
});
