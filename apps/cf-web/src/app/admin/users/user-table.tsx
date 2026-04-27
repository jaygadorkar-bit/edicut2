"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Megaphone,
  MoreHorizontal,
  Settings2,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Video,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  bulkDeleteUsers,
  bulkUpdateUserRoles,
  deleteUser,
  updateUserRole,
} from "@/lib/api/admin";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type AppRole = "customer" | "affiliate" | "editor" | "project_manager" | "admin";

interface UserWithRole {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
  image: string | null;
  createdAt: string;
}

const roleConfig: Record<
  AppRole,
  {
    label: string;
    color: string;
    icon: typeof ShieldCheck;
    description: string;
  }
> = {
  admin: {
    label: "Administrator",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: ShieldCheck,
    description: "Full system access and financial controls.",
  },
  project_manager: {
    label: "Manager",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: Settings2,
    description: "Oversees requests and editor assignments.",
  },
  editor: {
    label: "Editor",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Video,
    description: "Fulfills requests and uploads deliverables.",
  },
  affiliate: {
    label: "Affiliate",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: Megaphone,
    description: "Handles referrals, promotions, and partner growth.",
  },
  customer: {
    label: "Customer",
    color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    icon: User,
    description: "Standard client with access to own projects.",
  },
};

export function UserTable({ users }: { users: UserWithRole[] }) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<AppRole>("customer");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserWithRole | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const selectedCount = selectedIds.length;
  const allSelected = useMemo(
    () => users.length > 0 && selectedIds.length === users.length,
    [selectedIds.length, users.length]
  );

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? users.map((user) => user.id) : []);
  };

  const toggleSelectUser = (userId: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, userId] : current.filter((id) => id !== userId)
    );
  };

  const handleRoleUpdate = async (userId: string, newRole: AppRole) => {
    setIsUpdating(userId);
    const result = await updateUserRole(userId, newRole);
    setIsUpdating(null);

    if (result.success) {
      toast.success("User role updated successfully.");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to update user role.");
    }
  };

  const handleBulkRoleUpdate = async () => {
    if (!selectedIds.length) {
      toast.error("Select at least one user.");
      return;
    }

    setIsUpdating("bulk-role");
    const result = await bulkUpdateUserRoles(selectedIds, bulkRole);
    setIsUpdating(null);

    if (result.success) {
      toast.success("Selected users updated successfully.");
      setSelectedIds([]);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to update selected users.");
    }
  };

  const handleDeleteUser = async () => {
    if (!pendingDeleteUser) return;

    setIsUpdating(pendingDeleteUser.id);
    const result = await deleteUser(pendingDeleteUser.id);
    setIsUpdating(null);

    if (result.success) {
      toast.success("User deleted successfully.");
      setPendingDeleteUser(null);
      setSelectedIds((current) => current.filter((id) => id !== pendingDeleteUser.id));
      router.refresh();
    } else {
      toast.error(result.error || "Failed to delete user.");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) {
      toast.error("Select at least one user.");
      return;
    }

    setIsUpdating("bulk-delete");
    const result = await bulkDeleteUsers(selectedIds);
    setIsUpdating(null);

    if (result.success) {
      toast.success("Selected users deleted successfully.");
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to delete selected users.");
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-border/20 bg-card p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Bulk Management
              </p>
              <p className="text-sm font-bold text-white">
                {selectedCount > 0
                  ? `${selectedCount} users selected on this page`
                  : "Select users to update roles or delete them in bulk"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <select
              value={bulkRole}
              onChange={(event) => setBulkRole(event.target.value as AppRole)}
              className="h-11 min-w-[180px] rounded-xl border border-border/40 bg-background px-4 text-sm text-white outline-none transition-all focus:border-primary"
            >
              {Object.entries(roleConfig).map(([key, role]) => (
                <option key={key} value={key}>
                  {role.label}
                </option>
              ))}
            </select>
            <Button
              onClick={handleBulkRoleUpdate}
              disabled={selectedCount === 0 || isUpdating === "bulk-role"}
              className="h-11 rounded-xl font-bold"
            >
              {isUpdating === "bulk-role" ? "Updating..." : "Apply Role to Selected"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={selectedCount === 0 || isUpdating === "bulk-delete"}
              className="h-11 rounded-xl font-bold"
            >
              {isUpdating === "bulk-delete" ? "Deleting..." : "Delete Selected"}
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border/20 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 bg-background/50">
                  <th className="px-6 py-4 w-[56px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                      aria-label="Select all users on this page"
                    />
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Identity / User ID
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">
                    Role
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Permissions
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">
                    Manage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-muted-foreground italic font-medium"
                    >
                      No users found for the current filters.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const role = roleConfig[user.role];
                    const isSelected = selectedIds.includes(user.id);

                    return (
                      <tr
                        key={user.id}
                        className={cn(
                          "group hover:bg-background/20 transition-all duration-300",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        <td className="px-6 py-5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              toggleSelectUser(user.id, Boolean(checked))
                            }
                            aria-label={`Select ${user.name || user.email}`}
                          />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 border border-border/20">
                              <AvatarImage src={user.image || ""} />
                              <AvatarFallback className="bg-zinc-800 text-white font-bold">
                                {user.name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="font-bold text-white text-sm leading-none mb-1">
                                {user.name || "Unnamed User"}
                              </span>
                              <span className="text-xs text-muted-foreground leading-none">
                                {user.email}
                              </span>
                              <span className="mt-2 text-[10px] font-mono text-zinc-500 break-all">
                                ID: {user.id}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex justify-center">
                            <Badge
                              className={cn(
                                "rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-widest border shadow-lg",
                                role.color
                              )}
                            >
                              <role.icon className="h-3 w-3 mr-1.5 inline" />
                              {role.label}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs text-muted-foreground font-medium max-w-[240px] block leading-relaxed">
                            {role.description}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="hover:bg-white/10 rounded-xl"
                                disabled={isUpdating === user.id}
                              >
                                {isUpdating === user.id ? (
                                  <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-64 bg-zinc-950 border-zinc-800 p-2 rounded-2xl shadow-2xl"
                            >
                              <DropdownMenuLabel className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2 py-2">
                                Manage User
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator className="bg-zinc-800" />
                              {Object.entries(roleConfig).map(([key, config]) => (
                                <DropdownMenuItem
                                  key={key}
                                  onClick={() => handleRoleUpdate(user.id, key as AppRole)}
                                  className={cn(
                                    "flex flex-col items-start gap-1 p-3 rounded-xl transition-all mb-1 cursor-pointer",
                                    user.role === key
                                      ? "bg-primary/10 text-primary"
                                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                                  )}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                      <config.icon className="h-4 w-4" />
                                      Set {config.label}
                                    </div>
                                    {user.role === key && <Check className="h-4 w-4" />}
                                  </div>
                                  <span className="text-[10px] font-medium opacity-60 leading-snug">
                                    {config.description}
                                  </span>
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator className="bg-zinc-800" />
                              <DropdownMenuItem
                                onClick={() => setPendingDeleteUser(user)}
                                className="flex items-center gap-2 p-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="font-bold text-sm">Delete User</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AlertDialog
        open={Boolean(pendingDeleteUser)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteUser(null);
          }
        }}
      >
        <AlertDialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {pendingDeleteUser
                ? `Delete ${pendingDeleteUser.name || pendingDeleteUser.email} from the platform. This also removes their access and related auth records.`
                : "Delete this user from the platform."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Selected Users</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Delete {selectedCount} selected user{selectedCount === 1 ? "" : "s"} from this page.
              This permanently removes their access and related auth records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
