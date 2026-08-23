/**
 * R-14 종결 anchor — ④ 변환은 §163⑨ payload에 **항상 `reportedValue`를 싣는다** (2026-08-23)
 *
 * ## R-14는 실체가 없었다
 *
 * 선행 계획서는 「입주권·완공APT의 §163⑨ 상속·증여 평가액 **자동 산정** 부재」를 후속으로 남겼다.
 * 착수 전 실측이 그 전제를 **반증**했다 — `CompanionAcquisitionCauseSection`은
 * `AssetSectionAcquisition`에서 **assetKind 분기 없이** 렌더되므로 입주권·완공APT도 `housing`과
 * **동일한** 자동 산정 UI(평가방법 · 보충적평가 보조계산 · 신고가액 칸)를 받는다.
 * 차이는 `land`만 면적을 추가로 묻는 것뿐이고, 그것은 §163⑨ land 분기가 단가×면적이기 때문이다.
 *
 * R-14의 서술은 R-10 초기 오진(「§163⑨ 칸은 엔진에 도달하지 않는다」 — `acquisitionPrice` 한
 * 갈래만 보고 `inheritedAcquisition` 갈래를 놓친 것)에서 **파생된 것**이다. R-10 §3.2-a가 그
 * 오진을 정정했지만, 그 전에 분리돼 나간 R-14가 **정정 전 서술을 그대로 들고 나갔다**
 * (memory `feedback_plan_gate_survives_after_override`).
 *
 * ## 그럼 무엇이 진짜 계약인가
 *
 * 조사 중 **실재하는 위험** 하나가 드러났다. 엔진의 `legacyFallback`
 * (`inheritance-acquisition-price.ts`)은 `reportedValue`가 **없을 때만** 돌고, 거기서
 * `computeSupplementary`가 `assetKind`로 산식을 가른다:
 *
 *   `land`                         → 공시지가 **단가 × 면적**
 *   `house_individual`/`house_apart` → **총액 그대로**
 *
 * 그런데 `deriveEngineInheritanceAssetKind`는 입주권을 **`house_apart`로 고정**한다
 * (「그 외(건물·권리 등)는 총액-safe house_apart」 — `transfer-tax-api-helpers.ts` 주석의 의도).
 * 종전 부동산이 토지인 입주권에서 이 경로에 도달하면 값이 갈린다.
 *
 * **엔진 직접 호출 실측** (입주권 · 공시지가 3,000,000/㎡ · 200㎡ · `reportedValue` 없음):
 *
 * | assetKind | 인가전 취득가액 | 양도차익 |
 * |---|---|---|
 * | `land` | 600,000,000 | 207,218,500 |
 * | `house_apart` | **3,000,000** | **804,218,500** |
 *
 * 차이 **597,000,000**. 하지만 **클라이언트 경로에서는 도달하지 않는다** —
 * `buildInheritedAcquisitionPayload`가 post-deemed·pre-deemed **양쪽 모두** `reportedValue`를
 * 싣기 때문이다(post-deemed는 `reportedRaw <= 0`이면 payload 자체를 보내지 않는다).
 *
 * ⇒ 이 파일이 고정하는 것은 **그 도달 불가**다. 이 계약이 깨지면 위 597,000,000이 실제 세액에
 *   나타난다. `reportedValue`를 조건부로 만들거나 생략하는 변경은 여기서 멈춘다.
 *
 * ⛔ **R-14 재제안 금지** — 「자동 산정이 없다」는 실측으로 반증됐다.
 */
import { describe, it, expect } from "vitest";
import { buildInheritedAcquisitionPayload } from "@/lib/calc/transfer-tax-api-inheritance";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    acquisitionCause: "inheritance",
    acquisitionDate: "2010-04-09",
    publishedValueAtInheritance: "3000000",
    acquisitionArea: "200",
    inheritanceValuationMethod: "supplementary",
    ...over,
  } as unknown as AssetForm;
}

/** payload가 나갔다면 `reportedValue`가 반드시 함께 있어야 한다 */
function reportedValueOf(a: AssetForm): number | "payload 없음" {
  const p = buildInheritedAcquisitionPayload(a, 1, false).inheritedAcquisition as
    | Record<string, unknown>
    | undefined;
  if (!p) return "payload 없음";
  return p.reportedValue as number;
}

describe("R-14 — §163⑨ payload는 항상 reportedValue를 싣는다 (legacyFallback 도달 차단)", () => {
  it("[L-01] post-deemed(1985 이후) 상속 → reportedValue 있음", () => {
    expect(reportedValueOf(asset())).toBe(3_000_000);
  });

  it("[L-02] pre-deemed(1985 이전) 상속 → reportedValue 있음", () => {
    expect(reportedValueOf(asset({ acquisitionDate: "1980-04-09" }))).toBe(3_000_000);
  });

  it("[L-03] 증여도 같다 — ① 소스만 `fixedAcquisitionPrice`로 갈린다", () => {
    expect(
      reportedValueOf(
        asset({
          acquisitionCause: "gift",
          publishedValueAtInheritance: "",
          fixedAcquisitionPrice: "3000000",
        }),
      ),
    ).toBe(3_000_000);
  });

  /**
   * 값이 없으면 payload를 **보내지 않는 것**이 정답이다 — 빈 payload를 보내면
   * `legacyFallback`이 돌아 assetKind가 세액을 가른다(위 597,000,000).
   */
  it("[L-04] post-deemed + 평가액 미입력 → payload 자체를 보내지 않는다", () => {
    expect(reportedValueOf(asset({ publishedValueAtInheritance: "" }))).toBe("payload 없음");
  });

  /**
   * 완공APT도 같은 경로다 — R-14가 「두 자산종류 공통 구조」라고 본 것은 맞았고,
   * 그래서 두 자산종류를 함께 고정한다.
   */
  it("[L-05] 완공APT도 동일 계약", () => {
    expect(reportedValueOf(asset({ assetKind: "redevelopment_apt" }))).toBe(3_000_000);
  });
});
