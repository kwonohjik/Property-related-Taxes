/**
 * @vitest-environment jsdom
 *
 * anchor — PR8b: §155① 일시적 2주택·§155⑦⑧ 계열의 **판정 사유·검토표·고지·카드** 7건
 *
 * | id | 결함 | 이 파일의 단언 |
 * |---|---|---|
 * | S07-3 | 기준일 전에 기한이 지난 §89② 3년·§155⑧·§155⑦3호의 과세 사유가 결과에서 사라짐 | `…:deadline-lapsed` 사유가 남는다(결론 불변) |
 * | S07-4 | §155⑧·⑦3호 기한 안내가 기한일 기준 §154① 보유 2년을 확인하지 않고 약속 | 보유가 모자라면 pending 없이 사유 |
 * | X2-1 | 2026.10.1. 이후 조정대상지역 단축 규정을 ①2호로 인용(현행은 ①1호) | 양도일 연혁별 호 표기 |
 * | S07-6 | 2012.6.29. 전 양도분 검토표 1년 행이 §155⑯ 지방이전 면제로 표시 | not_required · §155① |
 * | S07-5 | D3(⑦ 농어촌 + 일시적 2주택 3주택) 사유가 「2주택에만 적용」으로 엔진과 모순 | 기한 경과 사유·pending·검토표 |
 * | S15-9 | 3주택 세대 판정 카드가 「요건 충족」 | 「세대 주택 N채」 안내 |
 * | S11-6 | 판정 카드가 §154⑧3호 동일세대 상속 통산을 빼 엔진과 반대로 표시 | 카드 = 엔진 |
 *
 * 경로: 판정 메뉴 폼 → ④ → ⑫ → ⑭ route → 결과뷰 렌더(판정 메뉴 실제 화면 경로). 법령은 법제처 시행본 원문으로 확인했다
 * (「소득세법 시행령」 §155①: MST 290841 · 242735 · 214635 · 207800 · 122788).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { TempTwoHouseRegulatedInputs } from "@/components/calc/transfer/TempTwoHouseRegulatedInputs";
import { ImportedOneHouseFactsCard, type ImportedSpecialsSlice } from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";
import { regulatedShortenedClauseRefOf } from "@/lib/calc/one-house-era-labels";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { RETURN_TO_FARM_ROW_OK } from "../_helpers/rural-return-to-farm-facts";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function mkCase(today: string, form: Record<string, unknown>): RulingCase {
  return { id: "pr8b", docNo: "-", docDate: "-", basis: "current", today, summary: "", bucket: "match", form } as unknown as RulingCase;
}

/** 판정 메뉴 전 구간 — 폼 → ④ → route → (선택) 결과뷰 텍스트. */
async function judge(c: RulingCase, renderView = true) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const errors = validateAllSteps(form).filter((e) => e.severity === "error").map((e) => `${e.field}: ${e.message}`);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    const j = json?.data?.judgment ?? {};
    let text = "";
    if (renderView && res.status === 200) {
      const { container } = render(<OneHouseJudgmentResultView result={json.data} transferDate={form.transferDate} />);
      text = container.textContent ?? "";
      cleanup();
    }
    return {
      status: res.status,
      errors,
      isExempt: j.isExempt as boolean,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applied: (j.appliedExceptions ?? []).map((x: any) => x.id as string),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pending: (j.pending ?? []).map((p: any) => `${p.id}@${String(p.deadline).slice(0, 10)}`) as string[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unmet: Object.fromEntries((j.unmetExceptions ?? []).map((u: any) => [u.id, u.reasons as string[]])) as Record<string, string[]>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undeterminedReasons: (j.undetermined ?? []).map((u: any) => `${u.id} :: ${u.reason}`) as string[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviewScheme: j.requirementReview?.scheme as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviewItems: (j.requirementReview?.items ?? []) as any[],
      text,
    };
  } finally {
    vi.useRealTimers();
  }
}

const joined = (u: Record<string, string[]>, key: string) => (u[key] ?? []).join("\n");

// ═══ S07-3 · 기준일 전에 기한이 지난 축의 과세 사유 ═══════════════════════════════════════════
// §89② 3년(「소득세법」 제89조제2항·시행령 제156조의2제3항) · §155⑧ · §155⑦3호(MST 290841 원문)
const G105 = (today: string) =>
  mkCase(today, {
    isOneHousehold: true, transferDate: "2026-06-15", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15" },
    presaleRights: [{ id: "B", type: "redevelopment_right", memberOrigin: "successor", acquisitionDate: "2023-02-15", region: "capital", managementDisposalApprovalDate: "2021-06-15" }],
    rightThreeYearExceptionKind: "none",
  });
const U1 = (today: string) =>
  mkCase(today, {
    isOneHousehold: true, transferDate: "2025-06-02", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-01-10" },
    houses: [{ id: "u", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2018-03-01", oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2020-01-15" }],
  });
const RURAL_3HO = { id: "rural", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2020-01-10", oneHouseRuralHouse: true, ruralHouseKind: "return_to_farm", ...RETURN_TO_FARM_ROW_OK, ruralOutsideCapitalEupMyeon: true, ruralLandAreaSqm: "300", ruralWholeHouseholdMoved: true, ruralHighPriceAtAcquisition: false, ruralReturnedToFarmExitHouse: false };
const R2 = (today: string) =>
  mkCase(today, {
    isOneHousehold: true, transferDate: "2025-07-01", contractTotalPrice: "900000000",
    asset: { assetKind: "housing", acquisitionDate: "2019-06-01" },
    houses: [RURAL_3HO],
  });

describe("S07-3 기준일 전에 기한이 지난 「이 날까지 양도」 — 과세 사유가 남는다", () => {
  it("§89② 3년 경과(입주권 취득 2023-02-15 → 기한 2026-02-19, 기준일 2026-10-07): 과세 + 기한 경과 사유", async () => {
    const r = await judge(G105("2026-10-07"));
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]); // 이룰 수 없는 기한은 안내하지 않는다(종전 동작 유지)
    const reasons = joined(r.unmet, "156-2-3-right-three-year:deadline-lapsed");
    expect(reasons).toContain("2026-02-19");
    expect(reasons).toContain("판정 기준일(2026-10-07)");
    expect(r.text).toContain("§89 ②"); // 사유 카드의 근거 조문 배지
    expect(r.text).toContain("판정 기준일(2026-10-07) 전에 지나");
  });

  it("§155⑧ 해소일 2020-01-15 → 3년 기한 2023-01-16(월), 기준일 2026-10-10", async () => {
    const r = await judge(U1("2026-10-10"));
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
    expect(joined(r.unmet, "155-8-unavoidable-resolved:deadline-lapsed")).toContain("2023-01-16");
    expect(r.text).toContain("소득세법 시행령 §155⑧");
  });

  it("§155⑦3호 귀농주택 2020-01-10 → 5년 기한 2025-01-10, 기준일 2025-03-01", async () => {
    const r = await judge(R2("2025-03-01"));
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
    expect(joined(r.unmet, "155-7-3ho-return-to-farm:deadline-lapsed")).toContain("2025-01-10");
    expect(r.text).toContain("귀농");
  });

  it("긍정 짝 — 기준일이 기한 전이면 pending만 있고 기한 경과 사유는 없다", async () => {
    const a = await judge(G105("2026-02-01"));
    expect(a.pending).toContain("156-2-3-right-three-year@2026-02-19");
    expect(Object.keys(a.unmet).some((k) => k.endsWith(":deadline-lapsed"))).toBe(false);
    const b = await judge(U1("2023-01-10"));
    expect(b.pending).toContain("155-8-unavoidable-resolved@2023-01-16");
    expect(Object.keys(b.unmet).some((k) => k.endsWith(":deadline-lapsed"))).toBe(false);
    const c = await judge(R2("2025-01-05"));
    expect(c.pending).toContain("155-7-3ho-return-to-farm@2025-01-10");
    expect(Object.keys(c.unmet).some((k) => k.endsWith(":deadline-lapsed"))).toBe(false);
  });

  it("§155① 처분기한은 검토표가 이미 사유를 말하므로 같은 사유를 되풀이하지 않는다", async () => {
    // 종전 2018-01-10 · 신규 2021-03-02(비조정) → 처분기한 2024-03-04(월). 기준일 2026-10-10.
    const r = await judge(
      mkCase("2026-10-10", {
        isOneHousehold: true, transferDate: "2025-06-02", contractTotalPrice: "800000000",
        asset: { assetKind: "housing", acquisitionDate: "2018-01-10", residenceInputMode: "direct", residencePeriodMonthsAsset: "30" },
        houses: [{ id: "b", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2021-03-02" }],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.reviewScheme).toBe("155-1-temporary-two-house");
    expect(Object.keys(r.unmet).some((k) => k.endsWith(":deadline-lapsed"))).toBe(false);
    expect(r.reviewItems.find((i) => i.id === "disposal-deadline")?.note).toContain("판정 기준일(2026-10-10) 전에 지나");
  });
});

// ═══ S07-4 · 기한일 기준 §154① 보유 2년 ═══════════════════════════════════════════════════
// §155⑦ 단서·⑧ 「제154조제1항을 적용한다」(MST 290841 원문)
const U = (transfer: string, gen: string) =>
  mkCase("2024-01-02", {
    isOneHousehold: true, transferDate: transfer, contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: gen },
    houses: [{ id: "u", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2018-03-02", oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2022-01-03" }],
  });
const R = (transfer: string, gen: string) =>
  mkCase("2024-01-02", {
    isOneHousehold: true, transferDate: transfer, contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: gen },
    houses: [RURAL_3HO],
  });

describe("S07-4 기한 안내는 기한일 기준 §154① 보유 2년까지 확인한다", () => {
  it("§155⑧ — 일반주택 2023-06-01 취득: 기한(2025-01-03)에 보유 2년 미달 → pending 없음 + 사유", async () => {
    const r = await judge(U("2025-07-01", "2023-06-01"));
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.pending.filter((p) => p.startsWith("155-8-"))).toEqual([]);
    const why = joined(r.unmet, "155-8-unavoidable:work");
    expect(why).toContain("2025-01-03");
    expect(why).toContain("보유 2년");
    expect(r.text).not.toContain("양도일을 조정하면 요건을 갖출 수 있습니다");
  });

  it("§155⑦3호 — 일반주택 2023-06-01 취득: 기한(2025-01-10)에 보유 2년 미달 → pending 없음 + 사유", async () => {
    const r = await judge(R("2025-07-01", "2023-06-01"));
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.pending.filter((p) => p.startsWith("155-7-3ho"))).toEqual([]);
    const why = joined(r.unmet, "155-7-rural:return_to_farm");
    expect(why).toContain("2025-01-10");
    expect(why).toContain("보유 2년");
  });

  it("긍정 짝 — 일반주택 2020-01-01 / 2019-06-01 취득이면 pending이 유지되고 기한일 양도는 비과세", async () => {
    const a = await judge(U("2025-07-01", "2020-01-01"), false);
    expect(a.pending).toContain("155-8-unavoidable-resolved@2025-01-03");
    expect(Object.keys(a.unmet)).toEqual([]);
    expect((await judge(U("2025-01-03", "2020-01-01"), false)).isExempt).toBe(true);
    const b = await judge(R("2025-07-01", "2019-06-01"), false);
    expect(b.pending).toContain("155-7-3ho-return-to-farm@2025-01-10");
    expect((await judge(R("2025-01-10", "2019-06-01"), false)).isExempt).toBe(true);
  });
});

// ═══ X2-1 · 조정대상지역 처분기한 단축 규정의 호 표기 ═══════════════════════════════════════════
describe("X2-1 조정대상지역 단축 규정 인용 — 양도일 연혁", () => {
  const ymd = (s: string | undefined) => regulatedShortenedClauseRefOf(s);

  it("연혁 경계: 2018.10.23.~2020.2.10. 호 없음 · 2020.2.11.~2023.1.11. ①2호 · 2023.1.12.~2026.9.30. 단축 없음 · 2026.10.1.~ ①1호", () => {
    expect(ymd("2018-10-23")).toBe("①");
    expect(ymd("2020-02-10")).toBe("①");
    expect(ymd("2020-02-11")).toBe("①2호");
    expect(ymd("2023-01-11")).toBe("①2호");
    expect(ymd("2023-01-12")).toBe("①");
    expect(ymd("2026-09-30")).toBe("①");
    expect(ymd("2026-10-01")).toBe("①1호");
    expect(ymd(undefined)).toBe("①");
  });

  const mk = (today: string, transfer: string, prev: string, nw: string) =>
    mkCase(today, {
      isOneHousehold: true, transferDate: transfer, contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: prev, residenceInputMode: "direct", residencePeriodMonthsAsset: "30" },
      houses: [{ id: "b", region: "capital", acquisitionOrigin: "general", acquisitionDate: nw }],
    });
  async function cite(c: RulingCase) {
    const r = await judge(c, false);
    const reason = r.undeterminedReasons.find((u) => u.startsWith("155-1-regulated-at-new-acquisition-unverified")) ?? "";
    const form = buildCaseForm(c);
    const card = judgmentTempTwoHouseVerdict(form, judgmentDerivedNewHouse(form)) as { regulated: Parameters<typeof TempTwoHouseRegulatedInputs>[0]["regulated"] };
    const { container } = render(
      <TempTwoHouseRegulatedInputs form={form as never} onChange={() => {}} regulated={card.regulated} newHouseAcquisitionDate="x" />,
    );
    const text = container.textContent ?? "";
    cleanup();
    return { reason, text };
  }

  // #30·#32 — 조정 여부 미입력 고지는 **결론이 갈릴 때만** 나온다. 인용 문구를 보려면 조정→조정 단축 기한(2년)은 지났고 본문 3년은
  //   안인 양도(= 두 독법의 결론이 다른 양도)여야 한다.
  it("2028-10-05 양도 · 신규 2026-08-21(2년 도과·3년 이내) — 고지·카드 제목이 ①1호를 가리키고 ①2호를 가리키지 않는다", async () => {
    const { reason, text } = await cite(mk("2028-10-06", "2028-10-05", "2020-01-10", "2026-08-21"));
    expect(reason).toContain("소득세법 시행령 §155①1호");
    expect(reason).not.toContain("①2호");
    expect(text).toContain("조정대상지역 처분기한 (§155①1호)");
    expect(text).not.toContain("§155①2호)");
  });

  it("짝 — 2022-06-01 양도는 ①2호가 맞다(유지 — 신규 2020-03-02: 2년 도과·3년 이내)", async () => {
    const { reason, text } = await cite(mk("2022-06-02", "2022-06-01", "2018-01-10", "2020-03-02"));
    expect(reason).toContain("소득세법 시행령 §155①2호");
    expect(text).toContain("조정대상지역 처분기한 (§155①2호)");
  });

  it("짝 — 2019-06-01 양도(호 없는 본문 괄호)는 ①만 인용한다 — 카드 제목. 이 시기엔 두 독법의 결론이 갈릴 수 없어 고지는 나오지 않는다(#30)", async () => {
    const { reason, text } = await cite(mk("2019-06-02", "2019-06-01", "2017-01-10", "2018-11-02"));
    // 2018-10-23~2020-02-10 양도의 조정→조정 2년은 신규 취득이 2018-09-14 이후일 때뿐이라, 양도가 2년을 넘기려면 2020-02-11 이후여야 한다.
    expect(reason).toBe("");
    expect(text).toContain("조정대상지역 처분기한 (§155①)");
  });

  it("계산기 「넘겨받은 사실」 라벨도 양도일 연혁을 따른다", () => {
    const f = (over: Partial<ImportedSpecialsSlice>) => ({
      ...(createDefaultTransferFormData() as unknown as ImportedSpecialsSlice),
      prevHouseRegulatedAtNewAcquisition: "yes" as const,
      newHouseRegulatedAtAcquisition: "yes" as const,
      ...over,
    });
    const labels = (transferDate: string) => {
      const { container } = render(<ImportedOneHouseFactsCard facts={undefined} specials={f({})} transferDate={transferDate} />);
      const t = container.textContent ?? "";
      cleanup();
      return t;
    };
    expect(labels("2026-10-05")).toContain("신규 주택 취득 당시 종전 주택 (§155①1호)");
    expect(labels("2026-10-05")).not.toContain("§155①2호)");
    expect(labels("2022-06-01")).toContain("신규 주택 취득 당시 신규 주택 (§155①2호)");
  });
});

// ═══ S07-6 · 2012.6.29. 전 양도분 검토표 1년 행 ═══════════════════════════════════════════════
describe("S07-6 2012.6.29. 전 양도 — 검토표 1년 행은 「요건 없음」", () => {
  const mk = (today: string, transfer: string, prev: string, nw: string) =>
    mkCase(today, {
      isOneHousehold: true, transferDate: transfer, contractTotalPrice: "500000000",
      asset: { assetKind: "housing", acquisitionDate: prev },
      houses: [{ id: "n", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: nw }],
    });
  const oneYear = async (c: RulingCase) => {
    const r = await judge(c, true);
    return { item: r.reviewItems.find((i) => i.id === "one-year"), text: r.text };
  };

  it("2007 양도(1년 내 신규) — not_required · §155① · ⑯·지방이전이 아니다", async () => {
    const { item, text } = await oneYear(mk("2007-05-15", "2007-05-01", "2004-01-10", "2004-06-01"));
    expect(item?.status).toBe("not_required");
    expect(item?.legalBasis).toBe("소득세법 시행령 §155①");
    expect(item?.note).toContain("제23887호");
    expect(item?.note).not.toContain("지방이전");
    expect(item?.facts.map((f: { label: string }) => f.label)).not.toContain("1년 경과일");
    expect(text).not.toContain("지방이전");
  });

  it("경계 — 2012-06-28 양도는 요건 없음, 2012-06-29 양도부터 요건 있음(1년 내 신규 → unmet · §155①)", async () => {
    expect((await oneYear(mk("2012-06-29", "2012-06-28", "2010-01-10", "2010-06-01"))).item?.status).toBe("not_required");
    const after = (await oneYear(mk("2012-06-30", "2012-06-29", "2010-01-10", "2010-06-01"))).item;
    expect(after?.status).toBe("unmet");
    expect(after?.legalBasis).toBe("소득세법 시행령 §155①");
  });

  it("짝 — 2013 양도 · 실제 1년 경과는 met", async () => {
    expect((await oneYear(mk("2013-05-15", "2013-05-01", "2010-01-10", "2011-06-01"))).item?.status).toBe("met");
  });
});

// ═══ S07-5 · D3 사유 ═══════════════════════════════════════════════════════════════════════
// 서면인터넷방문상담4팀-977 · 엔진 E-3 `ruralTemporaryTwoHouseOverlapCountHolds` — 농어촌주택이 겹친 3주택은 §155① 분기다.
describe("S07-5 D3(⑦ 농어촌 + 일시적 2주택 3주택) — 엔진 규칙과 표시층이 같은 말을 한다", () => {
  const RURAL = { ...RURAL_3HO, acquisitionDate: "2022-01-10" };
  const NEW = { id: "new", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2023-09-01" };
  const f = (transferDate: string, houses: unknown[]) => ({
    isOneHousehold: true, transferDate, contractTotalPrice: "900000000",
    asset: { assetKind: "housing", acquisitionDate: "2019-06-01" }, houses,
  });
  const COUNT_REASON = /2주택\)? 보유한 세대가 일반주택을 양도하는 경우에만/;

  it("D3x(2026-09-15 양도 · 처분기한 2026-09-01 경과) — 사유는 기한 경과, pending·검토표가 2주택과 같다", async () => {
    const r = await judge(mkCase("2026-08-01", f("2026-09-15", [RURAL, NEW])));
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(false);
    const all = Object.values(r.unmet).flat().join("\n");
    expect(all).not.toMatch(COUNT_REASON);
    expect(joined(r.unmet, "155-1-temporary-two-house")).toContain("처분기한 3년의 말일(2026-09-01)이 지난 2026-09-15에 양도했습니다");
    expect(r.pending).toContain("155-1-disposal-deadline@2026-09-01");
    expect(r.reviewScheme).toBe("155-1-temporary-two-house");
    const row = r.reviewItems.find((i) => i.id === "disposal-deadline");
    expect(row?.status).toBe("unmet");
    expect(row?.note).toContain("2026-09-01까지 양도하면 이 요건을 충족합니다");
    expect(r.text).toContain("양도일을 조정하면 요건을 갖출 수 있습니다");
  });

  it("긍정 짝 — D3ok(2026-08-20)는 비과세이고 검토표가 실린다", async () => {
    const r = await judge(mkCase("2026-08-01", f("2026-08-20", [RURAL, NEW])), false);
    expect(r.isExempt).toBe(true);
    expect(r.applied).toEqual(expect.arrayContaining(["155-1-temporary-two-house", "155-7-rural:return_to_farm"]));
    expect(r.reviewScheme).toBe("155-1-temporary-two-house");
  });

  it("대조 — 농어촌 행을 뺀 2주택도 같은 날짜에 같은 pending", async () => {
    const r = await judge(mkCase("2026-08-01", f("2026-09-15", [NEW])), false);
    expect(r.pending).toContain("155-1-disposal-deadline@2026-09-01");
  });

  it("부정 짝 — 농어촌주택 요건 미충족(읍·면 아님)이면 겹침이 아니므로 「2주택에만 적용」 사유가 남는다", async () => {
    const notEligible = { ...RURAL, ruralOutsideCapitalEupMyeon: false };
    const r = await judge(mkCase("2026-08-01", f("2026-08-20", [notEligible, NEW])), false);
    expect(r.isExempt).toBe(false);
    expect(Object.values(r.unmet).flat().join("\n")).toMatch(COUNT_REASON);
    expect(r.pending).toEqual([]);
    expect(r.reviewScheme).toBeUndefined();
  });
});

// ═══ S15-9 · 3주택 세대 판정 카드 ═══════════════════════════════════════════════════════════
describe("S15-9 3주택 세대 §155① 판정 카드 — 「요건 충족」을 말하지 않는다", () => {
  const f = (houses: unknown[]) => ({
    isOneHousehold: true, transferDate: "2026-06-01", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-01" }, houses,
  });
  const B = { id: "b", region: "capital", acquisitionOrigin: "general", acquisitionDate: "2010-03-01" };
  const C = { id: "c", region: "capital", acquisitionOrigin: "general", acquisitionDate: "2024-03-01" };
  const card = (houses: unknown[]) => {
    const { container } = render(<Step2 form={buildCaseForm(mkCase("2026-06-02", f(houses)))} onChange={() => {}} />);
    return container.textContent ?? "";
  };

  it("비중첩 3주택 — 「일시적 2주택 특례 요건 충족」이 없고 세대 주택 3채 안내가 있다", () => {
    const t = card([B, C]);
    expect(t).not.toContain("일시적 2주택 특례 요건 충족");
    expect(t).toContain("일시적 2주택 특례 — 세대 주택 3채");
    expect(t).toContain("겹친 경우가 아니면 대상이 아닙니다");
  });

  it("긍정 짝 — 2주택은 「요건 충족」 표시, 3채 안내는 없다", () => {
    const t = card([C]);
    expect(t).toContain("일시적 2주택 특례 요건 충족");
    expect(t).not.toContain("세대 주택 3채");
  });
});

// ═══ S11-6 · 카드 ↔ 엔진 §154⑧3호 동일세대 상속 통산 ═════════════════════════════════════════
describe("S11-6 판정 카드의 1년 요건 면제 — 엔진과 같은 거주 개월(§154⑧3호 통산)", () => {
  const form = (sameHousehold: boolean, residence: string) => ({
    isOneHousehold: true, transferDate: "2025-03-01", contractTotalPrice: "800000000", isRegulatedArea: false,
    provisoReason: "unavoidable",
    asset: {
      assetKind: "housing", acquisitionDate: "2024-01-01", acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2015-01-01", decedentSameHouseholdBeforeInheritance: sameHousehold,
      decedentCohabitationHoldingStartDate: "2019-01-01", decedentCohabitationResidenceMonths: "60",
      residencePeriodMonthsAsset: residence,
    },
    houses: [{ id: "new", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2024-06-01" }],
  });
  async function both(sameHousehold: boolean, residence: string) {
    const c = mkCase("2025-03-01", form(sameHousehold, residence));
    const r = await judge(c, false);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-03-01T03:00:00Z"));
    const f = buildCaseForm(c);
    const card = judgmentTempTwoHouseVerdict(f, judgmentDerivedNewHouse(f)) as { status: string; oneYearWaived: boolean };
    vi.useRealTimers();
    return { r, card };
  }

  it("동일세대 상속 통산(상속 후 6개월 + 상속 전 60개월) — 카드도 1년 요건 면제(eligible), 엔진 비과세와 일치", async () => {
    const { r, card } = await both(true, "6");
    expect(r.errors).toEqual([]);
    expect(r.isExempt).toBe(true);
    expect(r.applied).toContain("154-1-proviso:unavoidable");
    expect(card.oneYearWaived).toBe(true);
    expect(card.status).toBe("eligible");
  });

  it("짝 — 동일세대가 아니면 통산하지 않는다: 카드 ineligible · 엔진 과세(상속 후 6개월 < 1년)", async () => {
    const { r, card } = await both(false, "6");
    expect(r.isExempt).toBe(false);
    expect(card.oneYearWaived).toBe(false);
    expect(card.status).toBe("ineligible");
  });

  it("짝 — 상속 후 12개월이면 통산 없이도 면제: 카드 eligible · 엔진 비과세", async () => {
    const { r, card } = await both(false, "12");
    expect(r.isExempt).toBe(true);
    expect(card.oneYearWaived).toBe(true);
    expect(card.status).toBe("eligible");
  });
});
