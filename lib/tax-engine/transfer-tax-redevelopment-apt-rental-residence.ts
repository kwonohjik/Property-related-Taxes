/**
 * 재개발 완공APT × 「소득세법 시행령」 §155⑳ 장기임대주택 보유자 **거주주택** 특례 (계획서 `redev-apt-rental-residence-155-20.plan.md` D-2).
 *
 * 국세청은 거주주택이 재건축·재개발로 신축된 뒤 양도해도 이 특례를 적용하고, 거주기간은 멸실 전 주택과 신축 주택의 실제 거주를
 * 통산한다(부동산납세과-827 · 서면-2015-부동산-1491). 현행 영 §155⑳(MST 290841) 1호는 「보유기간 중 거주기간 2년 이상」이고
 * 재건축 주택을 빼는 문언이 없다. 종전에는 완공APT 분기가 §155⑳ 단계보다 먼저 반환해(`transfer-tax.ts`) 특례가 통째로 빠졌다
 * — 같은 사실에서 일반 주택 0 · 완공APT 124,366,000(계획서 §1).
 *
 * 🔑 요건 판정은 **판정 메뉴·계산기와 같은 leaf**다(`buildRentalHousingVerdict` → `judgeRentalHousingEligibility` · 세대 구성). 일반 경로 STEP 2.5는 §166 3분할 양도차익을 모르는 자체 세액
 * 산식이라 쓰지 않는다. 대신 §155⑳이 「국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」하라는 조문이므로
 *   · 요건이 서면 — 임대주택을 세대 주택 수에서 뺀 입력으로 정본 판정을 한다(다른 특례와 겹친 구성은 그 특례 판정이 그대로 돈다).
 *   · 서지 않으면 — 계산기 일반 경로와 같이 임대주택을 주택 수에 되돌려(STEP 0.96과 같은 leaf) 판정하고, 세대 구성 불성립만
 *     판정 뒤 거둔다(`revokeExemptionOnRentalCompositionExceeded` — D12). 판정 메뉴(`applyRentalHousingVerdict`)처럼 무조건 거두면
 *     되돌린 주택 수에서 서는 다른 특례(일시적 2주택 등)까지 지운다.
 * 12억 초과 안분·표2는 `calculateRedevelopmentTax`의 기존 경로가 판정 결과로 처리한다.
 *
 * ⚠️ 입력은 판정 번역본(`translateRedevAptForHousingJudgment`)이어야 한다 — 거주주택 취득일(승계조합원 = 사용승인일)·
 *    거주월수(원조합원 = 종전 + 신축 통산 · 승계조합원 = 신축만 — `resolveAptResidenceMonths`)를 요건 판정이 같은 값으로 본다.
 * ⚠️ 시나리오 B(직전거주주택보유주택 · 영 §161 기간 안분)는 §166 3분할과 결합할 근거가 없어 적용하지 않는다(Q-2 (a)) —
 *    비과세를 거두고 확인 필요를 알린다. 화면은 ⑧이 막는다.
 */
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { buildRentalHousingVerdict } from "./one-house/rental-housing-verdict";
import { revokeOneHouseExemption } from "./one-house/revoke-exemption";
import type { OneHouseJudgment } from "./one-house/types";
import { restoreRentalUnitsToHouseCount, revokeExemptionOnRentalCompositionExceeded } from "./transfer-tax-rental-housing-judge";
import { resolveRentalResidenceComposition } from "./transfer-tax-rental-residence-composition";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";

/** 완공APT 시나리오 B 미지원 고지 — ⑧ 오류 문구와 같은 사실을 말한다. */
export const REDEV_APT_RENTAL_SCENARIO_B_NOTICE =
  `재개발·재건축으로 완공된 주택은 장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})의 직전거주주택보유주택(시나리오 B · ` +
  `${TRANSFER_RENTAL_HOUSING.PIT_RD_161_1} 기간 안분)으로 계산하지 않았습니다 — §161 안분과 §166 양도차익 산식을 결합할 근거를 확인하지 못해 ` +
  "1세대1주택 비과세를 적용하지 않았습니다 — 확인이 필요합니다.";

/** 세대 주택 수에 이미 들어 있는 임대 호수 — `rentalUnitsToRestore`(STEP 0.96)와 같은 입력 전제의 거울. */
function rentalUnitsCounted(input: TransferTaxInput): number {
  const roster = input.houses ?? [];
  if (roster.length > 0) return roster.filter((h) => h.isLongTermRental).length;
  // 명부가 없으면 주택 수 1은 거주주택만 센 값이다 — 2 이상은 임대주택을 이미 센 입력으로 본다(STEP 0.96과 같은 규칙).
  return input.householdHousingCount === 1 ? 0 : (input.rentalHousingException?.rentalUnits?.length ?? 0);
}

export function prepareRedevAptRentalResidence(
  translated: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate: Date | undefined,
): {
  /** 정본 판정에 넘길 입력 — 특례가 서면 임대주택을 뺀 주택 수, 서지 않으면 되돌린 주택 수 */
  judgeInput: TransferTaxInput;
  /** 판정 결과에 특례 결론을 반영한다(서지 않으면 비과세를 거둔다) */
  finalize: (judgment: OneHouseJudgment) => OneHouseJudgment;
  steps: CalculationStep[];
  warnings: string[];
} {
  const rhe = translated.rentalHousingException;
  const passthrough = { judgeInput: translated, finalize: (j: OneHouseJudgment) => j, steps: [], warnings: [] };
  if (rhe?.applyException !== true) return passthrough;

  if (rhe.scenario === "B") {
    return {
      judgeInput: translated,
      finalize: (j) => (j.isExempt || j.isPartialExempt ? revokeOneHouseExemption(j) : j),
      steps: [{ label: "장기임대주택 거주주택 비과세 특례 — 적용 불가", formula: REDEV_APT_RENTAL_SCENARIO_B_NOTICE, amount: 0, legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20 }],
      warnings: [REDEV_APT_RENTAL_SCENARIO_B_NOTICE],
    };
  }

  const composition = resolveRentalResidenceComposition(translated, parsedRates, generalHouseAcquisitionDate);
  const verdict = buildRentalHousingVerdict(translated, composition);
  if (!verdict) return passthrough;

  if (verdict.passed) {
    const counted = rentalUnitsCounted(translated);
    const deemedCount = Math.max(1, translated.householdHousingCount - counted);
    return {
      judgeInput: { ...translated, householdHousingCount: deemedCount },
      finalize: (j) => j,
      steps: [
        {
          label: "장기임대주택 거주주택 비과세 특례",
          formula:
            `장기임대주택 ${rhe.rentalUnits?.length ?? 0}호의 요건과 거주주택 요건(보유기간 중 거주 2년 이상)을 충족해 ` +
            (deemedCount !== translated.householdHousingCount
              ? `임대주택을 세대 주택 수에서 빼고(${translated.householdHousingCount}주택 → ${deemedCount}주택) `
              : "임대주택을 세대 주택 수에서 뺀 채로 ") +
            "1세대1주택 비과세를 판정했습니다 — " +
            "거주기간은 멸실 전 주택과 신축 주택의 거주를 통산합니다(부동산납세과-827 · 서면-2015-부동산-1491)",
          amount: 0,
          legalBasis: verdict.legalBasis,
        },
      ],
      warnings: [...verdict.notices],
    };
  }

  // 불성립 — 계산기 일반 경로와 같다: 임대주택을 주택 수에 되돌려(STEP 0.96) 판정하고, 세대 구성 불성립(3중첩 등)만 판정 뒤 거둔다(D12).
  //   판정 메뉴처럼 무조건 거두지 않는다 — 되돌린 주택 수에서 다른 특례(임대주택이 일시적 2주택의 신규 주택 등)가 서면 그 비과세가 맞다
  //   (STEP 0.96 고지 「임대주택이 다른 특례(일시적 2주택 등)에 해당하면 … 판정합니다」와 같은 전제).
  const restored = restoreRentalUnitsToHouseCount(translated, translated, parsedRates, generalHouseAcquisitionDate);
  const warnings = [...(restored.notice ? [restored.notice] : []), ...verdict.notices];
  const reasons = [
    ...(verdict.compositionFailReason ? [verdict.compositionFailReason] : []),
    ...verdict.residenceFailReasons,
    ...verdict.unitFailReasons.map((u) => u.message),
  ];
  return {
    judgeInput: restored.input,
    finalize: (j) => {
      const revoked = revokeExemptionOnRentalCompositionExceeded(j, translated, parsedRates, generalHouseAcquisitionDate);
      if (revoked.notice) warnings.push(revoked.notice);
      return revoked.judgment;
    },
    steps: [
      {
        label: "장기임대주택 거주주택 비과세 특례 — 적용 불가",
        formula: reasons.length > 0 ? reasons.join(" · ") : "장기임대주택 거주주택 비과세 특례 요건 미충족",
        amount: 0,
        legalBasis: verdict.legalBasis,
      },
    ],
    // `finalize`가 구성 불성립 고지를 더한다 — 호출부는 판정 뒤에 읽는다.
    warnings,
  };
}
