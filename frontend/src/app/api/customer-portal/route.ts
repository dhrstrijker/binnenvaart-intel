import { CustomerPortal } from "@polar-sh/nextjs";
import { createClient } from "@supabase/supabase-js";

export const GET = CustomerPortal({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  getCustomerId: async (req) => {
    // Extract user from Supabase auth cookie
    const { createClient: createSSR } = await import("@/lib/supabase/server");
    const supabase = await createSSR();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Look up polar_customer_id from profiles
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("polar_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.polar_customer_id) {
      throw new Error("No Polar customer ID found");
    }

    return profile.polar_customer_id;
  },
  server: "production",
});
