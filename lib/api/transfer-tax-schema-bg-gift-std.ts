/**
 * ⑫ 부담부증여 × 건물·일반건물 × 기준시가 평가 — 증여일 건물 기준시가(`burdenedGiftInfo.giftBuildingStdPriceAtTransfer`) 필수.
 * 술어·문구는 ⑤⑧과 같은 `lib/calc/bg-gift-building-std-required.ts`(3중 패턴). 단건·다건 공용 진입점과 컴패니언 항목이 부른다.
 */
import { z } from "zod";
import { bgGiftBuildingStdMissingMessage, bgGiftBuildingStdRequired } from "@/lib/calc/bg-gift-building-std-required";

type Body = {
  propertyType?: string;
  transferType?: string;
  selfOwns?: string;
  burdenedGiftInfo?: unknown;
};
type Info = { valuationMode?: string; giftBuildingStdPriceAtTransfer?: number };

export function refineBgGiftBuildingStd(data: Body, ctx: z.RefinementCtx, basePath: (string | number)[] = []): void {
  const info = data.burdenedGiftInfo as Info | null | undefined;
  if (!info) return;
  if (!bgGiftBuildingStdRequired({ kind: data.propertyType, transferType: data.transferType, valuationMode: info.valuationMode, selfOwns: data.selfOwns })) return;
  if ((info.giftBuildingStdPriceAtTransfer ?? 0) > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [...basePath, "burdenedGiftInfo", "giftBuildingStdPriceAtTransfer"],
    message: bgGiftBuildingStdMissingMessage(data.propertyType),
  });
}
