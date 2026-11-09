/**
 * 양도세 감면(reductions[]) — **엔진이 필요로 하는데 Zod가 비워 두게 두던 값**을 ⑧과 같은 조건으로 요구한다
 * (2026-09-30 Zod↔엔진 필수 점검).
 *
 * 비우면 400이 아니라 **200 + 다른 세액**이었다 — 엔진·라우터가 빈 값을 조용히 채운다:
 *   - 전용면적: 라우터 `?? 0`(`income-deduction-router.ts`) → 고가주택(면적 기준) 판정이 켜지지 않는다
 *   - 매매계약일·사용승인일: 엔진이 취득일로 대신 읽는다(`new-99.ts`·`new-99-3.ts`) → 기간 판정이 바뀐다
 *   - 임대 계속 여부: `!== false`로 읽어 「계속 임대」가 된다(`rental-97-3.ts`·`rental-97-5.ts`) → 안분이 빠진다
 * ⑧ `lib/calc/transfer-tax-validate-reductions.ts`는 모두 요구한다. 여기 조건은 그 ⑧의 거울이다.
 * 매매계약일은 ⑧·라우터와 같이 자산-수준 `assetContractDate`로 대신할 수 있다.
 */
import { z } from "zod";
import { isAddenda29_2WindowIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { NEW_99_3_ADDENDA_6762 } from "@/lib/tax-engine/legal-codes/transfer-house";
import { new994CapitalRegionConflict } from "@/lib/tax-engine/transfer-reductions/new-99-4-size";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { assetKindGateMessage, reductionAssetKindFromWire } from "@/lib/tax-engine/transfer-reductions/asset-kind-gate";

type ReductionLike = { type: string } & Record<string, unknown>;

/**
 * 감면 × 자산 종류 게이트 — ⑧(`validateStep2Reductions`)과 같은 단일 소스 술어·문구(`assetKindGateMessage`).
 * ⑧을 거치지 않는 직접 호출은 200 + 감면 적용이었다(§99의3 × 토지·건물·상가건물 40,755,002 과소 — NH-54).
 * 엔진 진입이 아니라 여기(쪼개기 전 원본 본문)에서 거른다: 다건 집계가 겸용 컴패니언을 상가 land·building 카드로
 * 쪼개 감면을 싣기 때문에 엔진 `propertyType`로는 ⑧의 `assetKind`를 복원할 수 없다.
 * `kind`는 주 자산 `propertyType` · 컴패니언 `assetKind`(겸용 `mixed_use_house` 포함). 모르는 값은 막지 않는다.
 */
export function refineReductionAssetKindGate(
  reductions: ReadonlyArray<ReductionLike> | undefined,
  kind: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const assetKind = reductionAssetKindFromWire(kind);
  if (!assetKind) return;
  (reductions ?? []).forEach((r, i) => {
    const message = assetKindGateMessage(r.type, assetKind);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, i, "type"], message });
  });
}

export function refineReductionRequiredInputs(
  reductions: ReadonlyArray<ReductionLike> | undefined,
  assetContractDate: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  /**
   * 자산의 재개발 정보 — 완공 아파트(청산금 수령 단독신고 제외)면 §99·§99의3은 조합원 갈래라 매매계약일·사용승인일 대신
   * 준공일(`redevelopment.completionDate`)을 요구한다 (엔진 `redevMemberNewHouseOf` · ⑧과 같은 술어 · NH-36).
   */
  redevelopment?: { subject?: string; receiveOnlyMode?: boolean; completionDate?: string } | null,
) {
  const member = redevelopment?.subject === "apt" && redevelopment.receiveOnlyMode !== true;
  const memberCompletion = member ? redevelopment?.completionDate : undefined;
  (reductions ?? []).forEach((r, i) => {
    const at = (key: string) => [...path, i, key];
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: at(key), message });
    const positive = (v: unknown) => typeof v === "number" && v > 0;
    const memberIssue = (label: string) => {
      if (!memberCompletion)
        issue(
          "redevelopment.completionDate",
          `${label} 적용: 재개발·재건축 조합원이 받은 신축주택은 준공일(사용승인·사용검사일 — redevelopment.completionDate)로 판정합니다.`,
        );
    };

    if (r.type === "new_99_3") {
      // 라우터 기본값이 from_builder다(`income-deduction-router.ts`) — 미지정도 1호로 본다.
      if (member) {
        memberIssue("§99의3");
      } else if (r.acquisitionType993 === "self_built") {
        if (!r.usageApprovalDate993) issue("usageApprovalDate993", "§99의3 2호 적용: 사용승인일이 필요합니다.");
      } else if (!r.contractDate993 && !assetContractDate) {
        issue("contractDate993", "§99의3 1호 적용: 매매계약일(contractDate993 또는 assetContractDate)이 필요합니다.");
      }
      if (r.houseType993 !== "detached" && !positive(r.exclusiveAreaSqm993))
        issue("exclusiveAreaSqm993", "§99의3 적용: 전용면적(㎡)이 필요합니다(고가주택 판정).");
      // 법률 제6762호 부칙 §29② — 2호 사용승인 2003.1.1.~6.30.이면 2003.1.1. 전 착공 여부가 필요하다(자동 fallback 금지).
      if (
        (member
          ? isAddenda29_2WindowIso("self_built", memberCompletion)
          : isAddenda29_2WindowIso(r.acquisitionType993 as string | undefined, r.usageApprovalDate993 as string | undefined)) &&
        !r.constructionStartedBefore2003_993
      )
        issue(
          "constructionStartedBefore2003_993",
          `§99의3 2호 적용: 사용승인일이 2003.1.1.~2003.6.30.이면 2003.1.1. 전 공사 착수 여부(예·아니오·모름)가 필요합니다 (${NEW_99_3_ADDENDA_6762.PRIOR_CONSTRUCTION_STARTED}).`,
        );
      detachedFactsIssues(r, "993", "§99의3", issue, positive);
    }

    if (r.type === "new_99") {
      if (member) {
        memberIssue("§99");
      } else if (r.acquisitionType99 === "self_built") {
        if (!r.usageApprovalDate99) issue("usageApprovalDate99", "§99 적용: 자기건설 주택의 사용승인일이 필요합니다.");
      } else if (!r.contractDate99 && !assetContractDate) {
        // 조특법 §99①2호 — 「신축주택취득기간 중에 … 최초로 매매계약을 체결하고 계약금을 납부한 자」
        issue("contractDate99", "§99 적용: 매매계약일(contractDate99 또는 assetContractDate)이 필요합니다.");
      }
      if (r.houseType99 !== "detached" && !positive(r.exclusiveAreaSqm99))
        issue("exclusiveAreaSqm99", "§99 적용: 전용면적(㎡)이 필요합니다(고가주택 판정).");
      detachedFactsIssues(r, "99", "§99", issue, positive);
    }

    if ((r.type === "rental_97_3" || r.type === "rental_97_5") && r.rentalContinuesToTransfer === undefined) {
      issue(
        "rentalContinuesToTransfer",
        `임대가 양도일까지 계속되었는지(rentalContinuesToTransfer)가 필요합니다 (조특령 ${r.type === "rental_97_5" ? "§97의5②" : "§97의3⑤"}).`,
      );
    }
  });
}

/**
 * 단독주택을 고른 고급주택 판정(소득세법 시행령 §156 1호·3호 — NH-02)은 연면적·딸린 토지·하한·시설이 모두 있어야 한다 (⑧ 거울).
 * 주택 유형 자체가 없으면(직접 API·옛 이력) 종전과 같이 공동주택 기준으로 계산한다 — 여기서 막지 않는다.
 */
function detachedFactsIssues(
  r: ReductionLike,
  suffix: "99" | "993",
  label: string,
  issue: (key: string, message: string) => void,
  positive: (v: unknown) => boolean,
) {
  if (r[`houseType${suffix}`] !== "detached") return;
  if (!positive(r[`grossFloorAreaSqm${suffix}`]))
    issue(`grossFloorAreaSqm${suffix}`, `${label} 적용: 단독주택 연면적(㎡)이 필요합니다(고급주택 판정).`);
  if (!positive(r[`attachedLandAreaSqm${suffix}`]))
    issue(`attachedLandAreaSqm${suffix}`, `${label} 적용: 단독주택에 딸린 토지 면적(㎡)이 필요합니다(고급주택 판정).`);
  if (!r[`stdPriceFloorMet${suffix}`])
    issue(`stdPriceFloorMet${suffix}`, `${label} 적용: 단독주택 시가표준액·기준시가 하한 충족 여부(예·아니오·모름)가 필요합니다.`);
  if (!r[`luxuryFacility${suffix}`])
    issue(`luxuryFacility${suffix}`, `${label} 적용: 엘리베이터·에스컬레이터·67㎡ 이상 수영장 설치 여부(예·아니오·모름)가 필요합니다.`);
}

/**
 * §99의4 수도권 행 모순(리뷰 NH-20 · Q-7 (b)) — 명부 행 법정동코드(`ruralHouseRegionCode`)가 예외 아닌 수도권인데 소재지 요건을
 * 「충족」으로 보낸 선언은 막는다. ⑧(`house-count-exclusion-reduction-validate.ts`)과 같은 함수(`new994CapitalRegionConflict`).
 * 코드가 없으면(직접 API·수동 주소) 판정하지 않는다 — 소재지 토글은 종전대로 사용자 확인값이다.
 */
export function refineNew994CapitalRegion(
  reductions: ReadonlyArray<ReductionLike> | undefined,
  transferDate: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  (reductions ?? []).forEach((r, i) => {
    if (r.type !== "new_99_4_rural" && r.type !== "new_99_4_hometown") return;
    const conflict = new994CapitalRegionConflict({
      isHometown: r.type === "new_99_4_hometown",
      meetsLocationRequirement: r.meetsLocationRequirement as boolean | undefined,
      regionCode: r.ruralHouseRegionCode as string | undefined,
      transferDate: toOptionalDate(transferDate),
      ruralHouseAcquisitionDate: toOptionalDate(r.ruralHouseAcquisitionDate as string | undefined),
    });
    if (conflict) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, i, "meetsLocationRequirement"], message: `§99의4 적용: ${conflict}` });
    }
  });
}
