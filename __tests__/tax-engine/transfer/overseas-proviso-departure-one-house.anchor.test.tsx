/**
 * anchor — §154①2호 나·다목 단서 「출국일 현재 1주택을 보유하고 있는 경우로서」 (2026-10-08)
 *
 * · 「소득세법 시행령」 §154①2호 나·다목(현행 본문 실독) — 「다만, 출국일 현재 1주택을 보유하고 있는 경우로서 출국일부터
 *   2년 이내에 양도하는 경우에 한한다」. 대통령령 제20618호(2008.2.22.) 시행 후 양도분.
 * · 사전-2019-법령해석재산-0188(2019.8.20.) — 거주주택과 §155⑳ 장기임대주택을 각 1개 보유한 세대가 국외 유학으로 세대전원
 *   출국 후 2년 이내 비거주자로 거주주택을 양도하면 다목 비과세를 적용받을 수 없다 ⇒ 장기임대주택도 센다.
 *
 * 종전에는 「출국일 현재 1주택」을 묻지 않아 단서의 1주택을 §155⑳ 임대주택을 뺀 양도일 주택 수로 보았다(평가셋 F281).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { resolveExemptionProviso } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { collectExemptionProvisoErrors } from "@/lib/calc/exemption-proviso-validate";
import { buildExemptionProvisoPayload, departureOnlyHousePayload } from "@/lib/calc/exemption-proviso-payload";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

afterEach(cleanup);
const D = (s: string) => new Date(s);

function overseas(over: { departureOnlyHouse?: boolean; transferDate?: string; departureDate?: string } = {}) {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2008-04-04"),
    transferDate: D(over.transferDate ?? "2019-02-22"),
    oneHouseExemptionProviso: {
      reason: "overseas_residence",
      departureDate: D(over.departureDate ?? "2017-04-25"),
      ...(over.departureOnlyHouse !== undefined ? { departureOnlyHouse: over.departureOnlyHouse } : {}),
    },
  } as Partial<TransferTaxInput>);
}

describe("엔진 — 출국일 현재 1주택", () => {
  it("「예」면 단서 성립(보유·거주 면제) · 「아니오」면 불성립(F281)", () => {
    expect(resolveExemptionProviso(overseas({ departureOnlyHouse: true }))).toBe("both");
    expect(resolveExemptionProviso(overseas({ departureOnlyHouse: false }))).toBeNull();
  });

  it("미입력은 불성립(모름=불리) — 2008.2.22. 이후 양도", () => {
    expect(resolveExemptionProviso(overseas())).toBeNull();
  });

  it("2008.2.22. 전 양도분은 그 요건이 없다 — 미입력이어도 성립(경계 전날·당일)", () => {
    expect(resolveExemptionProviso(overseas({ transferDate: "2008-02-21", departureDate: "2007-06-01" }))).toBe("both");
    expect(resolveExemptionProviso(overseas({ transferDate: "2008-02-22", departureDate: "2007-06-01" }))).toBeNull();
  });
});

describe("⑧ — 2008.2.22. 이후 양도면 답해야 한다", () => {
  const base = { reason: "overseas_migration", departureDate: "2017-04-25" };
  it("미입력이면 오류 · 예/아니오면 통과", () => {
    expect(collectExemptionProvisoErrors({ ...base, transferDate: "2019-02-22" }).join(" ")).toContain("1채만 보유");
    expect(collectExemptionProvisoErrors({ ...base, transferDate: "2019-02-22", departureOnlyHouse: "no" })).toEqual([]);
    expect(collectExemptionProvisoErrors({ ...base, transferDate: "2019-02-22", departureOnlyHouse: "yes" })).toEqual([]);
  });
  it("그 전 양도 · 다른 사유는 묻지 않는다", () => {
    expect(collectExemptionProvisoErrors({ ...base, transferDate: "2008-02-21" })).toEqual([]);
    expect(collectExemptionProvisoErrors({ reason: "unavoidable", transferDate: "2019-02-22" })).toEqual([]);
  });
});

describe("④ payload — 나·다목일 때만 싣는다", () => {
  it("yes/no → boolean · 미입력·다른 사유는 키 없음", () => {
    expect(departureOnlyHousePayload("overseas_residence", "yes")).toEqual({ departureOnlyHouse: true });
    expect(departureOnlyHousePayload("overseas_migration", "no")).toEqual({ departureOnlyHouse: false });
    expect(departureOnlyHousePayload("overseas_residence", "")).toEqual({});
    expect(departureOnlyHousePayload("unavoidable", "yes")).toEqual({});
  });
  it("계산기·부담부증여 공용 조립이 싣는다", () => {
    const p = buildExemptionProvisoPayload(
      {
        provisoReason: "overseas_residence",
        provisoDepartureDate: "2017-04-25",
        provisoDepartureOnlyHouse: "no",
        provisoExpropriationDate: "",
        provisoBusinessApprovalDate: "",
        provisoRentalLeaseResidenceMonths: "",
        provisoPreContractNoHouse: false,
      } as Parameters<typeof buildExemptionProvisoPayload>[0],
      "one_house",
    );
    expect((p as { oneHouseExemptionProviso: Record<string, unknown> }).oneHouseExemptionProviso.departureOnlyHouse).toBe(false);
  });
});

describe("⑤ 입력 카드", () => {
  const props = {
    provisoDepartureDate: "2017-04-25",
    provisoDepartureOnlyHouse: "" as const,
    provisoExpropriationDate: "",
    provisoBusinessApprovalDate: "",
    provisoRentalLeaseResidenceMonths: "",
    provisoPreContractNoHouse: false,
    mode: "one_house" as const,
  };
  it("나·다목이면 질문이 뜨고 고른 값을 돌려준다 · 다른 사유면 없다", () => {
    let patch: Record<string, unknown> = {};
    render(<ExemptionProvisoSection {...props} provisoReason="overseas_residence" onChange={(p) => (patch = p)} />);
    fireEvent.click(screen.getByTestId("proviso-departure-only-house-no"));
    expect(patch).toEqual({ provisoDepartureOnlyHouse: "no" });
    cleanup();
    render(<ExemptionProvisoSection {...props} provisoReason="unavoidable" onChange={() => {}} />);
    expect(screen.queryByTestId("proviso-departure-only-house-no")).toBeNull();
  });
});
