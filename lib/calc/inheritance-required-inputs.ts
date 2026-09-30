/**
 * 상속세 — 엔진이 읽는데 비우면 조용히 다른 세액이 되는 입력의 **공용 게이트** (⑧·⑫ 단일 소스).
 *
 * ⑧ `lib/calc/inheritance-validate.ts`와 ⑫ `lib/validators/inheritance-gift-required-refines.ts`가
 * 같은 술어를 부른다. 조건을 두 곳에 따로 적으면 한쪽만 바뀌어 「UI 통과 ↔ API 400」 모순이 생긴다.
 *
 * 2026-09-30 Zod↔엔진 필수 점검 2차(#6·#7·#10·#11).
 */
import {
  parseResidentNumber,
  isCompleteResidentNumber,
} from "@/lib/calc/resident-number";
import type {
  CasualtyLossInput,
  Heir,
  InheritanceDeductionInput,
  InheritanceTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * #6 자연인 상속인의 생년월일 원천이 없다 — 생년월일도, 생년월일을 도출할 수 있는 주민등록번호도 없다.
 * 엔진은 `birthDate`로만 미성년자·연로자·장애인 공제(상속세 및 증여세법 §20①2호·3호·4호)의 만 나이를 세며,
 * 없으면 해당 공제를 조용히 건너뛴다. 법인은 대상 아님.
 */
export function heirLacksBirthDateSource(
  heir: Pick<Heir, "relation" | "birthDate" | "residentNumber">,
): boolean {
  if (heir.relation === "corporate" || heir.birthDate) return false;
  const rrn = heir.residentNumber;
  return !(rrn && isCompleteResidentNumber(rrn) && parseResidentNumber(rrn));
}

/**
 * #7 §23 재해손실공제 — 재난 발생일이 없다. 엔진은 날짜가 없으면 「신고기한 이내」로 가정해
 * 공제한다(상속세 및 증여세법 §23① — 신고기한 이내 재난). 기한 판정을 명시(`isWithinFilingDeadline`)한
 * 입력은 엔진이 그 값을 쓰므로 날짜를 요구하지 않는다(화면 ④는 이 키를 싣지 않는다).
 */
export function casualtyLossDateMissing(cl: CasualtyLossInput | undefined): boolean {
  return cl !== undefined && !cl.disasterDate && cl.isWithinFilingDeadline === undefined;
}

const ANCILLARY_KEYS = [
  "ancillaryLandArea",
  "buildingFootprintArea",
  "ancillaryLandRegion",
  "ancillaryLandStdPrice",
] as const;

/**
 * #11 상속세 및 증여세법 §23의2① 주택부수토지 면적한도 — 네 항목 중 일부만 입력. 엔진은 네 항목이 모두 있어야 차감하므로
 * 일부만 오면 차감 없이 동거주택공제가 커진다. 전부 또는 전무여야 한다. 반환: 비어 있는 키(부분 입력일 때만).
 */
export function ancillaryLandMissingKeys(
  di: Pick<InheritanceDeductionInput, (typeof ANCILLARY_KEYS)[number]> | undefined,
): (typeof ANCILLARY_KEYS)[number][] {
  const missing = ANCILLARY_KEYS.filter((k) => di?.[k] === undefined);
  return missing.length > 0 && missing.length < ANCILLARY_KEYS.length ? missing : [];
}

/** ⑫ 경로(`creditInput` 기준)와 ⑧ 메시지를 함께 돌려주는 §30 검증 결과 */
export interface ShortTermReinheritIssue {
  path: (string | number)[];
  message: string;
}

/**
 * #10 상속세 및 증여세법 §30② 단기재상속세액공제 교차검증 — 자동 안분 fallback 금지.
 *
 * 엔진은 전의 상속재산가액(분모)이 없으면 분수 = 1(전부재상속)로, 전의 산출세액이 없으면 공제 0으로
 * 조용히 계산한다. 신규 재산별 배열 모델 + legacy 단일 분수 모델 모두 처리. 첫 문제만 돌려준다.
 * ⑧ 체크리스트 「shortTermReinherit」 비활성이면 ④가 필드를 전부 빼므로 이 검증을 통과한다.
 */
export function shortTermReinheritIssue(
  credit:
    | Pick<
        InheritanceTaxCreditInput,
        | "shortTermReinheritAssets"
        | "shortTermReinheritPriorDeathDate"
        | "shortTermReinheritPriorEstateValue"
        | "shortTermReinheritAssetValue"
        | "shortTermReinheritTaxPaid"
      >
    | undefined,
  deathDate: string | undefined,
): ShortTermReinheritIssue | null {
  if (!credit) return null;
  const assets = credit.shortTermReinheritAssets;
  const priorDeath = credit.shortTermReinheritPriorDeathDate;
  const priorEstate = credit.shortTermReinheritPriorEstateValue;
  const hasArrayAssets = assets != null && assets.length > 0;
  const hasLegacyAsset =
    credit.shortTermReinheritAssetValue != null && credit.shortTermReinheritAssetValue > 0;
  const hasPrior = priorEstate != null && priorEstate > 0;
  const issue = (path: (string | number)[], message: string) => ({ path, message });

  // 1차(전의) 상속개시일 ≤ 2차 상속개시일
  if (priorDeath && deathDate && priorDeath > deathDate) {
    return issue(
      ["shortTermReinheritPriorDeathDate"],
      "단기재상속 §30: 1차(전의) 상속개시일은 상속개시일보다 이후일 수 없습니다.",
    );
  }

  if (hasArrayAssets) {
    // ── 재산별 배열 모델 (집행 30-22-1②) ──
    if (!hasPrior) {
      return issue(
        ["shortTermReinheritPriorEstateValue"],
        "단기재상속 §30: 재상속분 재산을 입력한 경우 전의 상속재산가액(분모)을 입력해야 합니다.",
      );
    }
    if (credit.shortTermReinheritTaxPaid == null || credit.shortTermReinheritTaxPaid <= 0) {
      return issue(
        ["shortTermReinheritTaxPaid"],
        "단기재상속 §30: 재상속분 재산을 입력한 경우 전의 상속세 산출세액을 입력해야 합니다.",
      );
    }
    let sum = 0;
    for (let i = 0; i < assets!.length; i++) {
      const a = assets![i];
      // 각 재산 priorValue ≤ 전의 상속재산가액 (비율≤1, 집행 30-22-1③)
      if (a.priorValue > priorEstate!) {
        return issue(
          ["shortTermReinheritAssets", i, "priorValue"],
          `단기재상속 §30: 재상속분 재산 "${a.name ?? ""}" 가액이 전의 상속재산가액을 초과할 수 없습니다.`,
        );
      }
      sum += a.priorValue;
    }
    // Σ priorValue ≤ 전의 상속재산가액 (재상속분 합 ≤ 전상속재산)
    if (sum > priorEstate!) {
      return issue(
        ["shortTermReinheritAssets"],
        "단기재상속 §30: 재상속분 재산가액 합계가 전의 상속재산가액을 초과할 수 없습니다.",
      );
    }
    return null;
  }

  // ── legacy 단일 분수 모델 (§30②1호) — 분자·분모 동반 입력 강제 ──
  if (hasLegacyAsset && !hasPrior) {
    return issue(
      ["shortTermReinheritPriorEstateValue"],
      "단기재상속 §30②1호 안분: 재상속분 재산가액을 입력한 경우 전의 상속재산가액도 함께 입력해야 합니다.",
    );
  }
  if (!hasLegacyAsset && hasPrior) {
    return issue(
      ["shortTermReinheritAssetValue"],
      "단기재상속 §30②1호 안분: 전의 상속재산가액을 입력한 경우 재상속분 재산가액도 함께 입력해야 합니다.",
    );
  }
  if (hasLegacyAsset && hasPrior && credit.shortTermReinheritAssetValue! > priorEstate!) {
    return issue(
      ["shortTermReinheritAssetValue"],
      "단기재상속 §30②1호: 재상속분 재산가액(분자)이 전의 상속재산가액(분모)을 초과할 수 없습니다.",
    );
  }
  return null;
}
