import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Card, Chip, SectionTitle } from '../components/ui';
import { useGrid } from '../lib/layout';
import { useSnapshot } from '../lib/snapshot';
import { egp, num, pct } from '../lib/format';
import { radius, type as t, useColors } from '../lib/theme';

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 140 }}>
      <Text style={[t.meta, { color: c.muted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderColor: c.line, borderWidth: 1, borderRadius: radius.sm, backgroundColor: c.bg, paddingHorizontal: 12 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" accessibilityLabel={label} style={[t.body, { flex: 1, color: c.ink, minHeight: 44, textAlign: 'right' }]} />
        {suffix ? <Text style={[t.small, { color: c.muted }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}
const n = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;

export default function Tools() {
  const c = useColors();
  const { gutter, tablet } = useGrid();
  const { data } = useSnapshot();

  const [price, setPrice] = useState('25000');
  const [down, setDown] = useState('0');
  const [months, setMonths] = useState(12);
  const [rate, setRate] = useState('0');
  const inst = useMemo(() => {
    const principal = Math.max(0, n(price) - n(down));
    const r = n(rate) / 100 / 12;
    const m = r > 0 ? (principal * r) / (1 - (1 + r) ** -months) : principal / months;
    return { monthly: m, total: m * months + n(down), extra: m * months + n(down) - n(price) };
  }, [price, down, months, rate]);

  const [was, setWas] = useState('12000');
  const [now, setNow] = useState('9999');
  const [usual, setUsual] = useState('10500');
  const disc = useMemo(() => {
    const claimed = n(was) ? ((n(was) - n(now)) / n(was)) * 100 : 0;
    const real = n(usual) ? ((n(usual) - n(now)) / n(usual)) * 100 : 0;
    return { claimed, real };
  }, [was, now, usual]);

  const [amount, setAmount] = useState('100');
  const [cur, setCur] = useState('USD');
  const fx = data?.snap.fx;
  const egpPer = fx ? (fx.rates.EGP ?? 0) / (fx.rates[cur] ?? 1) : 0;

  const wrap = { flexDirection: tablet ? ('row' as const) : ('column' as const), gap: 16, flexWrap: 'wrap' as const };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={wrap}>
        <Card style={{ flex: 1, minWidth: 300, gap: 10 }}>
          <SectionTitle title="🧮 حاسبة التقسيط" hint="اعرف القسط الحقيقي والفوايد قبل ما توقّع" />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Field label="سعر المنتج" value={price} onChange={setPrice} suffix="ج.م" />
            <Field label="المقدم" value={down} onChange={setDown} suffix="ج.م" />
          </View>
          <Field label="الفايدة السنوية (0 لو من غير فوايد)" value={rate} onChange={setRate} suffix="%" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[6, 12, 18, 24, 36].map((m) => <Chip key={m} label={`${m} شهر`} active={months === m} onPress={() => setMonths(m)} />)}
          </View>
          <Text style={[t.h2, { color: c.ink }]}>{egp(inst.monthly)} / شهر</Text>
          <Text style={[t.small, { color: inst.extra > 1 ? c.clay : c.palm }]}>
            {inst.extra > 1 ? `هتدفع زيادة ${egp(inst.extra)} عن الكاش (الإجمالي ${egp(inst.total)})` : 'من غير فوايد فعلاً 👌'}
          </Text>
        </Card>

        <Card style={{ flex: 1, minWidth: 300, gap: 10 }}>
          <SectionTitle title="🕵️ الخصم ده حقيقي؟" hint="قارن الخصم المكتوب بالسعر المعتاد" />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Field label="السعر «قبل الخصم»" value={was} onChange={setWas} />
            <Field label="السعر دلوقتي" value={now} onChange={setNow} />
          </View>
          <Field label="السعر المعتاد (من الرسم البياني)" value={usual} onChange={setUsual} suffix="ج.م" />
          <Text style={[t.h3, { color: c.ink }]}>مكتوب: {pct(disc.claimed)} · الحقيقي: {pct(disc.real)}</Text>
          <Text style={[t.small, { color: disc.claimed - disc.real > 10 ? c.clay : c.palm }]}>
            {disc.claimed - disc.real > 10 ? '⚠️ الخصم منفوخ. السعر «قبل» أعلى من المعتاد بكتير.' : disc.real > 0 ? '✅ خصم حقيقي تقريبًا.' : 'السعر مش أقل من المعتاد.'}
          </Text>
        </Card>

        <Card style={{ flex: 1, minWidth: 300, gap: 10 }}>
          <SectionTitle title="💱 تحويل العملات" hint={fx ? `أسعار ${fx.source} · ${new Date(fx.updatedAt).toLocaleDateString('ar-EG-u-nu-latn')}` : 'محتاج نت أول مرة'} />
          <Field label="المبلغ" value={amount} onChange={setAmount} suffix={cur} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {['USD', 'EUR', 'SAR', 'AED', 'KWD', 'GBP'].map((x) => <Chip key={x} label={x} active={cur === x} onPress={() => setCur(x)} />)}
          </View>
          <Text style={[t.h2, { color: c.ink }]}>{egpPer ? egp(n(amount) * egpPer) : '—'}</Text>
          {egpPer ? <Text style={[t.meta, { color: c.muted }]}>1 {cur} = {num(egpPer, 2)} ج.م</Text> : null}
        </Card>
      </View>
    </ScrollView>
  );
}
