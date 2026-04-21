import { NextRequest, NextResponse } from 'next/server';
import { calculateLoan, generateWeeklySchedule, localDateStr } from '@/lib/calculations';
import { findOrCreateCustomerAdmin } from '@/lib/firestore/customers';
import { createLoanAdmin } from '@/lib/firestore/loans';

/**
 * Notion CSV format:
 * Borrower Name, Principal, Interest Amount, Start Date, Week 1, Week 2, ...
 * Week cell format: "1000-23/3" (amount-day/month) or "1000" (amount only) or empty
 */

function parseDate(raw: string): string {
  raw = raw.trim();
  if (!raw) return localDateStr(new Date());

  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const iso = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return raw;

  const d = new Date(raw);
  if (!isNaN(d.getTime())) return localDateStr(d);
  return localDateStr(new Date());
}

function parseWeekCell(cell: string): { amount: number; date_hint: string | null } | null {
  cell = cell.trim();
  if (!cell) return null;

  const withDate = cell.match(/^(\d+(?:\.\d+)?)-(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/);
  if (withDate) {
    const [, amt, datePart] = withDate;
    const parts = datePart.split('/');
    let date_hint: string | null = null;
    if (parts.length >= 2) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : new Date().getFullYear().toString();
      date_hint = `${y}-${m}-${d}`;
    }
    return { amount: parseFloat(amt), date_hint };
  }

  const plain = cell.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return { amount: parseFloat(plain[1]), date_hint: null };
  return null;
}

function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const cols: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const { csv } = await request.json() as { csv: string };
    if (!csv) return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });

    const rows = csvParse(csv);
    if (rows.length < 2) return NextResponse.json({ error: 'CSV must have header + at least one data row' }, { status: 400 });

    const [header, ...dataRows] = rows;
    const h = header.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const col = (name: string) => h.findIndex(c => c.includes(name));

    const iName = col('borrower') !== -1 ? col('borrower') : col('name');
    const iPrincipal = col('principal');
    const iInterest = col('interest');
    const iDate = col('date') !== -1 ? col('date') : col('start');

    if (iName === -1 || iPrincipal === -1) {
      return NextResponse.json({ error: 'CSV must have "Borrower Name" and "Principal" columns' }, { status: 400 });
    }

    const weekCols = h
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => /^w(eek|k)?\s*\d+/.test(c) || /^w\d+/.test(c))
      .map(({ i }) => i);

    const results: { name: string; status: string; loan_id?: string; error?: string }[] = [];

    for (const row of dataRows) {
      const borrowerName = row[iName]?.trim();
      if (!borrowerName) continue;

      try {
        const principal = parseFloat(row[iPrincipal]) || 0;
        if (principal <= 0) {
          results.push({ name: borrowerName, status: 'skipped', error: 'Invalid principal' });
          continue;
        }

        const startDate = parseDate(iDate !== -1 ? row[iDate] : '');
        const customer = await findOrCreateCustomerAdmin(borrowerName);

        const customInterest = iInterest !== -1 ? parseFloat(row[iInterest]) : NaN;
        const loanTermWeeks = weekCols.length > 0 ? weekCols.length : 10;
        const calc = calculateLoan(principal, 4, loanTermWeeks);
        const interestAmount = !isNaN(customInterest) && customInterest > 0 ? customInterest : calc.interestAmount;

        const endD = new Date(startDate + 'T00:00:00');
        endD.setDate(endD.getDate() + loanTermWeeks * 7);

        // Build payment schedule, pre-filling paid amounts from CSV
        const schedule = generateWeeklySchedule('placeholder', startDate, loanTermWeeks, calc.weeklyAmount);
        const payments = schedule.map((s, idx) => {
          const weekColIdx = weekCols[idx];
          const cell = weekColIdx !== undefined ? (row[weekColIdx] || '') : '';
          const parsed = parseWeekCell(cell);
          const paidAmount = parsed?.amount || 0;
          const paidDate = parsed?.date_hint || (paidAmount > 0 ? s.dueDate : null);
          let status: 'pending' | 'paid' | 'partial' | 'overdue' = 'pending';
          if (paidAmount >= s.expectedAmount) status = 'paid';
          else if (paidAmount > 0) status = 'partial';
          return {
            periodNumber: s.periodNumber,
            dueDate: s.dueDate,
            expectedAmount: s.expectedAmount,
            paidAmount,
            paidDate,
            status,
            notes: '',
          };
        });

        const loan = await createLoanAdmin(
          {
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone || '',
            planType: 'weekly',
            principal,
            interestRate: 4,
            loanTermPeriods: loanTermWeeks,
            totalPeriods: loanTermWeeks,
            interestAmount,
            totalAmount: principal + interestAmount,
            periodAmount: calc.weeklyAmount,
            startDate,
            endDate: localDateStr(endD),
            notes: '',
            status: 'active',
            interestCollected: false,
            interestCollectedDate: null,
          },
          payments
        );

        results.push({ name: borrowerName, status: 'imported', loan_id: loan.id });
      } catch (err) {
        results.push({ name: borrowerName, status: 'error', error: String(err) });
      }
    }

    const imported = results.filter(r => r.status === 'imported').length;
    return NextResponse.json({ imported, total: results.length, results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to process import' }, { status: 500 });
  }
}
