/**
 * ⑫ 비사업용 토지 판정 메뉴 요청 스키마 — `POST /api/calc/non-business-land-judgment`.
 *
 * 계획서 `docs/01-plan/features/nbl-judgment-menu.engine.plan.md` §3.2(D-E1) · 「사용자 결정 2차」 Q-1 (c).
 *
 * 본문은 `{ nonBusinessLandRaw, carryoverGiftRegistryDate? }`뿐이다. `propertySchema`를 재사용하지 않는다 — NBL 판정은 취득가·양도가가 필요 없다.
 * `nonBusinessLandRawSchema`(⑧ 거울 refine 포함)를 단일 소스로 쓰고, raw 스키마가 못 막는 **property 수준 규칙**만 계산기와 같은 조건·같은 문구로 얇게 막는다
 * (실측 틈 3건 — 상속인데 피상속인 취득일 없음 · 취득일 ≥ 양도일 · 빈 날짜가 `toDate`의 plain Error로 500).
 * 새 raw 칸이 생겨도(E3 진행 중) 메뉴가 자동으로 따라가도록 칸 목록을 하드코딩하지 않는다 — 아래 규칙이 읽는 칸은 판정에 직접 필요한 몇 개뿐이다.
 */
import { z } from "zod";
import { nonBusinessLandRawSchema } from "./transfer-tax-schema-nbl";
import { refineCarryoverTaxation } from "./transfer-tax-schema-companion-refines";

const isoDate = z.string().date();
const isIsoDate = (v: string | undefined): v is string => v !== undefined && isoDate.safeParse(v).success;

/** 이월과세 사건 머리 규칙에서 판정 메뉴가 묻지 않는 금액 칸의 이슈 — 걸러낸다(메뉴는 세액을 계산하지 않는다). */
const MONEY_ONLY_PATH_LEAVES: ReadonlySet<string | number> = new Set(["giftDateValuation", "donorAcquisitionPrice"]);

export const nblJudgmentRequestSchema = z
  .object({
    nonBusinessLandRaw: nonBusinessLandRawSchema,
    /**
     * 증여 등기접수일 — 이월과세(`acquisitionCause === "carryover_gift"`)일 때 시나리오 B(이월과세 배제 시 수증일 기산) 판정 입력.
     * 계산기의 `carryoverTaxation.giftRegistryDate`와 같은 값이다(`buildNblEngineInputGiftBasis`). 이월과세가 아니면 읽지 않는다.
     */
    carryoverGiftRegistryDate: isoDate.optional(),
  })
  .superRefine((data, ctx) => {
    const raw = data.nonBusinessLandRaw;
    const at = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nonBusinessLandRaw", ...path], message });

    // R1 — 판정 메뉴는 항상 상세 판정이다(`buildNblEngineInput`은 OFF면 undefined).
    if (raw.nblUseDetailedJudgment !== true) {
      at(["nblUseDetailedJudgment"], "비사업용 토지 판정은 정밀판정 입력이 필요합니다");
    }

    // R2 — 빈·깨진 날짜는 `toDate`가 plain Error를 던져 500이 된다. 계산기 top-level 날짜(`z.string().date()`)와 같은 형식으로 먼저 400.
    const acquisitionOk = isIsoDate(raw.acquisitionDate);
    const transferOk = isIsoDate(raw.transferDate);
    if (!acquisitionOk) at(["acquisitionDate"], "취득일(소유기간 기산일)을 YYYY-MM-DD 형식으로 입력하세요");
    if (!transferOk) at(["transferDate"], "양도일을 YYYY-MM-DD 형식으로 입력하세요");

    // R3 — 취득일 ≥ 양도일이면 엔진이 소유일수 0으로 비사업용에 조용히 접는다. 계산기 `transfer-tax-schema-refines.ts` 「취득일은 양도일보다 이전이어야 합니다」와 같다.
    // 이월과세의 raw `acquisitionDate`는 소유기간 기산일(= 증여자 취득일)이다.
    if (acquisitionOk && transferOk && raw.acquisitionDate >= raw.transferDate) {
      at(["acquisitionDate"], "취득일은 양도일보다 이전이어야 합니다");
    }

    // R4 — 상속: 피상속인 취득일 필수 · 상속개시일(= raw 취득일)보다 이전. 계산기와 같은 문구.
    if (raw.acquisitionCause === "inheritance") {
      if (!raw.decedentAcquisitionDate) {
        at(["decedentAcquisitionDate"], "상속의 경우 피상속인 취득일이 필수입니다");
      } else if (acquisitionOk && raw.decedentAcquisitionDate >= raw.acquisitionDate) {
        at(["decedentAcquisitionDate"], "피상속인 취득일은 상속개시일보다 이전이어야 합니다");
      }
    }

    // R5 — 이월과세(Q-1 (c)): 증여자 취득일·증여 등기접수일 필수, 날짜 순서(증여자 취득 → 증여 등기 → 양도)는 계산기 `refineCarryoverTaxation`을 **그대로** 부른다.
    // 금액 칸(증여 당시 평가액·증여자 취득가액)은 판정 메뉴가 묻지 않으므로 그 칸의 이슈만 걸러낸다.
    if (raw.acquisitionCause === "carryover_gift") {
      if (!raw.donorAcquisitionDate) at(["donorAcquisitionDate"], "이월과세 자산은 증여자 취득일이 필수입니다");
      if (!data.carryoverGiftRegistryDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["carryoverGiftRegistryDate"], message: "이월과세 자산은 증여 등기접수일이 필수입니다" });
      }
      if (isIsoDate(raw.donorAcquisitionDate) && data.carryoverGiftRegistryDate && transferOk) {
        refineCarryoverTaxation(
          {
            giftRegistryDate: data.carryoverGiftRegistryDate,
            donorAcquisitionDate: raw.donorAcquisitionDate,
            useEstimatedAcquisition: false,
            giftTaxAmount: 0,
            giftDateValuation: 0,
          },
          raw.transferDate,
          {
            addIssue: (issue: z.core.$ZodRawIssue) => {
              const path = (issue.path ?? []) as (string | number)[];
              const leaf = path[path.length - 1];
              if (leaf !== undefined && MONEY_ONLY_PATH_LEAVES.has(leaf)) return;
              const message = (issue as { message?: string }).message ?? "입력값이 올바르지 않습니다";
              // 증여자 취득일은 raw 칸, 증여 등기접수일은 요청 최상위 칸으로 옮긴다.
              if (leaf === "donorAcquisitionDate") at(["donorAcquisitionDate"], message);
              else if (leaf === "giftRegistryDate") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["carryoverGiftRegistryDate"], message });
              else at(["acquisitionCause"], message);
            },
          } as z.RefinementCtx,
          ["carryover"],
        );
      }
    }
  });

export type NblJudgmentRequest = z.infer<typeof nblJudgmentRequestSchema>;
