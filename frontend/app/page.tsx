"use client";

import { Dashboard } from "@/components/Dashboard";
import { SessionGate } from "@/components/SessionGate";

export default function Page() {
  return (
    <SessionGate>
      <Dashboard />
    </SessionGate>
  );
}
