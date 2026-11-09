import {
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  CalendarCheck,
  Users,
  UtensilsCrossed,
  TrendingUp,
  Clock,
  Plus,
  ArrowUpRight,
  Search,
  LayoutDashboard,
  Utensils,
  Boxes,
  LogOut,
  Bell,
  Filter,
} from "lucide-react";
import InventoryManagement from "../Inventory/Inventory";
import MenuPage from "../Menu/menu";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/*                            SHADCN UI PROXIES                               */
/* -------------------------------------------------------------------------- */

function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-800/80 bg-slate-900/90 text-slate-100 shadow-xl backdrop-blur-sm transition-all duration-200 hover:border-slate-700/80",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}>
      {children}
    </div>
  );
}

function CardTitle({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-semibold leading-none tracking-tight text-slate-100",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

function CardDescription({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-slate-400", className)} {...props}>
      {children}
    </p>
  );
}

function CardContent({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6 pt-0", className)} {...props}>
      {children}
    </div>
  );
}

function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}: {
  variant?: "default" | "outline" | "ghost" | "navy";
  size?: "default" | "sm" | "lg";
  className?: string;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

  const variants = {
    default:
      "bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold shadow-lg shadow-amber-500/20",
    outline:
      "border border-slate-700 bg-slate-800/50 text-slate-200 hover:bg-slate-800 hover:text-white border-slate-700/80",
    ghost: "hover:bg-slate-800 text-slate-300 hover:text-white",
    navy: "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/25",
  };

  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-lg px-3 text-[11px]",
    lg: "h-11 rounded-xl px-6 text-sm",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

type BadgeProps = {
  variant?: string;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLSpanElement>;

function Badge({
  variant = "default",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider transition-colors uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      className={cn(
        "flex w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500/80 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                            INLINE NAVY SIDEBAR                             */
/* -------------------------------------------------------------------------- */

function NavySidebar({
  activeTab,
  onTabChange,
  userEmail,
  userRole,
  onLogout,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userEmail: string;
  userRole: string;
  onLogout: () => void;
}) {
  const navItems = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "Inventory", label: "Inventory", icon: Boxes },
    { id: "Menu", label: "Menu", icon: Utensils },
  ];

  return (
    <aside className="w-64 bg-[#0F172A] border-r border-slate-800/80 flex flex-col h-full shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800/80 justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-serif text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20">
            N
          </div>
          <div>
            <span className="font-serif text-base font-bold tracking-widest text-white uppercase block leading-none">
              NOOMA
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-amber-500 font-semibold block mt-0.5">
              Kitchen + Bar
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Management
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group",
                isActive
                  ? "bg-slate-800/90 text-amber-400 border border-slate-700/80 shadow-md"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200",
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    "size-4 transition-colors",
                    isActive
                      ? "text-amber-400"
                      : "text-slate-500 group-hover:text-slate-300",
                  )}
                />
                <span>{item.label}</span>
              </div>
              {item && (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                    isActive
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-slate-800 text-slate-400",
                  )}
                ></span>
              )}
            </button>
          );
        })}
      </div>

      {/* User Profile / Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-[#0A0F1D]">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
              {userEmail ? userEmail[0].toUpperCase() : "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">
                {userEmail}
              </p>
              <p className="text-[10px] text-slate-500 capitalize">
                {userRole}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*                           MAIN DASHBOARD APP                               */
/* -------------------------------------------------------------------------- */

export default function Dashboard({
  userEmail = "admin@nooma.ph",
  userRole = "General Manager",
  onLogout = () => alert("Logged out!"),
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");

  // Metrics summary formatted for Navy Blue theme
  const metrics = [
    {
      title: "Today's Bookings",
      value: "18",
      change: "+12% vs yesterday",
      icon: CalendarCheck,
      trend: "up",
    },
    {
      title: "Active Guests",
      value: "42",
      change: "Peak time at 7:30 PM",
      icon: Users,
      trend: "neutral",
    },
    {
      title: "Active Tables",
      value: "12 / 16",
      change: "75% Occupancy",
      icon: UtensilsCrossed,
      trend: "up",
    },
    {
      title: "Daily Revenue Est.",
      value: "₱34,500",
      change: "+18% this week",
      icon: TrendingUp,
      trend: "up",
    },
  ];

  const recentBookings = [
    {
      code: "RES-942A",
      name: "Maria Santos",
      guests: 4,
      time: "6:30 PM",
      status: "Confirmed",
      table: "T-04",
      section: "Main Dining",
    },
    {
      code: "RES-811B",
      name: "Juan Dela Cruz",
      guests: 2,
      time: "7:00 PM",
      status: "Seated",
      table: "T-02",
      section: "Chef's Counter",
    },
    {
      code: "RES-302C",
      name: "Arnaldo Lim",
      guests: 8,
      time: "7:30 PM",
      status: "Pending",
      table: "T-08",
      section: "VIP Room",
    },
    {
      code: "RES-499D",
      name: "Elena Ramos",
      guests: 3,
      time: "8:00 PM",
      status: "Confirmed",
      table: "T-05",
      section: "Terrace Bar",
    },
    {
      code: "RES-512E",
      name: "Gabriel Sy",
      guests: 6,
      time: "8:30 PM",
      status: "Seated",
      table: "T-10",
      section: "Wine Cellar",
    },
  ];

  const filteredBookings = recentBookings.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.table.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex h-screen bg-[#020617] text-slate-100 font-sans antialiased overflow-hidden selection:bg-amber-500/20 selection:text-amber-300">
      {/* Navy Sidebar */}
      <NavySidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userEmail={userEmail}
        userRole={userRole}
        onLogout={onLogout}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#020617]">
        {/* Top Control Bar */}
        <header className="h-16 border-b border-slate-800/80 bg-[#0F172A]/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <Input
                value={searchTerm}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSearchTerm(e.target.value)
                }
                placeholder="Search reservations, table numbers, or guests..."
                className="pl-10 h-9 bg-slate-950/60 border-slate-800 text-xs text-slate-200 placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors relative">
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-2 bg-amber-500 rounded-full animate-pulse" />
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <Badge
              variant="outline"
              className="gap-1.5 py-1 px-3 text-[11px] font-normal border-emerald-500/30 bg-emerald-950/30 text-emerald-400"
            >
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              LAN Server Online
            </Badge>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <div
          className={
            activeTab === "Inventory"
              ? "w-full"
              : "p-6 md:p-8 space-y-8 max-w-7xl w-full mx-auto"
          }
        >
          {activeTab === "Inventory" && <InventoryManagement />}
          {activeTab === "Menu" && <MenuPage />}
          {activeTab === "dashboard" && (
            <>
              {/* Header Intro */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-white font-serif">
                      Overview Dashboard
                    </h1>
                    <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/30">
                      Live
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Real-time operational summary & floor analytics for NOOMA
                    Kitchen + Bar.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" className="gap-2">
                    <Filter className="size-3.5 text-slate-400" /> Filter View
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => setActiveTab("reservations")}
                  >
                    <Plus className="size-4" /> New Booking
                  </Button>
                </div>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((m, idx) => {
                  const Icon = m.icon;
                  return (
                    <Card
                      key={idx}
                      className="bg-slate-900/90 border-slate-800/80 hover:border-slate-700 transition-all group"
                    >
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          {m.title}
                        </CardTitle>
                        <div className="p-2 rounded-xl bg-slate-800/80 text-amber-400 border border-slate-700/50 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                          <Icon className="size-4" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white tracking-tight font-serif">
                          {m.value}
                        </div>
                        <p className="text-[11px] text-amber-400 mt-1.5 font-medium flex items-center gap-1">
                          <span className="inline-block size-1.5 rounded-full bg-amber-400" />
                          {m.change}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Recent Activity Table View */}
              <Card className="bg-slate-900/90 border-slate-800/80">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-serif text-white">
                      Upcoming Floor Reservations
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Live table allocations for tonight's service.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab("reservations")}
                    className="gap-1 text-xs"
                  >
                    View All <ArrowUpRight className="size-3.5" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider bg-slate-950/40">
                        <tr>
                          <th className="py-3 px-4 rounded-l-xl">Code</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Party Size</th>
                          <th className="py-3 px-4">Time</th>
                          <th className="py-3 px-4">Section</th>
                          <th className="py-3 px-4">Table</th>
                          <th className="py-3 px-4 rounded-r-xl">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredBookings.map((b) => (
                          <tr
                            key={b.code}
                            className="hover:bg-slate-800/40 transition-colors group"
                          >
                            <td className="py-3.5 px-4 font-mono text-xs font-semibold text-amber-400">
                              {b.code}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-200">
                              {b.name}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {b.guests} Guests
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <Clock className="size-3.5 text-slate-500" />
                                {b.time}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {b.section}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-300 font-semibold text-[11px]">
                                {b.table}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge
                                className={cn(
                                  "border",
                                  b.status === "Seated"
                                    ? "bg-blue-950/80 text-blue-300 border-blue-700/50"
                                    : b.status === "Confirmed"
                                      ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/50"
                                      : "bg-amber-950/80 text-amber-300 border-amber-700/50",
                                )}
                              >
                                {b.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab !== "dashboard" &&
            activeTab !== "Inventory" &&
            activeTab !== "Menu" && (
            <div className="flex flex-col items-center justify-center min-h-[400px] border border-dashed border-slate-800 rounded-3xl p-8 bg-slate-900/40 text-center">
              <div className="p-4 rounded-full bg-slate-800/80 text-amber-400 mb-4 border border-slate-700">
                <Utensils className="size-8" />
              </div>
              <h3 className="font-serif text-xl text-white">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} View
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                This section is active in the navigation. The table booking and
                reporting views are integrated under the Navy theme.
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => setActiveTab("dashboard")}
              >
                Back to Dashboard
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
