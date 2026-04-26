import { db } from '@/lib/supabase-admin';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────
// Supabase uses snake_case columns; our app uses camelCase internally.

function rowToCustomer(row: any): Customer {
  return {
    id:        row.id,
    name:      row.name,
    phone:     row.phone ?? '',
    address:   row.address ?? '',
    notes:     row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getCustomersAdmin(): Promise<Customer[]> {
  const { data, error } = await db
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCustomer);
}

export async function getCustomerAdmin(id: string): Promise<Customer | null> {
  const { data, error } = await db
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // 0 rows
    throw error;
  }
  return data ? rowToCustomer(data) : null;
}

export async function createCustomerAdmin(
  input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Customer> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('customers')
    .insert({
      name:       input.name,
      phone:      input.phone || '',
      address:    input.address || '',
      notes:      input.notes || '',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToCustomer(data);
}

export async function updateCustomerAdmin(
  id: string,
  input: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name    !== undefined) patch.name    = input.name;
  if (input.phone   !== undefined) patch.phone   = input.phone;
  if (input.address !== undefined) patch.address = input.address;
  if (input.notes   !== undefined) patch.notes   = input.notes;

  const { error } = await db.from('customers').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCustomerAdmin(id: string): Promise<void> {
  // ON DELETE CASCADE on loans → payments handles the chain automatically.
  // But loans have ON DELETE RESTRICT on customer_id, so delete loans first.
  const { data: loans } = await db
    .from('loans')
    .select('id')
    .eq('customer_id', id);

  for (const l of loans ?? []) {
    await db.from('payments').delete().eq('loan_id', l.id);
    await db.from('loans').delete().eq('id', l.id);
  }

  const { error } = await db.from('customers').delete().eq('id', id);
  if (error) throw error;
}

export async function findOrCreateCustomerAdmin(
  name: string,
  phone?: string
): Promise<Customer> {
  if (phone) {
    const { data } = await db
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (data) return rowToCustomer(data);
  }
  return createCustomerAdmin({ name, phone: phone || '', address: '', notes: '' });
}
