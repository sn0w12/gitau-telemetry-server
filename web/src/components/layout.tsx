import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
    ChartNoAxesColumn,
    LayoutDashboard,
    LogOut,
    Moon,
    ServerCog,
    Sun,
    TriangleAlert,
    Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { RangeProvider } from "@/components/range-provider";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarInset,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";

type NavTo = "/" | "/spans" | "/errors" | "/traces" | "/system";

const NAV: { to: NavTo; label: string; icon: LucideIcon }[] = [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    { to: "/traces", label: "Traces", icon: Waypoints },
    { to: "/spans", label: "Spans", icon: ChartNoAxesColumn },
    { to: "/errors", label: "Errors", icon: TriangleAlert },
    { to: "/system", label: "System", icon: ServerCog },
];

function isActive(pathname: string, to: NavTo): boolean {
    return to === "/"
        ? pathname === "/"
        : pathname === to || pathname.startsWith(`${to}/`);
}

function AdminSidebar({ pathname }: { pathname: string }) {
    const { resolved, toggle } = useTheme();

    return (
        <Sidebar variant="inset" collapsible="icon">
            <TooltipProvider>
                <SidebarContent className="pt-1.5">
                    <SidebarGroup className="gap-1">
                        {NAV.map((item) => (
                            <SidebarMenuItem key={item.to}>
                                <SidebarMenuButton
                                    isActive={isActive(pathname, item.to)}
                                    tooltip={item.label}
                                    variant="ghost"
                                    render={<Link to={item.to} />}
                                >
                                    <item.icon />
                                    <span>{item.label}</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter>
                    <SidebarMenuItem>
                        <form action="/logout" method="post" className="w-full">
                            <SidebarMenuButton
                                type="submit"
                                tooltip="Sign out"
                                variant="ghost"
                            >
                                <LogOut />
                                <span>Sign out</span>
                            </SidebarMenuButton>
                        </form>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={toggle}
                            tooltip={
                                resolved === "dark" ? "Light mode" : "Dark mode"
                            }
                            variant="ghost"
                        >
                            {resolved === "dark" ? <Sun /> : <Moon />}
                            <span>
                                {resolved === "dark"
                                    ? "Light mode"
                                    : "Dark mode"}
                            </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarFooter>
            </TooltipProvider>
        </Sidebar>
    );
}

function AdminShell() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    return (
        <div className="flex h-svh w-full bg-sidebar">
            <SidebarProvider open={false} className="min-h-0 flex-1">
                <AdminSidebar pathname={pathname} />
                <SidebarInset>
                    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
                        <Outlet />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </div>
    );
}

export function RootLayout() {
    const isLogin = useRouterState({
        select: (state) => state.location.pathname === "/login",
    });

    if (isLogin) {
        return <Outlet />;
    }

    return (
        <RangeProvider>
            <AdminShell />
        </RangeProvider>
    );
}
