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
 * §47① 합산배제증여재산 플래그 — **모든 분기가 이 헬퍼를 통과해야 한다.**
 *
 * 🔴 종전에는 파일 맨 끝 일반 분기에서만 이 플래그를 붙였다. 그래서 그 앞에서 조기반환하는
 * 분기(§45의3 일감몰아주기 등)는 플래그를 통째로 잃었고, 엔진이 `aggregationExcluded: true`·
 * `aggExclClass: "deemed_profit"`를 올바로 내보내도 **소비되는 층에 도달하지 못했다**.
 * 증여세 본체가 §55①2호(증여의제이익 그대로) 대신 §55①4호 일반스트림으로 계산해
 * §53 증여재산공제를 붙이고 §47② 10년 합산 격리도 깨졌다.
 *
 * 지금은 §45의3만 이 플래그를 갖지만(§47① 열거는 §31①3호·§40①2·3호·§41의3·§41의5·
 * §42의3·§45·§45의2~§45의4 — **§45의5는 없다**), 나머지 분기도 같은 헬퍼를 통과시켜
 * 새 유형이 합산배제가 될 때 같은 누락이 재발하지 않게 한다(오늘은 전부 no-op).
 */
function aggregationExclusionFlags(result: DeemedGiftAnyResult) {
  if (!("aggregationExcluded" in result) || !result.aggregationExcluded) return {};
  return {
    isAggregationExcludedGift: true as const,
    ...(result.aggExclClass ? { aggregationExcludedClass: result.aggExclClass } : {}),
  };
}

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
          ...aggregationExclusionFlags(result),
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
            ...aggregationExclusionFlags(result),
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
          ...aggregationExclusionFlags(result),
        },
      ],
    };
  }

  // §45의3 일감몰아주기: 지배주주등은 **각자 독립 납세의무자**다 — §45의3①은 지배주주와
  // 그 친족이 이익을 「각각 증여받은 것으로 본다」고 한다. 마법사 세션 1개 = 신고 1건이므로
  // 선택된 1명만 이관한다(현물출자 고가 :75·감자 §39의2와 같은 취급).
  //
  // 🔴 종전에는 2번째 이후 수증자를 `simultaneousGifts`에 밀어 넣었다. 그 필드는
  //    §46①2호 「같은 공제그룹 **동시증여** 시 증여재산공제 한도 안분」 전용이고
  //    «동일 수증자 · 복수 증여자»를 전제한다(`deductions/gift-deductions.ts`).
  //    서로 다른 수증자를 넣으면 첫 수증자의 §53 공제가 잘못 안분되고, 나머지 수증자의
  //    증여세는 어차피 산출되지도 않는다. 같은 파일 :75~77이 이 함정을 주석으로 적고
  //    회피했는데 §45의3 분기만 그대로였다.
  if (result.type === "related_corp" && result.recipientBreakdown && result.recipientBreakdown.length > 0) {
    const taxable = result.recipientBreakdown.filter((r) => r.subtotal > 0);
    const selected = taxable[form.rcSelectedDoneeIndex] ?? taxable[0];
    if (!selected) return { giftDate: form.giftDate };
    return {
      giftDate: form.giftDate,
      // §45의3의 증여자는 특수관계「법인」이라 §53 어느 호에도 해당하지 않는다.
      // §55①2호 스트림이라 증여재산공제가 적용되지 않으므로 이 값은 세액에 영향이 없다 —
      // 폼이 값을 요구하므로 종전 기본값을 유지한다.
      donorRelation: "other_relative" as const,
      giftItems: [
        {
          id: `deemed-rc-${selected.recipientName.trim() || "recipient"}`,
          category: "other" as const,
          name: `일감몰아주기 이익 — ${selected.recipientName.trim() || "지배주주등"}`,
          marketValue: selected.subtotal,
          ...aggregationExclusionFlags(result),
        },
      ],
    };
  }

  // §45의5 특정법인과의 거래 — roster 모드. 지배주주등은 각자 독립 납세의무자다
  // (상증령 §34의5⑨ 「해당 지배주주등이 **각각** 직접 증여받은 것으로 볼 때의 증여세」).
  //
  // 🔴 종전에는 이 분기 자체가 없어 맨 끝 일반 분기로 떨어졌고, 그 값은
  //    `specific-corp.ts`의 `taxable.reduce((a, d) => a + d.gain, 0)` — **과세 수증자
  //    전원의 합계**였다. 증여세는 누진세율이라 합산 이관은 언제나 과다 산출된다.
  //    결과뷰는 `scSelectedDoneeIndex` 드롭다운으로 수증자를 고르게 해 놓고 prefill이
  //    그 선택을 무시하고 있었다.
  //
  // ※ §45의5는 §47① 합산배제 열거(§45의2~§45의4)에 **없다** → §55①4호 일반스트림이 맞다.
  // ※ `donorRelation`은 넣지 않는다 — roster의 `relation`이 «누구 기준» 관계인지 화면에
  //    명시돼 있지 않아(라벨이 그냥 「관계」다) §53 공제 관계를 여기서 단정할 수 없다.
  //    마법사에서 사용자가 고르게 둔다(자동 파생 금지 — 틀린 공제가 조용히 붙는 것보다 낫다).
  if (result.type === "specific_corp" && result.specificCorpMulti) {
    const taxable = result.specificCorpMulti.donees.filter((d) => d.isTaxable);
    const selected = taxable[form.scSelectedDoneeIndex] ?? taxable[0];
    if (!selected) return { giftDate: form.giftDate, giftItems: [] };
    return {
      giftDate: form.giftDate,
      giftItems: [
        {
          id: `deemed-sc-${selected.name.trim() || "donee"}`,
          category: "other" as const,
          name: `특정법인과의 거래 이익 — ${selected.name.trim() || "지배주주등"}`,
          marketValue: selected.gain,
          ...aggregationExclusionFlags(result),
        },
      ],
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
          ...aggregationExclusionFlags(result),
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
        ...aggregationExclusionFlags(result),
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
        ...aggregationExclusionFlags(result),
      },
    ],
  };
}
