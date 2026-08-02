/**
 * 증여이익 → 증여세 마법사 prefill payload 어댑터.
 * `gift-deemed-api.ts`가 800줄 정책을 넘어 분리(트리거 800 · 착지 ≤700).
 * import 경로 보존을 위해 `gift-deemed-api.ts`에서 re-export한다.
 */
import type { DeemedGiftAnyResult } from "@/lib/tax-engine/gift-deemed/types";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { DEEMED_TYPE_META, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";

/**
 * 증여이익 → 증여세 마법사 prefill payload (sessionStorage "giftTaxResumeInput").
 * 산정된 증여재산가액을 category:"other" 단일 항목(이미 평가된 금액)으로 주입.
 */
export function buildGiftWizardPrefill(
  form: DeemedFormState,
  result: DeemedGiftAnyResult,
): Partial<GiftFormState> {
  // 증자 cap-table: 수증자별 과세분(total>0)을 각각 별도 증여항목으로 이관 (수증자별 증여세 단위 상이)
  if ("perBeneficiary" in result) {
    const nameById = new Map(result.byShareholder.map((b) => [b.id, b.name]));
    return {
      giftDate: form.giftDate,
      giftItems: result.perBeneficiary
        .filter((b) => b.total > 0)
        .map((b) => ({
          id: `deemed-ci-alloc-${b.beneficiaryId}`,
          category: "other" as const,
          name: `${(nameById.get(b.beneficiaryId) ?? "").trim() || "수증자"} 증자이익(§39)`,
          marketValue: b.total,
        })),
    };
  }

  const label = form.type ? DEEMED_TYPE_META[form.type].label : "증여이익";

  // §39의3 현물출자: contributionBreakdown 있으면 저가/고가별 prefill
  if (result.type === "contribution" && result.contributionBreakdown && result.contributionBreakdown.length > 0) {
    // M2 — 저가/고가 판정은 form.conCaseType 명시값으로. gross 대소비교 금지:
    //   고가 roster有도 gross(base) >= Σper-donee 성립 → gross 비교 시 오판.
    const isLow = form.conCaseType !== "high";

    if (isLow) {
      // 저가: N 증여자 → 동시증여 다건 prefill (§47, 조심2010서3741)
      const mainBreakdown = result.contributionBreakdown[0];
      const restBreakdowns = result.contributionBreakdown.slice(1);

      const toDonorRel = (r?: GiftDonorRelation) =>
        r ? deriveDonorRelation(r, false) : ("other_relative" as const);

      const simultaneousGifts =
        restBreakdowns.length > 0
          ? restBreakdowns.map((bd) => ({
              donorRelation: toDonorRel(bd.relation),
              taxableValue: String(bd.value),
            }))
          : undefined;

      return {
        giftDate: form.giftDate,
        donorRelation: toDonorRel(mainBreakdown.relation),
        giftItems: [
          {
            id: `deemed-contribution-${mainBreakdown.party}`,
            category: "other" as const,
            name: `현물출자에 따른 이익 — ${mainBreakdown.party} 증여분`,
            marketValue: mainBreakdown.value,
          },
        ],
        simultaneousGifts,
      };
    }

    // 고가: 수증자는 **각자 독립 납세의무자**(동시증여 아님 — 동시증여는 동일 수증자 전제).
    //   마법사 세션 1개 = 신고 1건이므로 선택된 1명만 이관한다.
    //   선례와 동일: 감자 §39의2 `cdSelectedDoneeIndex` · 특정법인 §45의5 `scSelectedDoneeIndex`.
    // 기준금액(§29의3② 30%·3억) 미달 행은 value 0으로 남아 있다 — 신고 대상이 아니므로 제외.
    const taxableDonees = result.contributionBreakdown.filter((bd) => bd.value > 0);
    const selectedDonee = taxableDonees[form.conSelectedDoneeIndex] ?? taxableDonees[0];
    if (!selectedDonee) return { giftDate: form.giftDate, giftItems: [] };
    return {
      giftDate: form.giftDate,
      donorRelation: deriveDonorRelation(
        (selectedDonee.relation ?? "other") as GiftDonorRelation,
        false,
      ),
      giftItems: [
        {
          id: `deemed-contribution-high-${selectedDonee.party}`,
          category: "other" as const,
          name: `현물출자에 따른 이익 — ${selectedDonee.party} 수증자분`,
          marketValue: selectedDonee.value,
        },
      ],
    };
  }

  // §45의3 일감몰아주기: 수증자별 다건 prefill (존재 가드 — Critical-1, contribution 게이트와 별도)
  if (result.type === "related_corp" && result.recipientBreakdown && result.recipientBreakdown.length > 0) {
    const taxable = result.recipientBreakdown.filter((r) => r.subtotal > 0);
    const [main, ...rest] = taxable;
    if (!main) return { giftDate: form.giftDate };
    const simultaneousGifts =
      rest.length > 0
        ? rest.map((r) => ({ donorRelation: "other_relative" as const, taxableValue: String(r.subtotal) }))
        : undefined;
    return {
      giftDate: form.giftDate,
      donorRelation: "other_relative" as const,
      giftItems: [
        {
          id: `deemed-rc-${main.recipientName.trim() || "recipient"}`,
          category: "other" as const,
          name: `일감몰아주기 이익 — ${main.recipientName.trim() || "지배주주등"}`,
          marketValue: main.subtotal,
        },
      ],
      simultaneousGifts,
    };
  }

  // 감자 멀티(§39의2): 과세 수증자 여러 명 → 선택된 수증자의 total만 이관(수증자별 별도 신고).
  if (result.type === "capital_decrease" && result.capitalDecreaseMulti) {
    const taxable = result.capitalDecreaseMulti.donees.filter((d) => d.isTaxable);
    const selected = taxable[form.cdSelectedDoneeIndex] ?? taxable[0];
    if (!selected) return { giftDate: form.giftDate, giftItems: [] };
    return {
      giftDate: form.giftDate,
      giftItems: [
        {
          id: `deemed-capital_decrease-${selected.name}`,
          category: "other",
          name: `감자에 따른 이익 증여이익 (${selected.name})`,
          marketValue: selected.total,
        },
      ],
    };
  }

  // 신탁이익(§33): 원본권·수익권 별개 증여시기 → subGifts를 항목 분리 이관.
  // 마법사 giftDate는 단일이므로 수익권 증여시기 우선(원본권 증여시기가 다르면 별도 신고 — 결과뷰 안내).
  if (result.type === "trust_benefit" && result.subGifts && result.subGifts.length > 0) {
    const RIGHT_LABEL = { principal: "원본권", income: "수익권" } as const;
    return {
      giftDate: form.tbIncomeGiftDate || form.tbPrincipalGiftDate || form.giftDate,
      giftItems: result.subGifts.map((sg) => ({
        id: `deemed-trust-${sg.right}`,
        category: "other" as const,
        name: `신탁이익(${RIGHT_LABEL[sg.right]}) 증여이익`,
        marketValue: sg.value,
      })),
    };
  }

  return {
    giftDate: form.giftDate,
    giftItems: [
      {
        id: `deemed-${result.type}`,
        category: "other",
        name: `${label} 증여이익`,
        marketValue: result.deemedGiftValue,
        // §47① 합산배제증여재산(§41의3·§41의5 등) → 본세 §55① 호별 스트림. 비합산배제 deemed는 undefined.
        //   aggExclClass: 명의신탁(1호)·일감몰아주기(2호)는 3천만 공제 없음, 그 외(3호)는 3천만 공제. (H-40·G-4)
        ...(result.aggregationExcluded
          ? {
              isAggregationExcludedGift: true,
              ...(result.aggExclClass ? { aggregationExcludedClass: result.aggExclClass } : {}),
            }
          : {}),
      },
    ],
  };
}
