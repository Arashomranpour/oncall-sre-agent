import type { AppProps } from "next/app";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/auth";
import Layout from "@/components/Layout";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const page = (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
  return CLERK_ENABLED ? <ClerkProvider {...pageProps}>{page}</ClerkProvider> : page;
}
