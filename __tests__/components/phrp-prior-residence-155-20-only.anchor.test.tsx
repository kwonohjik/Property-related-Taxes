/**
 * @vitest-environment jsdom
 *
 * anchor — 직전거주주택은 §155⑳ 요건을 갖추고 양도한 주택만이다(과세 신고 포함 · 사전-2023-법규재산-0393)(사용자 확정 법리 2026-11-12 · 메모리
 * `project_155_1_vs_155_20_choice_phrp`).
 *
 * 근거: 소득세법 시행령 §154⑩2호 「제155조제20항 각 호 외의 부분 후단에 따른 직전거주주택보유주택」 → ⑳ 후단
 * 「그 보유기간 중에 양도한 다른 거주주택」의 「거주주택」은 ⑳ 본문이 정의한 주택(⑳ 요건을 갖춰 양도한 1주택)이다.
 * 거주주택 양도 때 §155①(일시적 2주택)·⑳을 함께 충족해 §155①을 택했으면 그 주택은 직전거주주택이 아니므로,
 * 뒤에 양도하는 임대주택(전환 주택)은 §154⑩·§161① 기간 안분 없이 판정한다 — 이것이 §154⑩ 질문의 「아니오」다.
 *
 * 종전 화면은 직전거주주택을 「보유 중 양도한 다른 거주주택」으로만 물어 §155①로 양도한 사용자도 「예」(기간 안분)를
 * 고르게 했다. 이 파일은 질문·안내·AI 추출 힌트가 그 한정을 담는지 고정한다(세액 산식 무변경 — 「아니오」의 결론은
 * `__tests__/calc/phrp-154-10-fact-question.anchor.test.tsx` PQ-2가 이미 고정: 판정 「비과세」 · 계산기 0).
 *
 * | # | 주장 |
 * |---|---|
 * | P20-1 | 판정 메뉴 질문이 「§155⑳의 요건을 갖춘 상태로」 묻고, §155① 등으로 양도했으면 해당 없다는 안내를 단다 · 「아니오」 설명도 같은 한정 |
 * | P20-2 | §154⑩ 블록 안내가 「§155⑳ 요건을 갖추고 … 다른 거주주택(직전거주주택)」으로 한정한다 |
 * | P20-3 | 계산기 미선언 안내가 같은 한정을 단다 |
 * | P20-4 | ⑳ 카드 시나리오 B 설명에 같은 안내 문장이 붙는다 |
 * | P20-5 | AI 사실 추출 힌트(§154⑩ 질문·직전거주주택 양도일)가 §155①로 양도한 경우를 제외한다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalHousingExceptionSection, type RentalHousingSectionMode } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { RentalHousing154_10Block } from "@/components/calc/transfer/RentalHousing154_10Block";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { PRIOR_RESIDENCE_155_20_ONLY_NOTE } from "@/lib/calc/phrp-154-10-fact-question";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

type Rh = AssetForm["rentalHousingException"];

function asset(rh?: Partial<Rh>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2018-06-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "13",
    rentalHousingException: { ...a.rentalHousingException, ...rh },
  };
}

function renderSection(mode: RentalHousingSectionMode, a = asset()) {
  const r = render(
    <RentalHousingExceptionSection
      mode={mode}
      rh={a.rentalHousingException}
      asset={a}
      acquisitionDate={a.acquisitionDate ?? ""}
      transferDate="2020-07-01"
      onChange={vi.fn()}
    />,
  );
  return (r.container.textContent ?? "").replace(/\s+/g, " ");
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ");

describe("직전거주주택 = §155⑳으로 양도한 주택만", () => {
  it("P20-1 ★ 판정 메뉴 질문 — 「요건을 갖춘 상태로」 · 0393 · §155① 제외 안내 · 「아니오」 설명", () => {
    renderSection("facts");
    const q = norm(screen.getByTestId("phrp-154-10-question").textContent);
    expect(q).toContain("다른 거주주택을 장기임대주택 거주주택 특례(소령 §155⑳)의 요건을 갖춘 상태로 양도한 적이 있습니까?");
    expect(norm(screen.getByTestId("phrp-154-10-prior-155-20-only").textContent)).toBe(PRIOR_RESIDENCE_155_20_ONLY_NOTE);
    expect(PRIOR_RESIDENCE_155_20_ONLY_NOTE).toContain("과세로 신고했어도 요건을 갖췄다면 해당합니다(사전-2023-법규재산-0393)");
    expect(PRIOR_RESIDENCE_155_20_ONLY_NOTE).toContain("일시적 2주택(소령 §155①)으로 양도한 주택은 직전거주주택이 아니어서");
    expect(q).toContain("보유 중 §155⑳ 요건을 갖추고 양도한 다른 거주주택이 없습니다");
    // 종전의 한정 없는 질문이 남아 있지 않다
    expect(q).not.toContain("이 주택을 보유하는 동안 다른 거주주택을 양도한 적이");
  });

  it("P20-2 §154⑩ 블록 안내 — 「§155⑳ 요건을 갖추고 … 다른 거주주택(직전거주주택)」", () => {
    const a = asset({ applyException: true, scenario: "B", rentalUnits: [], wasRegisteredRentalOrChildcare: true });
    render(<RentalHousing154_10Block rh={a.rentalHousingException} onChange={vi.fn()} />);
    const t = norm(screen.getByTestId("rental-154-10-block").textContent);
    expect(t).toContain("그 보유기간 중 §155⑳ 요건을 갖추고(과세로 신고했어도 포함 — 사전-2023-법규재산-0393) 다른 거주주택(직전거주주택)을 양도했다면");
  });

  it("P20-3 계산기 미선언 안내 — 같은 한정", () => {
    renderSection("calc");
    const t = norm(screen.getByTestId("rental-housing-154-10-calc-notice").textContent);
    expect(t).toContain("보유 중 §155⑳ 요건을 갖추고(과세로 신고했어도 포함) 다른 거주주택을 양도했다면, 직전거주주택 양도일 후 기간분만");
  });

  it("P20-4 ⑳ 카드 시나리오 B 설명 — 같은 안내 문장", () => {
    const text = renderSection("full", asset({ applyException: true, scenario: "A" }));
    expect(text).toContain(`§161① 기준시가 안분 적용. ${PRIOR_RESIDENCE_155_20_ONLY_NOTE}`);
  });

  it("P20-5 AI 추출 힌트 — §155①로 양도했으면 no · 직전거주주택이 아니다", () => {
    const hintOf = (path: string) => ONE_HOUSE_FIELD_CATALOG.find((f) => f.path === path)?.hint ?? "";
    const q = hintOf("asset.rentalHousingException.phrp154_10Answer");
    expect(q).toContain("다른 거주주택을 §155⑳(장기임대주택 거주주택 특례)의 요건을 갖춘 상태로 양도한 적이 있는가");
    expect(q).toContain("일시적 2주택(§155①)으로 양도했으면 no");
    expect(hintOf("asset.rentalHousingException.priorResidenceTransferDate")).toContain(
      "일시적 2주택(§155①)으로 양도한 주택은 직전거주주택이 아니다",
    );
  });
});
