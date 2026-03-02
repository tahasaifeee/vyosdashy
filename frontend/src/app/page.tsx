"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in (simplified)
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/routers");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">VyOS UI Manager</h1>
      <p className="mt-4 text-xl animate-pulse text-gray-500">Redirecting...</p>
    </main>
  );
}
