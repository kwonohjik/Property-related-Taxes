/**
 * 양도세 PHD(개별주택가격 미공시 취득 환산) 결과의 «환산 …가격» 이름 — 주택 종류별. (단일 정의)
 *
 * 소득세법 시행령 §164⑥·⑦ 산식으로 구한 취득 당시 주택가격의 이름은 주택 종류로 갈린다.
 *   · 단독·다가구 → «환산 개별주택가격»
 *   · 공동주택    → «환산 공동주택가격»
 * 이 둘 외의 조어(«추정값»·«법정 값»·«취득 당시 …가격 산식으로 계산한…» 등)는 쓰지 않는다 (memory `feedback_no_coined_legal_terms`).
 *
 * 주택 종류는 엔진 result에 없다 — 입력 위젯(`PreHousingDisclosureSection`)의 라디오가 쓰는 폼 필드
 * `AssetForm.phdHousingType`(표시 축 — API 페이로드에 싣지 않는다)에서 읽어 내려온다
 * (`saleSplitActual`·`exemptionNote` 와 같은 규약). 필드가 없는 옛 이력·미입력은 «단독·다가구»다.
 *
 * 위치: 결과 화면(components)·PDF(lib/pdf)·⑧ 검증 메시지(lib/calc)가 함께 읽으므로 lib/calc에 둔다.
 * `AssetForm`은 타입으로만 가져온다(런타임 import 순환 없음).
 * 상속 주택(영 §163⑨2호 경로)의 같은 이름은 `convertedHousePriceNames`(`lib/tax-engine/inheritance-house-valuation.ts`)다.
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

/**
 * 환산의 재료인 **고시 가격 자체**의 이름 — 공동주택 «공동주택가격», 그 밖 «개별주택가격».
 * 결과 이름(`phdConvertedPriceName`)과 한 문장에 나올 때(예: «…주택가격 최초 공시일 전이면 … 환산 …가격») 짝을 맞추는 데 쓴다.
 */
export function phdDisclosedPriceName(apartment: boolean | undefined): string {
  return apartment ? "공동주택가격" : "개별주택가격";
}
