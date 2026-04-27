import type { Icons } from '@/components/icons';

export interface NavAccess {
  role?: string;
  plan?: string;
  feature?: string;
  requireOrg?: boolean;
  permission?: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon?: keyof typeof Icons;
  isActive?: boolean;
  shortcut?: string[];
  items?: NavItem[];
  access?: NavAccess;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
