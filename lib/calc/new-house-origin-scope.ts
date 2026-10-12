/**
 * §155① 신규 주택 **취득 경위** 질문의 범위와 ⑧ 필수 규칙 (결정 #43 · G6-4) — ⑤ 노출·⑧ 검증이 같은 술어를 쓴다.
 *
 * - 노출: 양도 주택(§154① 비과세 판정 자산)보다 **나중에 취득한 행** — §155① 신규 주택 후보. 후보가 아닌 행(양도 주택보다 먼저
 *   취득)에는 묻지 않는다. 단 ⑧이 필수로 요구하는 행(도출된 신규 주택)은 **항상 연다** — 합가 D8 상대 쪽 짝(B→C)은 C가 양도 주택보다
 *   먼저 취득돼도 신규 주택이 되는데, 그 행에 답할 칸이 없으면 막다른 오류가 된다. 원조합원·자가 재건축 행은 완공일이 양도 주택보다 뒤여도 기존주택 취득일이 앞서면 후보에서 빠지는데,
 *   그 사실을 입력할 수 있도록 **완공일 기준으로 연다**.
 * - 필수: 명부에서 **신규 주택으로 도출된 행**(`TemporaryTwoHouseDates.newHouseRowId`)만. 후보가 둘 이상이면 도출하지 않으므로 묻지 않는다.
 *   「모름」은 유효한 답이다(막지 않는다).
 */
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

/** ⑤ — 이 행에 취득 경위 질문을 여는가. */
export function newHouseOriginQuestionVisible(
  primaryKind: string | undefined,
  primaryAcquisitionDate: string | undefined,
  house: Pick<HouseEntry, "acquisitionDate"> & Partial<Pick<HouseEntry, "id">>,
  /** ⑧이 읽는 도출 결과(`TemporaryTwoHouseDates.newHouseRowId`) — 이 행이면 후보 술어와 무관하게 연다. */
  derivedNewHouseRowId?: string,
): boolean {
  if (!isOneHouseExemptionAsset(primaryKind)) return false;
  if (derivedNewHouseRowId && house.id === derivedNewHouseRowId) return true;
  if (!primaryAcquisitionDate || !house.acquisitionDate) return false;
  // 문자열 `YYYY-MM-DD`의 사전식 비교가 곧 시간순이다(폼 전역 규약). 같은 날 취득은 양도 후 취득으로 보는 규약이라 후보가 아니다.
  return house.acquisitionDate > primaryAcquisitionDate;
}

const RIGHT_KINDS = new Set(["successor_right", "original_member_house", "original_member_non_house", "presale", "self_rebuild"]);

/** ⑧ — 신규 주택으로 도출된 행이 취득 경위(와 권리 취득일)를 답하지 않았다. */
export function newHouseOriginIssue(
  row: Pick<HouseEntry, "id" | "acquisitionDate" | "acquisitionOrigin" | "rightAcquisitionDate"> & Partial<Pick<HouseEntry, "rightApprovalDate">>,
  newHouseRowId: string | undefined,
): { field: string; message: string } | null {
  if (!newHouseRowId || row.id !== newHouseRowId) return null;
  if (!row.acquisitionOrigin) {
    return {
      field: "acquisitionOrigin",
      message:
        "일시적 2주택의 신규 주택으로 판정된 주택입니다 — 이 주택을 어떻게 취득했는지(일반 취득·분양권·조합원입주권·재건축 등) 선택하세요. 모르면 「모름」을 고르세요.",
    };
  }
  if (RIGHT_KINDS.has(row.acquisitionOrigin)) {
    if (!row.rightAcquisitionDate) {
      return {
        field: "rightAcquisitionDate",
        message: "권리 취득일(분양권 취득일·입주권 승계취득일·인가일·기존주택 취득일)을 입력하세요 — 모르면 경위를 「모름」으로 고르세요.",
      };
    }
    if (row.acquisitionDate && row.rightAcquisitionDate > row.acquisitionDate) {
      return {
        field: "rightAcquisitionDate",
        message: "권리 취득일은 이 주택의 취득일(완공·잔금일)보다 늦을 수 없습니다.",
      };
    }
    // 입주권은 관리처분계획 인가 뒤에만 생긴다 — 인가일이 승계취득일보다 늦으면 모순이다(같은 날은 허용).
    if (row.acquisitionOrigin === "successor_right" && row.rightApprovalDate && row.rightApprovalDate > row.rightAcquisitionDate) {
      return {
        field: "rightApprovalDate",
        message: "관리처분계획 인가일은 입주권 승계취득일보다 늦을 수 없습니다 — 입주권은 인가 뒤에 생깁니다. 모르면 인가일을 비워 두세요.",
      };
    }
  }
  return null;
}
