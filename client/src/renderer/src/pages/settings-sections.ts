import {
  User,
  Palette,
  Zap,
  Globe,
  Shield,
  Server,
  Database,
  Info,
  RefreshCw,
  type LucideIcon
} from 'lucide-react'

/* ── Section definitions (extracted to its own file so the Settings page
 * module only exports components, which keeps React Fast Refresh happy). ── */

export type UserRole = 'admin' | 'developer' | 'user'

export type SectionId =
  | 'profile'
  | 'appearance'
  | 'taskDefaults'
  | 'updates'
  | 'marketplace'
  | 'security'
  | 'system'
  | 'data'
  | 'advanced'
  | 'about'
  | 'developer'

export interface SectionDef {
  id: SectionId
  icon: LucideIcon
  labelKey: string
  descriptionKey: string
  scope: 'personal' | 'computer'
  roles: UserRole[]
}

/* Render order:
 *  1. Personal sections (always available on every computer, listed in the
 *     order they should appear at the top of the page).
 *  2. Computer sections (gated by roles; admin sees all, developer/user see
 *     only taskDefaults).
 *  The visual divider "此电脑专属" is rendered between the two groups when
 *  the current role has any computer sections. */
export const SECTIONS: SectionDef[] = [
  {
    id: 'profile',
    icon: User,
    labelKey: 'settings.sections.profile',
    descriptionKey: 'settings.descriptions.profile',
    scope: 'personal',
    roles: ['admin', 'developer', 'user']
  },
  {
    id: 'appearance',
    icon: Palette,
    labelKey: 'settings.sections.appearance',
    descriptionKey: 'settings.descriptions.appearance',
    scope: 'personal',
    roles: ['admin', 'developer', 'user']
  },
  {
    id: 'data',
    icon: Database,
    labelKey: 'settings.sections.data',
    descriptionKey: 'settings.descriptions.data',
    scope: 'personal',
    roles: ['admin', 'developer', 'user']
  },
  {
    id: 'about',
    icon: Info,
    labelKey: 'settings.sections.about',
    descriptionKey: 'settings.descriptions.about',
    scope: 'personal',
    roles: ['admin', 'developer', 'user']
  },
  {
    id: 'developer',
    icon: Zap,
    labelKey: 'settings.sections.developer',
    descriptionKey: 'settings.descriptions.developer',
    scope: 'computer',
    roles: ['admin', 'developer']
  },
  {
    id: 'taskDefaults',
    icon: Zap,
    labelKey: 'settings.sections.taskDefaults',
    descriptionKey: 'settings.descriptions.taskDefaults',
    scope: 'computer',
    // BUG FIX: previously excluded admin. Admin computers also run tasks
    // (admin can see/edit everything in this app), so they should also have
    // task defaults configured.
    roles: ['admin', 'developer', 'user']
  },
  {
    id: 'updates',
    icon: RefreshCw,
    labelKey: 'settings.sections.updates',
    descriptionKey: 'settings.descriptions.updates',
    scope: 'computer',
    // Per-computer concern (you update the app on THIS machine). Every role
    // should be able to check for / install / restart for updates, because
    // the running process on each user's computer is the thing being updated.
    roles: ['admin', 'developer', 'user']
  },
  {
    id: 'marketplace',
    icon: Globe,
    labelKey: 'settings.sections.marketplace',
    descriptionKey: 'settings.descriptions.marketplace',
    scope: 'computer',
    roles: ['admin']
  },
  {
    id: 'security',
    icon: Shield,
    labelKey: 'settings.sections.security',
    descriptionKey: 'settings.descriptions.security',
    scope: 'computer',
    roles: ['admin']
  },
  {
    id: 'system',
    icon: Server,
    labelKey: 'settings.sections.system',
    descriptionKey: 'settings.descriptions.system',
    scope: 'computer',
    roles: ['admin']
  },
  {
    id: 'advanced',
    icon: Zap,
    labelKey: 'settings.sections.advanced',
    descriptionKey: 'settings.descriptions.advanced',
    scope: 'computer',
    roles: ['admin']
  }
]

/** Return the sections a computer in the given role should see, preserving
 *  the order defined in SECTIONS. Pure function — fully testable. */
export function getVisibleSections(role: UserRole): SectionDef[] {
  return SECTIONS.filter((s) => s.roles.includes(role))
}
