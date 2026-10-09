/**
 * D2 Pre-Do (⑤ 렌더) — 「건물 상속·증여 + 토지 매매」 설계 전 현행 화면 고정 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d2.ui.design.md §2·§5
 * 짝(④⑥⑧ 값): __tests__/calc/transfer-land-part-cause.d2.predo.test.ts
 *
 * ## 이 파일이 하는 일
 * 1. **현행**: 건물 취득원인이 상속·증여일 때 「토지는 다른 원인으로 취득」 토글이 **없다**(입력 경로 0)는 사실과,
 *    상속 블록이 D2에서 숨겨야 할 칸(동일세대·평가방법·신고가액)을 **지금은 그대로 렌더**한다는 사실을 고정한다.
 * 2. **불변식**: 매매 호스트(D1)의 토글은 그대로다.
 * 3. D2 후 기대는 `it.todo`.
 *
 * ⚠️ 렌더 가능성 자체가 이 테스트의 전제다 — `CompanionAcquisitionCauseSection`이 jsdom에서 mount된다(실측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup); // RTL 자동 cleanup 미설정 — 수동

const noop = () => {};

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionDate: "2025-05-01",
    inheritanceStartDate: "2025-05-01",
    inheritanceDate: "2025-05-01",
    decedentAcquisitionDate: "2000-01-01",
    ...over,
  } as AssetForm;
}

function mount(a: AssetForm) {
  return render(
    <CompanionAcquisitionCauseSection asset={a} onChange={noop} transferDate="2026-06-30" isNewConstruction={a.acquisitionCause === "newConstruction"} />,
  );
}

/** D1·D0 토글 testid — D2는 새 testid(`land-part-cause-building-cause`)를 쓴다(설계 §2.4). */
const TOGGLE_IDS = ["land-part-cause-purchase", "newconstruction-land-acq"] as const;

describe("A. 불변식 — D2 후에도 유지", () => {
  it("A1 매매 호스트: D1 토글(land-part-cause-purchase)이 그대로 있다", () => {
    const { container } = mount(asset({ acquisitionCause: "purchase" }));
    expect(container.querySelector('[data-testid="land-part-cause-purchase"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="newconstruction-land-acq"]')).toBeNull();
  });

  it("A2 신축 호스트: D0 토글(newconstruction-land-acq)이 그대로 있다", () => {
    const { container } = mount(asset({ acquisitionCause: "newConstruction", occupancyApprovalDate: "2020-06-01" }));
    expect(container.querySelector('[data-testid="newconstruction-land-acq"]')).not.toBeNull();
  });

  it("A3 이월과세(증여) 호스트: 토지 원인 토글이 없다 — D2는 이월과세 건물을 열지 않는다(계획서 §5)", () => {
    const { container } = mount(asset({ acquisitionCause: "carryover_gift" }));
    for (const id of TOGGLE_IDS) expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
  });

  it("A4 비주택·토지 자산(assetKind land)은 어느 호스트에서도 토글이 없다", () => {
    for (const cause of ["purchase", "inheritance", "gift"] as const) {
      const { container, unmount } = mount(asset({ acquisitionCause: cause, assetKind: "land" }));
      for (const id of TOGGLE_IDS) expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
      unmount();
    }
  });
});

describe("B. 현행 pin — D2 Do가 일부러 뒤집는다 (설계 §2 · §5)", () => {
  it("B1 [D2에서 뒤집힘] 상속 호스트: 「토지는 다른 원인으로 취득」 토글이 없다 (입력 경로 0)", () => {
    const { container } = mount(asset({ acquisitionCause: "inheritance" }));
    for (const id of TOGGLE_IDS) expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
    expect(container.querySelector('[data-field="landAcquisitionCause"]')).toBeNull();
  });

  it("B2 [D2에서 뒤집힘] 증여 호스트: 같은 토글이 없다", () => {
    const { container } = mount(asset({ acquisitionCause: "gift" }));
    for (const id of TOGGLE_IDS) expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
    expect(container.querySelector('[data-field="landAcquisitionCause"]')).toBeNull();
  });

  it("B3 상속 호스트가 지금 렌더하는 자산 단위 칸: 피상속인 취득일·동일세대 토글·선순위 토글·평가방법 (D2 토글 ON에서는 숨기거나 건물 단일 칸으로 대체)", () => {
    mount(asset({ acquisitionCause: "inheritance" }));
    expect(screen.queryAllByText("피상속인 취득일").length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/상속개시 당시 피상속인과 동일세대/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/양도 주택이 선순위 상속주택이 아님/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("상속세 신고 시 평가방법").length).toBeGreaterThan(0);
  });

  it("B4 증여 호스트가 지금 렌더하는 칸: 증여일·증여자 취득일 (신고가액 칸은 부담부증여가 아니면 자산 단위 1개)", () => {
    mount(asset({ acquisitionCause: "gift" }));
    expect(screen.queryAllByText("증여일").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("증여자 취득일").length).toBeGreaterThan(0);
  });

  it("B5 상속 호스트 + 개별주택가격 미공시 구간(상속개시일 < 2005-04-30): §164⑦ 환산 칸이 자산 단위로 렌더된다 (결합 공시 — D2에서 숨김)", () => {
    const { container } = mount(
      asset({ acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01" }),
    );
    // 환산 위젯의 입력 앵커(HouseValuationSection) — 정확한 앵커가 바뀌어도 이 테스트가 먼저 알려준다.
    expect(container.querySelector('[data-field="inhHouseValLandArea"]')).not.toBeNull();
  });
});

describe("C. D2 후 기대 (설계 §2 · §5) — todo", () => {
  it.todo("C1 상속 호스트: 토글(data-testid=land-part-cause-building-cause, data-field=landAcquisitionCause) 노출, OFF에도 amber tone");
  it.todo("C2 증여 호스트: 같은 토글 노출 — 단 이월과세·부담부증여·재개발 등 호스트는 미노출 (A3 유지)");
  it.todo("C3 토글 ON(상속): 동일세대·선순위·평가방법·신고가액·§164⑦ 칸이 렌더되지 않는다 (CompanionAcqInheritanceBlock 미마운트)");
  it.todo("C4 토글 ON: 날짜 2열 [토지 취득일 | 건물 상속개시일] — 건물 칸 라벨 파생, 의제취득 클램프·배지 없음");
  it.todo("C5 토글 ON: 건물 파트 = 고정 칩 「실거래가 · 상속개시일 평가액」 + 평가액 칸(split-building-acq-price), 토지 파트 = 매매 4종 라디오");
  it.todo("C6 토글 ON(상속): 건물 피상속인 취득일 칸(decedentAcquisitionDate) 노출, 증여는 증여자 취득일 칸 없음 또는 선택");
  it.todo("C7 토글 ON: PHD 토글·신축/증축 SelfBuiltSection·자산 단위 취득가액 칸 미렌더");
  it.todo("C8 소유자 다름 ↔ 토글 상호 잠금 (한쪽이 켜지면 다른 쪽 켜기 비활성 + 사유)");
  it.todo("C9 상속 ↔ 증여 라디오 전환 시 토글이 꺼진다(landCauseHost 불일치) — 입력값은 보존, 다시 켜면 복원");
  it.todo("C10 매매로 전환하면 D2 잔재는 무효 — D1 토글 OFF 상태로 읽힌다");
  it.todo("C11 건물 상속개시일 < 경계일(V-12)이면 날짜 아래 안내(amber) — 계산 불가 사유");
});
