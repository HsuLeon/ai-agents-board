import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  BellRing,
  BookOpenCheck,
  ClipboardCheck,
  GitBranch,
  KanbanSquare,
  LayoutDashboard,
  MessageSquareWarning,
  Radar,
  SquareTerminal,
  UsersRound
} from "lucide-react";
import { NavLink } from "@/components/nav-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Agents Board",
  description: "AI Agent workflow platform MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <strong>AI Agents Board</strong>
              <span>Agent workflow platform MVP</span>
            </Link>
            <nav className="nav" aria-label="Main navigation">
              <NavLink href="/" title="Dashboard">
                <LayoutDashboard size={16} />
                Dashboard
              </NavLink>
              <NavLink href="/board" title="Workflow board">
                <KanbanSquare size={16} />
                Board
              </NavLink>
              <NavLink href="/agents" title="Agent admin">
                <UsersRound size={16} />
                Agents
              </NavLink>
              <NavLink href="/blocked" title="Blocked tasks">
                <Bot size={16} />
                Blocked
              </NavLink>
              <NavLink href="/questions" title="Question inbox">
                <MessageSquareWarning size={16} />
                Questions
              </NavLink>
              <NavLink href="/events" title="Agent events">
                <BellRing size={16} />
                Events
              </NavLink>
              <NavLink href="/api-docs" title="Agent API docs">
                <BookOpenCheck size={16} />
                API Docs
              </NavLink>
              <NavLink href="/reports" title="Reports">
                <ClipboardCheck size={16} />
                Reports
              </NavLink>
              <NavLink href="/worker" title="Worker console">
                <SquareTerminal size={16} />
                Worker
              </NavLink>
              <NavLink href="/orchestrator" title="Orchestrator">
                <GitBranch size={16} />
                Orchestrator
              </NavLink>
              <NavLink href="/watchdog" title="Watchdog">
                <Radar size={16} />
                Watchdog
              </NavLink>
            </nav>
          </header>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
