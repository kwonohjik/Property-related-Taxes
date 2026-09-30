/**
 * 검증 메시지 → 입력칸(field) 수집기와 `collectStepIssues`의 field 부착.
 *
 * 계획서: `docs/00-pm/transfer-validation-field-jump.plan.md` D-3(F안)
 */
import { describe, it, expect } from "vitest";
import { collectWithFields, fieldError } from "@/lib/calc/transfer-tax-validate-field";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const form = (patch: Partial<TransferFormData>): TransferFormData =>
  ({ ...createDefaultTransferFormData(), ...patch }) as TransferFormData;

describe("fieldError / collectWithFields", () => {
  it("수집기 밖에서는 문자열만 돌려준다 — 하위 검증을 직접 부르는 테스트의 계약", () => {
    expect(fieldError("transferDate", "메시지")).toBe("메시지");
    const { fieldOf } = collectWithFields(() => null);
    expect(fieldOf("메시지")).toBeUndefined(); // 밖에서 부른 기록이 새지 않는다
  });

  it("수집 중에는 메시지 → field를 기록하고, 같은 메시지는 첫 기록이 이긴다", () => {
    const { result, fieldOf } = collectWithFields(() => [
      fieldError("acquisitionDate", "같은 메시지"),
      fieldError("landAcquisitionDate", "같은 메시지"),
    ]);
    expect(result).toEqual(["같은 메시지", "같은 메시지"]);
    expect(fieldOf("같은 메시지")).toBe("acquisitionDate");
  });

  it("끝나면 수집기를 닫는다 — 예외가 나도", () => {
    expect(() =>
      collectWithFields(() => {
        throw new Error("x");
      }),
    ).toThrow("x");
    const { fieldOf } = collectWithFields(() => null);
    fieldError("transferDate", "닫힌 뒤");
    expect(fieldOf("닫힌 뒤")).toBeUndefined();
  });
});

describe("collectStepIssues — field 부착", () => {
  it("0단계: 폼 전역(직접 push)과 자산 공통(fieldError 경유) 모두 field가 붙는다", () => {
    const issues = collectStepIssues(0, form({ transferDate: "", contractTotalPrice: "" }));
    const byMsg = (m: string) => issues.find((it) => it.message.startsWith(m));
    expect(byMsg("양도일을 선택하세요")).toMatchObject({ assetIndex: 0, field: "transferDate" });
    expect(byMsg("총 양도가액을 입력하세요")).toMatchObject({ field: "contractTotalPrice" });
    expect(byMsg("자산: 소재지를 입력하세요")).toMatchObject({ assetIndex: 0, field: "addressJibun" });
  });

  it("미부착 메시지(취득 검증 — Phase 2 대상)는 field가 없다 → 화면이 카드로 후퇴", () => {
    const issues = collectStepIssues(
      0,
      form({
        assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", acquisitionDate: "" }],
        transferDate: "2024-03-01",
        contractTotalPrice: "1000000000",
      }),
    );
    expect(issues).toEqual([{ step: 0, assetIndex: 0, message: "자산: 취득일을 입력하세요." }]);
  });

  it("1단계·3단계 직접 push에도 field가 붙는다", () => {
    expect(collectStepIssues(1, form({ householdHousingCount: "" }))[0]).toMatchObject({
      field: "householdHousingCount",
    });
    const s3 = collectStepIssues(3, form({ amendmentMode: true, originalDeterminedTax: "" }));
    expect(s3.find((it) => it.message === "당초 결정세액을 입력하세요.")).toMatchObject({
      field: "originalDeterminedTax",
    });
  });
});
