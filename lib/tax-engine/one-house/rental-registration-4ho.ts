/**
 * 삭제된 소득세법 시행령 §154①4호(임대사업자 등록 주택 거주기간 제한 면제) — 경과조치 판정 leaf (OH-38)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.5 · §9.7 L-3. 원문(DRF eflaw 실독 2026-09-28):
 *
 * - 종전 §154① 단서(MST 212809): 「1세대가 양도일 현재 국내에 1주택을 보유하고 있는 경우로서 … 제4호 및
 *   제5호에 해당하는 경우에는 거주기간의 제한을 받지 아니한다」 ⇒ **거주만** 면제(보유 2년 유지).
 * - 종전 4호: 「거주자가 해당 주택을 임대하기 위하여 법 제168조제1항에 따른 등록과 「민간임대주택에 관한
 *   특별법」 제5조에 따른 임대사업자등록을 한 경우. 다만, 「민간임대주택에 관한 특별법」 제43조를 위반하여
 *   임대의무기간 중에 해당 주택을 양도하는 경우와 임대보증금 또는 임대료의 연 증가율이 100분의 5를
 *   초과하는 경우는 제외한다.」
 * - 부칙<제29523호> 제6조: 「제154조제1항제4호 … 의 개정규정은 이 영 시행 이후 주택 임대차계약을
 *   체결하거나 기존 계약을 갱신하는 분부터 적용한다.」(시행 2019-02-12) ⇒ 5% 단서는 2019-02-12 이후 계약분만.
 * - 부칙<제30395호> 제38조(시행 2020-02-11): ① 「이 영 시행 전에 양도한 분에 대해서는 제154조제1항의
 *   개정규정에도 불구하고 종전의 규정에 따른다.」 ② 「1세대가 조정대상지역에 1주택을 보유한 거주자로서
 *   2019년 12월 16일 이전에 해당 주택을 임대하기 위해 법 제168조제1항에 따른 사업자등록과 「민간임대주택에
 *   관한 특별법」 제5조제1항에 따른 임대사업자로 등록을 신청한 경우에는 해당 주택을 이 영 시행 이후
 *   양도하는 경우라도 제154조제1항의 개정규정에도 불구하고 종전의 규정에 따른다.」
 *
 * 국세청 해석(taxlaw.nts.go.kr 원문 확인 2026-09-28):
 * - 자동말소(민특법 §6⑤) 후에는 5% 단서를 따지지 않는다 — 서면-2022-법규재산-4654(법규과-1810, 2023.7.10.).
 * - 자진말소(민특법 §6①11호) 후에는 임대의무기간 중 양도·5% 초과여도 거주요건 면제 — 서면-2020-법령해석재산-3974
 *   (법령해석과-779, 2021.3.8.) · 서면-2023-법규재산-3842(법규과-1427, 2025.6.25.) 질의2.
 * - 재개발·재건축 멸실 후 말소 — 서면-2024-법규재산-5082(법규과-824, 2026.4.2.).
 * - 분양권 상태 등록도 적용 — 사전-2025-법규재산-0117(2025.3.17.).
 * - 2019.12.17. 이후 배우자 증여로 포괄승계 후 이혼·별도세대면 **부적용** — 사전-2024-법규재산-0747(2024.11.21.).
 *
 * 🔑 미입력은 **판정 보류**다(`undetermined`) — 면제로 추정하지 않는다. 「1주택 보유」 판정 시점(신청 당시 vs
 *    양도 당시)은 직접 선례 미확보라 **신청 당시 선언**을 받고, 양도일 1주택은 단서 문언이 따로 요구한다
 *    (1주택 맥락에서만 이 사유를 노출하는 `provisoGate`가 담보).
 */
import type { Rental4hoRegistrationFacts, TransferTaxInput } from "../types/transfer.types";
import { RENTAL_REGISTRATION_4HO } from "../legal-codes";

/** 부칙<제30395호> 제1조 — 공포일(2020-02-11) 시행. 이 날 전 양도는 제38조①. */
export const RENTAL_4HO_DELETION_EFFECTIVE_DATE = new Date("2020-02-11");
/** 부칙<제30395호> 제38조② — 「2019년 12월 16일 이전에 … 등록을 신청한 경우」 */
export const RENTAL_4HO_REGISTRATION_DEADLINE = new Date("2019-12-16");
/** 부칙<제29523호> 제1조 본문(공포일 시행)·제6조 — 5% 단서는 이 날 이후 체결·갱신 계약분 */
export const RENTAL_4HO_RENT_CAP_CONTRACT_START = new Date("2019-02-12");

export const RENTAL_4HO_REASON = "rental_registration_4ho" as const;

export type Rental4hoVerdict =
  | { status: "applies"; legalBasis: string }
  | { status: "excluded"; reasons: string[] }
  | { status: "undetermined"; missing: string[] };

type Rental4hoInput = Pick<TransferTaxInput, "transferDate" | "oneHouseExemptionProviso">;

/** 양도일이 부칙 제38조① 구간(시행 전 양도)인가 — 그렇지 않으면 ② 요건(신청 기한·1주택 선언)을 본다 */
export function isRental4hoTransferredBeforeDeletion(transferDate: Date): boolean {
  return transferDate.getTime() < RENTAL_4HO_DELETION_EFFECTIVE_DATE.getTime();
}

/** 적용 근거 — 종전 4호 + 부칙 제38조 ①/② (양도일로 가른다) */
export function rental4hoLegalBasis(transferDate: Date): string {
  const transitional = isRental4hoTransferredBeforeDeletion(transferDate)
    ? RENTAL_REGISTRATION_4HO.TRANSITIONAL_TRANSFERRED_BEFORE
    : RENTAL_REGISTRATION_4HO.TRANSITIONAL_APPLIED_BY_DEADLINE;
  return `${RENTAL_REGISTRATION_4HO.PRE_DELETION_ARTICLE} · ${transitional}`;
}

/**
 * 4호 판정. 사유가 4호가 아니면 null.
 * 반환이 `applies`일 때만 `resolveExemptionProviso`가 "residence_only"(거주만 면제)를 준다.
 */
export function resolveRental4hoRegistration(input: Rental4hoInput): Rental4hoVerdict | null {
  const p = input.oneHouseExemptionProviso;
  if (p?.reason !== RENTAL_4HO_REASON) return null;
  const f: Rental4hoRegistrationFacts = p.rentalRegistration4ho ?? {};
  const t = input.transferDate.getTime();
  const beforeDeletion = isRental4hoTransferredBeforeDeletion(input.transferDate);
  const missing: string[] = [];
  const excluded: string[] = [];

  const bizDate = f.businessRegistrationApplicationDate;
  const rentalDate = f.rentalRegistrationApplicationDate;
  if (!bizDate) missing.push("사업자등록(소득세법 §168①) 신청일");
  if (!rentalDate) missing.push("임대사업자 등록(민간임대주택법 §5①) 신청일");
  for (const [label, d] of [
    ["사업자등록", bizDate],
    ["임대사업자 등록", rentalDate],
  ] as const) {
    if (!d) continue;
    if (d.getTime() > t) {
      excluded.push(`${label} 신청일(${fmtDate(d)})이 양도일보다 늦습니다 — 양도 당시 등록한 주택이 아닙니다.`);
    } else if (!beforeDeletion && d.getTime() > RENTAL_4HO_REGISTRATION_DEADLINE.getTime()) {
      excluded.push(
        `${label} 신청일(${fmtDate(d)})이 2019년 12월 16일 뒤입니다 — 2020년 2월 11일 이후 양도는 ` +
          `2019년 12월 16일 이전에 신청한 경우에만 삭제 전 4호가 적용됩니다(${RENTAL_REGISTRATION_4HO.TRANSITIONAL_APPLIED_BY_DEADLINE}).`,
      );
    }
  }

  // 부칙 제38조② 고유 요건 — 시행(2020-02-11) 후 양도분에만 묻는다.
  if (!beforeDeletion) {
    if (f.regulatedOneHouseAtApplication === undefined) {
      missing.push("신청 당시 세대가 조정대상지역 1주택(분양권 상태 포함)만 보유했는지");
    } else if (!f.regulatedOneHouseAtApplication) {
      excluded.push(
        `신청 당시 세대가 조정대상지역에 1주택만 보유한 경우가 아닙니다 — ${RENTAL_REGISTRATION_4HO.TRANSITIONAL_APPLIED_BY_DEADLINE}는 ` +
          "「1세대가 조정대상지역에 1주택을 보유한 거주자로서」 신청한 경우에 한합니다.",
      );
    }
    // 사전-2024-법규재산-0747 — 2019.12.17. 이후 증여로 포괄승계 → 증여자와 별도 세대가 되면 부적용.
    if (f.giftSuccessionSeparatedHousehold) {
      excluded.push(
        "2019년 12월 17일 이후 증여로 임대사업자 지위를 포괄승계했고 등록을 신청한 증여자와 양도일 현재 " +
          "같은 세대가 아닙니다 — 삭제 전 4호가 적용되지 않습니다(사전-2024-법규재산-0747).",
      );
    }
  }

  // 양도일 현재 등록 상태 — 말소(자동·자진·멸실) 후에는 종전 4호 단서를 따지지 않는다(법규과-1810·1427·824).
  switch (f.statusAtTransfer) {
    case undefined:
      missing.push("양도일 현재 임대사업자 등록 상태(유지·자동말소·자진말소·멸실 말소)");
      break;
    case "other":
      missing.push(
        "자동말소·자진말소·멸실 말소 외의 사유로 말소된 경우의 종전 4호 단서(임대의무기간·5%) 적용 — 직접 선례를 확보하지 못했습니다",
      );
      break;
    case "maintained": {
      if (f.transferredDuringMandatoryPeriod === undefined) {
        missing.push("임대의무기간(민간임대주택법 §43) 중 양도인지");
      } else if (f.transferredDuringMandatoryPeriod) {
        excluded.push(
          `임대사업자 등록을 유지한 채 임대의무기간(${RENTAL_REGISTRATION_4HO.MANDATORY_PERIOD}) 중에 양도합니다 — 종전 4호 단서로 제외됩니다.`,
        );
      }
      if (f.rentIncreaseOver5Percent === undefined) {
        missing.push("임대보증금·임대료 연 5% 초과 증액 여부");
      } else if (f.rentIncreaseOver5Percent) {
        const c = f.rentIncreaseContractDate;
        if (!c) {
          missing.push("5% 초과 증액 계약의 체결·갱신일");
        } else if (c.getTime() >= RENTAL_4HO_RENT_CAP_CONTRACT_START.getTime()) {
          excluded.push(
            `${fmtDate(c)}에 체결·갱신한 계약에서 연 5%를 초과해 증액했습니다 — 종전 4호 단서로 제외됩니다` +
              `(2019년 2월 12일 이후 계약분부터 적용 — ${RENTAL_REGISTRATION_4HO.RENT_INCREASE_APPLICATION}).`,
          );
        }
      }
      break;
    }
    default:
      // auto_cancelled · voluntary_cancelled · demolition_cancelled — 단서를 따지지 않는다.
      break;
  }

  if (excluded.length > 0) return { status: "excluded", reasons: excluded };
  if (missing.length > 0) return { status: "undetermined", missing };
  return { status: "applies", legalBasis: rental4hoLegalBasis(input.transferDate) };
}

/** 판정 메뉴 「선언했으나 적용되지 않은 특례」 id — 계산기 경고도 같은 id로 고른다 */
export const RENTAL_4HO_UNMET_ID = "154-1-4ho-rental-registration";
export const RENTAL_4HO_LABEL = "삭제 전 §154①4호 임대사업자 등록 주택(거주기간 제한 면제)";

/** 「선언했으나 적용되지 않은 특례」 — 4호를 골랐는데 요건 미충족(판정 보류는 제외) */
export function collectRental4hoUnmet(input: Rental4hoInput) {
  const v = resolveRental4hoRegistration(input);
  if (v?.status !== "excluded") return [];
  return [
    {
      id: RENTAL_4HO_UNMET_ID,
      label: RENTAL_4HO_LABEL,
      legalBasis: rental4hoLegalBasis(input.transferDate),
      reasons: v.reasons,
    },
  ];
}

/** 표시용 날짜(YYYY-MM-DD) — `pending.ts`의 같은 이름 함수와 같은 규약 */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
