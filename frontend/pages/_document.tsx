import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="description" content="Multi-agent on-call SRE: triage, investigate, propose a fix, wait for human approval." />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563eb'/%3E%3Ctext x='16' y='21' font-size='13' font-family='sans-serif' font-weight='700' text-anchor='middle' fill='white'%3ESRE%3C/text%3E%3C/svg%3E" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
