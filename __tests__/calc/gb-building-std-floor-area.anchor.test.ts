/**
 * anchor: 건물1(원건물) 기준시가 계산기의 **연면적 단일 소스**
 *
 * ## 왜 이 한 줄에 anchor를 다는가 (2026-08-12 사용자 지적)
 *
 * `gbBuildingArea`(① 기본정보 「건물 연면적」)는 **양도 당시** 값이라 증축이 있으면
 * 원건물 + 증축분 합계다. 그런데 ② 건물 기준시가 계산기는 **건물1분만** 산정한다
 * (엔진 §166⑥ 분모 = 토지 + 건물1 + 건물2 — `general-building-extension.ts`).
 *
 * 전체 연면적으로 계산하면 건물1 기준시가가 과대해지고 안분이 통째로 어긋난다.
 * `gbBuildingArea` 자체는 엔진이 소비하지 않으므로(payload에 실리나 미사용),
 * **이 prefill이 세액에 닿는 유일한 경로**다.
 *
 * 3개 런처(2시점 일괄·취득시 단일·양도시 단일)가 같은 값을 써야 해서 함수로 고정한다 —
 * 인라인 `||`를 복제하면 한 곳만 고쳐질 때 조용히 갈린다(dual-truth).
 *
 * ⚠️ 컴포넌트 렌더로는 검증할 수 없다: 모달이 `hideFloorAreaInput`이라 prefill이 DOM에
 *    나타나지 않는다(probe 실측). 그래서 순수 함수 단위로 값을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { gbBuildingStdPriceFloorArea } from "@/lib/calc/building-std-batch-apply";

const f = gbBuildingStdPriceFloorArea;

describe("건물1 기준시가 계산기 연면적", () => {
  it("원건물 연면적이 있으면 그것을 쓴다 — 전체 연면적이 아니다", () => {
    expect(f({ gbOriginalBuildingArea: "83.72", gbBuildingArea: "167.44" })).toBe("83.72");
  });

  it("🔴 구별력 대조군 — 전체 연면적을 쓰면 안 된다", () => {
    // 이 단언이 깨지는 유일한 방법은 fallback 순서가 뒤집히는 것이다.
    expect(f({ gbOriginalBuildingArea: "83.72", gbBuildingArea: "167.44" })).not.toBe("167.44");
  });

  it("원건물 연면적이 비면 전체로 fallback한다 (legacy 자산 · dead-end 금지)", () => {
    expect(f({ gbOriginalBuildingArea: "", gbBuildingArea: "167.44" })).toBe("167.44");
  });

  it("둘 다 비면 빈 문자열 — 모달이 상위 입력 안내를 띄운다", () => {
    expect(f({ gbOriginalBuildingArea: "", gbBuildingArea: "" })).toBe("");
  });

  it("증축이 없으면 둘이 같은 값이라 분기가 무의미하다", () => {
    expect(f({ gbOriginalBuildingArea: "", gbBuildingArea: "83.72" })).toBe("83.72");
  });
});
