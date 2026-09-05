/**
 * anchor: 다건에서 비주택→주택 용도변경은 명시 차단 (2026-09-05 · 코드리뷰 Q26)
 *
 * ## 종전 결함 — 켜도 반영되지 않는데 아무도 말해주지 않았다
 *
 * 다건 화면은 단건 마법사를 그대로 임베드하므로(`MultiTransferTaxCalculator.tsx`) 용도변경
 * 토글을 켜고 주거용 사용 개시일까지 입력할 수 있고, ⑧(`validateStep`)도 통과시킨다.
 * 그런데 다건 변환(`multi-transfer-tax-api.ts`)은 `nonHousingToHousingConversion`을 만들지
 * 않고 §95⑤2호 거주월수 클램프(`clampResidenceToHousingPeriod`)도 태우지 않는다 —
 * 단건 ④(`transfer-tax-api.ts:223`)만 그 둘을 한다.
 *
 * ⇒ §95⑤ 기간 분해와 §154⑤ 단서 보유기간 기산이 통째로 빠져 **세액이 조용히 달라졌고**,
 *   사용자는 입력이 반영된 것으로 오인했다.
 *
 * 이 저장소의 확립된 처방은 **명시 차단**이다 — `validateMultiSupportedMode`가 같은 이유로
 * 부담부증여·재개발·입주권·겸용·이월과세 등 11건을 이미 차단한다
 * (「침묵 오산보다 명시 차단이 안전하다(법령 정확성 최우선)」).
 *
 * ⚠️ 이 anchor는 **차단만** 고정한다. 다건 지원을 여는 작업은 payload(④)·route(⑭)에 더해
 *    거주월수 클램프까지 옮겨야 단건과 세액이 일치한다 — 그때 이 케이스를 뒤집을 것.
 */
import { describe, it, expect } from "vitest";
import { validateMultiSupportedMode } from "../../lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "../../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "../../lib/stores/calc-wizard-store";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

function formWith(assetOverrides: Partial<AssetForm>): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2024-08-01",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionDate: "2015-03-01",
        ...assetOverrides,
      } as AssetForm,
    ],
  };
}

describe("validateMultiSupportedMode — 용도변경(§95⑤·⑥)", () => {
  it("🔴 용도변경 ON + 주거용 사용 개시일 → 차단 (종전에는 통과 후 조용히 무시)", () => {
    const reason = validateMultiSupportedMode(
      formWith({ hasNonHousingConversion: true, residentialUseStartDate: "2020-06-01" }),
    );
    expect(reason).not.toBeNull();
    expect(reason).toContain("용도변경");
    expect(reason).toContain("단건");
  });

  it("대조군 — 토글 OFF면 차단하지 않는다 (일반 주택 양도는 다건 지원)", () => {
    expect(validateMultiSupportedMode(formWith({}))).toBeNull();
  });

  it("대조군 — 개시일만 남고 토글이 OFF면 차단하지 않는다 (술어는 단일 소스)", () => {
    // `isUsageConversionActive`가 토글·개시일을 함께 본다. UI·④·⑧과 같은 함수를 쓰므로
    // 여기서 조건을 복제하지 않는다 — 복제하면 세 곳이 조용히 어긋난다.
    expect(
      validateMultiSupportedMode(
        formWith({ hasNonHousingConversion: false, residentialUseStartDate: "2020-06-01" }),
      ),
    ).toBeNull();
  });
});
