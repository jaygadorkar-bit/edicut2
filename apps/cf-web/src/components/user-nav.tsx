"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "next-auth/react";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

interface UserNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function UserNav({ user }: UserNavProps) {
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      await signOut({ callbackUrl: "/" });
    });
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.substring(0, 2).toUpperCase() || "EC";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full shadow-[0_0_15px_-5px_rgba(34,211,238,0.3)] hover:shadow-[0_0_20px_-5px_rgba(34,211,238,0.5)] transition-shadow border-2 border-primary/20">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.image || ""} alt={user.name || "User Dropdown"} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 border-border/40 bg-card/95 backdrop-blur-xl" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-bold leading-none text-white">{user.name || "EdiCut User"}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/40" />
        <DropdownMenuGroup>
          <DropdownMenuItem className="cursor-pointer hover:bg-primary/20 hover:text-white transition-colors">
            Profile
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer hover:bg-primary/20 hover:text-white transition-colors">
            Billing
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer hover:bg-primary/20 hover:text-white transition-colors">
            Settings
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/40" />
        <DropdownMenuItem 
          className="cursor-pointer text-destructive focus:bg-destructive focus:text-destructive-foreground transition-colors"
          onClick={handleSignOut}
          disabled={isPending}
        >
          {isPending ? (
            <span className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Logging out...
            </span>
          ) : (
            "Log out"
          )}
          {!isPending && <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
