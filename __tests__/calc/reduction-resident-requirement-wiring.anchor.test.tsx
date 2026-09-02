/**
 * D11-05 — §98·§98의2·§98의7·§98의8·§99 「거주자(내국인)」 요건 게이트가 영구 사문이었다.
 *
 * 엔진에는 게이트가 **실재**했다:
 *   `unsold-98-8.ts:157` · `new-99.ts:148·:156` · `unsold-hybrid-p4.ts:59` ·
 *   `unsold-hybrid-p5.ts:84` · `unsold-hybrid.ts:332`
 * 그런데 주입부가 전부 상수 fallback(`?? true` / `?? false`)이었고 ①④⑤⑫ 어디에도 입력
 * 경로가 없었다 ⇒ **비거주자가 신고해도 감면이 그대로 나갔다**.
 *
 * 조문 verbatim (법제처 DRF 실독, 조특법 efYd 20280101):
 *   §98①    「**거주자가** 대통령령으로 정하는 미분양 국민주택 … 을 1995년 11월 1일부터 …」
 *   §98의2① 「**거주자가** 2008년 11월 3일부터 2010년 12월 31일까지의 기간 중에 취득 …」
 *   §98의7① 「**내국인이** 2012년 9월 24일 현재 대통령령으로 정하는 미분양주택으로서 …」
 *   §98의8① 「**거주자가** 대통령령으로 정하는 준공후미분양주택으로서 …」
 *   §99①    「**거주자(주택건설사업자는 제외한다)가** 다음 각 호의 어느 하나에 해당하는 …」
 *   §2①1호  「"내국인"이란 「소득세법」에 따른 **거주자** 및 「법인세법」에 따른 내국법인을 말한다」
 *
 * ⇒ §98의7의 「내국인」은 「거주자 한정 아님」이 **아니다**. 개인 양도소득세 국면에서는
 *   거주자여야 하고, 「한정 아님」이 유의미한 것은 내국법인이 주체인 경우뿐이다.
 *
 * 배선은 §99의3 sibling(`isResident993`)과 **같은 형태**다 — 보이는 chip + 법문이 상정하는
 * 기본값. 「미입력=요건 충족」의 문제는 값이 true인 것이 아니라 **화면에 없다는 것**이었다.
 *
 * ⚠️ 마이그레이션이 없으면 저장된 폼에서 `undefined`가 「비거주자」로 읽혀 감면이 조용히
 *    배제된다(memory `feedback_new_asset_field_stale_sessionstorage_guard`). D11-05-6이 고정한다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

/** (조문 id, 요건 필드, 법문상 기본값) */
const RESIDENT_AXIS = [
  { id: "unsold_98", field: "isResident98", def: true },
  { id: "unsold_98_2", field: "isResident982", def: true },
  { id: "unsold_98_7", field: "isDomestic987", def: true },
  { id: "unsold_98_8", field: "isResident988", def: true },
  { id: "new_99", field: "isResident99", def: true },
  { id: "new_99", field: "isHousingConstructionBusiness99", def: false },
] as const;

describe("D11-05 거주자·내국인 요건 배선", () => {
  it("D11-05-1: ②③ 기본값 — 법문이 상정하는 통상의 경우로 채워진다", () => {
    for (const { id, field, def } of RESIDENT_AXIS) {
      const d = getReductionDefault(id) as unknown as Record<string, unknown>;
      expect(d[field], `${id}.${field}`).toBe(def);
    }
  });

  it("D11-05-2: 🔴 ④ 변환이 값을 payload에 싣는다 (명시 매핑이라 빠뜨리면 침묵 strip)", () => {
    for (const { id, field } of RESIDENT_AXIS) {
      const form = { ...(getReductionDefault(id) as AssetReductionForm) } as Record<string, unknown>;
      form[field] = field === "isHousingConstructionBusiness99" ? true : false;
      const [out] = toEngineReductions([form as AssetReductionForm], "purchase") as Record<
        string,
        unknown
      >[];
      expect(field in out, `${id}.${field} — ④`).toBe(true);
      expect(out[field], `${id}.${field} — ④ 값`).toBe(
        field === "isHousingConstructionBusiness99" ? true : false,
      );
    }
  });

  it("D11-05-3: 🔴 ⑫ Zod가 키를 보존한다 (스키마에 없으면 조용히 strip된다)", () => {
    for (const { id, field } of RESIDENT_AXIS) {
      const form = { ...(getReductionDefault(id) as AssetReductionForm) } as Record<string, unknown>;
      form[field] = field === "isHousingConstructionBusiness99" ? true : false;
      const [converted] = toEngineReductions([form as AssetReductionForm], "purchase");
      const parsed = reductionSchema.parse(converted) as Record<string, unknown>;
      expect(field in parsed, `${id}.${field} — ⑫`).toBe(true);
      expect(parsed[field], `${id}.${field} — ⑫ 값`).toBe(
        field === "isHousingConstructionBusiness99" ? true : false,
      );
    }
  });

  it("D11-05-4: 기본값 그대로도 ④⑫를 통과해 값이 살아 나간다", () => {
    for (const { id, field, def } of RESIDENT_AXIS) {
      const [converted] = toEngineReductions(
        [getReductionDefault(id) as AssetReductionForm],
        "purchase",
      );
      const parsed = reductionSchema.parse(converted) as Record<string, unknown>;
      expect(parsed[field], `${id}.${field}`).toBe(def);
    }
  });

  it("D11-05-5: ⑤ 각 폼에 요건 위젯이 그려진다", async () => {
    const cases: Array<[string, RegExp]> = [
      ["Unsold98InputForm", /^거주자$/],
      ["Unsold982InputForm", /^거주자$/],
      ["Unsold987InputForm", /^내국인$/],
      ["Unsold988InputForm", /^거주자$/],
    ];
    for (const [name, label] of cases) {
      cleanup();
      const mod = await import(`@/components/calc/transfer/${name}`);
      const Form = mod[name] as React.ComponentType<{ value: unknown; onChange: () => void }>;
      const id = name === "Unsold98InputForm" ? "unsold_98"
        : name === "Unsold982InputForm" ? "unsold_98_2"
        : name === "Unsold987InputForm" ? "unsold_98_7"
        : "unsold_98_8";
      render(<Form value={getReductionDefault(id) as never} onChange={vi.fn()} />);
      expect(screen.getAllByText(label).length, name).toBeGreaterThan(0);
    }
  });

  it("D11-05-6: 🔴 ①b 마이그레이션 — 저장된 구 폼의 undefined가 「비거주자」로 읽히지 않는다", () => {
    const stale = [
      { type: "unsold_98" },
      { type: "unsold_98_2" },
      { type: "unsold_98_7" },
      { type: "unsold_98_8" },
      { type: "new_99" },
    ] as unknown as AssetReductionForm[];
    const migrated = migrateAsset({ reductions: stale }).reductions as unknown as Record<
      string,
      unknown
    >[];
    const byType = Object.fromEntries(migrated.map((m) => [m.type as string, m]));
    for (const { id, field, def } of RESIDENT_AXIS) {
      expect(byType[id][field], `${id}.${field}`).toBe(def);
    }
  });

  it("D11-05-7: §98의7 안내가 「거주자 한정 아님」이라고 말하지 않는다 (조특법 §2①1호)", async () => {
    const { Unsold987InputForm } = await import("@/components/calc/transfer/Unsold987InputForm");
    render(
      <Unsold987InputForm value={getReductionDefault("unsold_98_7") as never} onChange={vi.fn()} />,
    );
    expect(document.body.textContent).not.toContain("거주자 한정 아님");
    expect(document.body.textContent).toContain("개인이라면 거주자여야 합니다");
  });

  /**
   * 종단 실측 — 배선이 **실제로 물리는지**. 요건 필드를 이어도 엔진 게이트에 닿지 않으면
   * 배선은 무의미하다(memory `feedback_api_trigger_without_input_path_is_noop`).
   */
  describe("D11-05-8 §99 종단 — 게이트가 세액을 가른다", () => {
    const rates = makeMockRates();
    const D = (v: string) => new Date(v);
    const run = (over: Record<string, unknown>) =>
      calculateTransferTax(
        baseTransferInput({
          transferPrice: 900_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: D("1999-01-01"),
          transferDate: D("2024-08-01"),
          householdHousingCount: 2,
          reductions: [
            {
              type: "new_99",
              contractDate99: D("1998-06-01"),
              acquisitionType99: "from_builder",
              isNationalHousing99: true,
              standardPriceAtAcquisition99: 100_000_000,
              standardPriceAt5Years99: 160_000_000,
              standardPriceAtTransfer99: 250_000_000,
              ...over,
            },
          ] as never,
        }),
        rates,
      );

    it("거주자 — §99① 차감이 적용된다", () => {
      expect(run({ isResident99: true, isHousingConstructionBusiness99: false }).determinedTax).toBe(
        74_870_000,
      );
    });

    it("🔴 비거주자 — 감면 전액 배제 (66,190,000원 차이)", () => {
      const excluded = run({ isResident99: false, isHousingConstructionBusiness99: false });
      expect(excluded.determinedTax).toBe(141_060_000);
      expect(excluded.determinedTax - 74_870_000).toBe(66_190_000);
    });

    it("🔴 주택건설사업자 — §99① 괄호로 배제된다", () => {
      expect(run({ isResident99: true, isHousingConstructionBusiness99: true }).determinedTax).toBe(
        141_060_000,
      );
    });

    it("🔑 종전 동작 재현 — 필드 미지정이면 거주자로 간주됐다 (그래서 사문이었다)", () => {
      expect(run({}).determinedTax).toBe(74_870_000);
    });
  });
});
