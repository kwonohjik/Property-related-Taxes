/**
 * B-2 — 감면 PHD 모드가 꺼지면 그 조문의 계산서도 사라져야 한다.
 * 계획서: docs/00-pm/red-phd-snapshot-followups.plan.md (B-2)
 *
 * #1268이 `-redev-phd`에 대해 닫은 것과 같은 실패 모드. 꺼지는 경로 3가지:
 *   ① `phdMode{조문}` 토글 OFF  ② 그 조문을 후보에서 제거  ③ 감면 자체를 끔(reductions 비움)
 *
 * B-4로 키가 조문을 구분하게 된 덕에 「어느 조문의 PHD가 꺼졌는가」를 판정할 수 있다.
 */
import { describe, it, expect } from "vitest";
import { isBuildingStdSnapshotApplicable } from "@/lib/calc/building-std-snapshot-applicability";

const KEY_993 = "bsp-a1-red993-phd";
const KEY_988 = "bsp-a1-red988-phd";

const inputWith = (reductions: unknown) => ({ assets: [{ assetId: "a1", reductions }] });

describe("감면 PHD 스냅샷 적용성 — 조문별 판정", () => {
  it("그 조문의 phdMode가 ON이면 적용 가능", () => {
    expect(
      isBuildingStdSnapshotApplicable(KEY_993, inputWith([{ type: "new_99_3", phdMode993: true }])),
    ).toBe(true);
  });

  it("① phdMode OFF → 차단", () => {
    expect(
      isBuildingStdSnapshotApplicable(KEY_993, inputWith([{ type: "new_99_3", phdMode993: false }])),
    ).toBe(false);
    // 키 자체가 없어도(미설정) 꺼진 것으로 본다 — PHD를 쓴 적 없는 조문이다
    expect(
      isBuildingStdSnapshotApplicable(KEY_993, inputWith([{ type: "new_99_3" }])),
    ).toBe(false);
  });

  it("② 그 조문을 후보에서 제거 → 차단", () => {
    expect(
      isBuildingStdSnapshotApplicable(KEY_993, inputWith([{ type: "unsold_98_8", phdMode988: true }])),
    ).toBe(false);
  });

  it("③ 감면을 전부 끔 → 차단", () => {
    expect(isBuildingStdSnapshotApplicable(KEY_993, inputWith([]))).toBe(false);
  });

  it("🔑 조문별로 독립 판정한다 — 한쪽만 꺼도 다른 쪽은 남는다", () => {
    const reductions = [
      { type: "new_99_3", phdMode993: false },
      { type: "unsold_98_8", phdMode988: true },
    ];
    expect(isBuildingStdSnapshotApplicable(KEY_993, inputWith(reductions))).toBe(false);
    expect(isBuildingStdSnapshotApplicable(KEY_988, inputWith(reductions))).toBe(true);
  });
});

describe("판정 불능은 통과 — 과잉 차단 방지", () => {
  it("구 키(`-red-phd`)는 조문을 알 수 없다 → 통과", () => {
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", inputWith([]))).toBe(true);
  });

  it("미등록 조문 prefix → 통과", () => {
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red9999-phd", inputWith([]))).toBe(true);
  });

  it("reductions가 없거나 배열이 아니면 통과 (구버전·부분 input_data)", () => {
    expect(isBuildingStdSnapshotApplicable(KEY_993, { assets: [{ assetId: "a1" }] })).toBe(true);
    expect(isBuildingStdSnapshotApplicable(KEY_993, inputWith("nope"))).toBe(true);
  });

  it("자산을 못 찾으면 통과", () => {
    expect(isBuildingStdSnapshotApplicable(KEY_993, { assets: [{ assetId: "other" }] })).toBe(true);
  });
});

describe("다건 양도 경로도 같은 판정", () => {
  const multi = (reductions: unknown) => ({
    __multiTransfer: true,
    properties: [{ id: "p1", form: { assets: [{ assetId: "a1", reductions }] } }],
  });

  it("다건 — phdMode OFF → 차단", () => {
    expect(
      isBuildingStdSnapshotApplicable(KEY_993, multi([{ type: "new_99_3", phdMode993: false }])),
    ).toBe(false);
  });

  it("다건 — phdMode ON → 통과", () => {
    expect(
      isBuildingStdSnapshotApplicable(KEY_993, multi([{ type: "new_99_3", phdMode993: true }])),
    ).toBe(true);
  });
});

/**
 * 🔴 구 키(`-red-phd`)가 조문별 신 키로 **대체**된 경우 (2026-08-24 코드 리뷰 Medium).
 *
 * `saveSnapshot`은 추가만 하므로 이력 복원 후 재계산하면 두 키가 공존하고,
 * 한 조문에 계산서가 4장(신 2 + 구 2) 찍힌다.
 */
describe("구 키 대체 판정 — allKeys를 줬을 때만 작동", () => {
  const ON = { assets: [{ assetId: "a1", reductions: [{ type: "new_99_3", phdMode993: true }] }] };

  it("PHD-ON 조문이 모두 신 키로 덮였으면 구 키는 제외된다", () => {
    const keys = ["bsp-a1-red-phd", "bsp-a1-red993-phd"];
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", ON, keys)).toBe(false);
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red993-phd", ON, keys)).toBe(true);
  });

  /**
   * 🔴 「신 키가 하나라도 있으면 대체」로 두면 **다른 조문의 계산서를 지운다**.
   * 저장 경로도 같은 술어를 쓰므로 손실이 영속화된다(2026-08-24 코드 리뷰 Low).
   */
  it("덮이지 않은 PHD-ON 조문이 남아 있으면 구 키를 살린다", () => {
    // §99의3은 구 키로 계산해 둔 상태, §98의8만 새로 계산 → §99의3 계산서가 사라지면 안 된다
    const twoOn = {
      assets: [{
        assetId: "a1",
        reductions: [
          { type: "new_99_3", phdMode993: true },
          { type: "unsold_98_8", phdMode988: true },
        ],
      }],
    };
    const keys = ["bsp-a1-red-phd", "bsp-a1-red988-phd"];
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", twoOn, keys)).toBe(true);
    // 둘 다 신 키를 가지면 구 키는 가리킬 대상이 없다
    const bothKeys = ["bsp-a1-red-phd", "bsp-a1-red988-phd", "bsp-a1-red993-phd"];
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", twoOn, bothKeys)).toBe(false);
  });

  it("PHD가 꺼진 조문은 덮개 대상이 아니다 — 구 키를 붙잡지 않는다", () => {
    const oneOnOneOff = {
      assets: [{
        assetId: "a1",
        reductions: [
          { type: "new_99_3", phdMode993: false },
          { type: "unsold_98_8", phdMode988: true },
        ],
      }],
    };
    expect(
      isBuildingStdSnapshotApplicable("bsp-a1-red-phd", oneOnOneOff, ["bsp-a1-red-phd", "bsp-a1-red988-phd"]),
    ).toBe(false);
  });

  it("판정 근거(reductions)가 없으면 대체로 보지 않는다 — 판정 불능은 통과", () => {
    const noRed = { assets: [{ assetId: "a1" }] };
    expect(
      isBuildingStdSnapshotApplicable("bsp-a1-red-phd", noRed, ["bsp-a1-red-phd", "bsp-a1-red993-phd"]),
    ).toBe(true);
  });

  it("신 키가 없으면 구 키는 그대로 남는다 (이력 단독 복원)", () => {
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", ON, ["bsp-a1-red-phd"])).toBe(true);
  });

  it("다른 자산의 신 키는 영향 없다", () => {
    const keys = ["bsp-a1-red-phd", "bsp-a2-red993-phd"];
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", ON, keys)).toBe(true);
  });

  it("allKeys를 안 주면 개별 판정만 — 기존 호출 호환", () => {
    expect(isBuildingStdSnapshotApplicable("bsp-a1-red-phd", ON)).toBe(true);
  });

  it("재개발 키는 이 규칙의 대상이 아니다", () => {
    const keys = ["bsp-a1-redev-phd", "bsp-a1-red993-phd"];
    expect(
      isBuildingStdSnapshotApplicable("bsp-a1-redev-phd", { assets: [{ assetId: "a1" }] }, keys),
    ).toBe(true);
  });
});
