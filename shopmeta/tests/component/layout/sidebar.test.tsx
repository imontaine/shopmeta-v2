// tests/component/layout/sidebar.test.tsx
// Component tests for the Sidebar component.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock TanStack Router hooks used inside Sidebar ───────────────────────────
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className, onClick, 'aria-current': ariaCurrent }: {
    to: string; children: React.ReactNode; className?: string; onClick?: () => void; 'aria-current'?: string
  }) => (
    <a href={to} className={className} onClick={onClick} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: '/chat' }),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: '/chat' } }),
  useRouter: () => ({ navigate: vi.fn() }),
}))

// ─── Mock TanStack Query ───────────────────────────────────────────────────────
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  }),
  useQuery: () => ({ data: [], isLoading: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  QueryClient: class { invalidateQueries = vi.fn() },
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// ─── Mock ThemeToggle so we don't pull in its full dependency tree ─────────────
vi.mock('#/components/layout/ThemeToggle', () => ({
  ThemeToggle: () => <button aria-label="theme toggle mock">Theme</button>,
}))

import { ThemeProvider } from '#/lib/theme'
import { Sidebar } from '#/components/layout/Sidebar'

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const defaults = {
    collapsed: false,
    mobileOpen: false,
    onToggle: vi.fn(),
    onMobileClose: vi.fn(),
  }
  return render(
    <ThemeProvider>
      <Sidebar {...defaults} {...props} />
    </ThemeProvider>
  )
}

describe('Sidebar component', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark', 'light')
    localStorage.clear()
  })

  test('sidebar element exists after render', () => {
    renderSidebar()
    const sidebar = document.getElementById('sidebar')
    expect(sidebar).not.toBeNull()
  })

  test('renders navigation landmark', () => {
    renderSidebar()
    expect(screen.getByRole('navigation')).toBeDefined()
  })

  test('renders all main nav links', () => {
    renderSidebar()
    expect(screen.getByText('Chat')).toBeDefined()
    expect(screen.getByText('Dashboard')).toBeDefined()
    expect(screen.getByText('Agents')).toBeDefined()
    expect(screen.getByText('Settings')).toBeDefined()
  })

  test('active link has active class when on /chat', () => {
    renderSidebar()
    const chatLink = screen.getByText('Chat').closest('a')!
    expect(chatLink.className).toContain('sidebar-nav-link--active')
  })

  test('non-active links do not have active class', () => {
    renderSidebar()
    const dashboardLink = screen.getByText('Dashboard').closest('a')!
    expect(dashboardLink.className).not.toContain('sidebar-nav-link--active')
  })

  test('collapse toggle button exists', () => {
    renderSidebar()
    const collapseBtn = document.getElementById('sidebar-collapse-btn')
    expect(collapseBtn).not.toBeNull()
  })

  test('clicking collapse toggle calls onToggle', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ onToggle })

    const btn = document.getElementById('sidebar-collapse-btn')!
    await user.click(btn)

    expect(onToggle).toHaveBeenCalledOnce()
  })

  test('collapsed sidebar adds --collapsed class', () => {
    renderSidebar({ collapsed: true })
    const sidebar = document.getElementById('sidebar')!
    expect(sidebar.className).toContain('sidebar--collapsed')
  })

  test('expanded sidebar does not have --collapsed class', () => {
    renderSidebar({ collapsed: false })
    const sidebar = document.getElementById('sidebar')!
    expect(sidebar.className).not.toContain('sidebar--collapsed')
  })

  test('mobileOpen sidebar adds --mobile-open class', () => {
    renderSidebar({ mobileOpen: true })
    const sidebar = document.getElementById('sidebar')!
    expect(sidebar.className).toContain('sidebar--mobile-open')
  })

  test('mobile overlay is visible when mobileOpen=true', () => {
    renderSidebar({ mobileOpen: true })
    const overlay = document.getElementById('sidebar-overlay')
    expect(overlay).not.toBeNull()
  })

  test('mobile overlay not rendered when mobileOpen=false', () => {
    renderSidebar({ mobileOpen: false })
    const overlay = document.getElementById('sidebar-overlay')
    expect(overlay).toBeNull()
  })

  test('clicking mobile overlay calls onMobileClose', async () => {
    const onMobileClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ mobileOpen: true, onMobileClose })

    const overlay = document.getElementById('sidebar-overlay')!
    await user.click(overlay)

    expect(onMobileClose).toHaveBeenCalledOnce()
  })

  test('collapsed sidebar hides nav labels', () => {
    renderSidebar({ collapsed: true })
    // When collapsed, nav label spans are not rendered
    expect(screen.queryByText('Chat')).toBeNull()
    expect(screen.queryByText('Dashboard')).toBeNull()
  })
})
