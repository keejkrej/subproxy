import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const links = [
  ["/", "Sessions"],
  ["/keys", "Keys"],
  ["/ledger", "Ledger"],
] as const;

export function Shell({
  current,
  title,
  description,
  children,
}: {
  current: "/" | "/keys" | "/ledger";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">subproxy</p>
          <h1 className="text-2xl font-semibold tracking-tight">Control panel</h1>
        </div>
        <nav className="flex items-center gap-1">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={cn(buttonVariants({ variant: current === href ? "secondary" : "ghost" }))}
            >
              {label}
            </Link>
          ))}
          <UserButton />
        </nav>
      </header>
      <Separator className="my-6" />
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </section>
    </div>
  );
}
