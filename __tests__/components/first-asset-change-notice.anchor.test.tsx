/** @vitest-environment jsdom */
/**
 * 첫 자산 삭제 안내(Q-5) 배선(RTL) — Step1 삭제 → 마커 → Step4 카드 → 확인 해제.
 * 계획서 `docs/00-pm/first-asset-change-step4-facts-notice.plan.md` §4. 묶음 leaf·분류 가드는 `__tests__/calc/first-asset-facts.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { HOUSE, form } from "../calc/_helpers/g1-reverse-appurtenant-fixtures";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

type F = TransferFormData;
const NOTICE = "first-asset-change-notice";
const ACK = "first-asset-change-notice-ack";

const A = () => ({ ...HOUSE(0), assetId: "a1", assetLabel: "자산 1" });
const B = () => ({ ...HOUSE(0), assetId: "b1", assetLabel: "자산 2", addressJibun: "서울 테스트동 2", acquisitionDate: "2019-05-02" });
const C = () => ({ ...HOUSE(0), assetId: "c1", assetLabel: "자산 3", addressJibun: "서울 테스트동 3", acquisitionDate: "2019-06-02" });

let latest: F | undefined;
/** 한 폼을 Step1(삭제)과 Step4(카드)가 공유한다 — 실제 계산기에서 단계 이동 사이에 폼이 유지되는 것과 같다. */
function Host({ init, show }: { init: F; show: "step1" | "step4" }) {
  const [f, setF] = useState<F>(init);
  useEffect(() => {
    latest = f;
  }, [f]);
  const onChange = (p: Partial<F>) => setF((prev) => ({ ...prev, ...p }));
  return show === "step1" ? <Step1 form={f} onChange={onChange} /> : <Step4 form={f} onChange={onChange} />;
}

const deleteCard = (idx: number) => {
  const card = document.querySelector<HTMLElement>(`[data-asset-card-index="${idx}"]`)!;
  fireEvent.click(within(card).getByText("삭제"));
};

describe("Step1 삭제 → 마커", () => {
  it("W-1: 첫 자산 삭제 + 폼 전역 선언 있음 → 마커(새 첫 자산 · 묶음)", () => {
    render(<Host show="step1" init={{ ...(form(A(), B(), C()) as F), wasRegulatedAtAcquisition: true, marriageDate: "2020-01-01" }} />);
    deleteCard(0);
    expect(latest?.assets.map((a) => a.assetId)).toEqual(["b1", "c1"]);
    expect(latest?.firstAssetChangeNote).toEqual({ newFirstAssetId: "b1", groups: ["regulated", "merge"] });
  });
  it("W-2: 가운데 자산 삭제는 마커를 건드리지 않는다", () => {
    render(<Host show="step1" init={{ ...(form(A(), B(), C()) as F), wasRegulatedAtAcquisition: true }} />);
    deleteCard(1);
    expect(latest?.firstAssetChangeNote).toBeUndefined();
  });
  it("W-3: 선언이 없으면 첫 자산을 지워도 마커가 없다", () => {
    render(<Host show="step1" init={form(A(), B(), C()) as F} />);
    deleteCard(0);
    expect(latest?.firstAssetChangeNote).toBeUndefined();
  });
  it("W-4: 선언이 없는 두 번째 삭제는 이전 마커를 지운다(첫 자산이 또 바뀌었다)", () => {
    const old = { newFirstAssetId: "a1", groups: ["merge"] } as const;
    render(<Host show="step1" init={{ ...(form(A(), B(), C()) as F), firstAssetChangeNote: { ...old, groups: [...old.groups] } }} />);
    deleteCard(0);
    expect(latest?.firstAssetChangeNote).toBeUndefined();
  });
});

describe("Step4 카드", () => {
  const withNote = (over: Partial<F> = {}): F =>
    ({
      ...(form(B(), C()) as F),
      wasRegulatedAtAcquisition: true,
      marriageDate: "2020-01-01",
      firstAssetChangeNote: { newFirstAssetId: "b1", groups: ["regulated", "merge"] },
      ...over,
    }) as F;

  it("C-1: 마커 + 값이 남아 있으면 카드와 묶음 줄이 보이고 새 첫 자산(라벨·주소)이 문구에 있다", () => {
    render(<Host show="step4" init={withNote()} />);
    expect(screen.getByTestId(NOTICE).textContent).toContain("지금은 ‘자산 2 · 서울 테스트동 2’이(가)");
    expect(screen.queryByTestId(`${NOTICE}-regulated`)).not.toBeNull();
    expect(screen.queryByTestId(`${NOTICE}-merge`)).not.toBeNull();
  });
  it("C-2: 마커가 없으면 카드가 없다", () => {
    render(<Host show="step4" init={withNote({ firstAssetChangeNote: undefined })} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
  it("C-3: 값을 비운 묶음은 줄이 없다", () => {
    render(<Host show="step4" init={withNote({ marriageDate: "" })} />);
    expect(screen.queryByTestId(`${NOTICE}-merge`)).toBeNull();
    expect(screen.queryByTestId(`${NOTICE}-regulated`)).not.toBeNull();
  });
  it("C-4: [확인했습니다]는 마커를 지우고 값은 그대로 둔다", () => {
    render(<Host show="step4" init={withNote()} />);
    fireEvent.click(screen.getByTestId(ACK));
    expect(latest?.firstAssetChangeNote).toBeUndefined();
    expect(latest?.wasRegulatedAtAcquisition).toBe(true);
    expect(latest?.marriageDate).toBe("2020-01-01");
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
  it("C-5: 마커의 새 첫 자산이 지금 첫 자산이 아니면 카드가 없다", () => {
    render(<Host show="step4" init={withNote({ firstAssetChangeNote: { newFirstAssetId: "zz", groups: ["merge"] } })} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});
