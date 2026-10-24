/**
 * anchor — 양도세 PHD 결과의 «환산 …가격» 이름은 주택 종류로 갈린다 (계획서 phd-appraisal-dead-end §9.4, 사용자 지시 2026-10-24)
 *
 * 소득세법 시행령 §164⑦ 산식으로 구한 취득 당시 주택가격의 이름:
 *   · 단독·다가구 → «환산 개별주택가격»   · 공동주택 → «환산 공동주택가격»   (이 둘 외의 조어 금지)
 *
 * 주택 종류는 엔진 result 에 없다 — 입력 위젯 라디오의 폼 필드 `AssetForm.phdHousingType` 에서 읽어 내려온다(표시 축 — ④ 가 싣지 않는다).
 *   P1 상세 섹션 3경우: 단독 / 공동 / 필드 없음(옛 결과) — 라벨 5곳 전부
 *   P2 단건 end-to-end: 폼 → ④ → route → 엔진 → TransferTaxResultView. 공동주택은 ④ 본문·응답이 단독과 **바이트 동일**(표시 축 — 엔진 변경 0)
 *   P3 옛 이력: phdHousingType 이 없는 formData → «환산 개별주택가격» (0·다른 값으로 바꾸지 않는다)
 *   P4 함께 양도(일괄) 카드: 자산별 폼에서 읽는다
 *   P5 다건 자산별 아코디언: property.form 에서 읽는다
 *   P6 상속주택 카드 3경로: 개별 / 공동(국토교통부) = «환산 공동주택가격» / 공동(국세청) = §164⑥ — 이번 지시 범위 밖이라 종전 문구 유지
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }), shouldBypassRateLimit: vi.fn().mockReturnValue(true) };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { InheritedHouseValuationDetailCard } from "@/components/calc/results/transfer/InheritedHouseValuationDetailCard";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { isPhdApartment, phdConvertedPriceName, phdDisclosedPriceName } from "@/components/calc/results/transfer/phd-housing-term";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import type { ReactElement } from "react";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { convertedHousePriceNames } from "@/lib/tax-engine/inheritance-house-valuation";
import type { InheritanceHouseValuationResult } from "@/lib/tax-engine/types/inheritance-house-valuation.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";
import { PHD_ELEVEN, PHD_METHODS, phdBundledForm, phdForm, runPhdCell } from "./_phd-non-estimated-fixture";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const text = (root: ParentNode = document.body) => (root.textContent ?? "").replace(/\s+/g, " ");
const count = (s: string, sub: string) => s.split(sub).length - 1;
const EST = Object.fromEntries(PHD_METHODS).est as Partial<AssetForm>;
const HOST: Partial<AssetForm> = { ...EST, ...PHD_ELEVEN, usePreHousingDisclosure: true };

const INDIVIDUAL = "환산 개별주택가격";
const APARTMENT = "환산 공동주택가격";

/** 라벨 5곳(행 라벨 1 + 산식 4)이 모두 `want` 이고 반대 이름·«추정»이 없다 */
function expectTerm(t: string, want: string, other: string) {
  expect(count(t, want), `${want} 개수`).toBe(5);
  expect(t).toContain(`${want} (취득시)`);
  expect(t).not.toContain(other);
  expect(t).not.toContain("추정");
}

describe("P1 상세 섹션 — 주택 종류별 이름 (3경우)", () => {
  const detail = () => calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT as never)!;
  const view = (props: { phdApartment?: boolean }) =>
    text(render(<PreHousingDisclosureDetailSection result={{ preHousingDisclosureDetail: detail() } as never} {...props} />).container);

  it("단독·다가구 → 환산 개별주택가격 5곳", () => expectTerm(view({ phdApartment: false }), INDIVIDUAL, APARTMENT));
  it("공동주택 → 환산 공동주택가격 5곳 · 환산 개별주택가격·추정 없음", () => expectTerm(view({ phdApartment: true }), APARTMENT, INDIVIDUAL));
  it("필드 없음(옛 결과 · prop 미전달) → 종전 표기 환산 개별주택가격", () => expectTerm(view({}), INDIVIDUAL, APARTMENT));
  it.each([
    [{ phdApartment: false }, "개별주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)", "공동주택가격 미공시 취득 환산"],
    [{ phdApartment: true }, "공동주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)", "개별주택가격 미공시 취득 환산"],
    [{}, "개별주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)", "공동주택가격 미공시 취득 환산"],
  ] as const)("머리글 3경우 — phdApartment=%j", (props, header, other) => {
    const t = view(props);
    expect(t).toContain(header);
    expect(t).not.toContain(other);
    expect(t).not.toContain("추정");
  });
  it("이름 함수·판정 함수", () => {
    expect(phdDisclosedPriceName(true)).toBe("공동주택가격");
    expect(phdDisclosedPriceName(false)).toBe("개별주택가격");
    expect(phdDisclosedPriceName(undefined)).toBe("개별주택가격");
    expect(phdConvertedPriceName(true)).toBe(APARTMENT);
    expect(phdConvertedPriceName(false)).toBe(INDIVIDUAL);
    expect(phdConvertedPriceName(undefined)).toBe(INDIVIDUAL);
    expect(isPhdApartment({ phdHousingType: "apartment" })).toBe(true);
    expect(isPhdApartment({ phdHousingType: "individual" })).toBe(false);
    expect(isPhdApartment({} as never)).toBe(false); // 옛 sessionStorage·이력 — 필드 없음
    expect(isPhdApartment(undefined)).toBe(false);
  });
});

describe("P2·P3 단건 end-to-end (폼 → ④ → route → 엔진 → 결과 뷰)", () => {
  async function single(housing: "individual" | "apartment" | "absent") {
    const over: Partial<AssetForm> = { ...HOST };
    if (housing !== "absent") over.phdHousingType = housing;
    const form = phdForm(over);
    if (housing === "absent") delete (form.assets[0] as Partial<AssetForm>).phdHousingType; // 옛 이력 — 필드 자체가 없다
    const row = await runPhdCell("single", housing, form);
    expect(row.status, row.fieldErrors).toBe(200);
    expect(row.issues, row.issueMsgs.join(" | ")).toBe(0);
    const result = (row.json as { data: { result: never } }).data.result;
    const c = render(<TransferTaxResultView result={result} formData={form} onReset={() => {}} onBack={() => {}} />).container;
    return { row, c, t: text(c) };
  }

  it("전제: PHD 상세가 실제로 렌더된다", async () => {
    const { c } = await single("individual");
    expect(c.querySelector('[data-print-section="phd"]')).not.toBeNull();
  });

  it("단독·다가구 → 환산 개별주택가격", async () => {
    const { t } = await single("individual");
    expectTerm(text(document.body.querySelector('[data-print-section="phd"]')!), INDIVIDUAL, APARTMENT);
    expect(t).not.toContain(APARTMENT);
  });

  it("공동주택 → 환산 공동주택가격 · 환산 개별주택가격·추정 없음", async () => {
    const { t } = await single("apartment");
    expectTerm(text(document.body.querySelector('[data-print-section="phd"]')!), APARTMENT, INDIVIDUAL);
    expect(t).not.toContain(INDIVIDUAL);
    expect(t).not.toContain("추정");
  });

  it("옛 이력(필드 없음) → 환산 개별주택가격 (P3)", async () => {
    const { t } = await single("absent");
    expectTerm(text(document.body.querySelector('[data-print-section="phd"]')!), INDIVIDUAL, APARTMENT);
    expect(t).not.toContain(APARTMENT);
  });

  it("표시 축이다 — 공동주택이어도 ④ 본문·응답이 단독과 동일하다 (엔진·전송 변경 0)", async () => {
    const a = await runPhdCell("single", "i", phdForm({ ...HOST, phdHousingType: "individual" }));
    const b = await runPhdCell("single", "a", phdForm({ ...HOST, phdHousingType: "apartment" }));
    expect(a.status).toBe(200);
    expect(b.bodySha).toBe(a.bodySha);
    expect(b.respSha).toBe(a.respSha);
    expect(b.totalTax).toBe(a.totalTax);
  });
});

describe("P4 함께 양도(일괄) 카드 — 자산별 폼에서 읽는다", () => {
  async function bundle(housing: "individual" | "apartment") {
    const form = phdBundledForm({ ...HOST, phdHousingType: housing });
    const row = await runPhdCell("companion", housing, form);
    expect(row.status, row.fieldErrors).toBe(200);
    const d = (row.json as { data: { apportionment: never; aggregated: never; transferBurdenedGiftBreakdown?: never } }).data;
    const c = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={form} />).container;
    return c;
  }

  it("전제 + 단독 → 환산 개별주택가격", async () => {
    const c = await bundle("individual");
    expect(count(text(c), INDIVIDUAL)).toBeGreaterThanOrEqual(5);
    expect(text(c)).not.toContain(APARTMENT);
  });
  it("공동주택 → 환산 공동주택가격 · 환산 개별주택가격 없음", async () => {
    const c = await bundle("apartment");
    expect(count(text(c), APARTMENT)).toBeGreaterThanOrEqual(5);
    expect(text(c)).not.toContain(INDIVIDUAL);
    expect(text(c)).not.toContain("추정");
  });
});

describe("P5 다건 자산별 아코디언 — property.form 에서 읽는다", () => {
  const breakdown = () => ({
    propertyId: "p1",
    propertyLabel: "p1",
    steps: [],
    preHousingDisclosureDetail: calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT as never)!,
  });
  const open = (housing: "individual" | "apartment") => {
    const form = phdForm({ ...HOST, phdHousingType: housing });
    const { container } = render(<PropertyBreakdownAccordion breakdown={breakdown() as never} property={{ propertyId: "p1", form } as never} />);
    fireEvent.click(container.querySelector(".cursor-pointer")!);
    return text(container);
  };
  it("단독 → 환산 개별주택가격 / 공동 → 환산 공동주택가격", () => {
    const i = open("individual");
    expect(count(i, INDIVIDUAL)).toBeGreaterThanOrEqual(5);
    expect(i).not.toContain(APARTMENT);
    cleanup();
    const a = open("apartment");
    expect(count(a, APARTMENT)).toBeGreaterThanOrEqual(5);
    expect(a).not.toContain(INDIVIDUAL);
  });
});

describe("P6 상속주택 환산 상세 카드 3경로", () => {
  const DETAIL: InheritanceHouseValuationResult = {
    sumAtInheritance: 148_382_411,
    sumAtFirstDisclosure: 329_982_000,
    landStdAtInheritance: 110_246_831,
    landStdAtTransfer: 1_243_350_000,
    landStdAtFirstDisclosure: 287_352_000,
    buildingStdAtInheritance: 38_135_580,
    buildingStdAtFirstDisclosure: 42_630_000,
    housePriceAtFirstDisclosure: 341_000_000,
    housePriceAtInheritanceUsed: 153_336_855,
    housePriceAtTransfer: 1_287_000_000,
    estimationMethod: "estimated_phd",
    formula: "",
    legalBasis: "소득세법 시행령 §164⑦",
    warnings: [],
  };
  const view = (agency: "molit" | "nts" | undefined) =>
    text(render(<InheritedHouseValuationDetailCard detail={{ ...DETAIL, apartFirstPriceAgency: agency }} />).container);

  it("개별(생략) → 환산 개별주택가격 (소득세법 시행령 §164⑦ 산식)", () => {
    const t = view(undefined);
    expect(t).toContain("환산 개별주택가격 (소득세법 시행령 §164⑦ 산식) · 합계기준시가 = 토지 + 건물");
    expect(count(t, INDIVIDUAL)).toBe(4); // 배지 + 소제목 + 합계기준시가 비율 좌변 + 환산취득가액 분자
    expect(t).not.toContain(APARTMENT);
    expect(t).not.toContain("산식으로 계산한 취득 당시");
    expect(t).not.toContain("추정");
  });
  it("공동주택 국토교통부 공시(§164⑦) → 환산 공동주택가격 — 종전 서술형·«취득 당시 공동주택가격 (…산식)» 없음", () => {
    const t = view("molit");
    expect(t).toContain("환산 공동주택가격 (소득세법 시행령 §164⑦ 산식) · 합계기준시가 = 토지 + 건물");
    expect(count(t, APARTMENT)).toBe(4); // 배지 + 소제목 + 합계기준시가 비율 좌변 + 환산취득가액 분자
    expect(t).not.toContain("§164⑦ 산식으로 계산한 취득 당시 공동주택가격");
    expect(t).not.toContain("취득 당시 공동주택가격 (");
    expect(t).not.toContain("취득당시 공동주택가격 ");
    expect(t).not.toContain(INDIVIDUAL);
    expect(t).not.toContain("추정");
    expect(convertedHousePriceNames("molit")).toEqual({ sentence: APARTMENT, label: `${APARTMENT} (소득세법 시행령 §164⑦ 산식)` });
  });
  it("공동주택 국세청 고시(§164⑥) → 같은 이름 «환산 공동주택가격», 조문만 «(… §164⑥ 산식)» — 종전 서술형·«취득 당시 공동주택 기준시가 (…)» 없음", () => {
    const t = view("nts");
    expect(t).toContain("환산 공동주택가격 (소득세법 시행령 §164⑥ 산식) · 합계기준시가 = 토지 + 건물");
    expect(count(t, APARTMENT)).toBe(4);
    expect(t).not.toContain("§164⑥ 산식으로 계산한 취득 당시 공동주택 기준시가");
    expect(t).not.toContain("취득 당시 공동주택 기준시가 (");
    expect(t).not.toContain("취득당시 공동주택 기준시가");
    expect(t).not.toContain(INDIVIDUAL);
    expect(t).not.toContain("추정");
    expect(convertedHousePriceNames("nts")).toEqual({ sentence: APARTMENT, label: `${APARTMENT} (소득세법 시행령 §164⑥ 산식)` });
  });
});

/** react-pdf 노드 트리의 텍스트 수집(함수 컴포넌트는 직접 호출) */
function collectPdf(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collectPdf(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collectPdf((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collectPdf((el.props ?? {}).children, out);
  return out;
}

describe("P7 PDF 출력물 — 같은 이름 규칙 · «추정»·변수 약어 없음", () => {
  async function pdfText(phdApartment: boolean | undefined) {
    const row = await runPhdCell("single", "pdf", phdForm({ ...HOST, phdHousingType: phdApartment ? "apartment" : "individual" }));
    expect(row.status, row.fieldErrors).toBe(200);
    const r = (row.json as { data: { result: Record<string, unknown> } }).data.result;
    expect(r.preHousingDisclosureDetail, "전제: PHD 상세").toBeTruthy();
    expect(r.splitDetail, "전제: 분리 내역(PDF PHD 표가 그 안에 있다)").toBeTruthy();
    return collectPdf(TransferSection({ r, phdApartment })).join("");
  }
  it("공동주택 → «환산 공동주택가격 (취득시)»", async () => {
    const t = await pdfText(true);
    expect(t).toContain(`${APARTMENT} (취득시)`);
    expect(t).not.toContain(INDIVIDUAL);
  });
  it("단독·다가구 / 옛 이력(prop 없음) → «환산 개별주택가격 (취득시)»", async () => {
    for (const a of [false, undefined]) {
      const t = await pdfText(a);
      expect(t).toContain(`${INDIVIDUAL} (취득시)`);
      expect(t).not.toContain(APARTMENT);
    }
  });
  it("문서 경로 — ResultPdfDocument 가 inputData.phdApartment 를 양도 섹션에 넘긴다(옛 이력 inputData 없음 → 개별)", async () => {
    const row = await runPhdCell("single", "doc", phdForm({ ...HOST, phdHousingType: "apartment" }));
    const r = (row.json as { data: { result: Record<string, unknown> } }).data.result;
    const doc = (inputData?: Record<string, unknown>) =>
      collectPdf(ResultPdfDocument({ taxType: "transfer", taxTypeLabel: "양도소득세", createdAt: "2026-10-24", resultData: r, inputData })).join("");
    expect(doc({ phdApartment: true })).toContain(`${APARTMENT} (취득시)`);
    expect(doc(undefined)).toContain(`${INDIVIDUAL} (취득시)`);
  });
  it("«추정»·P_A_est·Sum_A·Sum_F 가 없다", async () => {
    const t = await pdfText(true);
    for (const bad of ["추정", "P_A_est", "Sum_A", "Sum_F"]) expect(t).not.toContain(bad);
    expect(t).toContain("취득시 토지+건물 기준시가 합계");
    expect(t).toContain("최초공시일 토지+건물 기준시가 합계");
  });
});
