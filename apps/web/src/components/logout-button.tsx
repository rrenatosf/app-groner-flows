import { destroySession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

async function logout() {
  "use server";
  await destroySession();
  redirect("/login");
}

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="btn-ghost text-[12.5px] py-1.5 px-3">
        Sair
      </button>
    </form>
  );
}
