# Next.js App Router Integration Guide (`next-fetch-kit`)

This guide covers recommended patterns for using `next-fetch-kit` in **Next.js 13+ App Router** applications.

---

## Architecture Overview

In Next.js App Router, code executes in two distinct environments:
1. **Server-side (SSR)**: Server Components (RSC), Route Handlers (`app/api/route.ts`), Server Actions, and Middleware.
2. **Client-side (CSR)**: Client Components (`'use client'`).

`next-fetch-kit` is designed to run seamlessly in both environments without separate instances or boilerplate.

---

## 1. Setting Up Central API Client

Create a centralized API client module (e.g. `lib/api.ts`):

```typescript
// lib/api.ts
import { createFetchKit } from 'next-fetch-kit';

export const api = createFetchKit({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com',
  credentials: 'include',
  timeout: 15000,
  forwardCookies: true, // Automatically forwards cookies in SSR
  retry: {
    count: 2,
    delay: 1000,
    backoff: true,
  },
  auth: {
    // Client-side token retriever (localStorage or in-memory)
    getToken: () => {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('accessToken');
      }
      return undefined;
    },

    // Refresh token handler
    refresh: async (rawKit) => {
      if (typeof window !== 'undefined') {
        const { data } = await rawKit.post<{ accessToken: string }>('/auth/refresh', {
          body: { refreshToken: localStorage.getItem('refreshToken') },
        });
        return data.accessToken;
      }
    },

    onRefreshed: (newToken) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', newToken);
      }
    },

    onRefreshFailed: () => {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    },
  },
});
```

---

## 2. Server Components (RSC) Usage

In Server Components, `api` automatically forwards incoming browser cookies to your backend API via `forwardCookies: true`:

```typescript
// app/dashboard/page.tsx (Server Component)
import { api } from '@/lib/api';

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export default async function DashboardPage() {
  // Cookies are automatically forwarded to backend microservice
  const { data: user } = await api.get<UserProfile>('/me', {
    next: { revalidate: 60, tags: ['user-profile'] },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
      <p className="text-gray-600">{user.email}</p>
    </main>
  );
}
```

---

## 3. Client Components (CSR) Usage

In Client Components, `api` utilizes browser credentials, in-flight request deduplication, and automatic auth refresh:

```typescript
// components/UserProfileCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function UserProfileCard() {
  const [user, setUser] = useState<{ name: string } | null>(null);

  useEffect(() => {
    // In-flight deduplication prevents duplicate calls if multiple cards render at once
    api.get<{ name: string }>('/me').then((res) => setUser(res.data));
  }, []);

  if (!user) return <div>Loading...</div>;
  return <div>{user.name}</div>;
}
```

---

## 4. Route Handlers & Server Actions

```typescript
// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET() {
  try {
    const { data } = await api.get('/users');
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
```

---

## 5. React Context Event Listener Integration

Subscribe to global API events in a Client Provider:

```typescript
// components/providers/ApiListenerProvider.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function ApiListenerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Listen for auth refresh failures
    const unsubscribeAuth = api.on('auth:refresh-failed', () => {
      router.push('/login?reason=session_expired');
    });

    // Listen for errors
    const unsubscribeError = api.on('error', (err) => {
      console.error(`[API Error] ${err.status}: ${err.message}`);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeError();
    };
  }, [router]);

  return <>{children}</>;
}
```
