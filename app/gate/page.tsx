import { redirect } from "next/navigation";

/** Password gate is disabled — send visitors to the app. */
export default function GatePage() {
  redirect("/");
}
