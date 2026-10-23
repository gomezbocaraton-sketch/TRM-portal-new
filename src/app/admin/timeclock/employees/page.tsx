import { createClient } from '@/lib/supabase/server';
import { EmployeeManager, type EmployeeRow } from './EmployeeManager';

type Row = Record<string, unknown>;

export default async function EmployeesPage() {
  const supabase = await createClient();
  const [{ data: emps }, { data: links }, { data: locs }] = await Promise.all([
    supabase.from('time_employees').select('id, full_name, phone, email, active').order('full_name'),
    supabase.from('time_employee_locations').select('employee_id, location_id'),
    supabase.from('time_locations').select('id, name'),
  ]);

  const locName = new Map(((locs ?? []) as Row[]).map((l) => [Number(l.id), String(l.name)]));
  const employees: EmployeeRow[] = ((emps ?? []) as Row[]).map((e) => ({
    id: Number(e.id),
    name: String(e.full_name),
    phone: String(e.phone),
    email: e.email ? String(e.email) : '',
    active: Boolean(e.active),
    locations: ((links ?? []) as Row[])
      .filter((l) => Number(l.employee_id) === Number(e.id))
      .map((l) => locName.get(Number(l.location_id)) ?? '')
      .filter(Boolean),
  }));

  return <EmployeeManager employees={employees} />;
}
