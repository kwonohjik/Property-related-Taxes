/**
 * 간주취득 — 과점주주 패널 (Step 1-D-A)
 * 지방세법 §7⑤
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  deemedProvisoRate,
  provisoFromLuxuryFlag,
} from "@/lib/tax-engine/acquisition-deemed-proviso";
import { assessMajorShareholder } from "@/lib/tax-engine/acquisition-deemed";
import { DeemedProvisoCard } from "./DeemedProvisoCard";
import { DeemedMajorAssetBuckets } from "./DeemedMajorAssetBuckets";
import type { DeemedAssetBucketRow, FormState } from "../shared";

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

export function DeemedMajorShareholderSection({ form, set }: Props) {
  const isListed = form.deemedMajorIsListed ?? false;
  const isFounding = form.deemedMajorIsFoundingShare ?? false;
  /** 비과세 확정 케이스 — 상장법인 또는 설립 시 취득 (§7⑤) */
  const isExemptCase = isListed || isFounding;

  /** §15② 단서 — 물건별 구분 입력 모드 (법인이 사치성 물건과 일반 물건을 함께 보유) */
  const useBuckets = form.deemedMajorUseBuckets ?? false;
  const bucketRows = form.deemedMajorAssetBuckets ?? [];

  // 과세 미리보기 계산 — 엔진(assessMajorShareholder) 단일 진실 재사용.
  // 폼은 지분율을 퍼센트(0~100)로, 엔진은 소수(0~1)로 다루므로 ÷100 변환.
  const corpVal = parseAmount(form.deemedMajorCorporateAssetValue ?? "") ?? 0;
  const prevR   = parseFloat(form.deemedMajorPrevShareRatio ?? "0") || 0;
  const newR    = parseFloat(form.deemedMajorNewShareRatio  ?? "0") || 0;
  // ⚠️ 금액과 무관하게 지분율 판정을 돌린다 — 버킷 모드에서는 단일 금액 칸이 비어 있어도
  //    과세 지분율(최초 과점주주는 취득 후 전체)이 필요하다.
  const msh = !isExemptCase
    ? assessMajorShareholder({
        corporateAssetValue: corpVal,
        prevShareRatio: prevR / 100,
        newShareRatio: newR / 100,
        isListed,
        isFoundingShare: isFounding,
      })
    : undefined;
  // 최초 과점주주(비과점→과점)는 취득 후 전체 지분율, 이미 과점주주면 증가분만 과세
  const isFirstMajor = prevR <= 50 && newR > 50;
  const taxableRatio = msh?.taxableRatio ?? 0;
  const taxableRatioPct = taxableRatio * 100;
  const deemedBase = msh?.deemedTaxBase ?? 0;
  const showPreview = msh?.isSubjectToTax === true && corpVal > 0 && !useBuckets;

  /**
   * 세율 — 엔진 단일 진실(`deemedProvisoRate`). §15② 본문 2%, 단서(§13⑤ 해당) 10%.
   * 버킷 모드에서는 행마다 세율이 달라 여기서 단일 세율을 쓰지 않는다.
   */
  const deemedRate = deemedProvisoRate(provisoFromLuxuryFlag(form.isLuxuryProperty));
  const deemedRateLabel = `${(deemedRate * 100).toFixed(1).replace(/\.0$/, "")}%`;

  return (
    <ToneCard tone="amber" bodyClassName="space-y-3" noDark>
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-amber-700">과점주주 간주취득 상세</p>
        <TaxHelp
          title="과점주주 간주취득 (지방세법 §7⑤)"
          summary="법인 주식·지분을 취득해 과점주주(50% 초과)가 되면, 법인 보유 자산 취득으로 간주 과세"
          details={`## 개요
주주 1인 + 특수관계인 지분 합계 50% 초과 → 과점주주 성립

## 과세 요건
① 과점주주 도달 (50% 초과)
② 지분 증가분에 과세 (이미 과점주주였으면 증가분만)
③ 법인이 과세대상 자산 보유 (부동산·차량·기계장비 등)

## 상장법인 제외 (지방세기본법 §46, 시행령 §24①)
- **유가증권시장·코스닥시장** 상장법인 주식은 과점주주 정의에서 제외 → 간주취득 과세 대상 아님
- **코넥스(KONEX) 상장법인은 제외 대상이 아니므로 과세** — 시행령 §24①의 증권시장에 코넥스 미포함

## 과세표준
법인 보유 과세대상 자산 시가표준액 × 과세 지분율(증가분)`}
          legalBasis="지방세법 제7조 제5항"
        />
      </div>

      {/* 상장법인 여부 — 유가증권·코스닥만 (코넥스 제외) */}
      <ToggleCard
        tone="rose"
        title="유가증권시장·코스닥 상장법인 여부"
        description="유가증권시장·코스닥 상장법인은 과점주주 정의에서 제외 (지방세기본법 §46). 코넥스는 과세 대상이므로 OFF로 두세요."
        checked={isListed}
        onCheckedChange={(v) => set("deemedMajorIsListed", v)}
      >
        <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-800">
          유가증권시장·코스닥시장 상장법인의 과점주주는 취득세 과세 대상이 아닙니다 (계산 없이 비과세).
          <br />
          <span className="font-medium">코넥스(KONEX) 상장법인은 제외 대상이 아니므로 과세됩니다 — 이 토글을 OFF로 두고 지분율을 입력하세요.</span>
        </div>
      </ToggleCard>

      {/* 법인 설립 시 발행 주식 취득 — §7⑤ 괄호 비과세 */}
      <ToggleCard
        tone="rose"
        title="법인 설립 시 발행 주식 취득"
        description="법인설립 시 발행하는 주식·지분 취득으로 과점주주가 된 경우 취득으로 보지 아니함 (지방세법 §7⑤)"
        checked={isFounding}
        onCheckedChange={(v) => set("deemedMajorIsFoundingShare", v)}
      >
        <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-800">
          설립 시 취득은 과점주주 간주취득에서 제외됩니다 (지방세법 §7⑤ 괄호).
          설립 이후 증자·양수로 지분율이 증가하는 경우에만 과세 대상입니다.
        </div>
      </ToggleCard>

      {/*
        법인 보유 부동산등 장부상 총가액 (§10의6④)
        🔴 종전 라벨은 「시가표준액 합계」였으나 법문은 「결산서와 그 밖의 장부 등에 따른
           그 부동산등의 총가액」이다. 조심 1998-0634도 「법인 장부가액」으로 과세했다.
        버킷 모드에서는 합계가 버킷에서 나오므로 이 칸을 감춘다(두 진실 방지).
      */}
      {!useBuckets && (
        <div>
          <CurrencyInput
            label="법인 보유 부동산등 장부상 총가액"
            value={form.deemedMajorCorporateAssetValue ?? ""}
            onChange={(v) => set("deemedMajorCorporateAssetValue", v)}
            placeholder="금액 입력 (원)"
            disabled={isExemptCase}
          />
          <p className="text-xs text-muted-foreground mt-1">
            법인의 결산서·장부상 부동산등 총가액 (지방세법 §10의6④ — 시가표준액 아님)
          </p>
        </div>
      )}

      {/* 취득 전 지분율 */}
      <div>
        <p className="text-sm font-medium mb-1">취득 전 지분율</p>
        <DecimalInput
          value={form.deemedMajorPrevShareRatio ?? ""}
          onChange={(v) => set("deemedMajorPrevShareRatio", v)}
          placeholder="취득 전 보유 지분율 (신규 진입 시 비움)"
          unit="%"
          disabled={isExemptCase}
        />
        <p className="text-xs text-muted-foreground mt-1">
          이미 보유 중인 지분 비율. 신규 진입이면 0 입력
        </p>
      </div>

      {/* 취득 후 지분율 */}
      <div>
        <p className="text-sm font-medium mb-1">취득 후 지분율</p>
        <DecimalInput
          value={form.deemedMajorNewShareRatio ?? ""}
          onChange={(v) => set("deemedMajorNewShareRatio", v)}
          placeholder="취득 후 합산 지분율"
          unit="%"
          disabled={isExemptCase}
        />
        <p className="text-xs text-muted-foreground mt-1">
          과점주주 요건: 주주 1인 + 특수관계인 지분 합계 50% 초과 (§7⑤)
        </p>
      </div>

      {/* 과점주주 도달일 */}
      <div>
        <p className="text-sm font-medium mb-1">
          과점주주 도달일 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </p>
        <DateInput
          value={form.deemedMajorShareholderDate ?? ""}
          onChange={(v) => set("deemedMajorShareholderDate", v)}
          disabled={isExemptCase}
        />
        <p className="text-xs text-muted-foreground mt-1">
          주식·지분 취득으로 과점주주 기준(50% 초과)에 달한 날
        </p>
      </div>

      {/* §15② 단서 — 물건별 구분 입력 모드 */}
      {!isExemptCase && (
        <ToggleCard
          tone="amber"
          title="물건별로 구분해 입력 (§15② 단서)"
          description="법인이 본점·공장용 부동산(§13① 6%)이나 사치성 재산(§13⑤ 10%)을 일반 물건과 함께 보유하면 물건마다 세율이 갈립니다. 전부 한 세율로는 틀립니다."
          checked={useBuckets}
          onCheckedChange={(v) => {
            set("deemedMajorUseBuckets", v);
            if (v) {
              // 단일 토글과 이중 적용되지 않도록 최상위 사치성 플래그를 끈다(④도 strip 한다)
              set("isLuxuryProperty", false);
              set("luxuryType", "");
              if (bucketRows.length === 0) {
                set("deemedMajorAssetBuckets", [
                  { id: crypto.randomUUID(), label: "", bookValue: "", proviso: "none", luxuryType: "" },
                ] as DeemedAssetBucketRow[]);
              }
            }
          }}
          data-testid="deemed-bucket-mode"
        >
          <DeemedMajorAssetBuckets
            rows={bucketRows}
            taxableRatio={taxableRatio}
            onChange={(rows) => set("deemedMajorAssetBuckets", rows)}
          />
        </ToggleCard>
      )}

      {/* §15② 단서 — 사치성 재산(§13⑤) 해당 여부 (단일 물건 입력일 때) */}
      {!useBuckets && (
        <DeemedProvisoCard
          form={form}
          set={set}
          context="major_shareholder"
          disabled={isExemptCase}
          disabledReason="비과세 케이스에서는 세율 판정이 필요 없습니다."
        />
      )}

      {/* 과세 미리보기 */}
      {showPreview && (
        <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
          <p className="font-medium text-amber-800">과세 미리보기</p>
          <p className="text-amber-700">
            {isFirstMajor ? (
              <>과세 지분율 = 취득 후 <span className="font-medium">전체 {newR}%</span> (최초 과점주주 — §7⑤)</>
            ) : (
              <>과세 지분율 = 증가분 {taxableRatioPct.toFixed(2)}%p ({prevR}% → {newR}%)</>
            )}
          </p>
          <p className="text-amber-700">
            간주취득 과세표준 = {formatKRW(corpVal)} × {taxableRatioPct.toFixed(2)}% = {formatKRW(deemedBase)}
          </p>
          <p className="font-medium text-amber-800">
            예상 취득세 = {formatKRW(deemedBase)} × {deemedRateLabel} = {formatKRW(Math.floor(deemedBase * deemedRate))}
          </p>
          <p className="text-xs text-amber-600">* 농어촌특별세·지방교육세 별도</p>
        </div>
      )}
    </ToneCard>
  );
}
