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
import { autoCancelDeemed973Issue } from "@/lib/tax-engine/transfer-reductions/rental-97-3-auto-cancel";
import { aptPurchase973QuestionApplies } from "@/lib/tax-engine/transfer-reductions/rental-97-3-apt-purchase-exclusion";
import { APT_PURCHASE_973_MISSING_MESSAGE } from "@/lib/tax-engine/transfer-reductions/rental-97-3-apt-purchase-exclusion";
import { isAddenda29_2WindowIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { NEW_99_3_ADDENDA_6762 } from "@/lib/tax-engine/legal-codes/transfer-house";
import { new994CapitalRegionConflict } from "@/lib/tax-engine/transfer-reductions/new-99-4-size";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { assetKindGateMessage, reductionAssetKindFromWire } from "@/lib/tax-engine/transfer-reductions/asset-kind-gate";
import { RENTAL_973_RIGHT_TO_MOVE_IN_ID, rental973RightToMoveInBlockReason } from "@/lib/tax-engine/transfer-reductions/rental-97-3-right-after-auto-cancel";
import { findTrack127_7Conflict } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { findRental97StatutoryOverlap } from "@/lib/tax-engine/transfer-reductions/rental-97-statutory-overlap";
import { rental97StatutoryOverlapMessage } from "@/lib/tax-engine/transfer-reductions/rental-97-statutory-overlap";
import { findRental97TaxAmountOverlap } from "@/lib/tax-engine/transfer-reductions/rental-97-tax-amount-overlap";
import { rental97TaxAmountOverlapMessage } from "@/lib/tax-engine/transfer-reductions/rental-97-tax-amount-overlap";
import { isWithin5YearsCheck } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { track127_7ConflictMessage } from "@/lib/tax-engine/transfer-reductions/track-127-7-message";
import { assetContractDateForCause } from "@/lib/tax-engine/transfer-reductions/asset-contract-date";

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
  /** G-7 — §97의3 × 조합원입주권 요건(⑧ `rental973RightToMoveInBlockReason`과 같은 술어)에 쓰는 자산 사실 */
  right?: RightFacts,
) {
  const assetKind = reductionAssetKindFromWire(kind);
  if (!assetKind) return;
  (reductions ?? []).forEach((r, i) => {
    const message = assetKindGateMessage(r.type, assetKind) ?? rightToMoveIn973Message(r, assetKind, right);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, i, "type"], message });
  });
}

type RightFacts = {
  isSuccessorRightToMoveIn?: boolean;
  redevelopment?: { isSuccessorMember?: boolean; originalAssetType?: string; approvalDate?: string } | null;
};

/** G-7 — 조문 단위로 열린 §97의3 × 조합원입주권도 2731 사실관계(Q-5 a)가 아니면 막는다. 자산 사실이 없으면(모름) 막는다. */
function rightToMoveIn973Message(r: ReductionLike, assetKind: string, right: RightFacts | undefined): string | undefined {
  if (r.type !== RENTAL_973_RIGHT_TO_MOVE_IN_ID || assetKind !== "right_to_move_in") return undefined;
  const redev = right?.redevelopment ?? undefined;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return rental973RightToMoveInBlockReason({
    isSuccessor: right?.isSuccessorRightToMoveIn === true || redev?.isSuccessorMember === true,
    originalAssetType: redev?.originalAssetType,
    approvalDate: redev?.approvalDate,
    rentalContinuesToTransfer: typeof r.rentalContinuesToTransfer === "boolean" ? r.rentalContinuesToTransfer : undefined,
    autoCancelled973: r.autoCancelled973 === true,
    rentalEndDate: str(r.rentalEndDate),
    hasApprovalStdPrice: typeof r.stdPriceAtTransfer === "number" && r.stdPriceAtTransfer > 0,
  });
}

/**
 * 조특법 §127⑦ **트랙 교차** 차단 — ⑧(`validateStep2Reductions`)과 같은 단일 소스 술어(`findTrack127_7Conflict`)·문구(`track127_7ConflictMessage`).
 * 같은 카드(자산)에 차감형 + 세액감면형(또는 §98·§98의2 + 다른 감면)을 함께 실으면 엔진이 둘 다 적용해 이중 혜택이 된다
 * (§99의3 + §77 총세액이 낮은 쪽 단독보다 14,745,605 적음 — NH-41). 카드가 다르면 «일부에 한 감면, 남은 부분에 다른 감면»(단서)이라 막지 않는다.
 * 하이브리드 8종은 5년 분기로 트랙이 갈린다 — 취득일·양도일 중 하나라도 비면 분기를 알 수 없어 두 경우 모두 충돌일 때만 막는다.
 * 이어서 임대 범주 안 명문 배제 쌍(§97의3×§97의4 · §97의5×§97의3/4)도 ⑧ D2-05와 같은 단일 소스로 막는다(V-6).
 * 그 뒤 임대 세액감면 계열(§97 본문·단서·§97의2·§97의5) 안 쌍도 같은 방식으로 막는다 — 엔진이 첫 항목만 평가하기 때문이다(V-6 미측정분).
 */
export function refineReductionTrack127_7(
  reductions: ReadonlyArray<ReductionLike> | undefined,
  acquisitionDate: unknown,
  transferDate: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  /** V-7 — 거주주택 특례(§155⑳) 선언이 실리는 첫 주택 자산이면 문구에 경로 안내를 붙인다(차단 기준 불변). 컴패니언은 선언이 없어 생략. */
  opts?: { rentalHousingPath?: boolean },
) {
  const list = reductions ?? [];
  if (list.length < 2) return;
  const types = list.map((r) => r.type);
  const acq = toOptionalDate(acquisitionDate);
  const tr = toOptionalDate(transferDate);
  const within5s = acq && tr ? [isWithin5YearsCheck(acq, tr)] : [true, false];
  const conflicts = within5s.map((w) => findTrack127_7Conflict(types, w));
  const conflict = conflicts[0];
  if (conflict && !conflicts.some((c) => !c)) {
    const at = list.findIndex((r) => r.type === conflict.second.type);
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, Math.max(at, 0), "type"], message: track127_7ConflictMessage(conflict, opts) });
    return;
  }
  // 임대 범주 안 명문 배제 쌍(§97의3②·§97의5②) — ⑧과 같은 순서(§127⑦ 먼저)·같은 단일 소스·같은 문구
  const overlap = findRental97StatutoryOverlap(types);
  if (overlap) {
    const at = list.findIndex((r) => r.type === overlap.other);
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, Math.max(at, 0), "type"], message: rental97StatutoryOverlapMessage(overlap) });
    return;
  }
  // 임대 세액감면 계열(§97 본문·단서·§97의2·§97의5) 안 쌍 — 엔진이 첫 항목만 평가해 순서로 세액이 갈리던 것을 막는다(V-6 미측정분 Q-2 b)
  const taxOverlap = findRental97TaxAmountOverlap(types);
  if (!taxOverlap) return;
  const taxAt = list.findIndex((r) => r.type === taxOverlap.other);
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, Math.max(taxAt, 0), "type"], message: rental97TaxAmountOverlapMessage(taxOverlap) });
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
  /**
   * V-11 — 상속 자산은 자산-수준 매매계약일을 읽지 않는다(`assetContractDateForCause` — ⑤ 칸 숨김·④·엔진과 같은 leaf).
   * §99·§99의3은 상속 취득이면 엔진이 취득 원인으로 불적용한다(`evaluateNew99AcquisitionGate`) — 매매계약일을 요구하지 않는다(⑧과 같은 술어).
   */
  acquisitionCause?: string,
) {
  const member = redevelopment?.subject === "apt" && redevelopment.receiveOnlyMode !== true;
  const contractFallback = assetContractDateForCause(acquisitionCause, assetContractDate);
  const inherited = acquisitionCause === "inheritance";
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

    // V-13 — 조특령 §97⑤3호는 「상속인이 상속으로 인하여」 취득한 경우다. 상속 자산이 아니면 합산 입력을 받지 않는다(④는 싣지 않는다 — 직접 API 방어).
    if (r.type === "rental_97_5" && r.inheritance975 && !inherited)
      issue("inheritance975", "§97의5 피상속인 임대기간 합산(조특령 §97의5③ → §97⑤3호)은 상속받은 주택(acquisitionCause = inheritance)에만 적용됩니다.");
    // V-14 — §97의3도 같다. 단기→장기 변경신고 의제(조특령 §97의3④ 후단)와는 함께 받지 않는다(Q-2 · 엔진 사유와 같은 조건).
    if (r.type === "rental_97_3" && r.inheritance973 && !inherited)
      issue("inheritance973", "§97의3 피상속인 임대기간 합산(조특령 §97의3④ → §97⑤3호)은 상속받은 주택(acquisitionCause = inheritance)에만 적용됩니다.");
    if (r.type === "rental_97_3" && r.inheritance973 && r.shortTermConversion)
      issue("inheritance973", "§97의3 피상속인 임대기간 합산과 단기→장기 변경신고 임대개시 의제(shortTermConversion)는 함께 계산하지 않습니다.");
    // 구 조특령 §97의3②2호 자동말소 8년 간주 — ⑧과 같은 leaf(말소일 = rentalEndDate · 장기 등록일 = 변경신고 수리일 우선)
    if (r.type === "rental_97_3" && r.autoCancelled973) {
      const conv = r.shortTermConversion as { acceptedDate?: string } | undefined;
      const msg = autoCancelDeemed973Issue({
        rentalContinuesToTransfer: r.rentalContinuesToTransfer as boolean | undefined,
        cancelledDate: r.rentalEndDate as string | undefined,
        longRegistrationDate: conv?.acceptedDate ?? (r.registrationDate as string | undefined),
      });
      if (msg) issue(msg.field, msg.message);
    }
    // 종전 §97의3① 괄호 — 2020.7.11. 이후 등록 신청 아파트 매입임대(G-1). 질문 구간인데 답이 없으면 막는다(⑧과 같은 leaf).
    if (r.type === "rental_97_3" && r.aptPurchaseAfter0711_973 === undefined) {
      const conv = r.shortTermConversion as { acceptedDate?: string } | undefined;
      if (
        aptPurchase973QuestionApplies({
          longRegistrationDate: conv?.acceptedDate ?? (r.registrationDate as string | undefined),
          isShortTermConversion: conv !== undefined || r.isConvertedFromShortTerm === true,
        })
      )
        issue("aptPurchaseAfter0711_973", APT_PURCHASE_973_MISSING_MESSAGE);
    }

    if (r.type === "new_99_3") {
      // 라우터 기본값이 from_builder다(`income-deduction-router.ts`) — 미지정도 1호로 본다.
      if (member) {
        memberIssue("§99의3");
      } else if (r.acquisitionType993 === "self_built") {
        if (!r.usageApprovalDate993) issue("usageApprovalDate993", "§99의3 2호 적용: 사용승인일이 필요합니다.");
      } else if (!inherited && !r.contractDate993 && !contractFallback) {
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
      } else if (!inherited && !r.contractDate99 && !contractFallback) {
        // 조특법 §99①2호 — 「신축주택취득기간 중에 … 최초로 매매계약을 체결하고 계약금을 납부한 자」
        issue("contractDate99", "§99 적용: 매매계약일(contractDate99 또는 assetContractDate)이 필요합니다.");
      }
      if (r.houseType99 !== "detached" && !positive(r.exclusiveAreaSqm99))
        issue("exclusiveAreaSqm99", "§99 적용: 전용면적(㎡)이 필요합니다(고가주택 판정).");
      detachedFactsIssues(r, "99", "§99", issue, positive);
    }

    // Q-19 (US-41) — §98의3(매수)·§98의5·§98의7은 조문 칸 「최초 매매계약일」이 정본이다. 엔진은 자산-수준 `assetContractDate`로
    // 대신하지 않고 MISSING_CONTRACT_DATE로 부적격을 낸다 → 200 + 감면 0 대신 400으로 막는다 (⑧ 거울).
    if (r.type === "unsold_98_3" && r.houseType983 !== "self_built" && !r.contractDate983)
      issue("contractDate983", "§98의3 적용: 최초 매매계약일(contractDate983)이 필요합니다 (자산 매매계약일로 대신하지 않습니다).");
    if (r.type === "unsold_98_5" && !r.contractDate985)
      issue("contractDate985", "§98의5 적용: 최초 매매계약일(contractDate985)이 필요합니다 (자산 매매계약일로 대신하지 않습니다).");
    if (r.type === "unsold_98_7" && !r.contractDate987)
      issue("contractDate987", "§98의7 적용: 최초 매매계약일(contractDate987)이 필요합니다 (자산 매매계약일로 대신하지 않습니다).");

    // §99의2(구매·미분양·1세대1주택) — 같은 규칙. 자기건설은 사용승인일 기준이라 제외 (엔진은 유형 미지정이면 계약일 트랙).
    if (r.type === "unsold_99_2" && r.houseType992 !== "self_built" && !r.contractDate992)
      issue("contractDate992", "§99의2 적용: 최초 매매계약일(contractDate992)이 필요합니다 (자산 매매계약일로 대신하지 않습니다).");

    // Q-23 (a-1, 사용자 결정 2026-11-11) — 거주자·내국인·과밀 구분은 화면(⑧)이 반드시 받는 칸인데, ⑫에서 optional이라 API 직접 호출에서 빼면
    // 엔진이 `?? true`(거주자·내국인)·`=== true`(비과밀 100%)로 가정해 **조용히 낮은 세액**이 나왔다. 칸이 없으면 400으로 막는다(⑧ 거울).
    // 화면 경로는 폼 기본값(`UnifiedReductionPanel-defaults`)·마이그레이션이 항상 채워 영향이 없다. 엔진 기본값은 내부 호출·테스트의 안전망이라 그대로 둔다.
    const needBool = (key: string, message: string) => {
      if (typeof r[key] !== "boolean") issue(key, message);
    };
    if (r.type === "new_99") needBool("isResident99", "§99 적용: 거주자 여부(isResident99)가 필요합니다 — 비워 두면 거주자로 가정하지 않습니다 (법 §99① 「거주자」).");
    if (r.type === "new_99_3") needBool("isResident993", "§99의3 적용: 거주자 여부(isResident993)가 필요합니다 — 비워 두면 거주자로 가정하지 않습니다 (법 §99의3① 「거주자」).");
    if (r.type === "unsold_98") needBool("isResident98", "§98 적용: 거주자 여부(isResident98)가 필요합니다 — 비워 두면 거주자로 가정하지 않습니다.");
    if (r.type === "unsold_98_2") needBool("isResident982", "§98의2 적용: 거주자 여부(isResident982)가 필요합니다 — 비워 두면 거주자로 가정하지 않습니다.");
    if (r.type === "unsold_98_7") needBool("isDomestic987", "§98의7 적용: 내국인 여부(isDomestic987)가 필요합니다 — 비워 두면 내국인으로 가정하지 않습니다 (법 §98의7① 「내국인」).");
    if (r.type === "unsold_98_8") needBool("isResident988", "§98의8 적용: 거주자 여부(isResident988)가 필요합니다 — 비워 두면 거주자로 가정하지 않습니다 (법 §98의8① 「거주자」).");
    if (r.type === "unsold_98_3") {
      if (r.residencyType983 === undefined)
        issue("residencyType983", "§98의3 적용: 거주 구분(residencyType983 — resident·nonresident_no_pe·nonresident_with_pe)이 필요합니다 — 비워 두면 거주자로 가정하지 않습니다 (법 §98의3①).");
      // Q-20 — 수도권과밀억제권역 여부는 3-state다. 비우면 엔진이 비과밀(100%)로 가정하므로 막는다(⑧과 같은 이유 — 과밀이면 감면율 60%·면적 한정).
      needBool("isOverconcentration983", "§98의3 적용: 주택이 수도권과밀억제권역에 있는지(isOverconcentration983: true·false)가 필요합니다 — 비워 두면 비과밀(100%)로 가정하지 않습니다 (과밀억제권역이면 감면율 60%·면적 한정, 령 §98의3①단서).");
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
