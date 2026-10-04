"use client";

import { SessionProvider } from "next-auth/react";
import { CartCountProvider } from "./CartCountProvider";
import { NotificationCountProvider } from "./NotificationCountProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CartCountProvider>
        <NotificationCountProvider>{children}</NotificationCountProvider>
      </CartCountProvider>
    </SessionProvider>
  );
}
