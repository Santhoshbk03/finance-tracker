import { NextRequest, NextResponse } from 'next/server';
import { getCustomersAdmin, createCustomerAdmin } from '@/lib/firestore/customers';
import { getLoansAdmin } from '@/lib/firestore/loans';

export async function GET() {
  try {
    const [customers, loans] = await Promise.all([
      getCustomersAdmin(),
      getLoansAdmin(),
    ]);

    // Attach loan stats to each customer
    const enriched = customers.map((c) => {
      const cLoans = loans.filter((l) => l.customerId === c.id);
      const activeLoans = cLoans.filter((l) => l.status === 'active');
      return {
        ...c,
        total_loans: cLoans.length,
        active_loans: activeLoans.length,
        total_principal: activeLoans.reduce((s, l) => s + l.principal, 0),
        total_interest: activeLoans.reduce((s, l) => s + l.interestAmount, 0),
      };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, phone, address, notes } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const customer = await createCustomerAdmin({
      name: name.trim(),
      phone: phone || '',
      address: address || '',
      notes: notes || '',
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
