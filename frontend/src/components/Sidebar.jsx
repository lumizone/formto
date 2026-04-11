import { NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import {
  LayoutDashboard,
  FileText,
  LogOut,
  Plus,
  BarChart3,
  UserCircle,
  ChevronRight,
  Inbox,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useUnread } from "@/contexts/UnreadContext"
import ThemeToggle from "@/components/ThemeToggle"

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/forms", icon: FileText, label: "Forms" },
  { to: "/submissions", icon: Inbox, label: "Submissions", showUnread: true },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/account", icon: UserCircle, label: "Settings" },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useUnread()

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?'

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-background border-r border-border/40">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Logo */}
        <div className="flex items-center h-14 px-4">
          <span className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Chillax, sans-serif' }}>
            FormTo
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2">
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.showUnread && unreadCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* Create Form Button */}
          <div className="mt-6 px-1">
            <NavLink
              to="/forms/create"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Form
            </NavLink>
          </div>
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-border/40">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer group">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <ThemeToggle className="w-full justify-start mt-1 text-muted-foreground hover:text-foreground" />

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start mt-1 text-muted-foreground hover:text-foreground"
            onClick={() => { logout(); navigate('/login') }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  )
}
