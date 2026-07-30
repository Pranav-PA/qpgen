import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <AuthForm mode="login" next={next || "/dashboard"} initialError={error} />
      </div>
    </main>
  );
}
