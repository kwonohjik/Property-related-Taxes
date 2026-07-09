/**
 * DoneeMinorField — 수증자 미성년 판정 입력 (증여세 Step0).
 *
 * 주민등록번호 입력 → 증여일 기준 만 19세 미만 자동판정(우선) + 수동 토글 fallback(D-1).
 * 자동판정 성공 시 읽기전용 배지 표시 + 수동 ToggleCard 숨김.
 * 파싱 실패/미입력/증여일 부재 시 수동 ToggleCard fallback.
 *
 * 주민번호는 클라이언트 derive 전용(엔진 미전송). 결과/PDF 미노출.
 * 미성년 판정 결과는 호출부 buildGiftTaxInput(④)이 resolveIsMinorDonee로 동일 derive.
 *
 * 법령: 민법 §4(성년 19세) · 상증법 §57①(미성년+증여재산가액 20억 초과 40% 할증).
 */

import { useMemo } from "react";
import { differenceInYears } from "date-fns";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { computeAutoMinor } from "@/lib/calc/gift-donee-minor";
import { parseResidentNumber } from "@/lib/calc/resident-number";

interface DoneeMinorFieldProps {
  doneeResidentNumber: string;
  giftDate: string;
  isMinorDonee: boolean;
  onResidentNumberChange: (v: string) => void;
  onMinorToggle: (v: boolean) => void;
}

export function DoneeMinorField({
  doneeResidentNumber,
  giftDate,
  isMinorDonee,
  onResidentNumberChange,
  onMinorToggle,
}: DoneeMinorFieldProps) {
  // 자동판정(미성년 여부) — null이면 수동 fallback
  const autoMinor = useMemo(
    () => computeAutoMinor(doneeResidentNumber, giftDate),
    [doneeResidentNumber, giftDate],
  );
  const parsed = useMemo(
    () => parseResidentNumber(doneeResidentNumber ?? ""),
    [doneeResidentNumber],
  );
  // 배지 표시용 만 나이 (자동판정 성공 시에만)
  const age = useMemo(() => {
    if (autoMinor === null || !parsed || !giftDate) return null;
    return differenceInYears(new Date(giftDate), new Date(parsed.birthDate));
  }, [autoMinor, parsed, giftDate]);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
          §57
        </span>
        <p className="text-xs font-semibold text-violet-700">
          수증자 미성년자 (§57① 40% 할증 판정)
        </p>
      </div>

      <FieldCard
        label="수증자 주민등록번호 (선택)"
        hint="앞 7자리(생년월일·성별)로 생년월일을 도출해 미성년 여부를 자동판정합니다. 검증 없이 생년월일만 사용하며 저장·전송되지 않습니다. 미입력 시 아래에서 직접 선택하세요."
      >
        <input
          type="text"
          inputMode="numeric"
          value={doneeResidentNumber}
          onChange={(e) => onResidentNumberChange(e.target.value)}
          placeholder="앞 6자리-뒤 7자리"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="donee-resident-number"
        />
      </FieldCard>

      {autoMinor !== null ? (
        // 자동판정 성공 → 읽기전용 배지 (수동 토글 숨김)
        <div
          className="rounded-md border border-violet-200 bg-violet-100/60 px-3 py-2 text-xs text-violet-900"
          data-testid="donee-minor-auto-badge"
        >
          생년월일 {parsed?.birthDate} · 증여일 기준 만 {age}세 →{" "}
          <span className="font-semibold">
            {autoMinor ? "미성년자" : "성년"}
          </span>{" "}
          {autoMinor
            ? "(§57① 40% 할증 대상 — 세대생략 증여재산가액 20억 초과 시)"
            : "(§57① 40% 할증 대상 아님)"}
        </div>
      ) : (
        // 파싱 실패/미입력 → 수동 토글 fallback
        <ToggleCard
          tone="violet"
          title="수증자 미성년자 (§57① 40% 할증 판정)"
          description="수증자가 미성년자이고 세대생략 증여재산가액이 20억을 초과하면 30% 대신 40% 할증 적용"
          checked={isMinorDonee}
          onCheckedChange={onMinorToggle}
        />
      )}
    </div>
  );
}
