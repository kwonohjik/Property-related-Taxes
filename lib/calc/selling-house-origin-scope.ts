/**
 * 양도 주택이 **기존주택의 연장**일 때의 §155① 종전주택 취득일 (결정 #43 하위 2 가 · G6-4) — ⑤ 노출·④ 전송·⑧ 검증이 같은 술어를 쓴다.
 *
 * 보유 주택을 헐고 다시 지은 주택, 원조합원 기존주택이 완공된 주택은 새로 취득한 주택이 아니라 기존주택의 연장이다(조심 2016서2731).
 * 양도 주택 「취득일」에 사용승인일·잔금일을 넣으면 헐기 전 주택을 가진 기간 중에 취득한 명부 주택이 「양도 주택보다 먼저 취득」으로
 * 읽혀 신규 주택 후보에서 빠진다. 헐기 전 주택 취득일을 따로 받아 §155① 종전주택 취득일로 쓴다.
 *
 * - 노출·적용: 양도 자산이 `housing`이고 보유 주택 명부에 행이 있을 때만(명부가 없으면 §155① 짝을 고를 대상이 없다).
 *   재개발 신축(`redevelopment_apt`)은 별도 축(`RedevelopmentFormSlice`)이라 이 질문을 받지 않는다.
 * - 비운 칸은 「일반 취득」이다 — 취득일 그대로(종전 동작). 갈래만 고르고 날짜를 비우면 ⑧이 막는다.
 * - 이 날짜는 §155① 종전주택 취득일에만 쓴다. 비과세 보유기간(§154①)·장기보유특별공제 기산은 그대로 양도 주택 「취득일」을 쓴다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type SellingAsset = Partial<AssetForm>;

/** ⑤ — 양도 주택의 취득 경위 질문을 여는가. */
export function sellingHouseOriginQuestionVisible(
  primary: Partial<Pick<AssetForm, "assetKind">> | undefined,
  houseCount: number | undefined,
): boolean {
  return primary?.assetKind === "housing" && (houseCount ?? 0) > 0;
}

/**
 * §155① 종전주택 취득일의 **대체값** — 기존주택의 연장이면 헐기 전 주택 취득일, 아니면 `undefined`(호출부가 제 기준 취득일을 그대로 쓴다).
 * 질문이 닫혀 있으면 남아 있는 옛 값(stale)은 읽지 않는다. 호출부마다 기준 취득일의 규약이 달라(`primaryAcquisitionDateOf` 등) 값을 합치지 않고 대체만 돌려준다.
 */
export function sellingHousePreviousDateOverride(primary: SellingAsset | undefined, houseCount: number | undefined): string | undefined {
  if (!primary || !sellingHouseOriginQuestionVisible(primary, houseCount)) return undefined;
  if (!primary.sellingHouseRebuildKind || !primary.sellingHouseExistingAcquisitionDate) return undefined;
  return primary.sellingHouseExistingAcquisitionDate;
}

/** ⑧ — 갈래를 골랐는데 헐기 전 주택 취득일이 비었거나 양도 주택 취득일보다 늦다. */
export function sellingHouseOriginIssue(
  primary: SellingAsset | undefined,
  houseCount: number | undefined,
): { field: string; message: string } | null {
  if (!primary || !sellingHouseOriginQuestionVisible(primary, houseCount) || !primary.sellingHouseRebuildKind) return null;
  const existing = primary.sellingHouseExistingAcquisitionDate;
  if (!existing) {
    return {
      field: "sellingHouseExistingAcquisitionDate",
      message: "양도 주택이 기존주택을 헐고 다시 지은 주택이면 헐기 전(기존) 주택 취득일을 입력하세요 — 해당하지 않으면 「일반 취득」을 고르세요.",
    };
  }
  if (primary.acquisitionDate && existing > primary.acquisitionDate) {
    return {
      field: "sellingHouseExistingAcquisitionDate",
      message: "헐기 전 주택 취득일은 양도 주택의 취득일(사용승인·잔금일)보다 늦을 수 없습니다.",
    };
  }
  return null;
}
