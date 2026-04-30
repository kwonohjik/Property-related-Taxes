/** §7 주택 수 제외 11종 표 (시행령 §28의4⑥ + §28의2) + 한시 특례 6종 */
export function HouseCountExclusionSection() {
  return (
    <section id="house-count-exclusion" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">7. 주택 수 제외 11종 + 한시 특례 6종 (§28의4)</h2>
      <p className="text-sm text-muted-foreground">
        보유 주택 수 산정 시 아래 주택은 카운트에서 제외됩니다.
        <strong> 취득일(잔금일) 기준</strong>으로 판단.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-emerald-50 text-emerald-800">
              <th className="border border-emerald-200 px-2 py-2">#</th>
              <th className="border border-emerald-200 px-2 py-2 text-left">제외 유형</th>
              <th className="border border-emerald-200 px-2 py-2 text-left">요건</th>
              <th className="border border-emerald-200 px-2 py-2 text-left">근거</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {[
              ["1", "시가표준액 1억 이하 (수도권)", "수도권 소재 주택·오피스텔·부속토지", "§28의2 1호 가목"],
              ["2", "시가표준액 2억 이하 (비수도권)", "수도권 외 소재 (정비구역 제외)", "§28의2 1호 나목"],
              ["3", "상속 주택 5년 미경과", "상속개시일로부터 5년 미만", "§28의4⑥3호"],
              ["4", "시가표준액 1억 이하 오피스텔", "주거형 오피스텔만 해당", "§28의4⑥4호"],
              ["5", "시가표준액 1억 이하 부속토지", "주택 아닌 부속토지만 소유", "§28의4⑥5호"],
              ["6", "혼인 전 배우자 보유 분양권", "다른 배우자의 혼인 전 분양권 — 2026.12.31까지", "§28의4⑥10호"],
              ["7", "농어촌 주택", "대지 660㎡·연면적 150㎡·6,500만 이내", "§28의2 11호"],
              ["8", "노인복지주택", "1년 내 직접 사용 예정", "§28의2 3호"],
              ["9", "문화유산·천연기념물", "지정 주택", "§28의2 4호"],
              ["10", "사원임대용 60㎡", "1년 내 직접 사용", "§28의2 12호"],
              ["11", "인구감소지역 임대주택", "60일 내 등록 — 2026년 한시", "§28의2 18호"],
            ].map(([num, type, req, basis], i) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <td className="border border-border px-2 py-2 text-center">{num}</td>
                <td className="border border-border px-2 py-2 font-medium text-foreground">{type}</td>
                <td className="border border-border px-2 py-2">{req}</td>
                <td className="border border-border px-2 py-2">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2">
        <h3 className="text-sm font-semibold mb-2 text-emerald-700">한시 특례 6종 (2024.1.10~2027.12.31, §28의4②)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[500px]">
            <thead>
              <tr className="bg-emerald-50 text-emerald-800">
                <th className="border border-emerald-200 px-2 py-2 text-left">유형</th>
                <th className="border border-emerald-200 px-2 py-2 text-left">요건</th>
                <th className="border border-emerald-200 px-2 py-2 text-left">기간</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ["신축 소형주택", "다가구·연립·다세대·도시형 60㎡·3억(수도권 6억) 이하", "2024.1.10~2027.12.31"],
                ["유상승계 + 임대등록", "60㎡·3억(수도권 6억) 이하 + 임대사업자 등록", "2024.1.10~2027.12.31"],
                ["미분양 아파트", "수도권 외 85㎡·6억 이하 미분양", "2024.1.10~2025.12.31"],
                ["신축 다가구 (호별 60㎡)", "건축물대장 호별 전용면적 기재된 경우만", "2024.1.10~2027.12.31"],
                ["지방 소형 아파트", "수도권 외 전용 85㎡·6억 이하", "2024.1.10~2027.12.31"],
                ["취득 주택 자체 카운트 제외", "위 요건 충족 시 취득 주택도 카운트 불산입", "§28의4② 1·2·3호"],
              ].map(([type, req, period], i) => (
                <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                  <td className="border border-border px-2 py-2 font-medium text-foreground">{type}</td>
                  <td className="border border-border px-2 py-2">{req}</td>
                  <td className="border border-border px-2 py-2">{period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-md bg-emerald-50/60 border border-emerald-200 p-3 text-xs text-emerald-800">
        <strong>취득일 기준 anchor</strong>: 보유 주택 수는 <strong>잔금지급일(취득일)</strong> 기준으로 보유한 주택만 카운트.
        분양권 취득 시 기준일은 권리취득일(분양계약일) 소급 적용 (§28의4①).
      </div>
    </section>
  );
}
