/** @vitest-environment jsdom */
/**
 * anchor — 판정 메뉴 ② 양도 대상 화면의 입주권 카드(`RedevelopmentRightExemptionSection`)의 표시 두 가지 (S13-9).
 *
 * ① 재배치 전 단계 번호 — 카드가 존재하지 않는 「② 보유 주택·권리」 단계를 가리켰다(실제 단계 머리는 「③ 보유 주택·권리」).
 *    위치에 의존하지 않는 표현(「보유 주택·권리」 단계)을 쓴다(`TemporaryTwoHouseSection`의 정정과 같다).
 * ② 고가 기준금액 초과 안내 — 종전에는 판정 메뉴에 입력 칸이 없는 `asset.actualSalePrice`를 읽어 **어떤 가격에서도 뜨지
 *    않았다**. 판정 메뉴가 실제로 받는 `form.contractTotalPrice`(예상 양도가액)로 켠다. 기존 prop-wiring anchor는
 *    픽스처가 `actualSalePrice`를 직접 심어 이 결함을 가렸다(같은 파일의 픽스처도 함께 고쳤다).
 * ③ 제목·링크는 가목·나목을 모두 말한다 — 「소득세법」 제89조제1항제4호는 가목·나목을 둔다.
 *
 * | # | 주장 |
 * |---|---|
 * | C-1 | 단계 번호(「② 보유 주택·권리」 등)가 없고 「보유 주택·권리」 단계를 가리킨다 |
 * | C-2 | 가격 칸 15억 입력 → 안내 1개 · 9억이면 0개(🔑 긍정 짝) · 자산-수준 actualSalePrice만 채우면 뜨지 않는다 |
 * | C-3 | 제목은 「§89①4호」(가목 한정 아님) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function initial(assetOver: Record<string, unknown> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2025-09-01",
    assets: [
      {
        ...f.assets[0],
        assetKind: "right_to_move_in",
        redevSubject: "right",
        acquisitionDate: "2015-03-01",
        redevApprovalDate: "2021-05-01",
        redevExemptionEligibleAtApproval: "yes",
        ...assetOver,
      },
    ],
  } as OneHouseJudgmentFormData;
}

function Harness({ assetOver }: { assetOver?: Record<string, unknown> }) {
  const [form, setForm] = useState(() => initial(assetOver));
  return <Step3 form={form} onChange={(p) => setForm((s) => ({ ...s, ...p }))} />;
}

function typePrice(v: string) {
  const n = screen.getByTestId("one-house-sale-price") as HTMLInputElement;
  fireEvent.change(n.tagName === "INPUT" ? n : (n.querySelector("input") as HTMLInputElement), { target: { value: v } });
}

const HV = /초과 → §89①4호 각 목 외의 부분 단서 안분과세 적용/g;
const count = (text: string) => text.match(HV)?.length ?? 0;

describe("S13-9 · 단계 번호", () => {
  it("C-1 재배치 전 번호(② 보유 주택·권리)를 쓰지 않고 「보유 주택·권리」 단계를 가리킨다", () => {
    const t = render(<Harness />).container.textContent ?? "";
    expect(t).not.toMatch(/② 보유 주택·권리|② 「보유 주택」 명부|② 명부에 주택 1채/);
    expect(t).toMatch(/「보유 주택·권리」 단계 입력 필요/);
    expect(t).toMatch(/「보유 주택」 명부를/);
    expect(t).toMatch(/명부에 주택 1채/);
  });
});

describe("S13-9 · 고가 초과 안내는 판정 메뉴의 가격 칸으로 켠다", () => {
  it("C-2 가격 칸 15억 → 안내 1개 · 9억 → 0개(긍정 짝)", () => {
    const r = render(<Harness />);
    expect(count(r.container.textContent ?? "")).toBe(0); // 가격 미입력
    typePrice("1500000000");
    expect(count(r.container.textContent ?? "")).toBe(1);
    typePrice("900000000");
    expect(count(r.container.textContent ?? "")).toBe(0);
  });

  it("C-2b 판정 메뉴에 없는 자산-수준 actualSalePrice만 채워도 안내는 뜨지 않는다(그 칸은 입력 경로가 아니다)", () => {
    const r = render(<Harness assetOver={{ actualSalePrice: "1500000000" }} />);
    expect(count(r.container.textContent ?? "")).toBe(0);
  });
});

describe("S13-9 · 제목", () => {
  it("C-3 카드 제목·법령 링크는 가목 한정이 아니라 §89①4호", () => {
    const t = render(<Harness />).container.textContent ?? "";
    expect(t).toMatch(/1세대1입주권 비과세 요건 \(§89①4호\)/);
    expect(t).not.toMatch(/1세대1입주권 비과세 요건 \(§89①4호 가목\)/);
  });
});
