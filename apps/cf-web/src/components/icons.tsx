import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Circle,
  ClipboardList,
  Clock,
  Code,
  Command,
  CreditCard,
  Edit,
  ExternalLink,
  EyeOff,
  File,
  FileText,
  Folder,
  GripVertical,
  HelpCircle,
  Info,
  LayoutDashboard,
  Kanban,
  PanelLeft,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  Minus,
  Moon,
  Music,
  Palette,
  Paperclip,
  Phone,
  Image as ImageIcon,
  Plus,
  PlusCircle,
  Search,
  Settings,
  Settings2,
  Share,
  ShieldCheck,
  Slash,
  Sparkles,
  Star,
  Sun,
  Trash,
  TrendingDown,
  TrendingUp,
  Type,
  Underline,
  Upload,
  User,
  UserCircle,
  UserMinus,
  Users,
  Video,
  X,
  XCircle,
  MoreHorizontal,
  LucideIcon,
  Crown
} from "lucide-react";

export type Icon = LucideIcon;

export const Icons = {
  // General
  alertCircle: AlertCircle,
  warning: AlertTriangle,
  arrowRight: ArrowRight,
  check: Check,
  checks: CheckCircle2,
  circleCheck: CheckCircle2,
  close: X,
  clock: Clock,
  code: Code,
  dots: MoreHorizontal,
  ellipsis: MoreHorizontal,
  externalLink: ExternalLink,
  help: HelpCircle,
  info: Info,
  spinner: Loader2,
  search: Search,
  settings: Settings,
  trash: Trash,

  // Navigation / Chevrons
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  chevronsDown: ChevronsDown,
  chevronsLeft: ChevronsLeft,
  chevronsRight: ChevronsRight,
  chevronsUpDown: ChevronsUpDown,

  // Layout
  dashboard: LayoutDashboard,
  kanban: Kanban,
  panelLeft: PanelLeft,

  // User
  user: User,
  user2: UserCircle,
  account: UserCircle,
  profile: User,
  employee: UserMinus,
  userPen: Edit,
  teams: Users,

  // Brand
  github: Code, // Placeholder
  twitter: MessageSquare, // Placeholder
  logo: Command,

  // Communication
  chat: MessageSquare,
  notification: Bell,
  phone: Phone,
  video: Video,
  send: ArrowRight,
  paperclip: Paperclip,

  // Files
  page: File,
  post: FileText,
  fileTypePdf: FileText,
  fileTypeDoc: FileText,
  fileTypeXls: FileText,
  fileZip: Folder,
  media: ImageIcon,
  music: Music,

  // Actions
  add: Plus,
  edit: Edit,
  upload: Upload,
  share: Share,
  login: LogIn,
  logout: LogOut,
  gripVertical: GripVertical,

  // Shapes / Indicators
  circle: Circle,
  circleX: XCircle,
  plusCircle: PlusCircle,
  xCircle: XCircle,
  minus: Minus,

  // Theme
  sun: Sun,
  moon: Moon,
  brightness: Sun,
  laptop: LayoutDashboard,
  palette: Palette,

  // Commerce / Plans
  billing: CreditCard,
  creditCard: CreditCard,
  product: LayoutDashboard,
  pro: Crown,
  exclusive: Star,
  sparkles: Sparkles,
  badgeCheck: CheckCircle2,
  lock: Lock,

  // Data / Charts
  trendingDown: TrendingDown,
  trendingUp: TrendingUp,
  eyeOff: EyeOff,
  adjustments: Settings2,

  // Text formatting
  bold: Type, // Placeholder
  italic: Type, // Placeholder
  underline: Underline,
  text: Type,

  // Toast
  toastSuccess: CheckCircle2,
  toastInfo: Info,
  toastWarning: AlertTriangle,
  toastError: XCircle,
  toastLoading: Loader2,

  // Misc
  pizza: LayoutDashboard,
  workspace: Folder,
  forms: ClipboardList,
  slash: Slash,
  calendar: Clock,
  galleryVerticalEnd: LayoutDashboard,
  moreHorizontal: MoreHorizontal,
  shield: ShieldCheck,
};
