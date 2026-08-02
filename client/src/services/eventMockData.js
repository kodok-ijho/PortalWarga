// Small, isolated event-finance fixture used only by demo mode.
// Keeping it outside mockData.js avoids changing the existing IPL/expense
// fixtures and makes event-scoped behavior testable without a backend.

const events = [
  {
    id: 'demo-event-a',
    event_code: 'EVT-DEMO-A',
    title: 'Kerja Bakti Lingkungan',
    description: 'Kegiatan kebersihan bersama warga Palm Village.',
    event_date: '2026-08-09T07:00:00+07:00',
    end_date: '2026-08-09T12:00:00+07:00',
    location: 'Lapangan Palm Village',
    status: 'active',
    deleted_at: null,
  },
  {
    id: 'demo-event-b',
    event_code: 'EVT-DEMO-B',
    title: 'Perayaan HUT Kemerdekaan',
    description: 'Persiapan acara 17 Agustus.',
    event_date: '2026-08-17T15:00:00+07:00',
    end_date: null,
    location: 'Balai Warga',
    status: 'draft',
    deleted_at: null,
  },
];

const members = [
  {
    id: 'demo-member-a1',
    event_id: 'demo-event-a',
    profile_id: 'demo-admin',
    profile_name: 'Pak Hendra (Admin)',
    assignment_role: 'event_treasurer',
    revoked_at: null,
  },
  {
    id: 'demo-member-a2',
    event_id: 'demo-event-a',
    profile_id: 'demo-pengurus',
    profile_name: 'Ibu Ratna (Koordinator Palm Village)',
    assignment_role: 'coordinator_member',
    revoked_at: null,
  },
];

const incomes = [];
const expenses = [];

function activeEvent(event) {
  return !event.deleted_at;
}

export function listDemoEvents({ role, profileId, includeDeleted = false } = {}) {
  const visible = includeDeleted ? events : events.filter(activeEvent);
  if (role === 'admin' || role === 'bendahara' || role === 'admin_viewer') return visible.map((event) => ({ ...event }));
  if (!profileId) return [];
  const assignedIds = new Set(
    members.filter((member) => member.profile_id === profileId && !member.revoked_at).map((member) => member.event_id)
  );
  return visible.filter((event) => assignedIds.has(event.id)).map((event) => ({ ...event }));
}

export function getDemoEvent(eventId) {
  const event = events.find((item) => item.id === eventId && activeEvent(item));
  return event ? { ...event } : null;
}

export function getDemoMembers(eventId) {
  return members.filter((member) => member.event_id === eventId).map((member) => ({ ...member }));
}

export function getDemoAccess({ role, profileId } = {}) {
  const assigned = members
    .filter((member) => member.profile_id === profileId && !member.revoked_at)
    .map((member) => ({
      event_id: member.event_id,
      assignment_role: member.assignment_role,
      can_view: true,
      can_manage_finance: role === 'admin' || role === 'bendahara' || member.assignment_role === 'event_treasurer',
      can_manage_event: role === 'admin',
    }));

  return {
    global: {
      can_view_all_events: role === 'admin' || role === 'bendahara' || role === 'admin_viewer',
      can_manage_event: role === 'admin',
      can_manage_general_finance: role === 'admin' || role === 'bendahara',
    },
    events: assigned,
  };
}

export function listDemoIncomes({ eventId, scope } = {}) {
  return incomes
    .filter((income) => !income.deleted_at)
    .filter((income) => !scope || income.scope === scope)
    .filter((income) => !eventId || income.event_id === eventId)
    .map((income) => ({ ...income }));
}

export function createDemoIncome(payload) {
  const income = {
    id: `demo-income-${Date.now()}`,
    ...payload,
    amount: Number(payload.amount),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  incomes.push(income);
  return { ...income };
}

export function updateDemoIncome(id, payload) {
  const index = incomes.findIndex((income) => income.id === id && !income.deleted_at);
  if (index < 0) return null;
  incomes[index] = { ...incomes[index], ...payload, amount: Number(payload.amount), updated_at: new Date().toISOString() };
  return { ...incomes[index] };
}

export function deleteDemoIncome(id) {
  const income = incomes.find((item) => item.id === id && !item.deleted_at);
  if (!income) return null;
  income.deleted_at = new Date().toISOString();
  return { ...income };
}

export function getDemoEventReport(eventId) {
  const rows = listDemoIncomes({ eventId });
  const expenseRows = listDemoExpenses({ eventId });
  const totalIncome = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalExpense = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return {
    event: getDemoEvent(eventId),
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    transactionCount: rows.length + expenseRows.length,
    incomes: rows,
    expenses: expenseRows,
  };
}

export function listDemoExpenses({ eventId } = {}) {
  return expenses
    .filter((expense) => !expense.deleted_at && (!eventId || expense.event_id === eventId))
    .map((expense) => ({ ...expense }));
}

export function createDemoExpense(payload) {
  const expense = {
    id: `demo-event-expense-${Date.now()}`,
    ...payload,
    amount: Number(payload.amount),
    date: payload.date || payload.expense_date,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
  expenses.push(expense);
  return { ...expense };
}

export function updateDemoExpense(id, payload) {
  const index = expenses.findIndex((expense) => expense.id === id && !expense.deleted_at);
  if (index < 0) return null;
  expenses[index] = { ...expenses[index], ...payload, amount: Number(payload.amount), updated_at: new Date().toISOString() };
  return { ...expenses[index] };
}

export function deleteDemoExpense(id) {
  const expense = expenses.find((item) => item.id === id && !item.deleted_at);
  if (!expense) return null;
  expense.deleted_at = new Date().toISOString();
  return { ...expense };
}
