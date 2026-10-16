import type { ReactNode } from "react";

export const metadata = {
  title: "Nairobi Telemetry Engine",
  description: "Thermodynamic and KRA computation for vehicle tuning in Nairobi.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
