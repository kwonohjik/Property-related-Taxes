/**
 * ⑫ 겸용주택 **별개 취득 파트 모델**(B1) Zod — 중첩 객체 정의 + 결합 제외·값 누락 superRefine.
 *
 * `transfer-tax-schema-mixed-use.ts`가 길어져 분리했다. **중첩 객체는 정의가 없으면 침묵 strip된다**
 * (비엄격 `z.object` — predo anchor P-1이 이를 증명했고 R-B1이 긍정 짝이다).
 * 제외 조합·필수값 규칙은 **엔진 leaf(`mixed-use-part-acq.ts`)가 단일 소스**다 — 여기에 규칙을 다시 쓰지 않는다
 * (UI 통과 ↔ 서버 차단 모순 금지 · ⑧ `transfer-tax-validate-mixed-use-asset.ts`도 같은 leaf를 부른다).
 */
import { z } from "zod";
import {
  MIXED_PART_ACQ_MODES,
  collectMixedPartAcqIssues,
  type MixedPartAcqSource,
} from "@/lib/tax-engine/mixed-use-part-acq";

/**
 * 모드가 쓰지 않는 값 필드는 무시된다(엔진이 모드 키로 읽는다). `.nonnegative()`로 두는 이유 — 0·미입력은
 * 「값 누락」(X-6)으로 **구체적인 메시지**와 함께 막는다(Zod 일반 오류가 아니라).
 */
export const mixedSeparateAcquisitionSchema = z.object({
  landMode: z.enum(MIXED_PART_ACQ_MODES),
  buildingMode: z.enum(MIXED_PART_ACQ_MODES),
  landAcquisitionPrice: z.number().int().nonnegative().optional(),
  landSalesCaseValue: z.number().int().nonnegative().optional(),
  buildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  buildingSalesCaseValue: z.number().int().nonnegative().optional(),
  housingBuildingContractPrice: z.number().int().nonnegative().optional(),
});

/** 파트 모델이 아니면(`separateAcquisition` 부재) 아무것도 하지 않는다. */
export function refineMixedSeparateAcquisition(v: MixedPartAcqSource, ctx: z.RefinementCtx): void {
  for (const issue of collectMixedPartAcqIssues(v)) {
    ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }
}
