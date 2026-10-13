/**
 * ⑧ 이월과세 「증여자와 증여일부터 양도일까지 계속 같은 세대」 사실 검증 (결정 #33·#34·#38-6).
 *
 * `transfer-tax-validate-acquisition.ts`에서 분리했다(800줄 정책 — 이 검증을 만지는 김에 기회주의적 분리).
 * 노출(⑤)·전송(④)과 같은 술어를 쓰므로 화면에 없는 질문을 요구하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { carryoverHouseholdFactVisible } from "./transfer-tax-api-carryover";
import { fieldError } from "./transfer-tax-validate-field";

export function validateCarryoverHouseholdFact(
  asset: AssetForm,
  c: NonNullable<AssetForm["carryover"]>,
  label: string,
): string | null {
  // (g) 결정 #33·#34 — 증여자와 증여일부터 양도일까지 계속 같은 세대인가 (필수 사실 질문).
  //   노출·전송과 **같은 술어**(`carryoverHouseholdFactVisible`)로 게이트한다 — 화면에 없는 질문을 요구하면 막다른 오류다.
  //   관계를 고르지 않았어도 묻는다(관계 미선택이 질문을 건너뛰는 구멍이 되지 않게). 옛 이력은 미답("")이라 답을 요구한다.
  //   ⑤ 화면에서 이 질문은 가장 아래(적용배제 선언 위)라 오류 순서도 맨 뒤다 — 앞선 입력 오류를 가리지 않는다.
  if (carryoverHouseholdFactVisible(asset)) {
    if (c.donorSameHousehold === "")
      return fieldError(
        "carryover.donorSameHousehold",
        `${label}: 증여일부터 양도일까지 증여자와 계속 같은 세대였는지 선택하세요 (소득세법 §88 6호 · 시행령 §154①).`,
      );
    // 결정 #38-6 — 「이혼 후 재결합」은 배우자 증여에서만 고를 수 있다(관계를 바꾸면 화면이 비우지만, 남은 값이 조용히 버려지지 않게 막는다).
    if (c.donorSameHousehold === "rejoined" && c.donorRelation !== "spouse")
      return fieldError(
        "carryover.donorSameHousehold",
        `${label}: 「이혼 후 같은 사람과 재결합」은 배우자에게서 증여받은 경우에만 선택할 수 있습니다. 증여자와 계속 같은 세대였는지 다시 선택하세요.`,
      );
    if (c.donorSameHousehold === "yes") {
      const start = c.donorHouseholdHoldingStartDate;
      if (!start)
        return fieldError("carryover.donorHouseholdHoldingStartDate", `${label}: 세대가 이 주택 보유를 시작한 날을 입력하세요.`);
      if (start < c.donorAcquisitionDate)
        return fieldError(
          "carryover.donorHouseholdHoldingStartDate",
          `${label}: 세대 보유 시작일은 증여자 취득일 이후여야 합니다 — 증여자가 취득하기 전에는 보유가 없습니다.`,
        );
      if (start >= c.giftRegistryDate)
        return fieldError(
          "carryover.donorHouseholdHoldingStartDate",
          `${label}: 세대 보유 시작일은 증여 등기접수일 이전이어야 합니다.`,
        );
    }
  }
  return null;
}
