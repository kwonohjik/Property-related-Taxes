/**
 * ⑫ 구주택 멸실·신축 통산(`landRebuildPriorHouse`, 해석 (5)) 와이어 shape · 값 검사 · ⑭ 변환 — 단건·다건·컴패니언이 공유한다.
 *
 * 설계: docs/02-design/features/appurtenant-land-rebuild-rate-basis.engine.design.md §3
 *
 * 컴패니언(함께 양도 2번째 이후 자산)은 이 키를 **받아서 명시 거부**한다(`refineLandRebuild`의 `host.supported: false`) —
 * 받지 않으면 Zod가 조용히 strip해 통산 없이 계산한다(`splitCarryoverShape`와 같은 사유). 다건 합산은 ⑭(`multi/route.ts`)가 옮긴다.
 *
 * ⚠️ **leaf 규약** — `zod`·순수 engine leaf·`date-coerce`만 import한다(`transfer-tax-schema-base-shape.ts`·`-split.ts`가 spread하므로 TDZ 방지).
 */
import { z } from "zod";
import { toDate, toOptionalDate } from "./date-coerce";
import { collectLandRebuildIssues, type LandRebuildPriorHouse } from "@/lib/tax-engine/transfer-land-rebuild-rate";

const landRebuildPriorHouseSchema = z.object({
  /** 구주택이 토지 취득 때부터 있었는가(since_land) / 취득 뒤에 생겼는가(later — `priorHouseStartDate` 필수) */
  startMode: z.enum(["since_land", "later"]),
  /** `later`일 때만 — 구주택 취득일(본인 소유 개시일). since_land에서 보내면 거부(자동 채움·잔재 금지) */
  priorHouseStartDate: z.string().date().optional(),
  /** 구주택 멸실일 */
  demolitionDate: z.string().date(),
  /** 신축주택 정착면적이 구주택보다 늘지 않았음을 확인했는가 — true가 아니면 거부(사전-2023-법규재산-0097 전제) */
  footprintUnchanged: z.boolean(),
});

export const landRebuildShape = {
  landRebuildPriorHouse: landRebuildPriorHouseSchema.optional(),
} as const;

type WireRebuild = z.infer<typeof landRebuildPriorHouseSchema>;

/**
 * ⑫ 값 검사 — 엔진 진입(`calcSplitGain`)·⑧과 **같은 leaf**(`collectLandRebuildIssues`). 입력이 없으면 아무것도 보지 않는다.
 * `isHousing`: 주 자산은 `propertyType === "housing"`, 컴패니언은 `assetKind === "housing"`(어차피 `host.supported: false`로 거부).
 */
export function refineLandRebuild(
  d: {
    landRebuildPriorHouse?: WireRebuild;
    mixedUse?: unknown;
    acquisitionCause?: string;
    landAcquisitionCause?: string;
    acquisitionDate?: string;
    landAcquisitionDate?: string;
    selfOwns?: string;
    transferType?: string;
  },
  isHousing: boolean,
  ctx: z.RefinementCtx,
  prefix: (string | number)[] = [],
  host: { supported: boolean } = { supported: true },
): void {
  if (!d.landRebuildPriorHouse) return;
  const issues = collectLandRebuildIssues({
    isHousing,
    isMixedUse: !!d.mixedUse,
    hostSupported: host.supported,
    buildingAcquisitionCause: d.acquisitionCause,
    landAcquisitionCause: d.landAcquisitionCause,
    buildingAcquisitionDate: d.acquisitionDate,
    hasLandAcquisitionDate: !!d.landAcquisitionDate,
    landAcquisitionDate: d.landAcquisitionDate,
    selfOwns: d.selfOwns,
    isBurdenedGift: d.transferType === "burdened_gift" || d.acquisitionCause === "burdened_gift",
    rebuild: d.landRebuildPriorHouse,
  });
  for (const i of issues) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...prefix, ...i.field.split(".")], message: i.message });
  }
}

/** ⑭ — 와이어 → 엔진 입력. 날짜 문자열은 JSON 경유 후 string이라 Date 변환 필수(`date-coerce`). */
export function toEngineLandRebuild(w: WireRebuild | undefined): LandRebuildPriorHouse | undefined {
  if (!w) return undefined;
  return {
    startMode: w.startMode,
    priorHouseStartDate: toOptionalDate(w.priorHouseStartDate),
    demolitionDate: toDate(w.demolitionDate, "landRebuildPriorHouse.demolitionDate"),
    footprintUnchanged: w.footprintUnchanged,
  };
}
