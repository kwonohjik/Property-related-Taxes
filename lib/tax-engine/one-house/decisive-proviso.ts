/**
 * §155 의제 경로(④⑤ 합가 · ⑥ 문화유산 · ⑦ 농어촌 · ⑧ 수도권 밖 부득이)의 §154① 단서 근거 — **결론을 바꿨을 때만** (V-F4 D-3).
 *
 * 이 경로들은 「§154①을 적용」이라 정본 `meetsOneHouseHoldingResidence`가 단서까지 함께 본다. 근거 표시는
 * 단서를 빼고 같은 정본을 다시 불러 **거짓일 때만** 남긴다 — 본칙만으로 충족했는데 단서를 근거로 적으면 근거가 틀린다
 * (E-4 OH-60 · E-3 F-2와 같은 축: 실제로 적용된 것만).
 *
 * 🔑 판정을 다시 쓰지 않는다 — 단서만 뺀 입력으로 정본 술어를 그대로 부른다.
 */
import { TRANSFER } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import { meetsOneHouseHoldingResidence, PROVISO_LABEL, type ExemptionReqInput } from "../transfer-tax-exemption-requirements";
import type { OneHouseAppliedException } from "./types";

/**
 * 호출부는 정본이 **참**인 것을 확인한 뒤 부른다(이 함수는 「단서 없이도 참인가」만 본다).
 * 반환: 결정적이면 적용 특례 행, 아니면 `undefined`.
 */
export function decisiveProvisoException(
  input: ExemptionReqInput,
  rule: OneHouseSpecialRulesData["one_house_exemption"],
): OneHouseAppliedException | undefined {
  const reason = input.oneHouseExemptionProviso?.reason;
  if (!reason) return undefined;
  if (meetsOneHouseHoldingResidence({ ...input, oneHouseExemptionProviso: undefined }, rule)) return undefined;
  return { id: `154-1-proviso:${reason}`, label: `§154① 단서 ${PROVISO_LABEL[reason]}`, legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT };
}
