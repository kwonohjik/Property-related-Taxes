/**
 * anchor — 가업상속공제 §97의2④ **적용 대상 게이트** (취득원인 · 자산종류)
 *
 * 코드리뷰 2026-09 A04. 종전에는 ⑤ UI만 취득원인을 봤고 ④·⑧·⑫·⑭·엔진에는 조건이 없었다.
 * 취득원인 라디오 핸들러가 `familyBusinessInheritance`를 정리하지 않고 `updateAsset`이 단순
 * shallow merge라, **상속으로 입력해 두고 매매로 바꾸면 카드가 사라져 끌 방법이 없는 채로**
 * stale 값이 ④를 통과했다 ⇒ 실측 83,281,000원 과대.
 *
 * 취득원인만으로는 절반만 막힌다 — `assetKind`를 general_building으로 바꾸면 FB 카드가
 * 조기반환으로 렌더되지 않는데 취득원인은 inheritance라 통과한다 ⇒ 실측 71,242,600원 과대.
 *
 * 조문: 「소득세법」 §97의2④ — 적용 대상은 **가업상속공제가 적용된 상속 자산**이다.
 *
 * ⚠️ 이 anchor가 없으면 게이트를 지워도 red가 나지 않는다(리뷰 시점 mutation probe
 *    506파일 5,380건 / 6,837건 2회 독립 실행 → 반응 0건).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { allowsFamilyBusinessInheritance } from "@/lib/calc/transfer-fb-gate";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

/** 가업상속공제 4필드가 채워진 상속 토지. 취득원인·자산종류만 케이스별로 갈아끼운다. */
function fbForm(over: Record<string, unknown> = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-05-01";
  form.contractTotalPrice = "500,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2015-03-01",
    inheritanceStartDate: "2015-03-01",
    fixedAcquisitionPrice: "400,000,000",
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 100_000_000,
      inheritanceMarketValue: 200_000_000,
      fbDeductionAppliedRate: 0.6,
      inheritanceDate: "2015-03-01",
    },
    ...over,
  };
  return form;
}

describe("[A04] §97의2④ 게이트 술어", () => {
  it("A04-1: 상속 + 일반 자산 → 허용 (회귀 대조군)", () => {
    expect(allowsFamilyBusinessInheritance(fbForm().assets[0])).toBe(true);
  });

  it.each(["purchase", "gift", "newConstruction", "carryover_gift"])(
    "A04-2: 취득원인 %s → 차단",
    (cause) => {
      expect(allowsFamilyBusinessInheritance(fbForm({ acquisitionCause: cause }).assets[0])).toBe(false);
    },
  );

  it("A04-3: 상속이어도 general_building → 차단 (⑤가 FB 카드를 렌더하지 않는 경로)", () => {
    expect(
      allowsFamilyBusinessInheritance(fbForm({ assetKind: "general_building" }).assets[0]),
    ).toBe(false);
  });
});

describe("[A04] ④ body spread — stale FB가 엔진에 도달하지 않는다", () => {
  it("A04-4: 상속 → familyBusinessInheritance 전송 (회귀 대조군)", async () => {
    const { run, get } = captureBody(fbForm());
    await run();
    expect((get() as Record<string, unknown>).familyBusinessInheritance).toBeDefined();
  });

  it.each(["purchase", "gift", "newConstruction"])(
    "A04-5: 취득원인을 %s로 바꾼 stale 입력 → 미전송",
    async (cause) => {
      const { run, get } = captureBody(fbForm({ acquisitionCause: cause }));
      await run();
      expect((get() as Record<string, unknown>).familyBusinessInheritance).toBeUndefined();
    },
  );

  it("A04-6: general_building + 상속 → 미전송 (취득원인 단독 게이트로는 안 막히는 경로)", async () => {
    const { run, get } = captureBody(fbForm({ assetKind: "general_building" }));
    await run();
    expect((get() as Record<string, unknown>).familyBusinessInheritance).toBeUndefined();
  });
});

describe("[A04] ⑧ 명시 차단 — stale 저장소 복원 경로", () => {
  // ⑧ 자산 검증은 step 0(자산 입력 단계)에서 돈다.
  it("A04-7: 상속이면 이 차단에 걸리지 않는다 (회귀 대조군 — 다른 검증은 별개로 걸릴 수 있다)", () => {
    expect(validateStep(0, fbForm()) ?? "").not.toMatch(/상속으로 취득한 자산에만 적용/);
  });

  it("A04-8: 취득원인이 매매인데 FB 입력이 남아 있으면 차단한다", () => {
    const err = validateStep(0, fbForm({ acquisitionCause: "purchase" }));
    expect(err).toMatch(/가업상속공제.*상속으로 취득한 자산/);
  });

  /**
   * GB(general_building) 경로는 ⑧이 아니라 **④가 막는다**(A04-6).
   * ⑧에서는 GB 전용 필수 필드(「토지면적을 입력하세요」)가 FB 블록보다 먼저 걸려
   * 이 차단에 도달하지 않는다 — 실측 확인. 픽스처를 GB 완비로 부풀리는 대신 사실만 남긴다.
   */
  it("A04-9: general_building은 ⑧ FB 차단 이전에 GB 필수 필드가 먼저 걸린다 (도달 경로 기록)", () => {
    expect(validateStep(0, fbForm({ assetKind: "general_building" }))).toMatch(/토지면적/);
  });
});
