import { GoogleSignIn } from "@/components/google-sign-in";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center p-6">
      <GoogleSignIn />
    </main>
  );
}
