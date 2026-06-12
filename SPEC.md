# TaxShield AI - Specification Document

## 1. Concept & Vision

TaxShield AI is a sleek, trustworthy financial companion that empowers users to take control of their taxes and investments. The application feels like having a seasoned financial advisor in your pocket—intelligent, protective, and empowering. The visual language conveys security, growth, and clarity through a sophisticated dark theme with emerald accents suggesting wealth and stability.

## 2. Design Language

### Aesthetic Direction
Premium fintech aesthetic inspired by modern banking apps like Revolut and N26—clean, minimal, with purposeful data visualization and generous white space.

### Color Palette
- **Primary**: `#10B981` (Emerald Green - growth, money)
- **Secondary**: `#1E293B` (Slate Dark - trust, stability)
- **Accent**: `#F59E0B` (Amber - attention, warmth)
- **Background**: `#0F172A` (Deep Navy - premium feel)
- **Surface**: `#1E293B` (Card backgrounds)
- **Text Primary**: `#F8FAFC` (Near white)
- **Text Secondary**: `#94A3B8` (Muted gray)
- **Success**: `#22C55E`
- **Warning**: `#EAB308`
- **Error**: `#EF4444`

### Typography
- **Headings**: Inter (700, 600) - clean, modern
- **Body**: Inter (400, 500) - excellent readability
- **Numbers/Data**: JetBrains Mono - financial precision

### Spatial System
- Base unit: 4px
- Card padding: 24px
- Section gaps: 32px
- Border radius: 12px (cards), 8px (buttons), 6px (inputs)

### Motion Philosophy
- Transitions: 200ms ease-out for interactions
- Page transitions: 300ms slide + fade
- Micro-interactions: subtle scale (1.02) on hover
- Charts: 600ms staggered entry animations

## 3. Layout & Structure

### Authentication Pages
- Full-screen gradient background with abstract financial patterns
- Centered card with logo, tagline, and auth form
- Tabs for Login/Register toggle
- "Add User" functionality in registration

### Main Application (Post-Login)
- **Sidebar** (280px): Always visible, contains navigation, user profile, quick stats
- **Main Content Area**: Dynamic based on selected section
- **Header**: Page title, notifications, quick actions

### Pages/Sections
1. **Dashboard** - Overview with score, income/expense summary, charts
2. **Income** - Income source management
3. **Expenses** - Expense tracking and categorization
4. **Tax Optimizer** - Regime comparison, savings suggestions
5. **Portfolio Planner** - Risk-based investment strategies
6. **AI Agent** - Guided investment workflow

## 4. Features & Interactions

### Authentication
- **Login**: Email + password, "Remember me" option
- **Register**: Name, email, password, confirm password
- **Add User**: From settings, existing user adds family member
- **Session**: LocalStorage with mock authentication

### Dashboard
- **TaxShield Score**: 0-100 score based on financial health
- **Income vs Expenses**: Donut chart
- **Tax Breakdown**: Bar chart comparing regimes
- **Quick Stats**: Total income, expenses, savings rate, potential tax savings
- **Recent Activity**: Latest transactions

### Income Management
- Add income: Source name, amount, frequency (monthly/annual), category
- Categories: Salary, Business, Freelance, Investments, Rental, Other
- Edit/Delete existing entries
- Auto-calculate annual totals

### Expense Management
- Add expense: Category, description, amount, date
- Categories: Housing, Utilities, Food, Transport, Healthcare, Entertainment, Other
- Edit/Delete functionality
- Monthly/yearly views

### Tax Optimizer
- **Input**: Total income, deductions (80C, 80D, HRA, etc.)
- **Comparison**: Side-by-side Old vs New regime
- **Recommendation**: Highlight better option (default)
- **Suggestions**: List of tax-saving investments
  - 80C: PPF, ELSS, NSC, FD, Life Insurance
  - 80D: Health Insurance
  - 80E: Education Loan
  - HRA: Rent

### Portfolio Planner
- **Risk Profiles**:
  - Conservative (Low Risk): 70% Debt, 30% Equity
  - Moderate: 50% Debt, 40% Equity, 10% Alternatives
  - Aggressive: 20% Debt, 70% Equity, 10% Crypto/Alternatives
- **Pros/Cons**: Expandable cards for each strategy
- **Platform Suggestions**: Zerodha, Groww, Angel One (low brokerage)
- **Default**: Moderate (user can change)

### AI Investment Agent
- **Payment Methods**: UPI, Debit Card, Credit Card, Net Banking
- **Platform Selection**: Filter by brokerage
- **Investment Wizard** (Modal):
  1. Select account & platform
  2. Enter amount & risk preference
  3. Review stock recommendations
  4. Confirmation & execute
- **Progress Indicator**: Step-by-step visualization

## 5. Component Inventory

### Sidebar
- Logo + app name
- User avatar + name + email
- Navigation items with icons
- Active state: emerald background tint
- Collapse button for mobile

### Cards
- Surface color with subtle border
- Hover: slight elevation (shadow)
- Header + content structure

### Forms
- Dark inputs with border on focus
- Labels above inputs
- Validation messages in red
- Submit buttons: emerald gradient

### Charts
- Recharts library
- Emerald/slate color scheme
- Tooltips on hover
- Animated entry

### Modal
- Centered overlay with backdrop blur
- Slide-up animation
- Close button + escape key

### Buttons
- Primary: Emerald gradient
- Secondary: Outline style
- Ghost: Text only
- States: hover (brighten), active (scale down), disabled (opacity)

## 6. Technical Approach

### Stack
- React 18 with TypeScript
- Vite for build
- Tailwind CSS for styling
- Recharts for data visualization
- React Router for navigation
- LocalStorage for data persistence

### State Management
- React Context for auth state
- Local state for forms
- localStorage sync for data persistence

### Data Model
```typescript
User {
  id: string
  name: string
  email: string
  password: string
  createdAt: Date
}

Income {
  id: string
  userId: string
  source: string
  amount: number
  frequency: 'monthly' | 'annual'
  category: string
}

Expense {
  id: string
  userId: string
  category: string
  description: string
  amount: number
  date: Date
}

Portfolio {
  userId: string
  riskLevel: 'low' | 'moderate' | 'aggressive'
}
```

### Mock Authentication
- Demo credentials: demo@taxshield.ai / demo123
- Register new users freely
- Add family member from settings
