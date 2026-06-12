import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

// Types
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

interface Income {
  id: string;
  userId: string;
  source: string;
  amount: number;
  frequency: 'monthly' | 'annual';
  category: string;
  isRecurring?: boolean;
}

interface Expense {
  id: string;
  userId: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  isRecurring?: boolean;
}

interface Portfolio {
  userId: string;
  riskLevel: 'low' | 'moderate' | 'aggressive';
}

interface Investment {
  id: string;
  userId: string;
  platform: string;
  paymentMethod: string;
  amount: number;
  riskLevel: 'low' | 'moderate' | 'aggressive';
  stocks: string[];
  date: string;
  status: 'active' | 'completed' | 'processing' | 'cancelled' | 'revoked';
  currentValue: number;
  returns: number;
  platformDeduction?: number;
  netInvested?: number;
  orderId?: string;
  suitabilityScore?: number;
  estimatedSettlement?: string;
  expectedAnnualReturn?: string;
  notes?: string;
  holdings?: { name: string; sector: string; allocation: number; allocationAmount: number; units: number; expected: string }[];
  cancelledDate?: string;
  refundAmount?: number;
}

interface SavingsLedgerEntry {
  id: string;
  userId: string;
  amount: number;
  date: string;
  source: string;
  note: string;
}

interface AppData {
  users: User[];
  currentUser: User | null;
  incomes: Income[];
  expenses: Expense[];
  portfolio: Portfolio | null;
  investments: Investment[];
  savingsLedger: SavingsLedgerEntry[];
}

// Context
const AppContext = createContext<{
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
} | null>(null);

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

// Utility functions
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(amount);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getAnnualIncome = (incomes: Income[]) => {
  const monthly = incomes
    .filter(i => i.frequency === 'monthly')
    .reduce((sum, i) => sum + (i.isRecurring === false ? i.amount / 12 : i.amount), 0);
  const annual = incomes.filter(i => i.frequency === 'annual').reduce((sum, i) => sum + i.amount, 0);
  return monthly * 12 + annual;
};

const getAverageMonthlyExpense = (expenses: Expense[]) => {
  if (expenses.length === 0) return 0;
  const recurringMonthly = expenses.filter(e => e.isRecurring).reduce((sum, expense) => sum + expense.amount, 0);
  const oneTimeExpenses = expenses.filter(e => !e.isRecurring);
  if (oneTimeExpenses.length === 0) return recurringMonthly;
  const monthlyBuckets = new Map<string, number>();
  oneTimeExpenses.forEach(expense => {
    const date = new Date(expense.date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    monthlyBuckets.set(key, (monthlyBuckets.get(key) || 0) + expense.amount);
  });
  const total = Array.from(monthlyBuckets.values()).reduce((sum, value) => sum + value, 0);
  return recurringMonthly + (total / Math.max(1, monthlyBuckets.size));
};

const getFinancialHealthScore = (monthlyIncome: number, avgMonthlyExpense: number, totalInvested: number) => {
  if (monthlyIncome <= 0) return 0;
  const surplus = Math.max(0, monthlyIncome - avgMonthlyExpense);
  const savingsRate = surplus / monthlyIncome;
  const investmentDepth = totalInvested / Math.max(1, monthlyIncome * 6);
  return Math.round(clamp((savingsRate * 65) + (investmentDepth * 25) + 10, 0, 100));
};

const calculateIncomeTax = (taxable: number, regime: 'old' | 'new') => {
  const slabs = regime === 'new'
    ? [
      { upto: 300000, rate: 0 },
      { upto: 600000, rate: 0.05 },
      { upto: 900000, rate: 0.10 },
      { upto: 1200000, rate: 0.15 },
      { upto: 1500000, rate: 0.20 },
      { upto: Infinity, rate: 0.30 },
    ]
    : [
      { upto: 250000, rate: 0 },
      { upto: 500000, rate: 0.05 },
      { upto: 1000000, rate: 0.20 },
      { upto: Infinity, rate: 0.30 },
    ];

  let previous = 0;
  let tax = 0;
  for (const slab of slabs) {
    const slabIncome = Math.max(0, Math.min(taxable, slab.upto) - previous);
    tax += slabIncome * slab.rate;
    previous = slab.upto;
    if (taxable <= slab.upto) break;
  }

  const rebateLimit = regime === 'new' ? 700000 : 500000;
  const rebate = taxable <= rebateLimit ? Math.min(tax, regime === 'new' ? 25000 : 12500) : 0;
  return Math.round(Math.max(0, tax - rebate) * 1.04); // 4% health and education cess
};

const getTaxProfile = (annualIncome: number, expenses: Expense[], investments: Investment[]) => {
  const currentYear = new Date().getFullYear();
  const annualHousing = expenses
    .filter(e => e.category === 'Housing' && new Date(e.date).getFullYear() === currentYear)
    .reduce((sum, e) => sum + e.amount, 0);
  const annualHealth = expenses
    .filter(e => e.category === 'Healthcare' && new Date(e.date).getFullYear() === currentYear)
    .reduce((sum, e) => sum + e.amount, 0);
  const taxSavingInvestments = investments
    .filter(i => i.status !== 'cancelled' && i.status !== 'revoked')
    .flatMap(i => i.holdings?.map(h => h.name) ?? i.stocks)
    .filter(name => /(ELSS|PPF|Tax Saver|NPS|NSC)/i.test(name)).length * 50000;

  const oldDeductions = {
    standard: annualIncome > 0 ? 50000 : 0,
    section80C: Math.min(150000, taxSavingInvestments),
    section80D: Math.min(25000, annualHealth),
    hra: Math.min(annualHousing * 0.4, 200000),
  };
  const oldTotalDeductions = Object.values(oldDeductions).reduce((sum, value) => sum + value, 0);
  const newStandardDeduction = annualIncome > 0 ? 75000 : 0;
  const oldTaxable = Math.max(0, annualIncome - oldTotalDeductions);
  const newTaxable = Math.max(0, annualIncome - newStandardDeduction);
  const oldTax = calculateIncomeTax(oldTaxable, 'old');
  const newTax = calculateIncomeTax(newTaxable, 'new');
  const bestRegime = newTax <= oldTax ? 'new' : 'old';
  const tax = Math.min(oldTax, newTax);

  return {
    annualIncome,
    monthlyAfterTaxIncome: (annualIncome - tax) / 12,
    annualAfterTaxIncome: annualIncome - tax,
    tax,
    oldTax,
    newTax,
    bestRegime,
    oldTaxable,
    newTaxable,
    oldDeductions,
    oldTotalDeductions,
    newStandardDeduction,
  };
};

// Load data from localStorage
const loadData = (): AppData => {
  const stored = localStorage.getItem('taxshield_data');
  if (stored) {
    const data = JSON.parse(stored);
    if (data.users) data.users = data.users.map((u: User) => ({ ...u, createdAt: new Date(u.createdAt) }));
    if (!data.savingsLedger) data.savingsLedger = [];
    if (!data.investments) data.investments = [];
    return data;
  }
  return { users: [], currentUser: null, incomes: [], expenses: [], portfolio: null, investments: [], savingsLedger: [] };
};

// Icons
const Icons = {
  Dashboard: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  Income: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Expense: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Tax: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
    </svg>
  ),
  Portfolio: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  Agent: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Logout: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Close: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  User: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Edit: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
};

// Login/Register Component
const AuthPage: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserName, setAddUserName] = useState('');
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addUserPassword, setAddUserPassword] = useState('');
  const { data, setData } = useApp();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isLogin) {
      const user = data.users.find(u => u.email === email && u.password === password);
      if (user) {
        onLogin(user);
      } else if (email === 'demo@taxshield.ai' && password === 'demo123') {
        const demoUser: User = {
          id: 'demo',
          name: 'Demo User',
          email: 'demo@taxshield.ai',
          password: 'demo123',
          createdAt: new Date()
        };
        onLogin(demoUser);
      } else {
        setError('Invalid email or password');
      }
    } else {
      if (!name || !email || !password) {
        setError('Please fill all fields');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (data.users.find(u => u.email === email)) {
        setError('Email already registered');
        return;
      }
      const newUser: User = {
        id: generateId(),
        name,
        email,
        password,
        createdAt: new Date()
      };
      setData(prev => ({ ...prev, users: [...prev.users, newUser] }));
      onLogin(newUser);
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserName || !addUserEmail || !addUserPassword) {
      setError('Please fill all fields');
      return;
    }
    if (data.users.find(u => u.email === addUserEmail)) {
      setError('Email already registered');
      return;
    }
    const newUser: User = {
      id: generateId(),
      name: addUserName,
      email: addUserEmail,
      password: addUserPassword,
      createdAt: new Date()
    };
    setData(prev => ({ ...prev, users: [...prev.users, newUser] }));
    setShowAddUser(false);
    setAddUserName('');
    setAddUserEmail('');
    setAddUserPassword('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img src="/images/auth-hero.jpg" alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-emerald-900/70" />
      </div>
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl mb-4 shadow-lg shadow-emerald-500/25">
            <Icons.Shield />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">TaxShield AI</h1>
          <p className="text-slate-400">Secure your wealth with intelligent tax planning</p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
          {/* Tabs */}
          <div className="flex mb-6 bg-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                isLogin ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                !isLogin ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Enter your name"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-500/25"
            >
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {isLogin && (
            <div className="mt-4 p-3 bg-slate-700/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Demo Credentials:</p>
              <p className="text-xs text-emerald-400">demo@taxshield.ai / demo123</p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-700">
            <button
              onClick={() => setShowAddUser(true)}
              className="w-full py-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
            >
              + Add New User to Account
            </button>
          </div>
        </div>

        {/* Features Preview */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          {[
            { title: 'Tax Optimization', desc: 'Save up to ₹1.5L+ yearly', icon: '💰' },
            { title: 'Portfolio Planning', desc: 'AI-powered strategies', icon: '📊' },
            { title: 'Expense Tracking', desc: 'Smart categorization', icon: '📝' },
            { title: 'Secure & Private', desc: 'Bank-grade encryption', icon: '🔒' },
          ].map((feature, i) => (
            <div key={i} className="bg-slate-800/30 backdrop-blur rounded-xl p-4 border border-slate-700/50">
              <span className="text-2xl mb-2 block">{feature.icon}</span>
              <h3 className="text-white font-medium text-sm">{feature.title}</h3>
              <p className="text-slate-400 text-xs mt-1">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Add Family Member</h2>
              <button onClick={() => setShowAddUser(false)} className="text-slate-400 hover:text-white">
                <Icons.Close />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={addUserName}
                  onChange={(e) => setAddUserName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  placeholder="Family member name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  placeholder="family@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={addUserPassword}
                  onChange={(e) => setAddUserPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  placeholder="Set password"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
              >
                Add User
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Sidebar Component
const Sidebar: React.FC<{
  currentPage: string;
  setCurrentPage: (page: string) => void;
  onLogout: () => void;
}> = ({ currentPage, setCurrentPage, onLogout }) => {
  const { data } = useApp();
  const user = data.currentUser;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'income', label: 'Income', icon: Icons.Income },
    { id: 'expense', label: 'Expenses', icon: Icons.Expense },
    { id: 'tax', label: 'Tax Optimizer', icon: Icons.Tax },
    { id: 'portfolio', label: 'Portfolio', icon: Icons.Portfolio },
    { id: 'agent', label: 'AI Agent', icon: Icons.Agent },
  ];

  const monthlyIncome = data.incomes
    .filter(i => i.userId === user?.id && i.frequency === 'monthly')
    .reduce((sum, i) => sum + i.amount, 0);
  const annualIncome = data.incomes
    .filter(i => i.userId === user?.id && i.frequency === 'annual')
    .reduce((sum, i) => sum + i.amount, 0);
  const totalMonthly = monthlyIncome + annualIncome / 12;

  return (
    <aside className="w-72 bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center">
            <Icons.Shield />
          </div>
          <div>
            <h1 className="text-white font-bold">TaxShield AI</h1>
            <p className="text-xs text-slate-400">Smart Tax & Investment</p>
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 m-4 bg-slate-700/50 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{user?.name}</p>
            <p className="text-slate-400 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-600">
          <p className="text-xs text-slate-400">Monthly Income</p>
          <p className="text-lg font-semibold text-emerald-400">{formatCurrency(totalMonthly)}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all ${
              currentPage === item.id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <item.icon />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-700/50">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
        >
          <Icons.Logout />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

// Dashboard Component
const Dashboard: React.FC = () => {
  const { data } = useApp();
  const user = data.currentUser;

  const userIncomes = data.incomes.filter(i => i.userId === user?.id);
  const userExpenses = data.expenses.filter(e => e.userId === user?.id);
  const userInvestments = data.investments.filter(i => i.userId === user?.id && i.status !== 'cancelled' && i.status !== 'revoked');

  const totalAnnualIncome = getAnnualIncome(userIncomes);
  const totalMonthlyIncome = totalAnnualIncome / 12;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyExpenses = userExpenses
    .filter(e => {
      const date = new Date(e.date);
      return !e.isRecurring && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + e.amount, 0) +
    userExpenses.filter(e => e.isRecurring).reduce((sum, e) => sum + e.amount, 0);

  const avgMonthlyExpense = getAverageMonthlyExpense(userExpenses);
  const taxProfile = getTaxProfile(totalAnnualIncome, userExpenses, userInvestments);
  const taxSavings = Math.abs(taxProfile.oldTax - taxProfile.newTax);
  const savingsRate = totalMonthlyIncome > 0 ? ((totalMonthlyIncome - avgMonthlyExpense) / totalMonthlyIncome * 100) : 0;
  const totalInvested = userInvestments.reduce((s, i) => s + (i.netInvested ?? i.amount), 0);
  const totalReturns = userInvestments.reduce((s, i) => s + i.returns, 0);
  const score = getFinancialHealthScore(totalMonthlyIncome, avgMonthlyExpense, totalInvested);

  const pieData = [
    { name: 'Income', value: totalMonthlyIncome, color: '#10B981' },
    { name: 'Expenses', value: monthlyExpenses, color: '#EF4444' },
    { name: 'Savings', value: Math.max(0, totalMonthlyIncome - monthlyExpenses), color: '#3B82F6' },
  ].filter(d => d.value > 0);

  const taxComparison = [
    { regime: 'Old', tax: taxProfile.oldTax },
    { regime: 'New', tax: taxProfile.newTax },
  ];

  return (
    <div className="space-y-6">
      {/* Dashboard Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl h-40 border border-slate-700/50">
        <img src="/images/dashboard-banner.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-transparent" />
        <div className="relative h-full flex items-center justify-between p-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="text-slate-300 mt-1">Here's your financial overview for today</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-300">TaxShield Score</p>
            <p className={`text-4xl font-bold ${score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {Math.round(score)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
        {[
          { label: 'Monthly Income', value: formatCurrency(totalMonthlyIncome), color: 'emerald', icon: '💰' },
          { label: 'After-Tax Income', value: formatCurrency(taxProfile.monthlyAfterTaxIncome), color: 'emerald', icon: '🧾' },
          { label: 'Monthly Expenses', value: formatCurrency(monthlyExpenses), color: 'red', icon: '💸' },
          { label: 'Savings Rate', value: `${Math.max(0, savingsRate).toFixed(1)}%`, color: Math.max(0, savingsRate) >= 20 ? 'emerald' : 'amber', icon: '⚖️' },
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'blue', icon: '📈' },
          { label: 'Investment Returns', value: formatCurrency(totalReturns), color: totalReturns >= 0 ? 'emerald' : 'red', icon: '🎯' },
          { label: `${taxProfile.bestRegime.toUpperCase()} Regime Saves`, value: formatCurrency(taxSavings), color: 'amber', icon: '🛡️' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-400 text-sm">{stat.label}</p>
              <span className="text-xl">{stat.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${
              stat.color === 'emerald' ? 'text-emerald-400' :
              stat.color === 'red' ? 'text-red-400' :
              stat.color === 'blue' ? 'text-blue-400' :
              stat.color === 'amber' ? 'text-amber-400' : 'text-white'
            }`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expenses */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Income vs Expenses</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(value as number)}
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569', borderRadius: '8px' }}
                  labelStyle={{ color: '#F8FAFC' }}
                />
                <Legend wrapperStyle={{ color: '#94A3B8' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              <p>Add income and expenses to see visualization</p>
            </div>
          )}
        </div>

        {/* Tax Comparison */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Tax Regime Comparison</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={taxComparison} layout="vertical">
              <XAxis type="number" tickFormatter={(v) => `₹${(Number(v)/1000).toFixed(0)}K`} stroke="#94A3B8" />
              <YAxis type="category" dataKey="regime" stroke="#94A3B8" />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569', borderRadius: '8px' }}
              />
              <Bar dataKey="tax" fill="#10B981" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-sm text-slate-400 mt-2 text-center">
            {taxComparison[0].tax < taxComparison[1].tax ? '🎉 Old regime saves you more' : '🎉 New regime saves you more'}
          </p>
        </div>
      </div>

      {/* Recent Investments */}
      {userInvestments.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Investments</h3>
          <div className="space-y-3">
            {userInvestments.slice(-3).reverse().map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-slate-700/30 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                    <span className="text-emerald-400 text-xl">📈</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{inv.platform}</p>
                    <p className="text-slate-400 text-sm">{inv.paymentMethod} • {inv.stocks.length} stocks</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">{formatCurrency(inv.amount)}</p>
                  <p className={`text-sm ${inv.returns >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {inv.returns >= 0 ? '+' : ''}{formatCurrency(inv.returns)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Tips */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '💡', title: 'Maximize 80C Deductions', desc: 'Invest in ELSS, PPF, or FD to save up to ₹46,500 in taxes' },
            { icon: '📈', title: 'Emergency Fund', desc: 'Maintain 6 months of expenses as liquid savings' },
            { icon: '🏠', title: 'HRA Benefits', desc: 'Claim HRA if living in a rented accommodation' },
          ].map((tip, i) => (
            <div key={i} className="bg-slate-700/30 rounded-lg p-4">
              <span className="text-2xl">{tip.icon}</span>
              <h4 className="text-white font-medium mt-2">{tip.title}</h4>
              <p className="text-slate-400 text-sm mt-1">{tip.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Income Component
const Income: React.FC = () => {
  const { data, setData } = useApp();
  const user = data.currentUser;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ source: string; amount: string; frequency: 'monthly' | 'annual'; category: string; isRecurring: boolean }>({ source: '', amount: '', frequency: 'monthly', category: 'Salary', isRecurring: true });

  const categories = ['Salary', 'Business', 'Freelance', 'Investments', 'Rental', 'Other'];
  const userIncomes = data.incomes.filter(i => i.userId === user?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.source || !form.amount) return;

    if (editingId) {
      setData(prev => ({
        ...prev,
        incomes: prev.incomes.map(i => i.id === editingId ? { ...i, ...form, amount: parseFloat(form.amount), frequency: form.frequency as 'monthly' | 'annual' } : i)
      }));
    } else {
      setData(prev => ({
        ...prev,
        incomes: [...prev.incomes, {
          id: generateId(),
          userId: user!.id,
          source: form.source,
          amount: parseFloat(form.amount),
          frequency: form.frequency as 'monthly' | 'annual',
          category: form.category,
          isRecurring: form.isRecurring
        }]
      }));
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ source: '', amount: '', frequency: 'monthly', category: 'Salary', isRecurring: true });
  };

  const handleEdit = (income: Income) => {
    setForm({ source: income.source, amount: income.amount.toString(), frequency: income.frequency as 'monthly' | 'annual', category: income.category, isRecurring: income.isRecurring ?? income.frequency === 'monthly' });
    setEditingId(income.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setData(prev => ({ ...prev, incomes: prev.incomes.filter(i => i.id !== id) }));
  };

  const totalMonthly = userIncomes.filter(i => i.frequency === 'monthly' && i.isRecurring !== false).reduce((s, i) => s + i.amount, 0);
  const totalAnnual = userIncomes.filter(i => i.frequency === 'annual').reduce((s, i) => s + i.amount, 0);
  const oneTimeIncome = userIncomes.filter(i => i.isRecurring === false).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* Income Hero */}
      <div className="relative overflow-hidden rounded-2xl h-36 border border-slate-700/50">
        <img src="/images/income-wealth.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-transparent" />
        <div className="relative h-full flex items-center justify-between p-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Income Sources</h1>
            <p className="text-slate-300 mt-1">Manage all your income streams</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm({ source: '', amount: '', frequency: 'monthly', category: 'Salary', isRecurring: true }); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25"
          >
            <Icons.Plus /> Add Income
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm">Monthly Income</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalMonthly)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm">Annual Income</p>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(totalAnnual)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm">One-time Income</p>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(oneTimeIncome)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm">Total (Monthly Equivalent)</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(getAnnualIncome(userIncomes) / 12)}</p>
        </div>
      </div>

      {/* Income List */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-white">All Income Sources</h3>
        </div>
        {userIncomes.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p>No income sources added yet</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-emerald-400 hover:text-emerald-300">
              + Add your first income source
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {userIncomes.map(income => (
              <div key={income.id} className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-emerald-400 font-semibold">{income.category.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{income.source}</p>
                    <p className="text-slate-400 text-sm">
                      {income.category} • {income.frequency} • {income.isRecurring ? 'Recurring' : 'One-time'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-emerald-400 font-semibold">{formatCurrency(income.amount)}/{income.frequency === 'monthly' ? 'mo' : 'yr'}</p>
                  <button onClick={() => handleEdit(income)} className="p-2 text-slate-400 hover:text-white transition-colors">
                    <Icons.Edit />
                  </button>
                  <button onClick={() => handleDelete(income.id)} className="p-2 text-red-400 hover:text-red-300 transition-colors">
                    <Icons.Trash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">{editingId ? 'Edit' : 'Add'} Income</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <Icons.Close />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Source Name</label>
                <input
                  type="text"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g., Tech Corp Salary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    placeholder="50000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value as 'monthly' | 'annual' })}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Recurring income?</p>
                  <p className="text-xs text-slate-400">Turn this on for salary, rent, SIP interest, or other repeat inflows.</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-500 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
              </label>
              <button type="submit" className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all">
                {editingId ? 'Update' : 'Add'} Income
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Expenses Component
const Expenses: React.FC = () => {
  const { data, setData } = useApp();
  const user = data.currentUser;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: 'Housing', description: '', amount: '', date: new Date().toISOString().split('T')[0], isRecurring: false });

  const categories = ['Housing', 'Utilities', 'Food', 'Transport', 'Healthcare', 'Entertainment', 'Other'];
  const userExpenses = data.expenses.filter(e => e.userId === user?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;

    if (editingId) {
      setData(prev => ({
        ...prev,
        expenses: prev.expenses.map(e => e.id === editingId ? { ...e, ...form, amount: parseFloat(form.amount) } : e)
      }));
    } else {
      setData(prev => ({
        ...prev,
        expenses: [...prev.expenses, {
          id: generateId(),
          userId: user!.id,
          ...form,
          amount: parseFloat(form.amount)
        }]
      }));
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ category: 'Housing', description: '', amount: '', date: new Date().toISOString().split('T')[0], isRecurring: false });
  };

  const handleEdit = (expense: Expense) => {
    setForm({ category: expense.category, description: expense.description, amount: expense.amount.toString(), date: expense.date, isRecurring: expense.isRecurring ?? false });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setData(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyTotal = userExpenses
    .filter(e => {
      const d = new Date(e.date);
      return !e.isRecurring && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((s, e) => s + e.amount, 0) +
    userExpenses.filter(e => e.isRecurring).reduce((s, e) => s + e.amount, 0);

  const categoryTotals = categories.map(cat => ({
    category: cat,
    amount: userExpenses
      .filter(e => {
        const d = new Date(e.date);
        return e.category === cat && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.amount > 0);

  return (
    <div className="space-y-6">
      {/* Expenses Hero */}
      <div className="relative overflow-hidden rounded-2xl h-36 border border-slate-700/50 bg-gradient-to-br from-red-900/40 via-slate-900 to-slate-800">
        <div className="absolute inset-0 opacity-30">
          <svg className="w-full h-full" viewBox="0 0 800 150" preserveAspectRatio="none">
            <path d="M0,80 Q200,40 400,80 T800,60 L800,150 L0,150 Z" fill="url(#expenseGrad)" />
            <defs>
              <linearGradient id="expenseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.3" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="relative h-full flex items-center justify-between p-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Expenses</h1>
            <p className="text-slate-300 mt-1">Track and manage your spending</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm({ category: 'Housing', description: '', amount: '', date: new Date().toISOString().split('T')[0], isRecurring: false }); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25"
          >
            <Icons.Plus /> Add Expense
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">This Month's Spending</h3>
          <p className="text-4xl font-bold text-red-400">{formatCurrency(monthlyTotal)}</p>
          <p className="text-slate-400 mt-2">Total expenses for {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
        </div>
        {categoryTotals.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">By Category</h3>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={categoryTotals}>
                <XAxis dataKey="category" stroke="#94A3B8" fontSize={12} />
                <YAxis stroke="#94A3B8" fontSize={12} tickFormatter={(v) => `₹${(Number(v)/1000).toFixed(0)}K`} />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569', borderRadius: '8px' }}
                />
                <Bar dataKey="amount" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Expense List */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-white">All Expenses</h3>
        </div>
        {userExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p>No expenses recorded yet</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-emerald-400 hover:text-emerald-300">
              + Add your first expense
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50 max-h-96 overflow-y-auto">
            {userExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(expense => (
              <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-red-400 font-semibold">{expense.category.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{expense.description}</p>
                    <p className="text-slate-400 text-sm">
                      {expense.category} • {new Date(expense.date).toLocaleDateString()} • {expense.isRecurring ? 'Recurring' : 'One-time'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-red-400 font-semibold">-{formatCurrency(expense.amount)}</p>
                  <button onClick={() => handleEdit(expense)} className="p-2 text-slate-400 hover:text-white transition-colors">
                    <Icons.Edit />
                  </button>
                  <button onClick={() => handleDelete(expense.id)} className="p-2 text-red-400 hover:text-red-300 transition-colors">
                    <Icons.Trash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">{editingId ? 'Edit' : 'Add'} Expense</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <Icons.Close />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g., Grocery shopping"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    placeholder="2500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Recurring expense?</p>
                  <p className="text-xs text-slate-400">Use this for rent, EMIs, utilities, subscriptions, or insurance premiums.</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-500 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
              </label>
              <button type="submit" className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all">
                {editingId ? 'Update' : 'Add'} Expense
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Tax Optimizer Component
const TaxOptimizer: React.FC = () => {
  const { data } = useApp();
  const user = data.currentUser;

  const userIncomes = data.incomes.filter(i => i.userId === user?.id);
  const userExpenses = data.expenses.filter(e => e.userId === user?.id);
  const userInvestments = data.investments.filter(i => i.userId === user?.id);

  const annualIncome = getAnnualIncome(userIncomes);
  const currentYear = new Date().getFullYear();
  const annualExpenses = userExpenses
    .filter(e => new Date(e.date).getFullYear() === currentYear)
    .reduce((s, e) => s + e.amount, 0);

  const annualHousing = userExpenses
    .filter(e => e.category === 'Housing' && new Date(e.date).getFullYear() === currentYear)
    .reduce((sum, e) => sum + e.amount, 0);
  const annualHealth = userExpenses
    .filter(e => e.category === 'Healthcare' && new Date(e.date).getFullYear() === currentYear)
    .reduce((sum, e) => sum + e.amount, 0);
  const eligible80CInvestment = userInvestments
    .filter(investment => investment.status !== 'cancelled' && investment.status !== 'revoked')
    .flatMap(investment => investment.holdings?.map(h => h.name) ?? investment.stocks)
    .filter(stock => /(ELSS|PPF|NPS|Tax Saver)/i.test(stock)).length * 50000;

  const taxableIncome = Math.max(0, annualIncome);

  // Old Tax Regime (based on recorded household profile)
  const standardDeduction = annualIncome > 0 ? 50000 : 0;
  const section80C = Math.min(150000, eligible80CInvestment);
  const section80D = Math.min(25000, annualHealth);
  const HRA = Math.min(annualHousing * 0.4, 200000);
  const totalDeductions = standardDeduction + section80C + section80D + HRA;
  const oldTaxable = Math.max(0, taxableIncome - totalDeductions);

  // New Tax Regime
  const newTaxable = taxableIncome;
  const newStandardDeduction = annualIncome > 0 ? 75000 : 0;
  const newTaxableAfterStd = Math.max(0, newTaxable - newStandardDeduction);

  const calculateOldTax = (income: number) => calculateIncomeTax(income, 'old');
  const calculateNewTax = (income: number) => calculateIncomeTax(income, 'new');

  const oldTax = calculateOldTax(oldTaxable);
  const newTax = calculateNewTax(newTaxableAfterStd);
  const savings = oldTax - newTax;
  const recommendedRegime = newTax < oldTax ? 'new' : 'old';
  const bestTax = Math.min(oldTax, newTax);
  const postTaxIncome = annualIncome - bestTax - annualExpenses;
  const uncovered80C = Math.max(0, 150000 - section80C);
  const uncovered80D = Math.max(0, 25000 - section80D);

  const taxSavingSuggestions = [
    { section: '80C', title: 'ELSS Mutual Fund', desc: uncovered80C > 0 ? `You still have ${formatCurrency(uncovered80C)} of 80C room available.` : 'You have already utilized your 80C room well.', max: '₹1,50,000', icon: '📈' },
    { section: '80C', title: 'PPF Account', desc: 'Use long-term, low-risk deposits to build deductible savings.', max: '₹1,50,000', icon: '🏦' },
    { section: '80D', title: 'Health Insurance', desc: uncovered80D > 0 ? `Healthcare expenses support up to ${formatCurrency(25000)} in 80D planning.` : 'Your current healthcare spends already support the usual 80D limit.', max: '₹25,000', icon: '🏥' },
    { section: 'HRA', title: 'Rent / HRA', desc: annualHousing > 0 ? `Your recorded housing spend can support an HRA claim estimate of ${formatCurrency(HRA)}.` : 'Add housing expenses to estimate HRA impact more accurately.', max: 'Based on rent', icon: '🏠' },
    { section: 'NPS', title: 'NPS Tier I', desc: 'Useful if you want an additional retirement-focused deduction bucket.', max: '₹50,000 extra', icon: '🛡️' },
    { section: '80C', title: 'Tax Saver FD / NSC', desc: 'Stable alternative if you prefer fixed-return tax-saving products.', max: '₹1,50,000', icon: '📜' },
  ];

  const comparisonData = [
    { metric: 'Gross Income', old: formatCurrency(annualIncome), new: formatCurrency(newTaxable) },
    { metric: 'Claimed Deductions', old: formatCurrency(totalDeductions), new: formatCurrency(newStandardDeduction) },
    { metric: 'Taxable Income', old: formatCurrency(oldTaxable), new: formatCurrency(newTaxableAfterStd) },
    { metric: 'Post-tax Spendable', old: formatCurrency(annualIncome - oldTax - annualExpenses), new: formatCurrency(annualIncome - newTax - annualExpenses) },
    { metric: 'Tax Liability', old: formatCurrency(oldTax), new: formatCurrency(newTax), highlight: true },
  ];

  const taxBracketData = [500000, 1000000, 1500000, 2000000, 3000000].map(value => {
    const oldBracketTaxable = Math.max(0, value - totalDeductions);
    const newBracketTaxable = Math.max(0, value - newStandardDeduction);
    return {
      bracket: `₹${(value / 100000).toFixed(0)}L`,
      oldTax: Math.round(calculateOldTax(oldBracketTaxable)),
      newTax: Math.round(calculateNewTax(newBracketTaxable)),
    };
  });

  return (
    <div className="space-y-6">
      {/* Tax Optimizer Hero */}
      <div className="relative overflow-hidden rounded-2xl h-36 border border-slate-700/50 bg-gradient-to-br from-amber-900/40 via-slate-900 to-slate-800">
        <div className="absolute inset-0 opacity-30">
          <svg className="w-full h-full" viewBox="0 0 800 150" preserveAspectRatio="none">
            <path d="M0,100 Q200,50 400,70 T800,40 L800,150 L0,150 Z" fill="url(#taxGrad)" />
            <defs>
              <linearGradient id="taxGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.4" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="absolute top-4 right-4 text-6xl opacity-20">🛡️</div>
        <div className="relative h-full flex items-center p-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Tax Optimizer</h1>
            <p className="text-slate-300 mt-1">Compare tax regimes and find the best saving strategy</p>
          </div>
        </div>
      </div>

      {/* Recommendation Banner */}
      <div className={`rounded-xl p-6 border ${recommendedRegime === 'new' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-slate-300 text-sm mb-1">Recommended Tax Regime</p>
            <p className="text-3xl font-bold text-white capitalize">{recommendedRegime} Tax Regime {recommendedRegime === 'new' ? '✨' : '🏆'}</p>
            <p className="text-slate-400 mt-2">
              {Math.abs(savings) > 0
                ? <>Choosing this option can improve annual tax efficiency by <span className="text-emerald-400 font-semibold">{formatCurrency(Math.abs(savings))}</span>.</>
                : <>Both regimes are currently very close for your present data.</>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="rounded-xl bg-slate-900/40 px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wide">Best Tax</p>
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(bestTax)}</p>
            </div>
            <div className="rounded-xl bg-slate-900/40 px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wide">Post-tax Cashflow</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(postTaxIncome)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-white">Regime Comparison</h3>
        </div>
        <div className="grid grid-cols-4">
          <div className="p-4 font-medium text-slate-400">Metric</div>
          <div className="p-4 font-medium text-amber-400 text-center">Old Regime</div>
          <div className="p-4 font-medium text-emerald-400 text-center">New Regime</div>
          <div className="p-4 font-medium text-slate-400 text-center">Difference</div>
          {comparisonData.map((row, i) => (
            <React.Fragment key={i}>
              <div className="p-4 text-slate-300 border-t border-slate-700/50">{row.metric}</div>
              <div className={`p-4 text-center border-t border-slate-700/50 ${row.highlight ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>{row.old}</div>
              <div className={`p-4 text-center border-t border-slate-700/50 ${row.highlight ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>{row.new}</div>
              <div className="p-4 text-center border-t border-slate-700/50 text-slate-400">
                {row.metric === 'Tax Liability' ? (
                  <span className={savings > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {savings > 0 ? `-${formatCurrency(Math.abs(savings))}` : `+${formatCurrency(Math.abs(savings))}`}
                  </span>
                ) : '-'}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tax Saving Suggestions */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Tax Saving Investments</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {taxSavingSuggestions.map((item, i) => (
            <div key={i} className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-start gap-4">
                <span className="text-3xl">{item.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium">{item.title}</h4>
                    <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-400">{item.section}</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">{item.desc}</p>
                  <p className="text-emerald-400 text-sm mt-2 font-medium">Max: {item.max}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Tax Payable by Income Bracket</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={taxBracketData}>
            <XAxis dataKey="bracket" stroke="#94A3B8" />
            <YAxis stroke="#94A3B8" tickFormatter={(v) => `₹${(Number(v)/1000).toFixed(0)}K`} />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569', borderRadius: '8px' }}
            />
            <Legend wrapperStyle={{ color: '#94A3B8' }} />
            <Bar dataKey="oldTax" name="Old Regime" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="newTax" name="New Regime" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Portfolio Planner Component
const PortfolioPlanner: React.FC = () => {
  const { data, setData } = useApp();
  const user = data.currentUser;
  const [riskLevel, setRiskLevel] = useState<'low' | 'moderate' | 'aggressive'>(
    data.portfolio?.riskLevel || 'moderate'
  );
  const [cancelTarget, setCancelTarget] = useState<Investment | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [appetiteView, setAppetiteView] = useState<'all' | 'low' | 'moderate' | 'aggressive'>('all');

  const allUserInvestments = data.investments.filter(i => i.userId === user?.id);
  const userInvestments = allUserInvestments.filter(i => i.status !== 'cancelled' && i.status !== 'revoked');
  const cancelledInvestments = allUserInvestments.filter(i => i.status === 'cancelled' || i.status === 'revoked');
  const totalInvested = userInvestments.reduce((s, i) => s + (i.netInvested ?? i.amount), 0);
  const totalReturns = userInvestments.reduce((s, i) => s + i.returns, 0);
  const portfolioValue = totalInvested + totalReturns;

  // After-tax: long-term capital gains on equity assumed at 12.5% over ₹1.25L exemption
  const taxableGains = Math.max(0, totalReturns - 125000);
  const capitalGainsTax = Math.round(taxableGains * 0.125);
  const afterTaxValue = portfolioValue - capitalGainsTax;
  const afterTaxReturns = totalReturns - capitalGainsTax;

  const savingsBalance = data.savingsLedger
    .filter(s => s.userId === user?.id)
    .reduce((sum, s) => sum + s.amount, 0);
  const appetiteInvestments = appetiteView === 'all' ? userInvestments : userInvestments.filter(i => i.riskLevel === appetiteView);
  const appetiteHoldings = appetiteInvestments.flatMap(i =>
    (i.holdings ?? i.stocks.map(stock => ({ name: stock, sector: 'Legacy holding', allocation: 0, allocationAmount: 0, units: 0, expected: i.expectedAnnualReturn || '' })))
      .map(holding => ({ ...holding, riskLevel: i.riskLevel, orderId: i.orderId || i.id }))
  );

  useEffect(() => {
    setData(prev => ({ ...prev, portfolio: { userId: user?.id || '', riskLevel } }));
  }, [riskLevel]);

  // Revoke/rollback a trade: net invested principal moves to savings, returns are forfeited.
  const handleCancelTrade = (investment: Investment) => {
    const refundAmount = investment.netInvested ?? investment.amount;
    setData(prev => ({
      ...prev,
      investments: prev.investments.map(inv =>
        inv.id === investment.id
          ? { ...inv, status: 'revoked' as const, cancelledDate: new Date().toISOString(), refundAmount, returns: 0, currentValue: 0 }
          : inv
      ),
      savingsLedger: [
        ...prev.savingsLedger,
        {
          id: generateId(),
          userId: user!.id,
          amount: refundAmount,
          date: new Date().toISOString(),
          source: investment.platform,
          note: `Revoked order ${investment.orderId || investment.id} — net invested amount returned to savings`,
        },
      ],
    }));
    setCancelTarget(null);
    setExpandedId(null);
  };

  const strategies = {
    low: {
      title: 'Conservative (Low Risk)',
      allocation: [
        { name: 'Debt Funds', percentage: 70, color: '#3B82F6' },
        { name: 'Large Cap Equity', percentage: 20, color: '#10B981' },
        { name: 'Fixed Deposits', percentage: 10, color: '#8B5CF6' },
      ],
      returns: '8-10%',
      risk: 'Low',
      pros: [
        'Capital preservation',
        'Stable, predictable returns',
        'Low volatility',
        'Ideal for short-term goals',
        'FDIC/SEBI protected options',
      ],
      cons: [
        'Lower growth potential',
        'May not beat inflation long-term',
        'Limited upside',
      ],
    },
    moderate: {
      title: 'Balanced (Moderate Risk)',
      allocation: [
        { name: 'Equity (Diversified)', percentage: 50, color: '#10B981' },
        { name: 'Debt Funds', percentage: 40, color: '#3B82F6' },
        { name: 'Gold/Alternatives', percentage: 10, color: '#F59E0B' },
      ],
      returns: '12-15%',
      risk: 'Medium',
      pros: [
        'Balanced growth potential',
        'Some downside protection',
        'Good for medium-term goals',
        'Diversification benefit',
      ],
      cons: [
        'Moderate volatility',
        'May underperform in bull markets',
        'Requires occasional rebalancing',
      ],
    },
    aggressive: {
      title: 'Aggressive (High Risk)',
      allocation: [
        { name: 'Small/Mid Cap Equity', percentage: 50, color: '#EF4444' },
        { name: 'Index Funds', percentage: 30, color: '#10B981' },
        { name: 'Crypto/Alternatives', percentage: 10, color: '#F59E0B' },
        { name: 'Sector Funds', percentage: 10, color: '#8B5CF6' },
      ],
      returns: '18-22%',
      risk: 'High',
      pros: [
        'Maximum growth potential',
        'Beat inflation significantly',
        'Long-term wealth creation',
        'Higher returns in bull markets',
      ],
      cons: [
        'High volatility',
        'Significant drawdown risk',
        'Requires strong risk tolerance',
        'Not suitable for short-term',
      ],
    },
  };

  const platforms = [
    { name: 'Zerodha', brokerage: '₹0 on equity delivery', rating: 4.8, icon: '💹' },
    { name: 'Groww', brokerage: '₹0 on equity delivery', rating: 4.7, icon: '📈' },
    { name: 'Angel One', brokerage: '₹0 on equity delivery', rating: 4.6, icon: '🦹' },
    { name: 'Paytm Money', brokerage: '₹0 on equity delivery', rating: 4.5, icon: '💰' },
  ];

  const current = strategies[riskLevel];

  return (
    <div className="space-y-6">
      {/* Portfolio Hero */}
      <div className="relative overflow-hidden rounded-2xl h-44 border border-slate-700/50">
        <img src="/images/portfolio-growth.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-transparent" />
        <div className="relative h-full flex items-center p-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">Portfolio Planner</h1>
            <p className="text-slate-300 mt-1">Design your investment strategy based on risk appetite</p>
          </div>
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-5 text-right">
            <div>
              <p className="text-slate-300 text-xs">Total Invested</p>
              <p className="text-lg font-bold text-white">{formatCurrency(totalInvested)}</p>
            </div>
            <div>
              <p className="text-slate-300 text-xs">Portfolio Value</p>
              <p className="text-lg font-bold text-emerald-400">{formatCurrency(portfolioValue)}</p>
            </div>
            <div>
              <p className="text-slate-300 text-xs">After-Tax Value</p>
              <p className="text-lg font-bold text-amber-300">{formatCurrency(afterTaxValue)}</p>
            </div>
            <div>
              <p className="text-slate-300 text-xs">Savings (Rollbacks)</p>
              <p className="text-lg font-bold text-blue-300">{formatCurrency(savingsBalance)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* After-Tax Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm mb-1">Gross Returns</p>
          <p className={`text-2xl font-bold ${totalReturns >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalReturns >= 0 ? '+' : ''}{formatCurrency(totalReturns)}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm mb-1">Est. Capital Gains Tax</p>
          <p className="text-2xl font-bold text-red-300">-{formatCurrency(capitalGainsTax)}</p>
          <p className="text-slate-500 text-xs mt-1">LTCG 12.5% over ₹1.25L exemption</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-slate-700/50">
          <p className="text-slate-400 text-sm mb-1">After-Tax Returns</p>
          <p className={`text-2xl font-bold ${afterTaxReturns >= 0 ? 'text-amber-300' : 'text-red-400'}`}>
            {afterTaxReturns >= 0 ? '+' : ''}{formatCurrency(afterTaxReturns)}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-5 border border-blue-500/30">
          <p className="text-slate-400 text-sm mb-1">Savings Balance</p>
          <p className="text-2xl font-bold text-blue-300">{formatCurrency(savingsBalance)}</p>
          <p className="text-slate-500 text-xs mt-1">From rolled-back trades</p>
        </div>
      </div>

      {/* Stocks by Appetite */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Stocks Invested by Appetite</h3>
            <p className="text-slate-400 text-sm">See exactly which holdings are active for each risk appetite.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'low', 'moderate', 'aggressive'] as const).map(level => (
              <button
                key={level}
                onClick={() => setAppetiteView(level)}
                className={`rounded-lg px-3 py-2 text-sm capitalize transition-colors ${appetiteView === level ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        {appetiteHoldings.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No active holdings for this appetite yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {appetiteHoldings.map((holding, idx) => (
              <div key={`${holding.orderId}-${holding.name}-${idx}`} className="rounded-xl bg-slate-900/45 border border-slate-700/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white font-medium">{holding.name}</p>
                    <p className="text-slate-400 text-xs mt-1">{holding.sector}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-md ${holding.riskLevel === 'low' ? 'bg-blue-500/20 text-blue-400' : holding.riskLevel === 'moderate' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {holding.riskLevel}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Invested</span>
                  <span className="text-emerald-400 font-medium">{holding.allocationAmount > 0 ? formatCurrency(holding.allocationAmount) : 'Tracked'}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{holding.units > 0 ? `${holding.units} units` : 'Legacy unit data'}</span>
                  <span>{holding.expected}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Investments Section */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">My Investments</h3>
            <p className="text-slate-400 text-sm">Investments made through AI Agent</p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
            {userInvestments.length} Active
          </span>
        </div>
        {userInvestments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💼</span>
            </div>
            <p className="text-slate-400 mb-2">No investments yet</p>
            <p className="text-slate-500 text-sm">Use the AI Agent to start investing and they'll appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {userInvestments.slice().reverse().map(inv => {
              const returnsPct = inv.amount > 0 ? (inv.returns / inv.amount * 100) : 0;
              const isExpanded = expandedId === inv.id;
              return (
                <div key={inv.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-xl flex items-center justify-center">
                        <span className="text-xl">📊</span>
                      </div>
                      <div>
                        <p className="text-white font-semibold">{inv.platform}</p>
                        <p className="text-slate-400 text-xs">
                          {inv.orderId ? `${inv.orderId} • ` : ''}
                          {new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' • '}{inv.paymentMethod}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold text-lg">{formatCurrency(inv.netInvested ?? inv.amount)}</p>
                      {(inv.platformDeduction || 0) > 0 && <p className="text-xs text-amber-300">{formatCurrency(inv.platformDeduction || 0)} platform deduction</p>}
                      <p className={`text-sm ${inv.returns >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {inv.returns >= 0 ? '+' : ''}{formatCurrency(inv.returns)} ({returnsPct >= 0 ? '+' : ''}{returnsPct.toFixed(2)}%)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded-md ${
                      inv.riskLevel === 'low' ? 'bg-blue-500/20 text-blue-400' :
                      inv.riskLevel === 'moderate' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {inv.riskLevel.charAt(0).toUpperCase() + inv.riskLevel.slice(1)} Risk
                    </span>
                    <span className="text-xs px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400">Active</span>
                    <span className="text-xs px-2 py-1 rounded-md bg-slate-700 text-slate-300">
                      {(inv.holdings?.length ?? inv.stocks.length)} holdings
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                        className="text-xs px-3 py-1.5 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                      >
                        {isExpanded ? 'Hide' : 'View'} holdings
                      </button>
                      <button
                        onClick={() => setCancelTarget(inv)}
                        className="text-xs px-3 py-1.5 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors font-medium"
                      >
                        Revoke to savings
                      </button>
                    </div>
                  </div>

                  {/* Expanded holdings detail */}
                  {isExpanded && (
                    <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
                      <p className="text-sm font-medium text-white mb-3">Diversified Holdings</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(inv.holdings ?? inv.stocks.map(s => ({ name: s, sector: '', allocation: 0, allocationAmount: 0, units: 0, expected: '' }))).map((h, idx) => (
                          <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2.5">
                            <div>
                              <p className="text-sm text-white">{h.name}</p>
                              {h.sector && <p className="text-xs text-slate-400">{h.sector}</p>}
                            </div>
                            <div className="text-right">
                              {h.allocationAmount > 0 && <p className="text-sm text-emerald-400">{formatCurrency(h.allocationAmount)}</p>}
                              <p className="text-xs text-slate-400">
                                {h.allocation > 0 ? `${h.allocation}%` : ''}{h.units > 0 ? ` • ${h.units} units` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {inv.expectedAnnualReturn && (
                        <p className="text-xs text-slate-400 mt-3">Expected annual range: <span className="text-emerald-400">{inv.expectedAnnualReturn}</span> • Settlement: {inv.estimatedSettlement || 'T+1'}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Revoked / Rolled-back Trades */}
      {cancelledInvestments.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Revoked Trades</h3>
              <p className="text-slate-400 text-sm">Principal moved back into your savings balance</p>
            </div>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm font-medium">
              {formatCurrency(savingsBalance)} saved
            </span>
          </div>
          <div className="divide-y divide-slate-700/50">
            {cancelledInvestments.slice().reverse().map(inv => (
              <div key={inv.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center">
                    <span className="text-lg">↩️</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{inv.platform} <span className="text-slate-500 text-xs">{inv.orderId}</span></p>
                    <p className="text-slate-400 text-xs">
                      Cancelled {inv.cancelledDate ? new Date(inv.cancelledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-blue-300 font-semibold">+{formatCurrency(inv.refundAmount ?? inv.amount)}</p>
                  <p className="text-slate-500 text-xs">to savings</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Level Selector */}
      <div className="grid grid-cols-3 gap-4">
        {(['low', 'moderate', 'aggressive'] as const).map(level => (
          <button
            key={level}
            onClick={() => setRiskLevel(level)}
            className={`p-4 rounded-xl border transition-all ${
              riskLevel === level
                ? level === 'low' ? 'bg-blue-500/20 border-blue-500/50 text-white'
                : level === 'moderate' ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                : 'bg-red-500/20 border-red-500/50 text-white'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
            }`}
          >
            <p className="font-semibold capitalize">{level} Risk</p>
            <p className="text-sm mt-1 opacity-75">
              {level === 'low' ? '8-10% returns' : level === 'moderate' ? '12-15% returns' : '18-22% returns'}
            </p>
          </button>
        ))}
      </div>

      {/* Current Strategy */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">{current.title}</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            current.risk === 'Low' ? 'bg-blue-500/20 text-blue-400' :
            current.risk === 'Medium' ? 'bg-emerald-500/20 text-emerald-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {current.risk} Risk
          </span>
        </div>

        {/* Allocation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h4 className="text-slate-400 text-sm mb-4">Asset Allocation</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={current.allocation}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="percentage"
                >
                  {current.allocation.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${value}%`}
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-4">
              {current.allocation.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-300 text-sm">{item.name} ({item.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-slate-400 text-sm">Expected Returns</p>
              <p className="text-2xl font-bold text-emerald-400">{current.returns}</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-slate-400 text-sm">Risk Level</p>
              <p className="text-2xl font-bold text-amber-400">{current.risk}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pros & Cons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
          <h4 className="text-emerald-400 font-semibold mb-4 flex items-center gap-2">
            <Icons.Check /> Pros
          </h4>
          <ul className="space-y-2">
            {current.pros.map((pro, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300">
                <span className="text-emerald-400 mt-1">•</span>
                {pro}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700/50">
          <h4 className="text-red-400 font-semibold mb-4 flex items-center gap-2">
            <Icons.Close /> Cons
          </h4>
          <ul className="space-y-2">
            {current.cons.map((con, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300">
                <span className="text-red-400 mt-1">•</span>
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Low Brokerage Platforms */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Investment Platforms (Low Brokerage)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {platforms.map((platform, i) => (
            <div key={i} className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700/50 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{platform.icon}</span>
                <div>
                  <p className="text-white font-medium">{platform.name}</p>
                  <p className="text-amber-400 text-sm">★ {platform.rating}</p>
                </div>
              </div>
              <p className="text-emerald-400 text-sm">{platform.brokerage}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel / Rollback Confirmation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-md border border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-red-500/15 rounded-xl flex items-center justify-center">
                  <span className="text-xl">↩️</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Revoke this trade?</h2>
                  <p className="text-slate-400 text-sm">{cancelTarget.orderId || cancelTarget.platform}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-900/50 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Net amount returned to savings</span>
                  <span className="text-emerald-400 font-semibold">+{formatCurrency(cancelTarget.netInvested ?? cancelTarget.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Platform deduction not refunded</span>
                  <span className="text-amber-300">{formatCurrency(cancelTarget.platformDeduction || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Returns forfeited</span>
                  <span className="text-red-300">-{formatCurrency(cancelTarget.returns)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-2.5">
                  <span className="text-slate-400">New savings balance</span>
                  <span className="text-blue-300 font-semibold">{formatCurrency(savingsBalance + (cancelTarget.netInvested ?? cancelTarget.amount))}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Your net invested amount will be withdrawn from the market and credited to your savings balance. Platform deductions are not refunded and accumulated returns on this order will not be carried over.
              </p>
            </div>
            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Keep Invested
              </button>
              <button
                onClick={() => handleCancelTrade(cancelTarget)}
                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-amber-500 text-white font-semibold rounded-lg hover:from-red-600 hover:to-amber-600 transition-all"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// AI Agent Component
const AIAgent: React.FC = () => {
  const { data, setData } = useApp();
  const user = data.currentUser;
  const prefersReducedMotion = useReducedMotion();

  const userIncomes = data.incomes.filter(i => i.userId === user?.id);
  const userExpenses = data.expenses.filter(e => e.userId === user?.id);
  const monthlyIncome = getAnnualIncome(userIncomes) / 12;
  const avgMonthlyExpense = getAverageMonthlyExpense(userExpenses);

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [riskPref, setRiskPref] = useState<'low' | 'moderate' | 'aggressive'>('moderate');
  const [confirmed, setConfirmed] = useState(false);
  const [investing, setInvesting] = useState(false);
  const [success, setSuccess] = useState(false);

  const platforms = [
    { name: 'Zerodha', charge: '₹0 delivery', note: 'Execution-first', deductionType: 'No platform deduction', feeFlat: 0, feeRate: 0 },
    { name: 'Groww', charge: '₹0 delivery', note: 'Fast onboarding', deductionType: 'No platform deduction', feeFlat: 0, feeRate: 0 },
    { name: 'Angel One', charge: '₹0 delivery', note: 'Assisted order fee applies', deductionType: '₹20 assisted execution deduction', feeFlat: 20, feeRate: 0 },
  ];

  const paymentMethods = [
    { name: 'UPI', icon: '📱', desc: 'Instant transfer' },
    { name: 'Debit Card', icon: '💳', desc: 'From bank account' },
    { name: 'Credit Card', icon: '💳', desc: 'Delayed payment' },
    { name: 'Net Banking', icon: '🏦', desc: 'Direct bank transfer' },
  ];

  const stocks = {
    low: [
      { name: 'PPF Tax Saver', sectors: 'Government-backed savings', expected: '7-8%', risk: 'Low', allocation: 18, price: 500 },
      { name: 'Bharat Bond ETF', sectors: 'Debt ETF', expected: '7-9%', risk: 'Low', allocation: 22, price: 1280 },
      { name: 'Nifty 50 ETF', sectors: 'Index Equity', expected: '10-12%', risk: 'Low', allocation: 20, price: 245 },
      { name: 'HDFC Bank', sectors: 'Banking', expected: '10-12%', risk: 'Low', allocation: 14, price: 1650 },
      { name: 'Gold Bees ETF', sectors: 'Commodity / Gold', expected: '8-11%', risk: 'Low', allocation: 14, price: 62 },
      { name: 'SBI Liquid Fund', sectors: 'Liquid / Cash', expected: '6-7%', risk: 'Low', allocation: 12, price: 100 },
    ],
    moderate: [
      { name: 'ELSS Tax Saver Fund', sectors: 'Tax-saving equity', expected: '12-14%', risk: 'Medium', allocation: 20, price: 210 },
      { name: 'Nifty Next 50 ETF', sectors: 'Diversified equity', expected: '12-15%', risk: 'Medium', allocation: 18, price: 380 },
      { name: 'Corporate Bond Fund', sectors: 'Debt / stability', expected: '8-10%', risk: 'Medium', allocation: 16, price: 85 },
      { name: 'Reliance Industries', sectors: 'Conglomerate', expected: '13-16%', risk: 'Medium', allocation: 14, price: 2900 },
      { name: 'Infosys', sectors: 'Information Technology', expected: '13-15%', risk: 'Medium', allocation: 12, price: 1560 },
      { name: 'ICICI Pharma Fund', sectors: 'Healthcare', expected: '12-16%', risk: 'Medium', allocation: 12, price: 290 },
      { name: 'International Equity FoF', sectors: 'Global diversification', expected: '11-15%', risk: 'Medium', allocation: 8, price: 175 },
    ],
    aggressive: [
      { name: 'Mid Cap Index Fund', sectors: 'Growth equity', expected: '16-20%', risk: 'High', allocation: 22, price: 125 },
      { name: 'Small Cap Fund', sectors: 'High growth equity', expected: '18-24%', risk: 'High', allocation: 18, price: 92 },
      { name: 'Sector Rotation ETF', sectors: 'Thematic equity', expected: '16-22%', risk: 'High', allocation: 14, price: 310 },
      { name: 'Tata Motors', sectors: 'Auto / EV', expected: '18-25%', risk: 'High', allocation: 12, price: 980 },
      { name: 'Crypto Index (BTC/ETH)', sectors: 'Digital assets', expected: '20-35%', risk: 'High', allocation: 12, price: 450 },
      { name: 'Adani Green Energy', sectors: 'Renewable energy', expected: '17-24%', risk: 'High', allocation: 12, price: 1740 },
      { name: 'Emerging Markets Fund', sectors: 'Global high growth', expected: '16-22%', risk: 'High', allocation: 10, price: 220 },
    ],
  };

  const wizardSteps = [
    { title: 'Choose', desc: 'Account and platform' },
    { title: 'Amount', desc: 'Budget and risk' },
    { title: 'Review', desc: 'Basket and checks' },
    { title: 'Confirm', desc: 'Final approval' },
  ];

  const userInvestments = data.investments.filter(i => i.userId === user?.id && i.status !== 'cancelled' && i.status !== 'revoked');
  const totalInvested = userInvestments.reduce((s, i) => s + (i.netInvested ?? i.amount), 0);
  const totalReturns = userInvestments.reduce((s, i) => s + i.returns, 0);
  const savingsBalance = data.savingsLedger.filter(s => s.userId === user?.id).reduce((sum, s) => sum + s.amount, 0);
  const monthlySurplus = Math.max(0, monthlyIncome - avgMonthlyExpense);
  const investableCapacity = Math.max(0, Math.round(monthlySurplus * 4 + Math.max(0, totalReturns) + savingsBalance));
  const emergencyTarget = avgMonthlyExpense * 6;
  const emergencyReadiness = emergencyTarget > 0 ? clamp((monthlySurplus * 3 / emergencyTarget) * 100, 0, 100) : 100;
  const enteredAmount = parseFloat(amount) || 0;
  const selectedPlatformMeta = platforms.find(p => p.name === selectedPlatform);
  const platformDeduction = selectedPlatformMeta ? Math.round(selectedPlatformMeta.feeFlat + (enteredAmount * selectedPlatformMeta.feeRate)) : 0;
  const netInvestmentAmount = Math.max(0, enteredAmount - platformDeduction);
  const amountIsValid = enteredAmount >= 1000 && enteredAmount <= Math.max(1000, investableCapacity || monthlyIncome * 2);
  const expectedAnnualReturn = riskPref === 'low' ? '7-10%' : riskPref === 'moderate' ? '11-15%' : '15-22%';
  const orderPreviewId = `TSA-${new Date().getFullYear()}-${String(userInvestments.length + 1).padStart(4, '0')}`;
  const estimatedSettlement = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const suitabilityScore = clamp(
    45 +
    (amountIsValid ? 20 : -10) +
    (monthlySurplus > 0 ? 10 : -10) +
    (riskPref === 'low' ? 8 : riskPref === 'moderate' ? 12 : 4) +
    (emergencyReadiness >= 50 ? 10 : -5),
    0,
    99,
  );
  const selectedBasket = stocks[riskPref].map(product => {
    const allocationAmount = Math.round((netInvestmentAmount * product.allocation) / 100);
    return {
      ...product,
      allocationAmount,
      estimatedUnits: allocationAmount > 0 ? Math.max(1, Math.floor(allocationAmount / product.price)) : 0,
    };
  });
  const complianceChecks = [
    { label: 'Minimum investment threshold met', ok: enteredAmount >= 1000 },
    { label: 'Amount within investable capacity', ok: amountIsValid },
    { label: 'Emergency reserve remains protected', ok: emergencyReadiness >= 35 || avgMonthlyExpense === 0 },
    { label: 'Payment rail selected and verified', ok: Boolean(selectedMethod) },
  ];

  const handleInvest = () => {
    if (!confirmed || !amountIsValid || !selectedPlatform || !selectedMethod) return;
    setInvesting(true);
    setTimeout(() => {
      const returnsPct = riskPref === 'low' ? 0.08 : riskPref === 'moderate' ? 0.14 : 0.20;
      const investmentAmount = enteredAmount;
      const simulatedReturns = netInvestmentAmount * returnsPct * (0.35 + Math.random() * 0.45);

      const newInvestment: Investment = {
        id: generateId(),
        userId: user!.id,
        platform: selectedPlatform,
        paymentMethod: selectedMethod,
        amount: investmentAmount,
        platformDeduction,
        netInvested: netInvestmentAmount,
        riskLevel: riskPref,
        stocks: selectedBasket.map(s => `${s.name} • ${s.estimatedUnits} units`),
        date: new Date().toISOString(),
        status: 'active',
        currentValue: netInvestmentAmount + simulatedReturns,
        returns: Math.round(simulatedReturns),
        orderId: orderPreviewId,
        suitabilityScore,
        estimatedSettlement,
        expectedAnnualReturn,
        notes: `Basket created from monthly surplus profile with ${riskPref} risk preference.`,
        holdings: selectedBasket.map(s => ({
          name: s.name,
          sector: s.sectors,
          allocation: s.allocation,
          allocationAmount: s.allocationAmount,
          units: s.estimatedUnits,
          expected: s.expected,
        })),
      };

      setData(prev => ({
        ...prev,
        investments: [...prev.investments, newInvestment]
      }));

      setInvesting(false);
      setSuccess(true);
    }, 2200);
  };

  const resetWizard = () => {
    setShowWizard(false);
    setStep(1);
    setSelectedPlatform('');
    setSelectedMethod('');
    setAmount('');
    setRiskPref('moderate');
    setConfirmed(false);
    setSuccess(false);
  };

  const showWizardModal = showWizard;

  return (
    <div className="space-y-6">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl h-48 border border-slate-700/50 shadow-2xl shadow-slate-950/20"
      >
        <img src="/images/ai-agent.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/78 to-transparent" />
        {!prefersReducedMotion && (
          <>
            <motion.div
              aria-hidden="true"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute right-8 top-6 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl"
            />
            <motion.div
              aria-hidden="true"
              animate={{ y: [0, 10, 0], x: [0, -6, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute bottom-6 right-24 h-28 w-28 rounded-full bg-blue-400/10 blur-3xl"
            />
          </>
        )}
        <div className="relative flex h-full items-center justify-between p-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              AI Agent Online
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">AI Investment Agent</h1>
            <p className="mt-2 text-sm text-slate-300 md:text-base">
              Guided investing with a professional execution flow, low-brokerage routing, and portfolio sync.
            </p>
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right backdrop-blur md:block">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Readiness</p>
            <p className="mt-1 text-2xl font-semibold text-white">Live</p>
            <p className="text-xs text-slate-400">Secure transfer orchestration</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.35 }}
          className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-slate-800/70 to-blue-500/10 p-6"
        >
          {!prefersReducedMotion && (
            <motion.div
              aria-hidden="true"
              animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-emerald-400/20 blur-3xl"
            />
          )}
          <p className="text-sm text-slate-300">Investable Capacity</p>
          <p className="mt-2 text-4xl font-semibold text-white">{formatCurrency(Math.max(1000, investableCapacity || 0))}</p>
          <p className="mt-1 text-sm text-slate-400">From monthly surplus, portfolio returns{savingsBalance > 0 ? ` + ${formatCurrency(savingsBalance)} savings` : ''}</p>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Monthly Surplus</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatCurrency(monthlySurplus)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Avg Monthly Expense</p>
              <p className="mt-1 text-2xl font-semibold text-slate-200">{formatCurrency(avgMonthlyExpense)}</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <motion.div
              initial={false}
              animate={{ width: `${Math.min(100, monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : 0)}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400"
            />
          </div>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Emergency Readiness</p>
              <p className="mt-1 text-2xl font-semibold text-white">{Math.round(emergencyReadiness)}%</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Total Invested</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatCurrency(totalInvested)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>Target reserve</span>
            <span>{formatCurrency(emergencyTarget)}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <motion.div
              initial={false}
              animate={{ width: `${emergencyReadiness}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
            />
          </div>
        </motion.div>
      </div>

      {/* Payment Methods */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Payment Methods</h3>
            <p className="text-sm text-slate-400">Choose a transfer rail supported by the agent</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {paymentMethods.map((method, i) => (
            <motion.button
              key={i}
              onClick={() => setSelectedMethod(method.name)}
              whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.01 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
                selectedMethod === method.name
                  ? 'border-emerald-500/50 bg-emerald-500/15 shadow-lg shadow-emerald-500/10'
                  : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-2xl block mb-2">{method.icon}</span>
                  <p className="text-white font-medium">{method.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{method.desc}</p>
                </div>
                <span className={`mt-1 h-2.5 w-2.5 rounded-full transition-colors ${selectedMethod === method.name ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Platforms */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Low Brokerage Platforms</h3>
            <p className="text-sm text-slate-400">Recommended execution venues selected by the agent</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {platforms.map((platform, i) => (
            <motion.div
              key={i}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
              whileHover={prefersReducedMotion ? undefined : { y: -4 }}
              className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 backdrop-blur"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{platform.name}</p>
                  <p className="text-sm text-emerald-400">{platform.charge}</p>
                  <p className="mt-1 text-xs text-slate-400">{platform.note}</p>
                  <p className={`mt-1 text-xs ${platform.feeFlat > 0 || platform.feeRate > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{platform.deductionType}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Icons.Check />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-400">
          Industry-style guided workflow, explicit review stage, and portfolio sync after execution.
        </div>
        <motion.button
          onClick={() => setShowWizard(true)}
          disabled={monthlyIncome <= 0}
          whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.01 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
          className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-blue-500 px-5 py-4 font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
        >
          {!prefersReducedMotion && (
            <motion.span
              aria-hidden="true"
              animate={{ x: ['-40%', '140%'] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-y-0 left-0 w-1/3 bg-white/15 blur-xl"
            />
          )}
          <span className="relative">Start Investing with AI Agent</span>
        </motion.button>
      </div>

      {/* Investments Summary */}
      {userInvestments.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Your Investments</h3>
              <p className="text-slate-400 text-sm">All investments are visible in Portfolio Planner</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Total Invested</p>
              <p className="text-xl font-bold text-emerald-400">
                {formatCurrency(totalInvested)}
              </p>
            </div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <p className="text-emerald-400 text-sm">
              ✓ All {userInvestments.length} investment(s) are reflected in your Portfolio Planner
            </p>
          </div>
        </motion.div>
      )}

      {userInvestments.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-700/50 p-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Order History</h3>
              <p className="text-sm text-slate-400">Execution log generated from your completed AI Agent orders</p>
            </div>
            <span className="rounded-full bg-slate-700/70 px-3 py-1 text-xs text-slate-300">{userInvestments.length} orders</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/40 text-slate-400">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Order ID</th>
                  <th className="px-6 py-3 text-left font-medium">Date</th>
                  <th className="px-6 py-3 text-left font-medium">Platform</th>
                  <th className="px-6 py-3 text-left font-medium">Amount</th>
                  <th className="px-6 py-3 text-left font-medium">Deduction</th>
                  <th className="px-6 py-3 text-left font-medium">Suitability</th>
                  <th className="px-6 py-3 text-left font-medium">Settlement</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {userInvestments.slice().reverse().map(order => (
                  <tr key={order.id} className="border-t border-slate-700/40 text-slate-300">
                    <td className="px-6 py-4 text-white">{order.orderId || order.id}</td>
                    <td className="px-6 py-4">{new Date(order.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4">{order.platform}</td>
                    <td className="px-6 py-4 font-medium text-white">{formatCurrency(order.amount)}</td>
                    <td className="px-6 py-4 text-amber-300">{formatCurrency(order.platformDeduction || 0)}</td>
                    <td className="px-6 py-4">{order.suitabilityScore ?? '—'}</td>
                    <td className="px-6 py-4">{order.estimatedSettlement || 'T+1'}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">{order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Investment Wizard Modal */}
      <AnimatePresence>
        {showWizardModal && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/60"
            >
            {/* Header */}
            <div className="border-b border-slate-700 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">AI Investment Wizard</h2>
                <button onClick={resetWizard} className="text-slate-400 hover:text-white">
                  <Icons.Close />
                </button>
              </div>
              {/* Progress */}
              <div className="mt-4 grid grid-cols-4 gap-3">
                {wizardSteps.map((item, index) => {
                  const active = step >= index + 1;
                  return (
                    <div key={item.title} className="space-y-2">
                      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-700">
                        <motion.div
                          initial={false}
                          animate={{ width: active ? '100%' : '0%' }}
                          transition={{ duration: 0.25, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-400"
                        />
                      </div>
                      <p className={`text-xs font-medium ${active ? 'text-white' : 'text-slate-500'}`}>{item.title}</p>
                      <p className="text-[11px] text-slate-500">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-slate-400 text-sm mt-2">Step {step} of 4</p>
            </div>

            {/* Content */}
            <div className="p-6">
              {success ? (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-8 text-center"
                >
                  <motion.div
                    animate={prefersReducedMotion ? undefined : { scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20"
                  >
                    <Icons.Check />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-white">Investment Successful</h3>
                  <p className="mt-2 text-slate-400">
                    Your order of {formatCurrency(enteredAmount)} has been executed with {formatCurrency(platformDeduction)} platform deduction and {formatCurrency(netInvestmentAmount)} net invested.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <p className="text-sm text-emerald-400">
                      Order {orderPreviewId} is visible in Portfolio Planner and Dashboard summary
                    </p>
                  </div>
                  <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
                    <div className="rounded-lg bg-slate-800/70 p-3">
                      <p className="text-xs text-slate-400">Platform</p>
                      <p className="font-medium text-white">{selectedPlatform}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/70 p-3">
                      <p className="text-xs text-slate-400">Risk Level</p>
                      <p className="font-medium capitalize text-white">{riskPref}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/70 p-3">
                      <p className="text-xs text-slate-400">Settlement</p>
                      <p className="font-medium text-white">{estimatedSettlement}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/70 p-3">
                      <p className="text-xs text-slate-400">Basket</p>
                      <p className="font-medium text-white">{selectedBasket.length} items</p>
                    </div>
                  </div>
                  <button
                    onClick={resetWizard}
                    className="mt-6 rounded-lg bg-emerald-500 px-6 py-3 text-white transition-colors hover:bg-emerald-600"
                  >
                    Done
                  </button>
                </motion.div>
              ) : investing ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                    <motion.div
                      animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                      className="h-10 w-10 rounded-full border-4 border-emerald-500 border-t-transparent"
                    />
                  </div>
                  <p className="font-medium text-white">Processing your investment...</p>
                  <p className="mt-2 text-sm text-slate-400">Verifying transfer, risk profile, and platform confirmation</p>
                </div>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Step 1: Select Account & Platform */}
                    {step === 1 && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-white">Select Platform & Payment Method</h3>
                          <p className="text-sm text-slate-400">Pick the route the agent should use for execution</p>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-300">Investment Platform</label>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {platforms.map((p, i) => (
                              <motion.button
                                key={i}
                                onClick={() => setSelectedPlatform(p.name)}
                                whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.01 }}
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                                className={`rounded-xl border p-4 text-left transition-all ${
                                  selectedPlatform === p.name
                                    ? 'border-emerald-500/50 bg-emerald-500/15 shadow-lg shadow-emerald-500/10'
                                    : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-medium text-white">{p.name}</p>
                                    <p className="text-xs text-emerald-400">{p.charge}</p>
                                    <p className={`mt-1 text-[11px] ${p.feeFlat > 0 || p.feeRate > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{p.deductionType}</p>
                                  </div>
                                  <span className={`h-2.5 w-2.5 rounded-full ${selectedPlatform === p.name ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                </div>
                              </motion.button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-300">Payment Method</label>
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {paymentMethods.map((m, i) => (
                              <motion.button
                                key={i}
                                onClick={() => setSelectedMethod(m.name)}
                                whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                                className={`rounded-xl border p-4 text-left transition-all ${
                                  selectedMethod === m.name
                                    ? 'border-emerald-500/50 bg-emerald-500/15'
                                    : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600'
                                }`}
                              >
                                <p className="text-white font-medium">{m.icon} {m.name}</p>
                                <p className="mt-1 text-xs text-slate-400">{m.desc}</p>
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Amount & Risk */}
                    {step === 2 && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-white">Investment Amount & Risk</h3>
                          <p className="text-sm text-slate-400">Set the amount and exposure level before review</p>
                        </div>
                        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                          <label className="mb-2 block text-sm font-medium text-slate-300">How much to invest? (₹)</label>
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full rounded-lg border border-slate-600 bg-slate-900/60 px-4 py-3 text-2xl font-semibold text-white outline-none transition-colors focus:border-emerald-500"
                            placeholder="10000"
                          />
                          <div className="mt-2 flex items-center justify-between text-sm">
                            <p className="text-slate-400">Min: ₹1,000 | Capacity: {formatCurrency(Math.max(1000, investableCapacity || 0))}</p>
                            {!amountIsValid && enteredAmount > 0 && (
                              <p className="text-red-400">Amount exceeds your suggested safe limit</p>
                            )}
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {['5000', '10000', '25000'].map(preset => (
                              <button
                                key={preset}
                                onClick={() => setAmount(preset)}
                                className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
                              >
                                {formatCurrency(Number(preset))}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-300">Risk Appetite</label>
                          <div className="grid grid-cols-3 gap-3">
                            {(['low', 'moderate', 'aggressive'] as const).map(r => (
                              <motion.button
                                key={r}
                                onClick={() => setRiskPref(r)}
                                whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                                className={`rounded-xl border p-3 capitalize transition-all ${
                                  riskPref === r
                                    ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                                    : 'border-slate-700/50 bg-slate-800/50 text-slate-400'
                                }`}
                              >
                                {r}
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Review Stocks */}
                    {step === 3 && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-white">Recommended Basket</h3>
                          <p className="text-sm text-slate-400">This basket is assembled from your available surplus, selected risk level, and current portfolio profile.</p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                          <div className="space-y-3">
                            {selectedBasket.map((stock, i) => (
                              <motion.div
                                key={i}
                                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                transition={{ delay: 0.04 * i, duration: 0.24 }}
                                className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="font-medium text-white">{stock.name}</p>
                                    <p className="text-sm text-slate-400">{stock.sectors}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium text-emerald-400">{stock.expected}</p>
                                    <p className={`text-xs ${stock.risk === 'Low' ? 'text-blue-400' : stock.risk === 'Medium' ? 'text-amber-400' : 'text-red-400'}`}>
                                      {stock.risk} Risk
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                                  <div className="rounded-lg bg-slate-900/50 p-3">
                                    <p className="text-slate-500 text-xs">Allocation</p>
                                    <p className="text-white">{stock.allocation}%</p>
                                  </div>
                                  <div className="rounded-lg bg-slate-900/50 p-3">
                                    <p className="text-slate-500 text-xs">Amount</p>
                                    <p className="text-white">{formatCurrency(stock.allocationAmount)}</p>
                                  </div>
                                  <div className="rounded-lg bg-slate-900/50 p-3">
                                    <p className="text-slate-500 text-xs">Units</p>
                                    <p className="text-white">{stock.estimatedUnits}</p>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                          <div className="space-y-4">
                            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                              <p className="text-sm text-slate-400">Suitability Score</p>
                              <p className="mt-1 text-3xl font-semibold text-white">{suitabilityScore}/99</p>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400" style={{ width: `${suitabilityScore}%` }} />
                              </div>
                              <p className="mt-2 text-xs text-slate-400">Higher scores indicate stronger fit with your current cashflow and safety profile.</p>
                            </div>
                            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                              <p className="text-sm font-medium text-white mb-3">Compliance Checks</p>
                              <div className="space-y-2">
                                {complianceChecks.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2 text-sm">
                                    <span className="text-slate-300">{item.label}</span>
                                    <span className={item.ok ? 'text-emerald-400' : 'text-red-400'}>{item.ok ? 'Pass' : 'Review'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                          <p className="text-sm text-amber-400">
                            Verify the basket before approval. This preview uses your stored financial data and may change if your income, expenses, or portfolio changes.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Confirmation */}
                    {step === 4 && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-white">Confirm Investment</h3>
                          <p className="text-sm text-slate-400">Review the order summary and grant final permission.</p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Order Reference</span>
                              <span className="text-white">{orderPreviewId}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Platform</span>
                              <span className="text-white">{selectedPlatform}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Payment Method</span>
                              <span className="text-white">{selectedMethod}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Amount</span>
                              <span className="font-semibold text-white">{formatCurrency(enteredAmount)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Platform Deduction</span>
                              <span className={platformDeduction > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                                {platformDeduction > 0 ? `-${formatCurrency(platformDeduction)}` : '₹0'}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Net Invested</span>
                              <span className="font-semibold text-emerald-400">{formatCurrency(netInvestmentAmount)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Risk Level</span>
                              <span className="capitalize text-white">{riskPref}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Expected Annual Range</span>
                              <span className="text-emerald-400">{expectedAnnualReturn}</span>
                            </div>
                            <div className="flex justify-between gap-4 border-t border-slate-700 pt-3">
                              <span className="text-slate-400">Settlement</span>
                              <span className="text-white">T+1 • {estimatedSettlement}</span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                            <p className="text-sm font-medium text-white">Execution Summary</p>
                            <div className="mt-3 space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-400">Suitability</span><span className="text-white">{suitabilityScore}/99</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Platform Deduction</span><span className={platformDeduction > 0 ? 'text-amber-300' : 'text-emerald-400'}>{formatCurrency(platformDeduction)}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Basket Items</span><span className="text-white">{selectedBasket.length}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-amber-400">Awaiting Approval</span></div>
                            </div>
                          </div>
                        </div>
                        <label className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-300">
                            I agree to the terms, understand market risk, and authorize the agent to place this order and sync it to my portfolio.
                          </span>
                        </label>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {!success && !investing && (
              <div className="border-t border-slate-700 p-6 flex gap-3">
                {step > 1 && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="flex-1 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Back
                  </button>
                )}
                {step < 4 ? (
                  <motion.button
                    onClick={() => setStep(s => s + 1)}
                    disabled={(step === 1 && (!selectedPlatform || !selectedMethod)) || (step === 2 && !amountIsValid)}
                    whileHover={prefersReducedMotion ? undefined : { scale: 1.01 }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                    className="flex-1 rounded-lg bg-emerald-500 py-3 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleInvest}
                    disabled={!confirmed}
                    whileHover={prefersReducedMotion ? undefined : { scale: 1.01 }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                    className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-blue-500 py-3 font-semibold text-white transition-all hover:from-emerald-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Invest {formatCurrency(parseFloat(amount) || 0)}
                  </motion.button>
                )}
              </div>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const [data, setData] = useState<AppData>(loadData);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('taxshield_data', JSON.stringify(data));
  }, [data]);

  // Check for existing session
  useEffect(() => {
    if (data.currentUser) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (user: User) => {
    setData(prev => ({ ...prev, currentUser: user }));
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setData(prev => ({ ...prev, currentUser: null }));
    setIsAuthenticated(false);
    setCurrentPage('dashboard');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'income': return <Income />;
      case 'expense': return <Expenses />;
      case 'tax': return <TaxOptimizer />;
      case 'portfolio': return <PortfolioPlanner />;
      case 'agent': return <AIAgent />;
      default: return <Dashboard />;
    }
  };

  return (
    <AppContext.Provider value={{ data, setData }}>
      <div className="min-h-screen bg-slate-900">
        {isAuthenticated ? (
          <div className="flex">
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} onLogout={handleLogout} />
            <main className="flex-1 p-6 overflow-y-auto min-h-screen">
              {renderPage()}
            </main>
          </div>
        ) : (
          <AuthPage onLogin={handleLogin} />
        )}
      </div>
    </AppContext.Provider>
  );
};

export default App;
