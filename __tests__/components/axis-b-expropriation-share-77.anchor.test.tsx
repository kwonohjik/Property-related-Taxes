/**
 * @vitest-environment jsdom
 *
 * ⑤ 축 B 첫 카드의 공익수용 선택·해제 → 지분 카드의 §77 감면 행도 같은 이벤트에서 추가·제거 (NBL2611-C9).
 * 순수 헬퍼 + 실제 `CompanionAssetsSection`(첫 카드 ② 「양도 형태·원인」 라디오 클릭)을 렌더해 화면 경로를 고정한다.
 * route 실호출·⑧ 쪽 anchor는 `__tests__/api/transfer.route.nbl2611-c9-axis-b-share-77.anchor.test.ts`.
 */
import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { applyCardPatchWithAxisBExpropriation, withAxisBExpropriationRow } from "@/components/calc/transfer/axis-b-expropriation-sync";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const EXPR = "public_expropriation";
const share = (n: number, over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(n), acquisitionCause: "purchase", ownershipNumerator: n === 1 ? "10" : "90", ownershipDenominator: "100", ...over }) as AssetForm;
const exprRows = (a: AssetForm) => (a.reductions ?? []).filter((r) => r.type === EXPR);
const userRow = { type: EXPR, expropriationCash: "900000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2021-03-01" } as const;
const causeOn = { transferType: "regular", transferCause: EXPR } as Partial<AssetForm>;
const causeOff = { transferType: "regular", transferCause: "general" } as Partial<AssetForm>;

describe("C9 · applyCardPatchWithAxisBExpropriation (순수)", () => {
  it("🔑 축 B 첫 카드가 수용을 고르면 §77 행이 없는 지분 카드에 기본행(현금 0 · 고시일 공란)을 더한다", () => {
    const next = applyCardPatchWithAxisBExpropriation([share(1), share(2), share(3)], 0, causeOn, true);
    expect(next[0].transferCause).toBe(EXPR);
    expect(exprRows(next[0])).toHaveLength(0); // 첫 카드 자신의 행은 `TransferModeBlock.selectMode`가 같은 패치에 싣는다
    for (const i of [1, 2]) {
      const rows = exprRows(next[i]) as { expropriationCash: string; expropriationApprovalDate: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].expropriationCash).toBe("0");
      expect(rows[0].expropriationApprovalDate).toBe(""); // 고시일을 복제하지 않는다 — ④·⑧이 첫 카드 값을 읽는다
    }
  });

  it("이미 §77 행이 있는 지분 카드는 건드리지 않는다(사용자 입력 보존)", () => {
    const mine = share(2, { reductions: [{ ...userRow }] });
    const next = applyCardPatchWithAxisBExpropriation([share(1), mine], 0, causeOn, true);
    expect(next[1]).toBe(mine);
  });

  it("🔑 해제(일반 양도·부담부증여)는 첫 카드와 대칭으로 지분 카드의 §77 행을 제거하되 다른 감면은 남긴다", () => {
    const keep = { type: "self_farming", farmingYears: "8" } as const;
    const a = [share(1, { transferCause: EXPR }), share(2, { reductions: [{ ...userRow }, { ...keep }] })];
    const next = applyCardPatchWithAxisBExpropriation(a, 0, causeOff, true);
    expect(exprRows(next[1])).toHaveLength(0);
    expect(next[1].reductions).toEqual([keep]);
  });

  it("축 B가 아니면(함께 양도·단건) 지분 카드를 건드리지 않는다", () => {
    const a = [share(1), share(2)];
    const next = applyCardPatchWithAxisBExpropriation(a, 0, causeOn, false);
    expect(next[0].transferCause).toBe(EXPR);
    expect(next[1]).toBe(a[1]);
  });

  it("수용 여부가 안 바뀌는 패치(양도원인 없음 · 수용 → 수용 · 일반 → 일반 · 지분 카드 패치)는 단순 병합이다", () => {
    const exprFirst = [share(1, { transferCause: EXPR }), share(2)];
    expect(applyCardPatchWithAxisBExpropriation(exprFirst, 0, { addressJibun: "x" }, true)[1]).toBe(exprFirst[1]);
    expect(applyCardPatchWithAxisBExpropriation(exprFirst, 0, causeOn, true)[1]).toBe(exprFirst[1]);
    const plain = [share(1), share(2)];
    expect(applyCardPatchWithAxisBExpropriation(plain, 0, causeOff, true)[1]).toBe(plain[1]);
    expect(exprRows(applyCardPatchWithAxisBExpropriation(plain, 1, causeOn, true)[1])).toHaveLength(0);
  });

  it("withAxisBExpropriationRow — 멱등", () => {
    const once = withAxisBExpropriationRow(share(2));
    expect(withAxisBExpropriationRow(once)).toBe(once);
  });
});

/** 상태를 쥔 래퍼 — `CompanionAssetsSection`은 제어 컴포넌트다. */
const holder: { latest: AssetForm[] } = { latest: [] };
function Harness({ initial, splitMode }: { initial: AssetForm[]; splitMode: "fractional" | "companion" }) {
  const [assets, setAssets] = useState(initial);
  return (
    <CompanionAssetsSection
      assets={assets}
      bundledSaleMode="actual"
      onChange={(a) => {
        holder.latest = a;
        setAssets(a);
      }}
      transferDate="2024-09-01"
      splitMode={splitMode}
      onFractionalToggle={() => {}}
    />
  );
}
const clickCause = (label: RegExp) => {
  const radios = screen.getAllByRole("radio").filter((el) => label.test(el.closest("label")?.textContent ?? ""));
  expect(radios.length).toBeGreaterThan(0);
  fireEvent.click(radios[0]); // 첫 카드 ②만 이 라디오를 그린다(지분 카드는 ② 숨김)
};

describe("C9 · 화면 — 첫 카드 ② 「양도 형태·원인」 라디오", () => {
  it("🔑 축 B: 「공익수용·협의매수」 선택 → 첫 카드와 지분 카드 모두 §77 행 · 「일반 양도」로 되돌리면 모두 제거", () => {
    render(<Harness initial={[share(1), share(2)]} splitMode="fractional" />);
    clickCause(/공익수용/);
    expect(holder.latest[0].transferCause).toBe(EXPR);
    expect(exprRows(holder.latest[0])).toHaveLength(1);
    expect(exprRows(holder.latest[1])).toHaveLength(1);
    clickCause(/일반 양도/);
    expect(holder.latest[0].transferCause).toBe("general");
    expect(exprRows(holder.latest[0])).toHaveLength(0);
    expect(exprRows(holder.latest[1])).toHaveLength(0);
  });

  it("함께 양도(다른 물건)는 컴패니언에 §77 행을 만들지 않는다(자기 ②가 있다)", () => {
    render(<Harness initial={[share(1), share(2)]} splitMode="companion" />);
    const radios = screen.getAllByRole("radio").filter((el) => /공익수용/.test(el.closest("label")?.textContent ?? ""));
    fireEvent.click(radios[0]);
    expect(exprRows(holder.latest[0])).toHaveLength(1);
    expect(exprRows(holder.latest[1])).toHaveLength(0);
  });

  it("🔑 첫 카드가 이미 수용인 축 B에서 「+ 지분 추가」한 새 지분도 §77 행을 받는다 · 수용이 아니면 받지 않는다", () => {
    const { unmount } = render(<Harness initial={[share(1, { transferCause: EXPR, reductions: [{ ...userRow }] }), share(2)]} splitMode="fractional" />);
    fireEvent.click(screen.getByRole("button", { name: /지분 추가/ }));
    expect(holder.latest).toHaveLength(3);
    expect(exprRows(holder.latest[2])).toHaveLength(1);
    unmount();
    render(<Harness initial={[share(1), share(2)]} splitMode="fractional" />);
    fireEvent.click(within(document.body).getByRole("button", { name: /지분 추가/ }));
    expect(holder.latest).toHaveLength(3);
    expect(exprRows(holder.latest[2])).toHaveLength(0);
  });
});
