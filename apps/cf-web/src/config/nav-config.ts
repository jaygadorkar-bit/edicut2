import { Icons } from "@/components/icons";

export interface NavItem {
  title: string;
  url: string;
  icon?: keyof typeof Icons;
  isActive?: boolean;
  shortcut?: string[];
  items?: NavItem[];
  access?: {
    role?: string;
    plan?: string;
    feature?: string;
    requireOrg?: boolean;
    permission?: string;
  };
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const adminNavGroups: NavGroup[] = [
  {
    label: "Management",
    items: [
      {
        title: "Overview",
        url: "/admin",
        icon: "dashboard",
        isActive: true,
      },
      {
        title: "Master Board",
        url: "/admin/projects",
        icon: "kanban",
      },
      {
        title: "Gig Editor",
        url: "/admin/packages",
        icon: "edit",
      },
      {
        title: "Portfolio",
        url: "/admin/portfolio",
        icon: "media",
      },
      {
        title: "User Management",
        url: "/admin/users",
        icon: "teams",
      },
      {
        title: "Security",
        url: "/admin/security",
        icon: "shield",
      },
    ],
  },
];

export const customerNavGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        title: "Overview",
        url: "/dashboard",
        icon: "dashboard",
        isActive: true,
      },
      {
        title: "My Projects",
        url: "/dashboard/projects",
        icon: "kanban",
      },
      {
        title: "New Project",
        url: "/dashboard/new",
        icon: "add",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        title: "Messages",
        url: "/dashboard/chat",
        icon: "chat",
      },
      {
        title: "Profile",
        url: "/dashboard/profile",
        icon: "profile",
      },
    ],
  },
];
