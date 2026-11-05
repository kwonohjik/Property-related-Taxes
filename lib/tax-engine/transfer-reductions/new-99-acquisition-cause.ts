/**
 * §99·§99의3 취득 원인 게이트 — 공용 leaf (리뷰 NH-03 · NH-17 · NH-40 · NH-16).
 *
 * 조세특례제한법 §99①·§99의3①은 감면 대상 신축주택을 두 갈래로 한정한다.
 *   - 주택건설사업자로부터 취득(§99①2호 · §99의3①1호): «주택건설업자와 **최초로 매매계약을 체결하고 계약금을 납부한 자**가 취득»
 *   - 자기건설(§99①1호 · §99의3①2호): «**자기가 건설한**» 주택(조합원 취득 포함)
 * 상속·증여로 받은 주택은 법문상 어느 갈래에도 해당하지 않는다(리뷰 인용 해석례 재산세제과-1028·서면4팀-1192 — 본문 미확인, 메시지는 법문만 인용).
 * 자기건설 주택의 지분을 증여·상속으로 추가 취득한 경우도 그 지분은 자기가 건설한 것이 아니라 지분별로 판정한다
 * (사용자 결정 리뷰 Q-3 지분별 — 리뷰 인용 대법원 2010두6847 · 기준-2024-0151). 계산 입력 하나(자산·지분 하나)의 취득 원인이 그 판정 단위다.
 *
 * - 이월과세 증여(`carryover_gift`)는 이 게이트가 판정하지 않는다 — 수정 전 동작 그대로 둔다(국세청 해석 원문 확인 후 별도, 리뷰 Q-3 보류).
 * - 매매로 취득한 주택건설사업자 갈래는 분양권 승계 여부를 3-state로 받는다. «아니오»는 불성립, «모름»은 불성립 + 확인 필요.
 *   화면(⑧)은 답을 필수로 받는다. 값이 없는 직접 API·옛 이력은 종전과 같이 계산한다(레거시 경로 현행 유지 — 리뷰 Q-3 계획서 결정).
 * - §99의3의 조합원은 관리처분계획 인가일(사업계획 승인일) 현재의 조합원이다(조특령 §99의3③2호·⑤). 재개발 자산의 승계조합원
 *   (인가일 뒤 입주권 승계 — `redevelopment.isSuccessorMember`, 인가일은 자산의 관리처분계획 인가일)은 어느 갈래에도 해당하지 않는다.
 *   §99 조합원 갈래(§99①1호 괄호)에는 인가일 요건이 없다.
 */
import type { TriStateAnswer } from "./new-99-luxury-house";
import { NEW_HOUSING_ACQUISITION_ARTICLE as ART } from "../legal-codes/transfer-house";

export type New99AcquisitionCause =
  | "purchase"
  | "inheritance"
  | "gift"
  | "carryover_gift"
  | "newConstruction"
  | "burdened_gift";

export interface New99AcquisitionGateInput {
  article: "new_99" | "new_99_3";
  acquisitionType: "from_builder" | "self_built";
  acquisitionCause?: New99AcquisitionCause;
  /** (주택건설사업자 갈래 · 매매 취득) 주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 사람이 본인인가 */
  firstContract?: TriStateAnswer;
  /** 재개발 자산의 승계조합원(관리처분계획 인가일 뒤 입주권 승계)인가 */
  isRedevSuccessorMember?: boolean;
}

export interface New99AcquisitionGateReason {
  code: "ACQUIRED_BY_INHERITANCE_OR_GIFT" | "NOT_FIRST_CONTRACT" | "FIRST_CONTRACT_UNCONFIRMED" | "NOT_MEMBER_AT_APPROVAL";
  message: string;
  legalBasis: string;
}

/** 주택건설사업자 갈래에서 최초 계약 여부를 물어야 하는 취득 원인인가 — UI·⑧·④·⑫·엔진 공용 술어 */
export function needsFirstContractAnswer(
  acquisitionType: string | undefined,
  acquisitionCause: string | undefined,
): boolean {
  if (acquisitionType === "self_built") return false;
  return acquisitionCause !== "inheritance" && acquisitionCause !== "gift" && acquisitionCause !== "carryover_gift";
}

export function evaluateNew99AcquisitionGate(input: New99AcquisitionGateInput): New99AcquisitionGateReason | undefined {
  const { article, acquisitionType, acquisitionCause } = input;
  const is993 = article === "new_99_3";
  // §99: 1호 자기건설 · 2호 주택건설사업자 / §99의3: 1호 주택건설사업자 · 2호 자기건설
  const selfBuiltArticle = is993 ? ART.NEW_99_3_SELF_BUILT : ART.NEW_99_SELF_BUILT;
  const builderArticle = is993 ? ART.NEW_99_3_FROM_BUILDER : ART.NEW_99_FROM_BUILDER;

  if (acquisitionCause === "inheritance" || acquisitionCause === "gift") {
    const causeLabel = acquisitionCause === "inheritance" ? "상속" : "증여";
    if (acquisitionType === "self_built") {
      return {
        code: "ACQUIRED_BY_INHERITANCE_OR_GIFT",
        message:
          `${causeLabel}으로 취득한 주택(지분)은 «자기가 건설한» 신축주택이 아니라 적용되지 않습니다 (${selfBuiltArticle}) — ` +
          "자기건설 주택의 지분을 증여·상속으로 추가 취득했다면 그 지분은 자기건설분과 따로 판정합니다.",
        legalBasis: selfBuiltArticle,
      };
    }
    return {
      code: "ACQUIRED_BY_INHERITANCE_OR_GIFT",
      message:
        `${causeLabel}으로 취득한 주택은 «주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 자가 취득»한 주택이 아니라 적용되지 않습니다 (${builderArticle}).`,
      legalBasis: builderArticle,
    };
  }

  if (is993 && input.isRedevSuccessorMember === true) {
    return {
      code: "NOT_MEMBER_AT_APPROVAL",
      message:
        `관리처분계획 인가일 뒤에 입주권을 승계한 조합원은 «관리처분계획 인가일(사업계획 승인일) 현재의 조합원»이 아니라 §99의3이 적용되지 않습니다 (${ART.NEW_99_3_MEMBER_AT_APPROVAL}). ` +
        `주택건설업자와 최초로 매매계약을 체결한 자도 아닙니다(${ART.NEW_99_3_FROM_BUILDER}).`,
      legalBasis: ART.NEW_99_3_MEMBER_AT_APPROVAL,
    };
  }

  if (!needsFirstContractAnswer(acquisitionType, acquisitionCause)) return undefined;
  const branch = builderArticle;
  if (input.firstContract === "yes" || input.firstContract === undefined) return undefined;
  if (input.firstContract === "no") {
    return {
      code: "NOT_FIRST_CONTRACT",
      message: `분양권을 승계(전매)받아 취득한 주택은 «주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 자가 취득»한 주택이 아니라 적용되지 않습니다 (${branch}).`,
      legalBasis: branch,
    };
  }
  return {
    code: "FIRST_CONTRACT_UNCONFIRMED",
    message:
      `확인 필요: 본인이 주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부했는지 확인되지 않아 적용하지 않았습니다 (${branch}). ` +
      "최초 계약자라면 「최초 계약 여부」를 「예」로 선택하고 다시 계산하세요.",
    legalBasis: branch,
  };
}
