"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function PaymentSuccessPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-xl">
        <Card className="p-6 text-center">
          <h1 className="text-2xl font-semibold text-textPrimary">Payment complete</h1>
          <p className="mt-2 text-textSecondary">
            Your booking payment was successful. Payment and invoice records may take a moment to appear.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/customer/requests">
              <Button>View requests</Button>
            </Link>
            <Link href="/customer/payments">
              <Button variant="secondary">Payment history</Button>
            </Link>
            <Link href="/customer/invoices">
              <Button variant="secondary">Invoices</Button>
            </Link>
            <Link href="/customer">
              <Button variant="ghost">Back to marketplace</Button>
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
