import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SystemRoles } from 'librechat-data-provider';
import { Button, Spinner } from '@librechat/client';
import type { TWillamaBucket, TWillamaTraffic, TWillamaUsage } from 'librechat-data-provider';
import {
  useWillamaAdminTrafficQuery,
  useWillamaAdminUsageQuery,
  useWillamaUsageQuery,
} from '~/data-provider';
import { useAuthContext, useDocumentTitle, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;
type Format = { money: (v: number) => string; int: (v: number) => string };
type AdminTab = 'costs' | 'traffic';

const RANGES = [
  { days: 7, labelKey: 'com_willama_range_7' },
  { days: 30, labelKey: 'com_willama_range_30' },
  { days: 90, labelKey: 'com_willama_range_90' },
] as const;

const CATEGORIES = ['email', 'phone', 'iban', 'creditCard', 'fiscalCode', 'ipAddress', 'apiKey'] as const;
const SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;
const SIZE_LABELS: Record<(typeof SIZES)[number], string> = {
  xs: '< 200',
  s: '200 – 1k',
  m: '1k – 5k',
  l: '5k – 20k',
  xl: '> 20k',
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

function useFormat(): Format {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const money = new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    const int = new Intl.NumberFormat(i18n.language);
    return { money: (v) => money.format(v), int: (v) => int.format(v) };
  }, [i18n.language]);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-border-light bg-surface-primary rounded-xl border p-4">
      <p className="text-text-secondary text-sm">{label}</p>
      <p className="text-text-primary mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-text-secondary mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function Bars({ items }: { items: Array<{ label: string; value: number; title: string }> }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <div className="flex h-32 items-end gap-1" role="img" aria-label={items.map((i) => i.title).join(', ')}>
      {items.map((item) => (
        <div key={item.label} className="flex h-full flex-1 flex-col justify-end" title={item.title}>
          <div
            className="bg-surface-submit min-h-px w-full rounded-t"
            style={{ height: max > 0 ? `${(item.value / max) * 100}%` : 0 }}
          />
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="border-border-light overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-surface-secondary text-text-secondary">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn('px-3 py-2 font-medium', i === 0 ? 'text-start' : 'text-end')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])} className="border-border-light border-t">
              {row.map((cell, i) => (
                <td key={i} className={cn('text-text-primary px-3 py-2', i === 0 ? 'text-start' : 'text-end')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text-primary text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function State({
  loading,
  error,
  localize,
}: {
  loading: boolean;
  error: boolean;
  localize: Localize;
}) {
  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }
  return error ? (
    <p role="alert" className="text-status-error text-sm">
      {localize('com_willama_load_error')}
    </p>
  ) : null;
}

function UsageView({
  data,
  fmt,
  localize,
  withUsers,
}: {
  data: TWillamaUsage;
  fmt: Format;
  localize: Localize;
  withUsers?: boolean;
}) {
  const tokens = (b: TWillamaBucket) => b.promptTokens + b.completionTokens;
  return (
    <div className="flex flex-col gap-4">
      {data.pricingErrors.length > 0 && (
        <p role="status" className="text-text-secondary text-sm">
          {localize('com_willama_pricing_warning', { 0: data.pricingErrors.join('; ') })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label={localize('com_willama_cost')}
          value={fmt.money(data.totals.cost)}
          hint={localize('com_willama_markup_note', { 0: String(data.markupPercent) })}
        />
        {withUsers && (
          <Kpi label={localize('com_willama_cost_base')} value={fmt.money(data.totals.baseCost)} />
        )}
        <Kpi label={localize('com_willama_tokens_in')} value={fmt.int(data.totals.promptTokens)} />
        <Kpi label={localize('com_willama_tokens_out')} value={fmt.int(data.totals.completionTokens)} />
      </div>
      {data.byDay.length === 0 ? (
        <p className="text-text-secondary text-sm">{localize('com_willama_no_data')}</p>
      ) : (
        <>
          <h3 className="text-text-secondary text-sm font-medium">{localize('com_willama_by_day')}</h3>
          <Bars
            items={data.byDay.map((d) => ({
              label: d.day,
              value: d.cost,
              title: `${d.day}: ${fmt.money(d.cost)}`,
            }))}
          />
          <Table
            head={[
              localize('com_willama_model'),
              localize('com_willama_tokens_in'),
              localize('com_willama_tokens_out'),
              localize('com_willama_cost'),
              localize('com_willama_source'),
            ]}
            rows={data.byModel.map((m) => [
              m.model,
              fmt.int(m.promptTokens),
              fmt.int(m.completionTokens),
              fmt.money(m.cost),
              m.source,
            ])}
          />
          {withUsers && data.byUser && (
            <Table
              head={[localize('com_willama_user'), localize('com_willama_tokens_in'), localize('com_willama_cost')]}
              rows={data.byUser.map((u) => [u.user, fmt.int(tokens(u)), fmt.money(u.cost)])}
            />
          )}
        </>
      )}
    </div>
  );
}

function TrafficView({
  data,
  fmt,
  localize,
}: {
  data: TWillamaTraffic;
  fmt: Format;
  localize: Localize;
}) {
  const { totals } = data;
  const rate = totals.messages ? Math.round((totals.flaggedMessages / totals.messages) * 100) : 0;
  const avg = totals.messages ? Math.round(totals.chars / totals.messages) : 0;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary text-sm">{localize('com_willama_traffic_privacy')}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label={localize('com_willama_traffic_messages')} value={fmt.int(totals.messages)} />
        <Kpi
          label={localize('com_willama_traffic_flagged')}
          value={fmt.int(totals.flaggedMessages)}
          hint={`${rate}%`}
        />
        <Kpi label={localize('com_willama_traffic_avg_chars')} value={fmt.int(avg)} />
      </div>
      {totals.messages === 0 ? (
        <p className="text-text-secondary text-sm">{localize('com_willama_no_data')}</p>
      ) : (
        <>
          <h3 className="text-text-secondary text-sm font-medium">{localize('com_willama_traffic_categories')}</h3>
          <Table
            head={[localize('com_willama_traffic_categories'), '#']}
            rows={CATEGORIES.map((c) => [localize(`com_willama_cat_${c}`), fmt.int(totals.categories[c])])}
          />
          <h3 className="text-text-secondary text-sm font-medium">{localize('com_willama_traffic_sizes')}</h3>
          <Table
            head={[localize('com_willama_traffic_sizes'), '#']}
            rows={SIZES.map((s) => [SIZE_LABELS[s], fmt.int(totals.sizes[s])])}
          />
          <h3 className="text-text-secondary text-sm font-medium">{localize('com_willama_traffic_by_model')}</h3>
          <Table
            head={[
              `${localize('com_willama_endpoint')} / ${localize('com_willama_model')}`,
              localize('com_willama_traffic_messages'),
              localize('com_willama_traffic_flagged'),
            ]}
            rows={data.byModel.map((m) => [
              `${m.endpoint} / ${m.model}`,
              fmt.int(m.messages),
              fmt.int(m.flaggedMessages),
            ])}
          />
        </>
      )}
    </div>
  );
}

export default function UsageDashboard() {
  const localize = useLocalize();
  const fmt = useFormat();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const [days, setDays] = useState<number>(30);
  const [tab, setTab] = useState<AdminTab>('costs');
  const range = useMemo(() => rangeFor(days), [days]);
  useDocumentTitle(localize('com_willama_title'));

  const mine = useWillamaUsageQuery(range);
  const adminUsage = useWillamaAdminUsageQuery(range, { enabled: isAdmin && tab === 'costs' });
  const traffic = useWillamaAdminTrafficQuery(range, { enabled: isAdmin && tab === 'traffic' });

  return (
    <main className="bg-surface-primary h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-text-primary text-2xl font-semibold">{localize('com_willama_title')}</h1>
          <div className="flex gap-2" role="group">
            {RANGES.map((r) => (
              <Button
                key={r.days}
                size="compact"
                variant={days === r.days ? 'submit' : 'outline'}
                aria-pressed={days === r.days}
                onClick={() => setDays(r.days)}
              >
                {localize(r.labelKey)}
              </Button>
            ))}
          </div>
        </header>

        <Section title={localize('com_willama_my_usage')}>
          <State loading={mine.isLoading} error={mine.isError} localize={localize} />
          {mine.data && <UsageView data={mine.data} fmt={fmt} localize={localize} />}
        </Section>

        {isAdmin && (
          <Section title={localize('com_willama_admin')}>
            <div className="flex gap-2" role="tablist">
              {(['costs', 'traffic'] as const).map((id) => (
                <Button
                  key={id}
                  role="tab"
                  size="compact"
                  aria-selected={tab === id}
                  variant={tab === id ? 'submit' : 'outline'}
                  onClick={() => setTab(id)}
                >
                  {localize(id === 'costs' ? 'com_willama_admin_costs' : 'com_willama_admin_traffic')}
                </Button>
              ))}
            </div>
            {tab === 'costs' ? (
              <>
                <State loading={adminUsage.isLoading} error={adminUsage.isError} localize={localize} />
                {adminUsage.data && (
                  <UsageView data={adminUsage.data} fmt={fmt} localize={localize} withUsers />
                )}
              </>
            ) : (
              <>
                <State loading={traffic.isLoading} error={traffic.isError} localize={localize} />
                {traffic.data && <TrafficView data={traffic.data} fmt={fmt} localize={localize} />}
              </>
            )}
          </Section>
        )}
      </div>
    </main>
  );
}
