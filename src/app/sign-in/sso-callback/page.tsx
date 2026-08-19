import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SignInSsoCallbackPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center p-6 text-sm text-[#8b8680]">
      <AuthenticateWithRedirectCallback />
    </main>
  );
}
