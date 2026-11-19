/**
 * 판정 메뉴 ↔ 핸드오프 계산기 결론 parity 게이트 (2026-11 리뷰 I-01 · PR-0).
 *
 * 평가셋에서 form이 있는 케이스를 두 경로로 돌려 결론(`isExempt`·`isPartialExempt`)이 같은지 본다.
 * - 판정 메뉴: 폼 → ④ → ⑫ → route ⑭ → 엔진 (`runJudgment`)
 * - 계산기: 같은 폼 → 핸드오프(`toTransferFormPatch`) → 계산기 ④ → ⑫ → route ⑭ → 엔진 (`runCalc`)
 * 설계 전제(`one-house-judgment-handoff.ts` D-3 「사실이 같으면 같은 답」)를 평가셋 규모로 지키는 안전망이다.
 * 지금 결함을 잡는 장치가 아니라 앞으로 생길 drift를 막는다 — 리뷰 시점 의도하지 않은 이탈은 0건이었다.
 *
 * 규칙
 * - 계산기 ⑧은 결론 대조의 전제로 쓰지 않는다 — 판정 메뉴가 묻지 않는 칸(소재지·취득가액)에서 전 케이스가 막힌다.
 *   대신 결론과 무관한 계산기 전용 금액 칸을 중립값으로 채운다(`neutralFill`, 권리가액은 1억·5억 결론 차이 0건 실측).
 * - 판정 메뉴 전용 사실(비거주자·잔금 전 멸실)이 있는 케이스는 결론을 맞추지 않는다 — 핸드오프가 일부러 넘기지 않는다
 *   (사용자 결정 「비거주자=판정 메뉴만」·#46). 허용은 id 목록이 아니라 그 키들의 기본값 이탈 술어로 둔다.
 *   이때도 「메뉴가 비과세인데 계산기가 과세」는 막는다(전용 사실은 비과세를 거두는 쪽으로만 작동한다).
 * - 중립값을 채워도 계산기가 400인 케이스는 대조하지 못한다 — 상한을 단언해 대조 범위가 조용히 줄지 않게 한다.
 *
 * 변형 「양도 주택 2호 ON」(D-46 재발 방지)
 * - 판정 메뉴와 중과 메뉴는 같은 store를 쓴다. 중과 메뉴에서 양도 주택 자신의 §167의3①2호(장기임대) 선언을 켜면
 *   그 선언이 핸드오프로 계산기에 실린다. 1주택 메뉴 ④는 싣지 않는다. 같은 사실관계이므로 결론이 같아야 한다.
 * - 지금은 D-46(⑳ 명부 장기임대 행 술어가 양도 행을 거르지 않음) 때문에 갈린다. 갈리는 케이스를 `D46_KNOWN_DIVERGENT`에
 *   고정한다 — PR-18이 고치면 이 목록을 비워야 통과하고, 새 갈림이 생겨도 실패한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import fs from "node:fs";
import path from "node:path";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import {
  oneHouseJudgmentNonResidentDefaults,
  oneHouseJudgmentDemolishedDefaults,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { buildCaseForm, type RulingCase } from "./harness";
import { handoff, runCalc, runJudgment, withToday } from "../one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const CASE_DIR = path.join(__dirname, "cases");
const cases: RulingCase[] = fs
  .readdirSync(CASE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((f) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(CASE_DIR, f), "utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  })
  .filter((c: RulingCase) => c.form);

/** 중립값을 채워도 계산기가 400인 케이스 수의 상한(리뷰 실측: 인가일 미입력 입주권 6 · 이월과세 증여 평가액 7). */
const MAX_UNCOMPARABLE = 13;

/** D-46 — 「양도 주택 2호 ON」 변형에서 지금 결론이 갈리는 케이스. PR-18이 고치면 비운다. */
const D46_KNOWN_DIVERGENT: string[] = ["E132-current", "E132-era", "E193-current", "E193-era", "E194-era"];

/** 판정 메뉴 전용 사실이 기본값에서 벗어났는가 — 핸드오프가 넘기지 않는 키(`toTransferFormPatch` extras와 같은 원천). */
function menuOnlyFactsPresent(form: OneHouseJudgmentFormData): boolean {
  const defaults: Record<string, unknown> = { ...oneHouseJudgmentNonResidentDefaults, ...oneHouseJudgmentDemolishedDefaults };
  const f = form as unknown as Record<string, unknown>;
  return Object.keys(defaults).some((k) => JSON.stringify(f[k] ?? null) !== JSON.stringify(defaults[k] ?? null));
}

/**
 * 계산기에만 있는 금액 칸 — 결론과 무관한 값으로 채운다. 판정 메뉴가 받은 칸은 건드리지 않는다.
 * ⚠️ 소재지(`addressJibun`)는 채우지 않는다 — 주소 문자열이 있으면 계산기가 그 문자열로 취득 당시 조정대상지역을 다시 판정해
 *    폼의 `wasRegulatedAtAcquisition`과 다른 결론을 낸다(가짜 주소로 거주요건 사안 13건이 비과세로 뒤집힘 — 2026-11-20 실측).
 */
function neutralFill(t: TransferFormData): TransferFormData {
  const assets = t.assets.map((a, i) =>
    i === 0
      ? {
          ...a,
          fixedAcquisitionPrice: a.fixedAcquisitionPrice || "100000000",
          redevRightsValue: a.redevRightsValue || "100000000",
        }
      : a,
  );
  return { ...t, assets } as TransferFormData;
}

/** 중과 메뉴 「양도 주택이 장기임대주택(§167의3①2호)」 선언 — 같은 store라 핸드오프로 계산기에 실린다. */
function withSellingRental2ho(form: OneHouseJudgmentFormData): OneHouseJudgmentFormData {
  return {
    ...form,
    sellingHouseExclusion: {
      ...(form.sellingHouseExclusion ?? {}),
      longTermRental: {
        isLongTermRental: true,
        isRegisteredRental: true,
        rentalRegistrationDate: "2012-01-02",
        businessRegistrationDate: "2012-01-02",
      },
    },
  } as OneHouseJudgmentFormData;
}

type Verdict = { ex: boolean; partial: boolean };
type Pair = { menu: Verdict | null; calc: Verdict | null; menuStatus: number; calcStatus: number; calcErr?: string };

async function runPair(c: RulingCase, form: OneHouseJudgmentFormData): Promise<Pair> {
  return withToday(c.today, async () => {
    const m = await runJudgment(form);
    const k = await runCalc(neutralFill(handoff(form)));
    const j = m.data?.judgment;
    return {
      menuStatus: m.status,
      calcStatus: k.status,
      menu: m.status === 200 && j ? { ex: j.isExempt === true, partial: j.isPartialExempt === true } : null,
      calc: k.status === 200 && k.result ? { ex: k.result.isExempt === true, partial: k.result.isPartialExempt === true } : null,
    };
  });
}

const uncomparable: string[] = [];
const d46Divergent: string[] = [];

describe("판정 메뉴 ↔ 핸드오프 계산기 결론 parity (I-01)", () => {
  it("대조할 케이스가 있다", () => {
    expect(cases.length).toBeGreaterThan(400);
  });

  for (const c of cases) {
    it(`[${c.id}] 결론이 같다`, async () => {
      const form = buildCaseForm(c);
      const p = await runPair(c, form);
      expect(p.menuStatus, "판정 메뉴 route는 평가셋 전 케이스에서 200이다").toBe(200);
      if (!p.calc) {
        uncomparable.push(c.id);
        return;
      }
      if (menuOnlyFactsPresent(form)) {
        expect(p.menu!.ex && !p.calc.ex, "메뉴 전용 사실은 비과세를 거두는 쪽으로만 갈린다").toBe(false);
        return;
      }
      expect(p.calc, `메뉴 ${JSON.stringify(p.menu)} · 계산기 ${JSON.stringify(p.calc)}`).toEqual(p.menu);
    });
  }

  it(`중립값으로도 계산기가 400인 케이스는 ${MAX_UNCOMPARABLE}건 이하다`, () => {
    expect(uncomparable.length, uncomparable.join(", ")).toBeLessThanOrEqual(MAX_UNCOMPARABLE);
  });
});

describe("변형 「양도 주택 2호 ON」 — 같은 store를 쓰는 중과 메뉴 선언 (D-46 재발 방지)", () => {
  const housing = cases.filter((c) => {
    const kind = (c.form?.asset as { assetKind?: string } | undefined)?.assetKind;
    return !kind || kind === "housing";
  });

  for (const c of housing) {
    it(`[${c.id}] 2호 ON에서도 결론이 같다(알려진 갈림 제외)`, async () => {
      const form = withSellingRental2ho(buildCaseForm(c));
      if (menuOnlyFactsPresent(form)) return;
      const p = await runPair(c, form);
      if (!p.menu || !p.calc) return;
      const same = p.menu.ex === p.calc.ex && p.menu.partial === p.calc.partial;
      if (!same) d46Divergent.push(c.id);
      if (D46_KNOWN_DIVERGENT.includes(c.id)) return;
      expect(p.calc, `메뉴 ${JSON.stringify(p.menu)} · 계산기 ${JSON.stringify(p.calc)}`).toEqual(p.menu);
    });
  }

  it("알려진 갈림 목록이 실제 갈림과 같다(PR-18이 고치면 목록을 비운다)", () => {
    expect([...d46Divergent].sort()).toEqual([...D46_KNOWN_DIVERGENT].sort());
  });
});
