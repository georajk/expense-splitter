'use client';

import { useMemo, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/db';

export type Person = { id: string; name: string };
export type Expense = {
  id: string;
  date: string;
  name: string;
  amount: number;
  paidBy: string;
  splitAmong: string[];
};

const INITIAL_PEOPLE: Person[] = [
  { id: 'person-1', name: 'Rahul' },
  { id: 'person-2', name: 'Krishna' },
  { id: 'person-3', name: 'Tom' },
  { id: 'person-4', name: 'Geo' },
];

const STORAGE_KEY = 'trip-expense-splitter-v1';

function formatMoney(value: number) {
  return `£${value.toFixed(2)}`;
}

function formatDateLabel(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function buildSummary(people: Person[], expenses: Expense[]) {
  const summary = people.reduce((acc, person) => {
    acc[person.id] = { paid: 0, owes: 0 };
    return acc;
  }, {} as Record<string, { paid: number; owes: number }>);

  expenses.forEach((expense) => {
    const share = expense.amount / expense.splitAmong.length;
    summary[expense.paidBy].paid += expense.amount;
    expense.splitAmong.forEach((personId) => {
      summary[personId].owes += share;
    });
  });

  return people.map((person) => ({
    ...person,
    paid: summary[person.id].paid,
    owes: summary[person.id].owes,
    balance: summary[person.id].paid - summary[person.id].owes,
  }));
}

function getDefaultDate() {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

const SUPABASE_TABLE = 'TripExpense' as const;

export default function HomePage() {
  const [people, setPeople] = useState<Person[]>(INITIAL_PEOPLE);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [date, setDate] = useState(getDefaultDate());
  const [expenseName, setExpenseName] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(INITIAL_PEOPLE[0].id);
  const [splitAmong, setSplitAmong] = useState<string[]>(INITIAL_PEOPLE.map((person) => person.id));
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw) as { people: Person[]; expenses: Expense[] };
        if (Array.isArray(data.people) && Array.isArray(data.expenses)) {
          setPeople(data.people);
          setExpenses(data.expenses);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ people, expenses })
    );
  }, [people, expenses]);

  const filteredExpenses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return expenses
      .filter((expense) => expense.name.toLowerCase().includes(query))
      .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  }, [searchQuery, expenses]);

  const summary = useMemo(() => buildSummary(people, expenses), [people, expenses]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount, 0), [expenses]);

  const allSelected = splitAmong.length === people.length;
  const selectedPeople = people.reduce((acc, person) => {
    acc[person.id] = person.name;
    return acc;
  }, {} as Record<string, string>);

  const togglePerson = (personId: string) => {
    if (splitAmong.includes(personId)) {
      if (splitAmong.length === 1) {
        return;
      }
      setSplitAmong(splitAmong.filter((id) => id !== personId));
    } else {
      setSplitAmong([...splitAmong, personId]);
    }
  };

  const handleAllToggle = () => {
    if (allSelected) {
      setSplitAmong([people[0].id]);
    } else {
      setSplitAmong(people.map((person) => person.id));
    }
  };

  const resetForm = () => {
    setExpenseName('');
    setAmount('');
    setSplitAmong(people.map((person) => person.id));
    setEditId(null);
  };

  const saveExpenseToSupabase = async (expense: Expense) => {
    setSupabaseError(null);
    setLoading(true);
    try {
      const insertPayload: Database['public']['Tables']['TripExpense']['Insert'] = {
        id: expense.id,
        date: expense.date,
        item: expense.name,
        amount: expense.amount,
        split_among: expense.splitAmong,
        paid_by: expense.paidBy,
      };
      const response = await supabase
        .from('TripExpense' as const)
        .insert([insertPayload] as any);
      if (response.error) {
        setSupabaseError(response.error.message);
      }
    } catch (error) {
      setSupabaseError('Unable to save expense to Supabase');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!expenseName.trim()) return;
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (!splitAmong.length) return;

    const expense: Expense = {
      id: editId ?? crypto.getRandomValues(new Uint32Array(1))[0].toString(),
      date,
      name: expenseName.trim(),
      amount: parsedAmount,
      paidBy,
      splitAmong,
    };

    setExpenses((current) => {
      const next = editId
        ? current.map((item) => (item.id === editId ? expense : item))
        : [expense, ...current];
      return next;
    });

    resetForm();
    await saveExpenseToSupabase(expense);
  };

  const handleEdit = (expense: Expense) => {
    setEditId(expense.id);
    setDate(expense.date);
    setExpenseName(expense.name);
    setAmount(expense.amount.toFixed(2));
    setPaidBy(expense.paidBy);
    setSplitAmong(expense.splitAmong);
  };

  const handleDelete = (expenseId: string) => {
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setExpenses([]);
    setConfirmClear(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
          <h1 className="text-2xl font-semibold text-slate-900">Trip Expense Splitter</h1>
          <p className="mt-2 text-sm text-slate-600">Track shared trip expenses for four people and see who owes or should receive money.</p>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">People</h2>
                  <p className="mt-1 text-sm text-slate-600">Edit person names and the app will use them everywhere.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {people.map((person, index) => (
                  <label key={person.id} className="block rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Person {index + 1}</span>
                    <input
                      type="text"
                      value={person.name}
                      onChange={(event) => {
                        setPeople((current) => current.map((item) => item.id === person.id ? { ...item, name: event.target.value } : item));
                      }}
                      className="mt-2 w-full border-0 bg-transparent px-0 text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder={`Person ${index + 1}`}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Expense Form</h2>
              <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-700">
                    <span>Date</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-700">
                    <span>Expense Name</span>
                    <input
                      type="text"
                      value={expenseName}
                      onChange={(event) => setExpenseName(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      placeholder="Lunch, Fuel, Hotel, Parking"
                      required
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-700">
                    <span>Amount</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      placeholder="45.80"
                      min="0"
                      step="0.01"
                      required
                    />
                  </label>

                  <label className="space-y-2 text-sm text-slate-700">
                    <span>Paid By</span>
                    <select
                      value={paidBy}
                      onChange={(event) => setPaidBy(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    >
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>{person.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Split Among</p>
                      <p className="text-sm text-slate-500">Choose who shares the expense.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAllToggle}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-slate-400"
                    >
                      {allSelected ? 'Uncheck All' : 'All'}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-700 transition hover:border-slate-400">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleAllToggle}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="font-medium">All</span>
                    </label>
                    {people.map((person) => (
                      <label key={person.id} className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-700 transition hover:border-slate-400">
                        <input
                          type="checkbox"
                          checked={splitAmong.includes(person.id)}
                          onChange={() => togglePerson(person.id)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="font-medium">{person.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-700">Expenses saved locally in your browser.</p>
                    {supabaseError && <p className="text-sm text-red-600">Supabase: {supabaseError}</p>}
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    {editId ? 'Update Expense' : 'Add Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
                  <p className="mt-1 text-sm text-slate-600">Totals for each person and the overall expense amount.</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  {confirmClear ? 'Confirm clear' : 'Clear expenses'}
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {summary.map((person) => (
                  <div key={person.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{person.name}</p>
                        <p className="text-xs text-slate-500">Paid: {formatMoney(person.paid)} • Owes: {formatMoney(person.owes)}</p>
                      </div>
                      <div className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
                        person.balance > 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : person.balance < 0
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {person.balance >= 0 ? '+' : ''}{formatMoney(person.balance)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-100 px-5 py-4">
                <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-900">
                  <span>Total Expenses</span>
                  <span>{formatMoney(totalExpenses)}</span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Expenses</h2>
              <p className="mt-1 text-sm text-slate-600">Search, sort, edit, delete, and export your trip expenses.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-64"
                placeholder="Search expenses"
              />
              <button
                type="button"
                onClick={() => {
                  const csv = [
                    ['Date', 'Expense', 'Amount', 'Paid By', 'Split Between', 'Share Per Person'],
                    ...filteredExpenses.map((expense) => [
                      expense.date,
                      expense.name,
                      expense.amount.toFixed(2),
                      selectedPeople[expense.paidBy],
                      expense.splitAmong.map((personId) => selectedPeople[personId]).join(', '),
                      (expense.amount / expense.splitAmong.length).toFixed(2),
                    ]),
                  ]
                    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
                    .join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'trip-expenses.csv';
                  link.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Expense</th>
                  <th className="px-3 py-3 font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Paid By</th>
                  <th className="px-3 py-3 font-medium">Split Between</th>
                  <th className="px-3 py-3 font-medium">Share</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredExpenses.length ? (
                  filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-slate-50">
                      <td className="px-3 py-4 text-slate-700">{formatDateLabel(expense.date)}</td>
                      <td className="px-3 py-4 text-slate-700">{expense.name}</td>
                      <td className="px-3 py-4 text-slate-700">{formatMoney(expense.amount)}</td>
                      <td className="px-3 py-4 text-slate-700">{selectedPeople[expense.paidBy]}</td>
                      <td className="px-3 py-4 text-slate-700">{expense.splitAmong.map((id) => selectedPeople[id]).join(', ')}</td>
                      <td className="px-3 py-4 text-slate-700">{formatMoney(expense.amount / expense.splitAmong.length)}</td>
                      <td className="px-3 py-4 space-x-2 text-slate-700">
                        <button
                          type="button"
                          onClick={() => handleEdit(expense)}
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(expense.id)}
                          className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                      No expenses recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
