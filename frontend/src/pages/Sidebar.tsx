import { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Utensils,
  Users,
  Settings,
  LogOut,
  Sparkles,
  ChevronLeft,
  Menu,
  Clock,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SidebarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userEmail: string;
  userRole: string;
  onLogout: () => void;
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "reservations",
    label: "Reservations",
    icon: CalendarDays,
    badge: "Live",
  },
  { id: "tables", label: "Restaurant Tables", icon: Utensils },
  { id: "customers", label: "Customers", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  userEmail,
  userRole,
  onLogout,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => setCollapsed(!collapsed);

  return (
    <>
      {/* Mobile Bar Toggle Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-neutral-900 text-white border-b border-neutral-800">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="size-5 text-amber-500" />
          <span>NOOMA</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white"
        >
          <Menu className="size-5" />
        </Button>
      </div>

      {/* Backdrop Overlay for Mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main Sidebar Shell */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-neutral-900 text-neutral-200 border-r border-neutral-800 transition-all duration-300 select-none",
          collapsed ? "w-20" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-800">
          <div
            className={cn(
              "flex items-center gap-3 overflow-hidden",
              collapsed && "justify-center w-full",
            )}
          >
            <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Sparkles className="size-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-display font-bold text-white tracking-wide text-base leading-none">
                  NOOMA
                </span>
                <span className="text-[10px] text-neutral-400 font-medium tracking-wider uppercase mt-1">
                  Kitchen + Bar
                </span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="hidden md:flex size-7 text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            <ChevronLeft
              className={cn(
                "size-4 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </Button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setMobileOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group relative",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/60",
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={cn(
                    "size-5 shrink-0",
                    isActive
                      ? "text-primary-foreground"
                      : "text-neutral-400 group-hover:text-white",
                  )}
                />

                {!collapsed && <span className="truncate">{item.label}</span>}

                {!collapsed && item.badge && (
                  <Badge
                    variant="secondary"
                    className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  >
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Session Footer */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-950/40 space-y-2">
          <div
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg bg-neutral-900/80 border border-neutral-800/80",
              collapsed && "justify-center",
            )}
          >
            <div className="size-8 rounded-full bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
              {userEmail.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {userEmail}
                </p>
                <p className="text-[10px] text-neutral-400 capitalize truncate">
                  {userRole || "Staff"}
                </p>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            onClick={onLogout}
            className={cn(
              "w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 h-9 px-3 text-xs gap-3",
              collapsed && "justify-center px-0",
            )}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && <span>Log out</span>}
          </Button>
        </div>
      </aside>
    </>
  );
}
