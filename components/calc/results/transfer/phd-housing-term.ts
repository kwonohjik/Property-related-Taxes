/**
 * 양도세 PHD(개별주택가격 미공시 취득 환산) 결과의 «환산 …가격» 이름 — 주택 종류별.
 *
 * 소득세법 시행령 §164⑦ 산식으로 구한 취득 당시 주택가격의 이름은 주택 종류로 갈린다.
 *   · 단독·다가구 → «환산 개별주택가격»
 *   · 공동주택    → «환산 공동주택가격»
 * 이 둘 외의 조어(«추정값»·«법정 값» 등)는 쓰지 않는다 (memory `feedback_no_coined_legal_terms`).
 *
 * 주택 종류는 엔진 result에 없다 — 입력 위젯(`PreHousingDisclosureSection`)의 라디오가 쓰는 폼 필드
 * `AssetForm.phdHousingType`(표시 축 — API 페이로드에 싣지 않는다)에서 읽어 내려온다
 * (`saleSplitActual`·`exemptionNote` 와 같은 규약). 필드가 없는 옛 이력·미입력은 «단독·다가구»다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 이 자산의 PHD 주택 종류가 공동주택인가 — 호출부가 결과 카드에 넘기는 불리언의 단일 정의. */
export function isPhdApartment(asset: Pick<AssetForm, "phdHousingType"> | undefined): boolean {
  return asset?.phdHousingType === "apartment";
}

/** §164⑦ 산식 결과의 이름 — 공동주택 «환산 공동주택가격», 그 밖(미지정·옛 이력 포함) «환산 개별주택가격». */
export function phdConvertedPriceName(apartment: boolean | undefined): string {
  return apartment ? "환산 공동주택가격" : "환산 개별주택가격";
}
