/**
 * 간주취득 — 건물 개수(改修) 패널 (Step 1-D-C)
 * 지방세법 §10의6③
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import { getBasicRate } from "@/lib/tax-engine/acquisition-tax-rate";
import type { FormState } from "../shared";

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

// 건물 개수 간주취득 세율 — 엔진 단일 진실. 개수는 원시취득에 해당하여 2.8%
// (§11①3호, anchor: deemed-renovation-rate.anchor.test.ts — 지목변경·과점주주 2%와 상이)
const DEEMED_RATE = getBasicRate("building", "deemed_renovation", 0).rate;
const DEEMED_RATE_LABEL = `${(DEEMED_RATE * 100).toFixed(1).replace(/\.0$/, "")}%`;

export function DeemedRenovationSection({ form, set }: Props) {
  const prevSv = parseAmount(form.deemedRenovationPrevStandardValue ?? "") ?? 0;
  const newSv  = parseAmount(form.deemedRenovationNewStandardValue  ?? "") ?? 0;
  const diff   = newSv - prevSv;
  const showPreview = prevSv > 0 || newSv > 0;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-violet-700">건물 개수 간주취득 상세</p>
        <TaxHelp
          title="건물 개수 간주취득 (지방세법 §10의6③)"
          summary="구조변경·용도변경·대수선으로 시가표준액이 증가하면 증가분에 취득세 과세"
          details={`## 개수 3종
- **구조변경**: 건물 구조 변경 (목조→철근콘크리트 등)
- **용도변경**: 건물 용도 변경 (창고→주택, 주택→상가 등, 건축법 §19 신고·허가)
- **대수선**: 주요 구조부 대규모 수선 (건축법 §2①9호 — 기둥·보·내력벽·주계단·지붕틀 등)

## 비해당
- 일반 수리·유지보수·인테리어 (대수선 기준 미달)
- 시가표준액이 감소하는 경우

## 과세표준
개수 후 시가표준액 - 개수 전 시가표준액 (양수인 경우만)

## 취득 시기 (지방세법 §20)
사용승인일과 사실상 사용개시일 중 빠른 날`}
          legalBasis="지방세법 제7조의2 제3항, 건축법 제2조 제1항 제9호"
        />
      </div>

      {/* 개수 유형 */}
      <div>
        <p className="text-sm font-medium mb-2">개수 유형</p>
        <RadioCardGroup
          tone="amber"
          layout="stack"
          name="deemedRenovationType"
          value={form.deemedRenovationType ?? ""}
          onChange={(v) => set("deemedRenovationType", v as "structural_change" | "use_change" | "major_repair")}
          options={[
            {
              value: "structural_change",
              label: "구조변경",
              description: "건물 구조 변경 — 목조에서 철근콘크리트 구조로 변경 등",
            },
            {
              value: "use_change",
              label: "용도변경",
              description: "건물 용도 변경 — 창고→주택, 주택→상가 등 (건축법 §19 신고·허가)",
            },
            {
              value: "major_repair",
              label: "대수선",
              description: "주요 구조부 대규모 수선 — 건축법 §2①9호 해당 (기둥·보·내력벽·주계단·지붕틀 등)",
            },
          ]}
        />
      </div>

      {/* 개수 전 시가표준액 */}
      <div>
        <CurrencyInput
          label="개수 전 시가표준액"
          value={form.deemedRenovationPrevStandardValue ?? ""}
          onChange={(v) => set("deemedRenovationPrevStandardValue", v)}
          placeholder="개수 전 건물 시가표준액"
        />
      </div>

      {/* 개수 후 시가표준액 */}
      <div>
        <CurrencyInput
          label="개수 후 시가표준액"
          value={form.deemedRenovationNewStandardValue ?? ""}
          onChange={(v) => set("deemedRenovationNewStandardValue", v)}
          placeholder="개수 후 건물 시가표준액"
        />
      </div>

      {/* 과세 미리보기 */}
      {showPreview && (
        <div className="rounded-md bg-violet-100/60 border border-violet-200 px-3 py-2 text-sm space-y-1">
          <p className="font-medium text-violet-800">과세 미리보기</p>
          {diff > 0 ? (
            <>
              <p className="text-violet-700">
                과세표준 = 개수 후 {formatKRW(newSv)} - 개수 전 {formatKRW(prevSv)} = {formatKRW(diff)}
              </p>
              <p className="font-medium text-violet-800">
                예상 취득세 = {formatKRW(diff)} × {DEEMED_RATE_LABEL} = {formatKRW(Math.floor(diff * DEEMED_RATE))}
              </p>
            </>
          ) : (
            <p className="text-amber-700">
              개수 후 시가표준액이 개수 전 이하 — 과세 대상 없음
            </p>
          )}
          <p className="text-xs text-violet-600">* 농어촌특별세·지방교육세 별도</p>
        </div>
      )}

      {/* 개수 완료일 (사용승인일) */}
      <div>
        <p className="text-sm font-medium mb-1">
          개수 완료일 (사용승인일) <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </p>
        <DateInput
          value={form.deemedRenovationDate ?? ""}
          onChange={(v) => set("deemedRenovationDate", v)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          구조변경·용도변경·대수선의 사용승인일
        </p>
      </div>

      {/* 사실상 사용개시일 */}
      <div>
        <p className="text-sm font-medium mb-1">
          사실상 사용개시일 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </p>
        <DateInput
          value={form.deemedRenovationActualUsageDate ?? ""}
          onChange={(v) => set("deemedRenovationActualUsageDate", v)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          사용승인 전에 실제 사용을 개시한 경우 입력. 사용승인일과 둘 중 빠른 날이
          취득시기이며 신고기한(60일)의 기산점이 됩니다 (지방세법 §20)
        </p>
      </div>
    </div>
  );
}
