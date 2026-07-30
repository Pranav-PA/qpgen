import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <AuthForm mode="signup" next={next || "/dashboard"} />
      </div>
    </main>
  );
}
